import type { FillLevel, GeoPoint, PickupRejectReason, PickupRequest, PickupStatus, PickupUnit, Role } from '@kindra/shared';
import { CODE_ALPHABET, PICKUP_REJECT_LABELS } from '@kindra/shared';
import { customAlphabet } from 'nanoid';
import { db } from '../core/db';
import { appendEvent, type Actor } from '../core/events';
import { newId, nowIso } from '../core/ids';
import { badRequest, conflict, forbidden, notFound } from '../core/errors';
import { isFeatureOn } from './features';
import { registerDeparture } from './trips';
import { notify, notifyRole } from './notifications';
import { myBusiness } from './profiles';

/**
 * Solicitudes de recolección para conductores (v4.0, 17.2, 17.4 y 17.6).
 * La solicitud es una capa de asignación sobre la operación existente: conserva el código del origen y,
 * al recolectar, registra la salida del mismo viaje que el centro confirma. No crea cantidades paralelas.
 * El módulo de aceite usa la misma cola, sin viaje de escombros, y solo si el administrador lo activó.
 */

const MODULES = {
  debris: { units: ['t', 'm3'] as PickupUnit[], text: 'Para escombros la unidad es t o m³.', active: () => true },
  oil: { units: ['l'] as PickupUnit[], text: 'Para aceite usado la unidad es litros.', active: () => isFeatureOn('oil_module') },
};
const moduleOf = (key: string) => {
  const m = MODULES[key as keyof typeof MODULES];
  if (!m || !m.active()) throw forbidden('Ese módulo de residuos no está activo.');
  return m;
};
const requestCode = customAlphabet(CODE_ALPHABET, 5);
const OPEN: PickupStatus[] = ['submitted', 'new', 'assigned', 'en_route', 'arrived', 'issue'];

function getOrThrow(id: string): PickupRequest {
  const r = db().get('pickupRequests', id);
  if (!r) throw notFound('La solicitud no existe.');
  return r;
}

function save(actor: Actor, r: PickupRequest, patch: Partial<PickupRequest>, action: string, note: string | null = null): PickupRequest {
  const now = nowIso();
  const next = db().update('pickupRequests', r.id, { ...patch, updatedAt: now, history: [...r.history, { at: now, by: actor.id, action, note }] });
  appendEvent({ type: 'pickup_request_action', objectType: 'system', objectId: `pickup:${r.id}`, actor, data: { action, code: r.code, from: r.status, to: next.status, note } });
  return next;
}

/** Estado efectivo: la recepción la determina el viaje que confirmó el centro, nunca el conductor. */
export function effectiveStatus(r: PickupRequest): PickupStatus {
  if (r.status === 'collected' && r.tripId && db().get('trips', r.tripId)?.state === 'received') return 'received';
  return r.status;
}

function assertDriver(actor: Actor, r: PickupRequest): void {
  if (actor.role !== 'driver' || !actor.id) throw forbidden('Esta acción es del conductor.');
  if (r.driverId !== actor.id) throw forbidden('La solicitud no está asignada a ti.');
}

export function pickupView(r: PickupRequest, viewer: { id: string | null; role: Role | 'system' | null }) {
  const store = db();
  const trip = r.tripId ? store.get('trips', r.tripId) : undefined;
  const reception = trip?.receptionId ? store.get('receptions', trip.receptionId) : undefined;
  const o = r.originId ? store.get('origins', r.originId) : undefined;
  const staff = !['driver', 'householder', 'business'].includes(viewer.role || '');
  const owner = viewer.role === 'householder' || viewer.role === 'business';
  const mine = r.driverId === viewer.id;
  return {
    ...r,
    status: effectiveStatus(r),
    sectorName: store.get('sectors', o?.sectorId ?? r.sectorId ?? '')?.name ?? null,
    address: o?.street ?? r.address,
    location: o?.location ?? r.location,
    centerName: r.centerId ? store.get('centers', r.centerId)?.name ?? null : null,
    requesterName: r.businessId ? store.get('businesses', r.businessId)?.name ?? null : staff && r.requesterUserId ? store.get('users', r.requesterUserId)?.alias ?? null : null,
    operatorName: r.operatorEntityId ? store.get('entities', r.operatorEntityId)?.name ?? null : null,
    requesterUserId: staff || owner ? r.requesterUserId : null,
    driverAlias: r.driverId && (staff || mine) ? store.get('users', r.driverId)?.alias ?? null : null,
    driverId: staff || mine ? r.driverId : null,
    // Un conductor no ve quién más la rechazó ni el historial de otras personas.
    rejections: staff ? r.rejections.map((x) => ({ ...x, driverAlias: store.get('users', x.driverId)?.alias ?? null, reasonLabel: PICKUP_REJECT_LABELS[x.reason] })) : r.rejections.filter((x) => x.driverId === viewer.id),
    history: staff ? r.history : r.history.filter((h) => h.by === viewer.id),
    tripCode: trip?.code ?? null,
    photoUrls: r.photoIds.map((id) => store.get('photos', id)?.url).filter(Boolean),
    received: r.received ? { quantity: r.received.quantity, unit: r.received.unit, condition: r.received.condition, at: r.received.at, check: r.received.check } : reception ? { quantity: reception.receivedQuantity ?? null, unit: reception.receivedUnit ?? null, condition: reception.condition ?? null, at: reception.receivedAt, check: reception.quantityCheck ?? null } : null,
  };
}

/** Alcance: el conductor ve lo disponible de su entidad y lo suyo; el centro, lo que va a su sitio; la entidad, lo propio. */
export function listPickups(actor: Actor): PickupRequest[] {
  const u = actor.id ? db().get('users', actor.id) : undefined;
  return db()
    .filter('pickupRequests', (r) => {
      switch (actor.role) {
        case 'admin':
        case 'coordinator':
          return true;
        case 'entity_admin':
          return r.operatorEntityId === actor.entityId;
        case 'center':
          return !!u?.centerId && r.centerId === u.centerId && !!r.driverId;
        case 'removal':
          return r.operatorEntityId === actor.entityId;
        case 'householder':
          return r.requesterUserId === actor.id;
        case 'business':
          return !!r.businessId && r.businessId === u?.businessId;
        case 'driver':
          return r.operatorEntityId === actor.entityId && (r.driverId === actor.id || (r.status === 'new' && !r.rejections.some((x) => x.driverId === actor.id)));
        default:
          return false;
      }
    })
    .sort((a, b) => (`${a.date}${a.windowFrom}` < `${b.date}${b.windowFrom}` ? -1 : 1));
}

export interface CreatePickupInput {
  module: string;
  originId: string;
  operatorEntityId: string;
  centerId: string;
  material: string;
  estimatedQuantity: number;
  unit: PickupUnit;
  date: string;
  windowFrom: string;
  windowTo: string;
  instructions?: string | null;
  handlingNotes?: string | null;
}

export function createPickup(actor: Actor, input: CreatePickupInput): PickupRequest {
  const store = db();
  if (!actor.id || !['coordinator', 'entity_admin', 'removal'].includes(actor.role || '')) throw forbidden('Solo coordinación o la entidad de retiro crean solicitudes.');
  const mod = moduleOf(input.module);
  if (input.module !== 'debris') throw badRequest('Las solicitudes de ese módulo las crea el hogar o el comercio.');
  if (actor.role !== 'coordinator' && input.operatorEntityId !== actor.entityId) throw forbidden('Solo puedes crear solicitudes para tu entidad.');
  if (!mod.units.includes(input.unit)) throw badRequest(mod.text);
  if (!(input.estimatedQuantity > 0)) throw badRequest('La cantidad estimada debe ser mayor que cero.');
  if (input.windowFrom >= input.windowTo) throw badRequest('La ventana horaria no es válida.');
  const origin = store.get('origins', input.originId);
  if (!origin) throw notFound('El origen no existe.');
  if (!['validated', 'under_removal'].includes(origin.state) || !origin.zoneAuthorized) throw conflict('Solo se asignan orígenes validados en zona autorizada.');
  const entity = store.get('entities', input.operatorEntityId);
  if (!entity || entity.type !== 'removal') throw badRequest('La entidad de retiro no existe.');
  if (!store.get('centers', input.centerId)) throw badRequest('El centro no existe.');
  if (store.find('pickupRequests', (r) => r.originId === origin.id && OPEN.includes(r.status))) throw conflict('Ese origen ya tiene una solicitud abierta.', 'duplicate_request');
  const now = nowIso();
  const r: PickupRequest = {
    id: newId('pk'),
    code: origin.code,
    originId: origin.id,
    module: 'debris',
    status: 'new',
    operatorEntityId: entity.id,
    requesterUserId: null,
    businessId: null,
    address: null,
    location: null,
    sectorId: origin.sectorId,
    photoIds: [],
    received: null,
    createdBy: actor.id,
    createdAt: now,
    updatedAt: now,
    material: input.material.trim(),
    estimatedQuantity: input.estimatedQuantity,
    unit: input.unit,
    date: input.date,
    windowFrom: input.windowFrom,
    windowTo: input.windowTo,
    centerId: input.centerId,
    instructions: input.instructions?.trim() || null,
    handlingNotes: input.handlingNotes?.trim() || null,
    driverId: null,
    acceptedAt: null,
    tripId: null,
    collected: null,
    validatedBy: null,
    validatedAt: null,
    rejections: [],
    issue: null,
    history: [],
  };
  store.put('pickupRequests', r);
  announce(entity.id);
  return save(actor, r, {}, 'created');
}

function announce(entityId: string): void {
  const drivers = db().filter('users', (u) => u.active && u.roles.includes('driver') && u.entityId === entityId && u.preferences?.available !== false);
  if (drivers.length) notify({ recipientKeys: drivers.map((u) => `user:${u.id}`), kind: 'pickup_new', text: 'Hay una solicitud de recolección disponible.', link: '/conductor/solicitudes' });
}

export interface ServiceRequestInput {
  module: string;
  material: string;
  estimatedQuantity: number;
  unit: PickupUnit;
  address: string;
  location: GeoPoint | null;
  sectorId: string | null;
  date: string;
  windowFrom: string;
  windowTo: string;
  instructions: string | null;
  photoIds: string[];
}

/** Solicitud de un hogar o comercio en un módulo activo. Para escombros se usa el reporte de siempre. */
export function requestService(actor: Actor, input: ServiceRequestInput): PickupRequest {
  const store = db();
  if (!actor.id || (actor.role !== 'householder' && actor.role !== 'business')) throw forbidden('Las solicitudes las crea un hogar o un comercio.');
  const mod = moduleOf(input.module);
  if (input.module === 'debris') throw badRequest('Para escombros usa «Avisar de un escombro»: ese reporte ya es la solicitud.');
  const user = store.get('users', actor.id)!;
  const businessId = actor.role === 'business' ? myBusiness(user).id : null;
  if (!mod.units.includes(input.unit)) throw badRequest(mod.text);
  if (input.windowFrom >= input.windowTo) throw badRequest('La ventana horaria no es válida.');
  if (input.date < new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' })) throw badRequest('Elige una fecha de hoy en adelante.');
  if (input.photoIds.some((x) => !store.get('photos', x))) throw badRequest('Una de las fotos no existe.');
  const now = nowIso();
  const r: PickupRequest = { id: newId('pk'), code: `RC-${requestCode()}`, originId: null, module: 'oil', status: 'submitted', operatorEntityId: null, requesterUserId: actor.id, businessId, address: input.address.trim(), location: input.location, sectorId: input.sectorId, photoIds: input.photoIds, createdBy: actor.id, createdAt: now, updatedAt: now, material: input.material.trim(), estimatedQuantity: input.estimatedQuantity, unit: input.unit, date: input.date, windowFrom: input.windowFrom, windowTo: input.windowTo, centerId: null, instructions: input.instructions?.trim() || null, handlingNotes: null, driverId: null, acceptedAt: null, tripId: null, collected: null, received: null, validatedBy: null, validatedAt: null, rejections: [], issue: null, history: [] };
  store.put('pickupRequests', r);
  notifyRole('coordinator', 'pickup_submitted', 'Hay una solicitud de recolección por programar.', { link: '/panel/solicitudes' });
  return save(actor, r, {}, 'submitted');
}

/** La coordinación programa: entidad, centro y ventana. Desde aquí la ven los conductores. */
export function schedulePickup(actor: Actor, id: string, input: { operatorEntityId: string; centerId: string; date: string; windowFrom: string; windowTo: string; handlingNotes: string | null }): PickupRequest {
  if (actor.role !== 'coordinator') throw forbidden('La programación es de la coordinación.');
  const r = getOrThrow(id);
  moduleOf(r.module);
  if (!['submitted', 'new'].includes(r.status)) throw conflict('La solicitud ya está asignada.');
  if (db().get('entities', input.operatorEntityId)?.type !== 'removal') throw badRequest('La entidad de retiro no existe.');
  if (!db().get('centers', input.centerId)) throw badRequest('El centro no existe.');
  if (input.windowFrom >= input.windowTo) throw badRequest('La ventana horaria no es válida.');
  const next = save(actor, r, { ...input, status: 'new' }, 'scheduled');
  announce(input.operatorEntityId);
  tellOwner(next, 'Tu recolección quedó programada.');
  return next;
}

function tellOwner(r: PickupRequest, text: string): void {
  if (r.requesterUserId) notify({ recipientKeys: [`user:${r.requesterUserId}`], kind: 'pickup_changed', text, link: r.businessId ? '/comercio/agenda' : '/hogar/solicitudes' });
}

export function cancelOwn(actor: Actor, id: string, note: string): PickupRequest {
  const r = getOrThrow(id);
  const u = actor.id ? db().get('users', actor.id) : undefined;
  const mine = (actor.role === 'householder' && r.requesterUserId === actor.id) || (actor.role === 'business' && !!r.businessId && r.businessId === u?.businessId);
  if (!mine) throw forbidden('La solicitud no es tuya.');
  if (!['submitted', 'new', 'assigned'].includes(r.status)) throw conflict('La recolección ya está en curso.');
  if (r.driverId) notify({ recipientKeys: [`user:${r.driverId}`], kind: 'pickup_changed', text: 'Se canceló una solicitud que tenías asignada.', link: '/conductor/solicitudes' });
  return save(actor, r, { status: 'cancelled' }, 'cancelled_by_requester', note.trim());
}

/** Recepción en el centro para módulos sin viaje de escombros. Nunca la confirma quien condujo. */
export function receivePickup(actor: Actor, id: string, input: { quantity: number; unit: PickupUnit; condition: string | null }): PickupRequest {
  const r = getOrThrow(id);
  const u = actor.id ? db().get('users', actor.id) : undefined;
  if (actor.role !== 'center' || !u?.centerId || u.centerId !== r.centerId) throw forbidden('Solo recibe el personal del centro asignado.');
  if (r.driverId === actor.id) throw forbidden('Nadie recibe lo que transportó.');
  if (r.module === 'debris') throw conflict('En escombros la llegada se confirma con el viaje.');
  if (r.status !== 'collected') throw conflict('La solicitud todavía no está recolectada.');
  if (!MODULES[r.module].units.includes(input.unit)) throw badRequest(MODULES[r.module].text);
  const sent = r.collected!.unit === input.unit ? r.collected!.quantity : null;
  const difference = sent === null ? null : Math.round((input.quantity - sent) * 100) / 100;
  const next = save(actor, r, { status: 'received', received: { quantity: input.quantity, unit: input.unit, condition: input.condition?.trim() || null, by: actor.id!, at: nowIso(), check: { dispatched: sent, difference, flagged: !!difference } } }, 'received', difference ? `diferencia ${difference} ${input.unit}` : null);
  if (difference) notifyRole('coordinator', 'pickup_issue', `Diferencia de cantidad en una recolección (${r.code}).`, { link: '/panel/solicitudes' });
  return next;
}

/** Comprobación y escritura ocurren en el mismo paso síncrono, así que solo un conductor toma la solicitud. */
export function acceptPickup(actor: Actor, id: string): PickupRequest {
  const r = getOrThrow(id);
  if (actor.role !== 'driver' || !actor.id) throw forbidden('Solo un conductor acepta solicitudes.');
  if (r.operatorEntityId !== actor.entityId) throw forbidden('La solicitud es de otra entidad.');
  if (r.status !== 'new' || r.driverId) throw conflict('Otra persona ya tomó esta solicitud.', 'already_assigned');
  const next = save(actor, r, { status: 'assigned', driverId: actor.id, acceptedAt: nowIso() }, 'accepted');
  tellOwner(next, 'Tu recolección ya tiene conductor asignado.');
  return next;
}

export function rejectPickup(actor: Actor, id: string, reason: PickupRejectReason, note?: string | null): PickupRequest {
  const r = getOrThrow(id);
  if (actor.role !== 'driver' || !actor.id || r.operatorEntityId !== actor.entityId) throw forbidden();
  if (!(reason in PICKUP_REJECT_LABELS)) throw badRequest('Elige un motivo.');
  if (reason === 'other' && !note?.trim()) throw badRequest('Escribe el motivo.');
  const available = r.status === 'new' && !r.driverId;
  const mine = r.status === 'assigned' && r.driverId === actor.id;
  if (!available && !mine) throw conflict('La solicitud ya no se puede rechazar.');
  const next = save(actor, r, { status: 'new', driverId: null, acceptedAt: null, rejections: [...r.rejections, { driverId: actor.id, reason, note: note?.trim() || null, at: nowIso() }] }, 'rejected', reason);
  notifyRole('coordinator', 'pickup_rejected', `Se rechazó una solicitud de recolección (${r.code}).`, { link: '/panel/solicitudes' });
  return next;
}

export function advancePickup(actor: Actor, id: string, to: 'en_route' | 'arrived'): PickupRequest {
  const r = getOrThrow(id);
  assertDriver(actor, r);
  const from: PickupStatus = to === 'en_route' ? 'assigned' : 'en_route';
  if (r.status !== from) throw conflict('El estado de la solicitud no permite este paso.');
  const next = save(actor, r, { status: to }, to);
  if (to === 'en_route') tellOwner(next, 'El conductor va en camino.');
  return next;
}

export interface CollectInput {
  quantity: number;
  unit: PickupUnit;
  photoId: string;
  vehicleId: string;
  fillLevel?: FillLevel | null;
  note?: string | null;
  location?: GeoPoint | null;
  deviceTime?: string | null;
  offlineQueuedAt?: string | null;
}

/** Recolección: registra la salida del viaje existente y guarda lo que declara el conductor. */
export function collectPickup(actor: Actor, id: string, input: CollectInput): PickupRequest {
  const r = getOrThrow(id);
  assertDriver(actor, r);
  if (r.status !== 'arrived') throw conflict('Confirma primero la llegada al punto.');
  if (!(input.quantity > 0)) throw badRequest('Indica la cantidad recolectada.');
  const mod = moduleOf(r.module);
  if (!mod.units.includes(input.unit)) throw badRequest(mod.text);
  if (!input.photoId || !db().get('photos', input.photoId)) throw badRequest('La evidencia fotográfica es obligatoria.');
  const vehicle = db().get('vehicles', input.vehicleId);
  if (!vehicle || vehicle.entityId !== r.operatorEntityId) throw badRequest('Elige un vehículo de tu entidad.');
  if (!r.originId || !r.centerId) return save(actor, r, { status: 'collected', collected: { quantity: input.quantity, unit: input.unit, photoId: input.photoId, note: input.note?.trim() || null, at: nowIso() } }, 'collected');
  const trip = registerDeparture(actor, { vehicleId: vehicle.id, originIds: [r.originId], centerId: r.centerId, photoId: input.photoId, fillLevel: input.fillLevel ?? null, location: input.location ?? null, deviceTime: input.deviceTime, offlineQueuedAt: input.offlineQueuedAt });
  return save(actor, r, { status: 'collected', tripId: trip.id, collected: { quantity: input.quantity, unit: input.unit, photoId: input.photoId, note: input.note?.trim() || null, at: nowIso() } }, 'collected');
}

/** Validación final: coordinación, después de que el centro confirmó. Nunca quien condujo. */
export function validatePickup(actor: Actor, id: string): PickupRequest {
  const r = getOrThrow(id);
  if (actor.role !== 'coordinator') throw forbidden('La validación final es de coordinación.');
  if (r.driverId === actor.id) throw forbidden('Nadie valida su propia entrega.');
  if (effectiveStatus(r) !== 'received') throw conflict('El centro todavía no confirmó la recepción.', 'not_received');
  const next = save(actor, r, { status: 'completed', validatedBy: actor.id, validatedAt: nowIso() }, 'validated');
  tellOwner(next, 'Tu recolección quedó validada y cerrada.');
  return next;
}

export function reportIssue(actor: Actor, id: string, text: string): PickupRequest {
  const r = getOrThrow(id);
  assertDriver(actor, r);
  if (!['assigned', 'en_route', 'arrived'].includes(r.status)) throw conflict('La solicitud no admite incidencias en este estado.');
  const next = save(actor, r, { status: 'issue', issue: { by: actor.id!, text: text.trim(), at: nowIso() } }, 'issue', text.trim());
  notifyRole('coordinator', 'pickup_issue', `Incidencia en una solicitud de recolección (${r.code}).`, { link: '/panel/solicitudes' });
  return next;
}

/** Coordinación o la entidad reasigna (vuelve a disponible) o cancela, siempre con motivo. */
export function managePickup(actor: Actor, id: string, action: 'reassign' | 'cancel', note: string): PickupRequest {
  const r = getOrThrow(id);
  if (actor.role !== 'coordinator' && !(actor.role === 'entity_admin' && r.operatorEntityId === actor.entityId)) throw forbidden();
  if (!OPEN.includes(r.status)) throw conflict('La solicitud ya tiene un viaje registrado o está cerrada.');
  if (!note.trim()) throw badRequest('Indica el motivo.');
  if (r.driverId) notify({ recipientKeys: [`user:${r.driverId}`], kind: 'pickup_changed', text: 'Cambió una solicitud que tenías asignada.', link: '/conductor/solicitudes' });
  tellOwner(r, action === 'cancel' ? 'Tu recolección fue cancelada.' : 'Tu recolección se está reasignando.');
  return save(actor, r, action === 'cancel' ? { status: 'cancelled' } : { status: r.operatorEntityId ? 'new' : 'submitted', driverId: null, acceptedAt: null, issue: null }, action, note.trim());
}

/** Impacto propio: solo solicitudes validadas, cantidad recibida por unidad; sin equivalencias ambientales. */
export function pickupImpact(actor: Actor, from: string | null, to: string | null, module: string | null = null) {
  const store = db();
  const u = actor.id ? store.get('users', actor.id) : undefined;
  const own = (r: PickupRequest) => (actor.role === 'driver' ? r.driverId === actor.id : actor.role === 'business' ? !!r.businessId && r.businessId === u?.businessId : r.requesterUserId === actor.id);
  const done = store.filter('pickupRequests', (r) => own(r) && r.status === 'completed' && (!module || r.module === module) && (!from || r.date >= from) && (!to || r.date <= to));
  const byMonth = new Map<string, { month: string; completed: number; m3: number | null; t: number | null; l: number | null }>();
  for (const r of done) {
    const month = r.date.slice(0, 7);
    const cur = byMonth.get(month) || { month, completed: 0, m3: null, t: null, l: null };
    cur.completed++;
    const trip = r.tripId ? store.get('trips', r.tripId) : undefined;
    const rec = trip?.receptionId ? store.get('receptions', trip.receptionId) : undefined;
    const direct = r.received;
    if (direct && direct.unit !== 'kg') cur[direct.unit] = Math.round(((cur[direct.unit] ?? 0) + direct.quantity) * 100) / 100;
    else if (rec?.receivedQuantity != null && rec.receivedUnit) cur[rec.receivedUnit] = Math.round(((cur[rec.receivedUnit] ?? 0) + rec.receivedQuantity) * 100) / 100;
    byMonth.set(month, cur);
  }
  const months = [...byMonth.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
  const sum = (k: 'm3' | 't' | 'l') => (months.some((m) => m[k] !== null) ? Math.round(months.reduce((s, m) => s + (m[k] ?? 0), 0) * 100) / 100 : null);
  return { from, to, completed: done.length, m3: sum('m3'), t: sum('t'), l: sum('l'), months, source: 'Solicitudes validadas con recepción confirmada por el centro' };
}
