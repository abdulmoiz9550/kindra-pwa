import { encryptField } from './secureField';
import type {
  Origin, OriginSize, OriginUrgency, GeoPoint, Subcategory, StructureType, DebrisCause, OriginPriority, RejectionReason,
  Closure, SatisfactionAnswer, Sector, Work, Batch, OriginEffectiveState, OriginState, ReportStatusKey,
} from '@kindra/shared';
import { PARISHES, PUBLIC_LOT_STATES, REPORT_STATUS_LABELS, effectiveOriginState, pointInPolygon, distanceMeters, REJECTION_REASON_PLAIN, ORIGIN_STATE_PLAIN, ORIGIN_STATE_LABELS, USE_TYPE_LABELS, isoDay } from '@kindra/shared';
import { db } from '../core/db';
import { appendEvent, SYSTEM_ACTOR, type Actor } from '../core/events';
import { assertTransition } from '../core/transitions';
import { newId, newParishCode, nowIso } from '../core/ids';
import { badRequest, conflict, forbidden, notFound } from '../core/errors';
import { getConfig } from './config';
import { notify, notifyOrigin, notifyRole, pickText } from './notifications';
import { refreshRecognition, maybeNotifySuspension, computePoints } from './points';
import { env } from '../config/env';
import { spaceOfSector } from './spaces';
import { announceSectorAssigned } from './announcements';
import { rewardReferrerIfFirstValidated } from './referrals';

// ---------------------------------------------------------------- consultas

export function getOriginByCode(code: string): Origin | undefined {
  const c = code.trim().toUpperCase();
  return db().find('origins', (o) => o.code === c);
}

export function getOriginOrThrow(idOrCode: string): Origin {
  const o = db().get('origins', idOrCode) || getOriginByCode(idOrCode);
  if (!o) throw notFound('No se encontró un reporte con ese código.');
  return o;
}

export function deriveSector(location: GeoPoint | null | undefined): Sector | undefined {
  if (!location) return undefined;
  return db().find('sectors', (s) => pointInPolygon(location, s.polygon));
}

export function sectorName(id: string | null | undefined): string {
  return (id && db().get('sectors', id)?.name) || 'tu sector';
}

export function centerNameForOrigin(o: Origin): string {
  const store = db();
  for (const tid of [...o.tripIds].reverse()) {
    const t = store.get('trips', tid);
    const c = t && store.get('centers', t.centerId);
    if (c) return c.name;
  }
  return 'centro de disposición';
}

/** 7.10: otro origen abierto a menos de X metros y dentro de la ventana de días. */
export function findPossibleDuplicate(location: GeoPoint | null | undefined, at: string, excludeId?: string): Origin | undefined {
  if (!location) return undefined;
  const cfg = getConfig();
  const windowMs = cfg.thresholds.duplicateWindowDays * 86_400_000;
  const atMs = new Date(at).getTime();
  return db().find(
    'origins',
    (o) =>
      o.id !== excludeId &&
      !!o.location &&
      !['rejected', 'duplicate', 'closed'].includes(o.state) &&
      Math.abs(atMs - new Date(o.createdAt).getTime()) <= windowMs &&
      distanceMeters(location, o.location) <= cfg.thresholds.duplicateDistanceM,
  );
}

export function reportsTodayBy(key: { userId?: string | null; clientKey?: string | null }): number {
  const today = isoDay(new Date());
  return db().filter('origins', (o) => isoDay(o.createdAt) === today && o.type === 'citizen' && ((!!key.userId && o.reporterId === key.userId) || (!!key.clientKey && (o as Origin & { clientKey?: string }).clientKey === key.clientKey))).length;
}

// ---------------------------------------------------------------- creación

export interface CitizenReportInput {
  photoIds: string[];
  location?: GeoPoint | null;
  street?: string | null;
  reference?: string | null;
  sectorId?: string | null;
  size: OriginSize;
  urgency?: OriginUrgency | null;
  subcategory?: Subcategory | null;
  voiceNoteId?: string | null;
  reporterName?: string | null;
  anonymous?: boolean;
  source: 'pwa' | 'aura' | 'whatsapp';
  deviceTime?: string | null;
  offlineQueuedAt?: string | null;
  clientKey?: string | null;
  channelProfileId?: string | null;
  /** Addendum v4.2, sección 7. */
  phone?: string | null;
  locationAccuracyM?: number | null;
  viaMonitor?: boolean;
}

/** Abreviatura de la parroquia del sector (CB, CM, MA) para los códigos. */
export function parishCodeOf(sectorId: string | null | undefined): string {
  const s = sectorId ? db().get('sectors', sectorId) : undefined;
  const hit = PARISHES.find((p) => p.name === s?.parish) || PARISHES.find((p) => s?.name.toLowerCase().includes(p.name.toLowerCase()));
  return hit?.code ?? 'LG';
}

const codeCount = (prefix: string) => db().filter('origins', (o) => o.code.startsWith(prefix)).length;

export interface CitizenReportResult {
  origin: Origin;
  sector: Sector;
  zonePending: boolean;
  possibleDuplicate: Origin | null;
  photoUnreadable: boolean;
}

export function createCitizenReport(input: CitizenReportInput, actor: Actor): CitizenReportResult {
  const store = db();
  const cfg = getConfig();
  // Addendum v4.2: sin foto se acepta como «Por Verificar» con prioridad baja.
  input.photoIds = input.photoIds ?? [];
  for (const pid of input.photoIds) if (!store.get('photos', pid)) throw badRequest('Una de las fotos no existe.');

  const userId = actor.id;
  if (reportsTodayBy({ userId, clientKey: input.clientKey }) >= cfg.thresholds.dailyReportLimit) {
    throw conflict('Por hoy ya registraste varios puntos. Si hay otro urgente, cuéntalo al equipo de coordinación.', 'daily_limit');
  }

  // Addendum v4.2: parroquia y sector de la lista son obligatorios; el punto en el mapa es opcional.
  const sector = (input.sectorId ? store.get('sectors', input.sectorId) : undefined) || deriveSector(input.location);
  if (!sector) throw badRequest('Elige la parroquia y el sector de la lista.', 'sector_unknown');

  const now = nowIso();
  const anonymous = !userId || !!input.anonymous;
  const user = userId ? store.get('users', userId) : undefined;
  const possibleDuplicate = findPossibleDuplicate(input.location, now) || null;
  const firstPhoto = store.get('photos', input.photoIds[0]);
  const photoUnreadable = !!firstPhoto?.unreadable;

  const origin: Origin & { clientKey?: string | null } = {
    id: newId('or'),
    code: newParishCode('R', parishCodeOf(sector.id), (c) => !!getOriginByCode(c), codeCount),
    type: 'citizen',
    sectorId: sector.id,
    location: input.location ?? null,
    street: input.street ?? null,
    reference: input.reference ?? null,
    date: now,
    photoIds: input.photoIds,
    subcategory: input.subcategory ?? null,
    size: input.size,
    urgency: input.urgency ?? null,
    voiceNoteId: input.voiceNoteId ?? null,
    zoneAuthorized: sector.authorized,
    reporterId: anonymous ? null : userId,
    reporterName: input.reporterName?.trim() || user?.name || user?.alias || null,
    anonymous,
    priority: input.photoIds.length ? null : 'low',
    state: 'registered',
    linkedOriginIds: [],
    linkedReporterKeys: [],
    duplicateOfId: null,
    entityId: null,
    createdAt: now,
    tripIds: [],
    batchIds: [],
    workIds: [],
    source: input.source,
    // Confidencial: se guarda cifrado.
    reporterPhone: encryptField(input.phone?.trim() || null),
    channelProfileId: input.channelProfileId ?? null,
    reporterRole: actor.role ?? 'citizen',
    viaMonitor: !!input.viaMonitor && actor.role === 'monitor',
    locationAccuracyM: input.location && input.locationAccuracyM != null ? Math.round(input.locationAccuracyM) : null,
    lotIds: [],
    possibleDuplicateOfId: possibleDuplicate?.id ?? null,
    clientKey: input.clientKey ?? null,
    spaceId: spaceOfSector(sector.id),
  };

  appendEvent({ type: 'origin_registered', objectType: 'origin', objectId: origin.id, actor: { id: userId, role: 'citizen', entityId: null }, data: { origin }, deviceTime: input.deviceTime, offlineQueuedAt: input.offlineQueuedAt });

  if (photoUnreadable) {
    appendEvent({ type: 'photo_retake_requested', objectType: 'origin', objectId: origin.id, actor: SYSTEM_ACTOR, data: { photoId: input.photoIds[0], by: 'system' } });
  }

  const pending = store.filter('origins', (o) => o.sectorId === sector.id && o.state === 'registered').length;
  notifyRole('coordinator', 'new_reports', pickText('notif_coord_new_reports', { número: pending, sector: sector.name }), { link: '/panel/coordinador' });
  if (!sector.authorized) notifyOrigin(origin, 'zone_not_cleared', pickText('zone_not_cleared'));

  return { origin: store.get('origins', origin.id)!, sector, zonePending: !sector.authorized, possibleDuplicate, photoUnreadable };
}

export interface InstitutionalOriginInput {
  material?: string | null;
  quantity?: number | null;
  unit?: 't' | 'm3' | null;
  location?: GeoPoint | null;
  street?: string | null;
  reference?: string | null;
  sectorId?: string | null;
  size: OriginSize;
  subcategory?: Subcategory | null;
  structureType: StructureType;
  cause: DebrisCause;
  buildingReference?: string | null;
  priority?: OriginPriority | null;
  photoIds?: string[];
  deviceTime?: string | null;
  date?: string | null;
}

/** Origen institucional: nace validado (6.1). */
export function createInstitutionalOrigin(input: InstitutionalOriginInput, actor: Actor): Origin {
  const store = db();
  if ((input.quantity == null) !== (input.unit == null)) throw badRequest('Indica la cantidad junto con su unidad.');
  // Lo que registra la entidad de retiro lo valida después la coordinación: nadie valida lo propio.
  const collector = actor.role === 'removal';
  const sector = deriveSector(input.location) || (input.sectorId ? store.get('sectors', input.sectorId) : undefined);
  if (!sector) throw badRequest('Indica una ubicación dentro de un sector o elige el sector.');
  const now = nowIso();
  const origin: Origin = {
    id: newId('or'),
    code: newParishCode('LG', parishCodeOf(sector.id), (c) => !!getOriginByCode(c), codeCount),
    type: 'institutional',
    sectorId: sector.id,
    location: input.location ?? null,
    street: input.street ?? null,
    reference: input.reference ?? null,
    date: input.date || now,
    photoIds: input.photoIds || [],
    subcategory: input.subcategory ?? null,
    material: input.material?.trim() || null,
    quantity: input.quantity ?? null,
    unit: input.unit ?? null,
    size: input.size,
    urgency: null,
    voiceNoteId: null,
    zoneAuthorized: sector.authorized,
    // Los orígenes institucionales quedan sellados con la entidad (4.1), no con una persona.
    reporterId: null,
    reporterName: store.get('entities', actor.entityId || '')?.name ?? null,
    anonymous: false,
    priority: input.priority ?? null,
    state: collector ? 'registered' : 'validated',
    validatedAt: collector ? null : now,
    linkedOriginIds: [],
    linkedReporterKeys: [],
    duplicateOfId: null,
    structureType: input.structureType,
    cause: input.cause,
    buildingReference: input.buildingReference ?? null,
    entityId: actor.entityId,
    createdAt: now,
    tripIds: [],
    batchIds: [],
    workIds: [],
    source: 'institutional',
    spaceId: spaceOfSector(sector.id),
  };
  appendEvent({ type: 'origin_registered', objectType: 'origin', objectId: origin.id, actor, data: { origin }, deviceTime: input.deviceTime });
  if (collector) {
    notifyRole('coordinator', 'origin_to_validate', `Hay un origen por validar: ${origin.code}.`, { link: '/panel/coordinador' });
    return store.get('origins', origin.id)!;
  }
  if (input.priority) notifyRole('removal', 'prioritized', pickText('notif_removal_prioritized', { número: 1, sector: sector.name }), { link: '/panel/retiro' });
  announceSectorAssigned(sector.id);
  return store.get('origins', origin.id)!;
}

// ---------------------------------------------------------------- coordinación

export function validateOrigin(id: string, actor: Actor, priority?: OriginPriority | null, deviceTime?: string | null): Origin {
  const o = getOriginOrThrow(id);
  if (o.type !== 'citizen' && o.state !== 'registered') throw conflict('Los orígenes institucionales nacen validados.');
  assertNotOwn(o, actor, 'validar');
  if (o.type === 'citizen' && !o.photoIds.length && !confirmedOnSite(o)) throw conflict('Este reporte llegó sin foto: queda «Por Verificar» hasta que un Contralor Comunitario confirme en campo que el punto existe.', 'needs_field_verification');
  assertTransition('origin', 'origin_validated', o.state, { actor, origin: o });
  appendEvent({ type: 'origin_validated', objectType: 'origin', objectId: o.id, actor, data: { priority: priority ?? null }, deviceTime });
  const sector = sectorName(o.sectorId);
  notifyOrigin(o, 'validated', pickText('validated_notice', { código: o.code, sector }));
  if (priority) notifyRole('removal', 'prioritized', pickText('notif_removal_prioritized', { número: 1, sector }), { link: '/panel/retiro' });
  if (o.reporterId) {
    refreshRecognition(o.reporterId);
    rewardReferrerIfFirstValidated(o.reporterId, o.id);
  }
  announceSectorAssigned(o.sectorId);
  return db().get('origins', o.id)!;
}

export function rejectOrigin(id: string, actor: Actor, reason: RejectionReason, note?: string | null, deviceTime?: string | null): Origin {
  const o = getOriginOrThrow(id);
  if (!reason) throw badRequest('El motivo de rechazo es obligatorio.');
  assertNotOwn(o, actor, 'rechazar');
  assertTransition('origin', 'origin_rejected', o.state, { actor, origin: o });
  appendEvent({ type: 'origin_rejected', objectType: 'origin', objectId: o.id, actor, data: { reason, note: note ?? null }, deviceTime });
  notifyOrigin(o, 'rejected', pickText('rejection', { código: o.code, motivo: REJECTION_REASON_PLAIN[reason] + (note ? ` (${note})` : '') }));
  if (o.reporterId) {
    refreshRecognition(o.reporterId);
    maybeNotifySuspension(o.reporterId);
  }
  return db().get('origins', o.id)!;
}

export function markDuplicate(id: string, mainId: string, actor: Actor, deviceTime?: string | null): Origin {
  const o = getOriginOrThrow(id);
  const main = getOriginOrThrow(mainId);
  assertNotOwn(o, actor, 'marcar como duplicado');
  if (main.id === o.id) throw badRequest('Un reporte no puede ser duplicado de sí mismo.');
  if (['rejected', 'duplicate'].includes(main.state)) throw badRequest('El reporte principal no puede estar rechazado ni ser a su vez un duplicado.');
  assertTransition('origin', 'origin_marked_duplicate', o.state, { actor, origin: o });
  appendEvent({ type: 'origin_marked_duplicate', objectType: 'origin', objectId: o.id, actor, data: { mainOriginId: main.id, mainCode: main.code }, deviceTime });
  notifyOrigin(o, 'duplicate', pickText('status_duplicate', { código: o.code, principal: main.code }), `/reporte/${main.code}`);
  return db().get('origins', o.id)!;
}

export function setPriority(id: string, actor: Actor, priority: OriginPriority, deviceTime?: string | null): Origin {
  const o = getOriginOrThrow(id);
  if (actor.role !== 'coordinator' && actor.role !== 'admin') throw forbidden();
  appendEvent({ type: 'priority_set', objectType: 'origin', objectId: o.id, actor, data: { priority }, deviceTime });
  notifyRole('removal', 'prioritized', pickText('notif_removal_prioritized', { número: 1, sector: sectorName(o.sectorId) }), { link: '/panel/retiro' });
  return db().get('origins', o.id)!;
}

export function setOriginZone(id: string, actor: Actor, authorized: boolean, deviceTime?: string | null): Origin {
  const o = getOriginOrThrow(id);
  if (actor.role !== 'coordinator' && actor.role !== 'admin') throw forbidden('Solo el coordinador o el administrador cambian la autorización de zona.');
  if (o.zoneAuthorized === authorized) return o;
  appendEvent({ type: authorized ? 'zone_authorized' : 'zone_unauthorized', objectType: 'origin', objectId: o.id, actor, data: { sectorId: o.sectorId }, deviceTime });
  if (authorized) notifyOrigin(o, 'zone_authorized', pickText(o.state === 'validated' ? 'validated_notice' : 'status_registered', { código: o.code, sector: sectorName(o.sectorId) }));
  else notifyOrigin(o, 'zone_not_cleared', pickText('zone_not_cleared'));
  return db().get('origins', o.id)!;
}

/** Autorización de zona a nivel de sector: actualiza el sector y emite un evento por cada origen afectado. */
export function setSectorAuthorization(sectorId: string, actor: Actor, authorized: boolean): { sector: Sector; affected: number } {
  const store = db();
  const sector = store.get('sectors', sectorId);
  if (!sector) throw notFound('El sector no existe.');
  if (actor.role !== 'coordinator' && actor.role !== 'admin') throw forbidden('Solo el coordinador o el administrador cambian la autorización de zona.');
  const next = store.update('sectors', sectorId, { authorized });
  let affected = 0;
  for (const o of store.filter('origins', (x) => x.sectorId === sectorId && x.zoneAuthorized !== authorized && !['rejected', 'duplicate', 'closed'].includes(x.state))) {
    setOriginZone(o.id, actor, authorized);
    affected++;
  }
  return { sector: next, affected };
}

export function markRemoved(id: string, actor: Actor, evidencePhotoId?: string | null, deviceTime?: string | null): Origin {
  const o = getOriginOrThrow(id);
  assertNotOwn(o, actor, 'cerrar');
  assertTransition('origin', 'origin_removed', o.state, { actor, origin: o });
  appendEvent({ type: 'origin_removed', objectType: 'origin', objectId: o.id, actor, data: { evidencePhotoId: evidencePhotoId ?? null }, deviceTime });
  sendRemovalClosure(db().get('origins', o.id)!);
  return db().get('origins', o.id)!;
}

/** 14.1 primer cierre. */
export function sendRemovalClosure(o: Origin): Closure {
  const existing = db().find('closures', (c) => c.originId === o.id && c.type === 'removal');
  if (existing) return existing;
  const closure: Closure = { id: newId('cl'), originId: o.id, type: 'removal', sentAt: nowIso(), citizenResponse: 'no_response' };
  appendEvent({ type: 'removal_closure_sent', objectType: 'origin', objectId: o.id, actor: SYSTEM_ACTOR, data: { closure } });
  notifyOrigin(o, 'first_closure', pickText('first_closure', { código: o.code, centro: centerNameForOrigin(o) }));
  return closure;
}

export interface Responder {
  userId?: string | null;
  byCode?: boolean;
  /** Perfil de AURA por WhatsApp de quien reportó. */
  profileId?: string | null;
}

export function respondRemovalClosure(code: string, response: 'confirmed' | 'disputed', responder: Responder, comment?: string | null, deviceTime?: string | null): { origin: Origin; text: string } {
  const o = getOriginOrThrow(code);
  const closure = db().find('closures', (c) => c.originId === o.id && c.type === 'removal');
  if (!closure) throw conflict('Este reporte todavía no figura como retirado; no hay nada que confirmar.', 'nothing_to_confirm');
  if (closure.citizenResponse !== 'no_response') throw conflict('Ya respondiste a este cierre.', 'already_answered');
  if (o.reporterId && responder.userId && responder.userId !== o.reporterId) throw forbidden('Solo quien hizo el reporte puede responder.');
  const actor: Actor = { id: responder.userId ?? null, role: 'citizen', entityId: null };
  if (response === 'confirmed') {
    appendEvent({ type: 'removal_confirmed', objectType: 'origin', objectId: o.id, actor, data: { closureId: closure.id, comment: comment ?? null }, deviceTime });
    if (o.reporterId) refreshRecognition(o.reporterId);
    const text = pickText('citizen_confirms');
    notifyOrigin(o, 'removal_confirmed', text);
    return { origin: db().get('origins', o.id)!, text };
  }
  const viaBot = !!responder.profileId && responder.profileId === o.channelProfileId;
  if (!viaBot && (o.anonymous || !o.reporterId)) throw conflict(pickText('anonymous_cannot_dispute', { código: o.code }), 'anonymous_cannot_dispute');
  assertTransition('origin', 'removal_disputed', o.state, { actor, origin: o });
  const alertText = `Disputa abierta en el reporte ${o.code} (${sectorName(o.sectorId)}): el ciudadano dice que el escombro sigue ahí.`;
  appendEvent({ type: 'removal_disputed', objectType: 'origin', objectId: o.id, actor, data: { closureId: closure.id, comment: comment ?? null, alertText }, deviceTime });
  const text = pickText('dispute');
  notifyOrigin(o, 'dispute', text);
  notifyRole('coordinator', 'dispute', pickText('notif_coord_dispute', { código: o.code, sector: sectorName(o.sectorId) }), { link: '/panel/coordinador' });
  // Addendum v4.2: la disputa reabre el caso y llega al Contralor Comunitario del sector.
  const monitors = sectorMonitors(o.sectorId, o.reporterId);
  if (monitors.length) notify({ recipientKeys: monitors.map((m) => `user:${m}`), kind: 'dispute', text: `Disputa en ${o.code} (${sectorName(o.sectorId)}): revisa el punto en campo.`, link: '/contralor' });
  return { origin: db().get('origins', o.id)!, text };
}

export function resolveDispute(id: string, actor: Actor, result: 'removed' | 'reopened', evidencePhotoId?: string | null, note?: string | null, deviceTime?: string | null): Origin {
  const o = getOriginOrThrow(id);
  assertNotOwn(o, actor, 'resolver la disputa de');
  assertTransition('origin', 'dispute_resolved', o.state, { actor, origin: o, evidence: result === 'reopened' || !!evidencePhotoId });
  appendEvent({ type: 'dispute_resolved', objectType: 'origin', objectId: o.id, actor, data: { result, evidencePhotoId: evidencePhotoId ?? null, note: note ?? null }, deviceTime });
  const resultado = pickText(result === 'removed' ? 'dispute_result_removed' : 'dispute_result_reopened');
  notifyOrigin(o, 'dispute_resolved', pickText('dispute_resolved', { código: o.code, resultado }));
  return db().get('origins', o.id)!;
}

export function answerSatisfaction(code: string, answer: SatisfactionAnswer, responder: Responder, comment?: string | null, deviceTime?: string | null): { text: string } {
  const o = getOriginOrThrow(code);
  const closure = db().find('closures', (c) => c.originId === o.id && c.type === 'work');
  if (!closure) throw conflict('Este reporte todavía no tiene cierre final.', 'no_final_closure');
  if (closure.satisfactionAnswer) throw conflict('Ya respondiste la pregunta de satisfacción.', 'already_answered');
  if (o.reporterId && responder.userId && responder.userId !== o.reporterId) throw forbidden('Solo quien hizo el reporte puede responder.');
  appendEvent({ type: 'satisfaction_answered', objectType: 'origin', objectId: o.id, actor: { id: responder.userId ?? null, role: 'citizen', entityId: null }, data: { closureId: closure.id, answer, comment: comment ?? null }, deviceTime });
  return { text: pickText(answer === 'yes' ? 'satisfaction_yes' : 'satisfaction_no') };
}

/** 7.12: el coordinador marca la foto como ilegible y se pide otra. */
export function requestPhotoRetake(id: string, actor: Actor, photoId: string, deviceTime?: string | null): Origin {
  const o = getOriginOrThrow(id);
  if (actor.role !== 'coordinator') throw forbidden();
  const photo = db().get('photos', photoId);
  if (!photo) throw badRequest('La foto no existe.');
  db().update('photos', photoId, { unreadable: true });
  appendEvent({ type: 'photo_retake_requested', objectType: 'origin', objectId: o.id, actor, data: { photoId, by: 'coordinator' }, deviceTime });
  const next = db().get('origins', o.id)!;
  notifyOrigin(next, 'photo_retake', pickText(next.manualReview ? 'manual_review' : 'unreadable_photo', { código: o.code }));
  return next;
}

export function addRetakePhoto(code: string, photoId: string, responder: Responder): { origin: Origin; manualReview: boolean; text: string } {
  const o = getOriginOrThrow(code);
  const photo = db().get('photos', photoId);
  if (!photo) throw badRequest('La foto no existe.');
  if (o.reporterId && responder.userId && responder.userId !== o.reporterId) throw forbidden();
  const actor: Actor = { id: responder.userId ?? null, role: 'citizen', entityId: null };
  appendEvent({ type: 'photo_added', objectType: 'origin', objectId: o.id, actor, data: { photoId } });
  if (photo.unreadable) {
    appendEvent({ type: 'photo_retake_requested', objectType: 'origin', objectId: o.id, actor: SYSTEM_ACTOR, data: { photoId, by: 'system' } });
    const next = db().get('origins', o.id)!;
    return { origin: next, manualReview: !!next.manualReview, text: pickText(next.manualReview ? 'manual_review' : 'unreadable_photo', { código: o.code }) };
  }
  return { origin: db().get('origins', o.id)!, manualReview: false, text: pickText('after_photo') };
}

// ---------------------------------------------------------------- cierre final (lo invoca works.ts)

export function sendFinalClosure(o: Origin, work: Work, batch: Batch): Closure | null {
  const store = db();
  if (store.find('closures', (c) => c.originId === o.id && c.type === 'work')) return null;
  const closure: Closure = { id: newId('cl'), originId: o.id, type: 'work', sentAt: nowIso(), citizenResponse: 'no_response', workId: work.id, batchId: batch.id };
  appendEvent({ type: 'final_closure_sent', objectType: 'origin', objectId: o.id, actor: SYSTEM_ACTOR, data: { closure, workId: work.id, batchId: batch.id } });
  const center = store.get('centers', batch.centerId);
  const qty = batch.outputs ? `${batch.outputs.aggregate} ${batch.outputs.unit === 't' ? 'toneladas' : 'm³'}` : 'una cantidad registrada';
  const link = `${env.publicBaseUrl}/publico/ficha/${o.code}`;
  const text = pickText('final_closure', {
    sector: sectorName(o.sectorId),
    centro: center?.name || 'centro de disposición',
    cantidad: qty,
    'tipo de obra': USE_TYPE_LABELS[work.useType] || work.useType,
    localidad: work.locality,
    enlace: link,
  });
  notifyOrigin(o, 'final_closure', text, `/reporte/${o.code}`);
  notifyPublicStage(o, 4);
  notifyOrigin(o, 'satisfaction_question', pickText('satisfaction_question'), `/reporte/${o.code}#satisfaccion`);
  if (o.reporterId) {
    refreshRecognition(o.reporterId);
    const s = computePoints(o.reporterId);
    notify({ recipientKeys: [`user:${o.reporterId}`], kind: 'recognition', text: pickText('recognition', { nivel: s.level.name }), link: '/perfil', originCode: o.code });
  }
  return closure;
}

// ---------------------------------------------------------------- vistas

export interface OriginStatusView {
  code: string;
  sectorId: string;
  sector: string;
  state: OriginEffectiveState;
  label: string;
  plain: string;
  auraKey: string;
  vars: Record<string, string | number | null>;
  center: string;
  priority: OriginPriority | null;
  createdAt: string;
  pendingRemovalConfirmation: boolean;
  pendingSatisfaction: boolean;
  anonymous: boolean;
  mainCode?: string | null;
}

export function originStatusView(o: Origin): OriginStatusView {
  const store = db();
  const state = effectiveOriginState(o);
  const center = centerNameForOrigin(o);
  const sector = sectorName(o.sectorId);
  const removal = store.find('closures', (c) => c.originId === o.id && c.type === 'removal');
  const work = store.find('closures', (c) => c.originId === o.id && c.type === 'work');
  const main = o.duplicateOfId ? store.get('origins', o.duplicateOfId) : undefined;
  const keyByState: Record<OriginEffectiveState, string> = {
    pending_authorization: 'zone_not_cleared',
    registered: 'status_registered',
    validated: 'status_validated',
    rejected: 'status_rejected',
    duplicate: 'status_duplicate',
    under_removal: 'status_under_removal',
    removed: 'status_removed',
    disputed: 'status_disputed',
    in_batch: 'status_in_batch',
    in_work: 'status_in_work',
    closed: 'status_closed',
  };
  return {
    code: o.code,
    sectorId: o.sectorId,
    sector,
    state,
    label: ORIGIN_STATE_LABELS[state],
    plain: ORIGIN_STATE_PLAIN[state],
    auraKey: keyByState[state],
    vars: {
      código: o.code,
      sector,
      centro: center,
      motivo: o.rejectionReason ? REJECTION_REASON_PLAIN[o.rejectionReason] : null,
      principal: main?.code ?? null,
    },
    center,
    priority: o.priority ?? null,
    createdAt: o.createdAt,
    pendingRemovalConfirmation: !!removal && removal.citizenResponse === 'no_response',
    pendingSatisfaction: !!work && !work.satisfactionAnswer,
    anonymous: o.anonymous,
    mainCode: main?.code ?? null,
  };
}

export function listOriginsForReporter(userId: string): Origin[] {
  return db()
    .filter('origins', (o) => o.reporterId === userId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function lookupOrigins(codes: string[]): Origin[] {
  const set = new Set(codes.map((c) => c.trim().toUpperCase()));
  return db()
    .filter('origins', (o) => set.has(o.code))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// ---------------------------------------------------------------- addendum v4.2: reporte ciudadano y lote

/** Nadie valida, verifica en campo, asigna a un lote ni cierra su propio reporte (addendum v4.2, sección 3). */
export function assertNotOwn(o: Origin, actor: Actor, what = 'actuar sobre'): void {
  if (actor.id && o.reporterId && o.reporterId === actor.id) throw forbidden(`No puedes ${what} un reporte que hiciste tú. Lo hace otra persona con el rol correspondiente.`, 'notOwnReport');
}

/** Contralores Comunitarios activos de un sector, sin contar a quien reportó. */
export function sectorMonitors(sectorId: string, exceptUserId?: string | null): string[] {
  return db()
    .filter('users', (u) => u.active && u.roles.includes('monitor') && (!u.sectorId || u.sectorId === sectorId || (u.monitorSectorIds ?? []).includes(sectorId)) && u.id !== exceptUserId)
    .map((u) => u.id);
}

/** La coordinación asigna un reporte validado a uno o más lotes de origen (LG-…). */
export function linkReportToLot(reportId: string, lotCode: string, actor: Actor): Origin {
  const store = db();
  if (actor.role !== 'coordinator') throw forbidden('Solo el Ente Coordinador asigna reportes a lotes.');
  const o = getOriginOrThrow(reportId);
  assertNotOwn(o, actor, 'asignar a un lote');
  if (o.type !== 'citizen') throw badRequest('Solo los reportes ciudadanos se asignan a un lote.');
  if (['registered', 'rejected', 'duplicate'].includes(o.state)) throw conflict('Valida primero el reporte.', 'not_validated');
  const lot = getOriginOrThrow(lotCode.trim().toUpperCase());
  if (lot.type !== 'institutional' || ['rejected', 'duplicate'].includes(lot.state)) throw badRequest('El código no corresponde a un lote de origen activo.');
  if ((o.lotIds ?? []).includes(lot.id)) return o;
  appendEvent({ type: 'report_linked_to_lot', objectType: 'origin', objectId: o.id, actor, data: { lotId: lot.id, lotCode: lot.code } });
  notifyOrigin(o, 'lote_asignado', `Tu reporte ${o.code} quedó asignado al lote ${lot.code}. Desde ahora ves sus 4 estados públicos.`);
  return store.get('origins', o.id)!;
}

/** Ubicación confirmada en campo (Contralor del sector o Ente de Retiro). La capturada queda en el historial. */
export function confirmLocation(id: string, actor: Actor, location: GeoPoint): Origin {
  const o = getOriginOrThrow(id);
  if (actor.role !== 'monitor' && actor.role !== 'removal' && actor.role !== 'driver') throw forbidden('Confirma la ubicación el Contralor Comunitario o el Ente de Retiro.');
  assertNotOwn(o, actor, 'confirmar la ubicación de');
  if (!(Math.abs(location.lat) <= 90 && Math.abs(location.lng) <= 180)) throw badRequest('Ubicación no válida.');
  appendEvent({ type: 'location_confirmed', objectType: 'origin', objectId: o.id, actor, data: { location: { lat: location.lat, lng: location.lng } } });
  return db().get('origins', o.id)!;
}

/**
 * El Contralor Comunitario valida o rechaza un cierre propuesto con foto. Rechazarlo reabre el caso como disputa.
 * No puede hacerlo sobre un reporte propio.
 */
export function monitorReviewClosure(id: string, actor: Actor, ok: boolean, photoId: string | null, note?: string | null): Origin {
  const store = db();
  const o = getOriginOrThrow(id);
  const user = actor.id ? store.get('users', actor.id) : undefined;
  if (actor.role !== 'monitor' || !user || !sectorMonitors(o.sectorId).includes(user.id)) throw forbidden('Solo un Contralor Comunitario del sector revisa cierres.');
  assertNotOwn(o, actor, 'revisar el cierre de');
  const closure = store.find('closures', (c) => c.originId === o.id && c.type === 'removal');
  if (!closure) throw conflict('Este punto no tiene un cierre propuesto.', 'nothing_to_confirm');
  if (!photoId || !store.get('photos', photoId)) throw badRequest('La foto es obligatoria.');
  appendEvent({ type: 'field_verified', objectType: 'origin', objectId: o.id, actor, data: { kind: 'closure', ok, photoId, note: note?.trim() || null } });
  if (!ok && o.state !== 'disputed') {
    const alertText = `El Contralor Comunitario no validó el cierre de ${o.code} (${sectorName(o.sectorId)}).`;
    appendEvent({ type: 'removal_disputed', objectType: 'origin', objectId: o.id, actor, data: { closureId: closure.id, comment: note?.trim() || null, alertText, byMonitor: true } });
    notifyRole('coordinator', 'dispute', alertText, { link: '/panel/coordinador?tab=disputes' });
    notifyOrigin(o, 'caso_reabierto', `El caso ${o.code} se reabrió: el punto no quedó despejado.`);
  }
  refreshRecognition(user.id);
  return store.get('origins', o.id)!;
}

const LOT_STAGE_OF_STATE: Partial<Record<OriginState, number>> = { under_removal: 1, removed: 1, in_batch: 2, in_work: 4, closed: 4 };

/**
 * Addendum v4.2, sección 4: estado público 1 a 4 (Retirado, Recibido, Procesado y Ensayado, Destino Final).
 * 0 = sin estado público. El 3 exige un ensayo validado; sin evidencia de una etapa, el lote no avanza.
 */
export function publicLotStage(o: Origin): number {
  const store = db();
  if (['rejected', 'duplicate'].includes(o.state)) return 0;
  let stage = 0;
  const trips = o.tripIds.map((id) => store.get('trips', id)).filter((t): t is NonNullable<typeof t> => !!t);
  if (trips.length) stage = 1;
  if (trips.some((t) => t.state === 'received')) stage = 2;
  const batches = o.batchIds.map((id) => store.get('batches', id)).filter((b): b is NonNullable<typeof b> => !!b);
  if (batches.some((b) => !!b.outputs && !!b.qualityVerificationId && store.get('qualityVerifications', b.qualityVerificationId)?.result === 'approved')) stage = 3;
  if (o.workIds.length && stage >= 3) stage = 4;
  const base = o.state === 'disputed' ? (o.preDisputeState as OriginState | null) : o.state;
  // Estados heredados sin viaje registrado (datos anteriores): nunca suben por encima de la evidencia.
  if (!trips.length && base && (LOT_STAGE_OF_STATE[base] ?? 0) >= 1 && o.removedAt) stage = Math.max(stage, 1);
  for (const lid of o.lotIds ?? []) {
    const lot = store.get('origins', lid);
    if (lot && lot.id !== o.id) stage = Math.max(stage, publicLotStage(lot));
  }
  return stage;
}

export interface ReportStatus {
  key: ReportStatusKey;
  label: string;
  reason: string | null;
  lotCodes: string[];
  publicStage: number;
  publicStageLabel: string | null;
  confirmBy: string | null;
}

/** Addendum v4.2, sección 7: estado del reporte ciudadano para la persona, el portal y AURA. */
export function reportStatus(o: Origin): ReportStatus {
  const store = db();
  const lotCodes = (o.lotIds ?? []).map((id) => store.get('origins', id)?.code).filter((c): c is string => !!c);
  const stage = publicLotStage(o);
  const removal = store.find('closures', (c) => c.originId === o.id && c.type === 'removal');
  const days = getConfig().thresholds.closureConfirmDays ?? 7;
  const out = (key: ReportStatusKey, reason: string | null = null): ReportStatus => ({
    key,
    label: REPORT_STATUS_LABELS[key],
    reason,
    lotCodes,
    publicStage: stage,
    publicStageLabel: stage ? PUBLIC_LOT_STATES[stage - 1] : null,
    confirmBy: key === 'closure_proposed' && removal ? new Date(Date.parse(removal.sentAt) + days * 86_400_000).toISOString() : null,
  });
  if (o.state === 'duplicate') return out('closed', 'duplicado');
  if (o.state === 'rejected') return out('closed', o.rejectionReason === 'outside_area' ? 'fuera de la zona' : o.rejectionReason === 'not_earthquake_debris' ? 'no es escombro' : o.rejectionReason === 'false' ? 'no se encontró el punto' : 'rechazado');
  if (o.fieldVerification?.result === 'not_exists' && o.state === 'registered') return out('received', 'el Contralor no encontró el punto');
  if (o.state === 'disputed') return out('disputed');
  if (removal?.citizenResponse === 'confirmed') return out(o.state === 'closed' ? 'closed' : 'confirmed', o.state === 'closed' ? 'despejado y confirmado' : null);
  if (removal && removal.citizenResponse === 'no_response') return o.closedNoConfirmationAt ? out('closed_no_confirmation', 'sin respuesta en el plazo') : out('closure_proposed');
  if (lotCodes.length || stage >= 1 || ['under_removal', 'removed', 'in_batch', 'in_work', 'closed'].includes(o.state)) return out('assigned_to_lot');
  if (o.state === 'validated') return out('validated');
  return out('received', o.photoIds.length ? null : 'sin foto: lo confirma un Contralor Comunitario');
}

/** Cierra sin confirmación los cierres propuestos que vencieron (se llama desde el ciclo de escalamiento). */
export function expireClosures(): number {
  const store = db();
  const days = getConfig().thresholds.closureConfirmDays ?? 7;
  const limit = Date.now() - days * 86_400_000;
  let n = 0;
  for (const c of store.filter('closures', (x) => x.type === 'removal' && x.citizenResponse === 'no_response' && Date.parse(x.sentAt) < limit)) {
    const o = store.get('origins', c.originId);
    if (!o || o.closedNoConfirmationAt || o.state === 'disputed') continue;
    appendEvent({ type: 'closure_expired', objectType: 'origin', objectId: o.id, actor: SYSTEM_ACTOR, data: { closureId: c.id, days } });
    n++;
  }
  return n;
}

/**
 * Addendum v4.2, 10.5: aviso cuando el lote pasa a Recibido, Procesado y Ensayado o Destino Final. Llega al reporte y
 * a los reportes ciudadanos asignados a ese lote.
 */
export function notifyPublicStage(o: Origin, stage: number): void {
  if (stage < 2 || stage > 4) return;
  const store = db();
  const label = PUBLIC_LOT_STATES[stage - 1];
  // En Destino Final el propio reporte ya recibió su aviso de cierre final.
  const targets = [...(stage === 4 ? [] : [o]), ...store.filter('origins', (x) => (x.lotIds ?? []).includes(o.id))];
  for (const t of targets) {
    if (t.type !== 'citizen') continue;
    notifyOrigin(t, 'status_change', `Tu reporte ${t.code} avanzó: el lote está en «${label}».`);
  }
}

/** Un Contralor Comunitario confirmó en campo que el punto existe (las verificaciones anteriores sin resultado cuentan como «existe»). */
export function confirmedOnSite(o: Origin): boolean {
  if (o.fieldVerification) return o.fieldVerification.result === 'exists';
  return !!o.verifiedOnSiteAt;
}
