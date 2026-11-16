import type { GeoPoint, Movement, MovementLeg, MovementOutput, TripLeg } from '@kindra/shared';
import { MOVEMENT_OUTPUT_LABELS } from '@kindra/shared';
import { db } from '../core/db';
import { appendEvent, type Actor } from '../core/events';
import { newId, nowIso } from '../core/ids';
import { badRequest, conflict, forbidden, notFound } from '../core/errors';
import { findVehicle } from './trips';
import { centerOf } from './batches';
import { notifyRole } from './notifications';
import { assertNoOpenTrip, centerPoint, geofenceCheck, planRoute, raiseTrackingAlert, traceHash, ingestPoints, tripRef } from './tracking';

/**
 * Puntos de control QR en cada tramo (addendum v1.3): CDT→CDF, CDT→obra y CDT→Estado.
 * Cada movimiento es un viaje con dos escaneos: salida (personal del centro escanea el QR del vehículo, elige
 * lote, tipo de salida, cantidad estimada y destino, con foto del camión) y llegada en la puerta de destino.
 */

const LEG_OUTPUT: Record<MovementLeg, MovementOutput> = { cdt_cdf: 'rejects', cdt_work: 'aggregate', cdt_state: 'metal' };
const OUTPUT_FIELD: Record<MovementOutput, 'aggregate' | 'rejects' | 'metal'> = { aggregate: 'aggregate', rejects: 'rejects', metal: 'metal' };
export const STATE_RECEPTION_NAME = 'Recepción del Estado (metal)';

export interface MovementDepartureInput {
  leg: MovementLeg;
  vehicleId?: string | null;
  vehicleQr?: string | null;
  batchId: string;
  outputType?: MovementOutput | null;
  quantity: number;
  destCenterId?: string | null;
  workId?: string | null;
  photoId?: string | null;
  location?: GeoPoint | null;
  deviceTime?: string | null;
  offlineQueuedAt?: string | null;
}

/** Cantidad ya enviada (en tránsito o recibida) de un tipo de salida de un lote. */
export function movedQuantity(batchId: string, outputType: MovementOutput): { inTransit: number; verified: number } {
  const ms = db().filter('movements', (m) => m.batchId === batchId && m.outputType === outputType);
  return {
    inTransit: ms.filter((m) => m.state !== 'received').reduce((s, m) => s + m.quantity, 0),
    verified: ms.filter((m) => m.state === 'received').reduce((s, m) => s + m.quantity, 0),
  };
}

export function registerMovementDeparture(actor: Actor, input: MovementDepartureInput): Movement {
  const store = db();
  if (!actor.id || !actor.entityId) throw forbidden();
  const center = centerOf(actor);
  const batch = store.get('batches', input.batchId);
  if (!batch || batch.centerId !== center.id) throw badRequest('Elige un lote de tu centro.');
  if (!batch.outputs) throw conflict('El lote todavía no tiene salidas registradas.', 'no_outputs');
  const outputType = input.outputType || LEG_OUTPUT[input.leg];
  if (outputType !== LEG_OUTPUT[input.leg]) throw badRequest(`En este tramo solo sale ${MOVEMENT_OUTPUT_LABELS[LEG_OUTPUT[input.leg]].toLowerCase()}.`);
  // 7.4: el agregado no sale hacia una obra sin verificación de calidad aprobada (compuerta fija).
  if (input.leg === 'cdt_work' && batch.qualityResult !== 'approved') throw conflict('El lote no tiene una verificación de calidad aprobada; no se puede despachar a una obra (regla 7.4).', 'qualityApproved');
  if (!(input.quantity > 0)) throw badRequest('Indica la cantidad estimada que sale.');
  const available = (batch.outputs[OUTPUT_FIELD[outputType]] || 0) - (() => { const m = movedQuantity(batch.id, outputType); return m.inTransit + m.verified; })();
  if (input.quantity > available + 1e-9) throw conflict(`La cantidad supera lo disponible de ${MOVEMENT_OUTPUT_LABELS[outputType].toLowerCase()} en el lote (${Math.max(0, Math.round(available * 100) / 100)} ${batch.outputs.unit}).`, 'over_quantity');
  if (!input.photoId) throw badRequest('La foto del camión cargado, con la placa visible, es obligatoria.');
  const vehicle = findVehicle(input);
  assertNoOpenTrip(vehicle.id);

  let destination: Movement['destination'];
  if (input.leg === 'cdt_cdf') {
    const dest = input.destCenterId ? store.get('centers', input.destCenterId) : undefined;
    if (!dest || dest.type !== 'CDF') throw badRequest('Elige un centro de disposición final como destino.');
    destination = { kind: 'center', id: dest.id, name: dest.name };
  } else if (input.leg === 'cdt_work') {
    const w = input.workId ? store.get('works', input.workId) : undefined;
    if (!w) throw badRequest('Elige la obra de destino.');
    destination = { kind: 'work', id: w.id, name: `${w.code} · ${w.name}` };
  } else {
    destination = { kind: 'state', id: null, name: STATE_RECEPTION_NAME };
  }

  const serverTime = nowIso();
  const movement: Movement = {
    id: newId('mv'),
    code: `M-${String(store.count('movements') + 1).padStart(4, '0')}`,
    leg: input.leg,
    vehicleId: vehicle.id,
    fromCenterId: center.id,
    batchId: batch.id,
    outputType,
    quantity: Math.round(input.quantity * 100) / 100,
    unit: batch.outputs.unit,
    destination,
    departure: { userId: actor.id, entityId: actor.entityId, deviceTime: input.deviceTime || serverTime, serverTime, photoId: input.photoId, location: input.location ?? null },
    arrival: null,
    state: 'in_transit',
    departureCheck: geofenceCheck(input.location, centerPoint(center)),
  };
  appendEvent({ type: 'movement_departure', objectType: 'trip', objectId: movement.id, actor, data: { movement }, deviceTime: input.deviceTime, offlineQueuedAt: input.offlineQueuedAt });
  if (input.location) ingestPoints(movement.id, [{ ...input.location, at: serverTime, label: 'Salida' }], 'checkpoint', { delayed: !!input.offlineQueuedAt });
  if (movement.departureCheck === 'outside') raiseTrackingAlert(`al_depfence_${movement.id}`, 'gate_alert', movement.id, `La salida ${movement.code} se escaneó fuera del perímetro de ${center.name}.`);
  const text = `Va en camino un camión (${vehicle.plate}) con ${movement.quantity} ${movement.unit} de ${MOVEMENT_OUTPUT_LABELS[outputType].toLowerCase()} desde ${center.name}.`;
  if (destination.kind === 'center') notifyRole('center', 'movement_incoming', text, { centerId: destination.id, link: '/panel/control' });
  else if (destination.kind === 'work') notifyRole('destination', 'movement_incoming', text, { entityId: store.get('works', destination.id!)?.entityId ?? null, link: '/panel/control' });
  else notifyRole('coordinator', 'movement_incoming', text, { link: '/panel/control' });
  planRoute(movement.id);
  return store.get('movements', movement.id)!;
}

/** Quién confirma la llegada en la puerta: centro de destino, obra de destino o el coordinador para la recepción del Estado. */
function assertDestinationActor(actor: Actor, m: Movement): void {
  const store = db();
  const user = actor.id ? store.get('users', actor.id) : undefined;
  if (!user) throw forbidden();
  if (m.departure.userId === actor.id) throw conflict('Nadie confirma la llegada de un movimiento que registró él mismo.', 'notOwnReport');
  if (m.destination.kind === 'center') {
    if (actor.role !== 'center') throw forbidden('La llegada la confirma el personal del centro de destino.');
    if (user.centerId !== m.destination.id) {
      raiseTrackingAlert(`al_wrongcenter_${m.id}_${user.centerId}`, 'gate_alert', m.id, `El movimiento ${m.code} se escaneó en ${store.get('centers', user.centerId || '')?.name ?? 'otro centro'}, distinto del destino declarado (${m.destination.name}).`);
      throw conflict(`Este camión está declarado hacia ${m.destination.name}, no hacia tu centro. Se avisó al coordinador y al supervisor.`, 'wrong_destination');
    }
  } else if (m.destination.kind === 'work') {
    const w = store.get('works', m.destination.id!);
    if (actor.role !== 'destination' || w?.entityId !== actor.entityId) throw forbidden('La llegada la confirma el destino final responsable de la obra.');
  } else if (actor.role !== 'coordinator') {
    throw forbidden('La llegada a la recepción del Estado la confirma el coordinador.');
  }
}

export function confirmMovementArrival(actor: Actor, key: string, input: { photoId?: string | null; vehicleQr?: string | null; location?: GeoPoint | null; deviceTime?: string | null; offlineQueuedAt?: string | null }): Movement {
  const store = db();
  const m = store.get('movements', key) || store.find('movements', (x) => x.code === key);
  if (!m) throw notFound('El movimiento no existe.');
  if (m.state === 'received') throw conflict('Este movimiento ya tiene la llegada confirmada.', 'bad_state');
  if (input.vehicleQr) {
    const v = store.get('vehicles', m.vehicleId);
    if (!v || v.qrCode !== input.vehicleQr.trim()) throw conflict('El QR escaneado no corresponde al vehículo de este movimiento.', 'vehicle_mismatch');
  }
  if (!input.photoId) throw badRequest('La foto de llegada es obligatoria.');
  assertDestinationActor(actor, m);
  const ref = tripRef(m.id)!;
  const arrivalCheck = geofenceCheck(input.location, ref.to);
  const serverTime = nowIso();
  if (input.location) ingestPoints(m.id, [{ ...input.location, at: serverTime, label: 'Llegada' }], 'checkpoint', { delayed: !!input.offlineQueuedAt });
  const arrival: TripLeg = { userId: actor.id!, entityId: actor.entityId!, deviceTime: input.deviceTime || serverTime, serverTime, photoId: input.photoId, location: input.location ?? null };
  const seal = traceHash(m.id);
  appendEvent({ type: 'movement_arrival', objectType: 'trip', objectId: m.id, actor, data: { arrival, arrivalCheck, traceHash: seal.hash, traceCount: seal.count, late: m.state === 'no_arrival' }, deviceTime: input.deviceTime, offlineQueuedAt: input.offlineQueuedAt });
  if (arrivalCheck === 'outside') raiseTrackingAlert(`al_arrfence_${m.id}`, 'gate_alert', m.id, `La llegada del movimiento ${m.code} se escaneó fuera del perímetro del destino: no cuenta como llegada verificada.`);
  return store.get('movements', m.id)!;
}

export function movementView(m: Movement) {
  const store = db();
  return {
    ...m,
    vehiclePlate: store.get('vehicles', m.vehicleId)?.plate ?? null,
    fromCenterName: store.get('centers', m.fromCenterId)?.name ?? null,
    batchCode: store.get('batches', m.batchId)?.code ?? null,
    departurePhotoUrl: m.departure.photoId ? store.get('photos', m.departure.photoId)?.url ?? null : null,
    arrivalPhotoUrl: m.arrival?.photoId ? store.get('photos', m.arrival.photoId)?.url ?? null : null,
    verified: m.state === 'received' && m.arrivalCheck !== 'outside',
  };
}

/** Lo ejecuta el planificador: movimiento sin llegada dentro del plazo configurado. */
export function markMovementsNoArrival(deadlineHours: number): number {
  const store = db();
  let n = 0;
  for (const m of store.filter('movements', (x) => x.state === 'in_transit')) {
    if ((Date.now() - Date.parse(m.departure.serverTime)) / 3_600_000 < deadlineHours) continue;
    appendEvent({ type: 'movement_no_arrival', objectType: 'trip', objectId: m.id, actor: { id: null, role: 'system', entityId: null }, data: {} });
    raiseTrackingAlert(`al_noarrival_${m.id}`, 'trip_no_arrival', m.id, `El movimiento ${m.code} hacia ${m.destination.name} superó el plazo de ${deadlineHours} horas sin llegada confirmada.`);
    n++;
  }
  return n;
}
