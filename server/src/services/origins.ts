import type {
  Origin, OriginSize, OriginUrgency, GeoPoint, Subcategory, StructureType, DebrisCause, OriginPriority, RejectionReason,
  Closure, SatisfactionAnswer, Sector, Work, Batch, OriginEffectiveState,
} from '@kindra/shared';
import { effectiveOriginState, pointInPolygon, distanceMeters, REJECTION_REASON_PLAIN, ORIGIN_STATE_PLAIN, ORIGIN_STATE_LABELS, USE_TYPE_LABELS, isoDay } from '@kindra/shared';
import { db } from '../core/db';
import { appendEvent, SYSTEM_ACTOR, type Actor } from '../core/events';
import { assertTransition } from '../core/transitions';
import { newId, newOriginCode, nowIso } from '../core/ids';
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
  source: 'pwa' | 'aura';
  deviceTime?: string | null;
  offlineQueuedAt?: string | null;
  clientKey?: string | null;
}

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
  if (!input.photoIds?.length) throw badRequest('Hace falta al menos una foto del escombro.', 'need_photo');
  for (const pid of input.photoIds) if (!store.get('photos', pid)) throw badRequest('Una de las fotos no existe.');

  const userId = actor.id;
  if (reportsTodayBy({ userId, clientKey: input.clientKey }) >= cfg.thresholds.dailyReportLimit) {
    throw conflict('Por hoy ya registraste varios puntos. Si hay otro urgente, cuéntalo al equipo de coordinación.', 'daily_limit');
  }

  const sector = deriveSector(input.location) || (input.sectorId ? store.get('sectors', input.sectorId) : undefined);
  if (!sector) throw badRequest('No pude ubicar ese punto dentro de los sectores atendidos. Comparte la ubicación o indica el sector y una referencia.', 'sector_unknown');
  if (!input.location && !(input.street || input.reference)) throw badRequest('Indica la ubicación, o la calle y una referencia.', 'need_location');

  const now = nowIso();
  const anonymous = !userId || !!input.anonymous;
  const user = userId ? store.get('users', userId) : undefined;
  const possibleDuplicate = findPossibleDuplicate(input.location, now) || null;
  const firstPhoto = store.get('photos', input.photoIds[0]);
  const photoUnreadable = !!firstPhoto?.unreadable;

  const origin: Origin & { clientKey?: string | null } = {
    id: newId('or'),
    code: newOriginCode((c) => !!getOriginByCode(c)),
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
    priority: null,
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
  const sector = deriveSector(input.location) || (input.sectorId ? store.get('sectors', input.sectorId) : undefined);
  if (!sector) throw badRequest('Indica una ubicación dentro de un sector o elige el sector.');
  const now = nowIso();
  const origin: Origin = {
    id: newId('or'),
    code: newOriginCode((c) => !!getOriginByCode(c)),
    type: 'institutional',
    sectorId: sector.id,
    location: input.location ?? null,
    street: input.street ?? null,
    reference: input.reference ?? null,
    date: input.date || now,
    photoIds: input.photoIds || [],
    subcategory: input.subcategory ?? null,
    size: input.size,
    urgency: null,
    voiceNoteId: null,
    zoneAuthorized: sector.authorized,
    // Los orígenes institucionales quedan sellados con la entidad (4.1), no con una persona.
    reporterId: null,
    reporterName: store.get('entities', actor.entityId || '')?.name ?? null,
    anonymous: false,
    priority: input.priority ?? null,
    state: 'validated',
    validatedAt: now,
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
  if (input.priority) notifyRole('removal', 'prioritized', pickText('notif_removal_prioritized', { número: 1, sector: sector.name }), { link: '/panel/retiro' });
  announceSectorAssigned(sector.id);
  return store.get('origins', origin.id)!;
}

// ---------------------------------------------------------------- coordinación

export function validateOrigin(id: string, actor: Actor, priority?: OriginPriority | null, deviceTime?: string | null): Origin {
  const o = getOriginOrThrow(id);
  if (o.type !== 'citizen') throw conflict('Los orígenes institucionales nacen validados.');
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
  if (o.anonymous || !o.reporterId) throw conflict(pickText('anonymous_cannot_dispute', { código: o.code }), 'anonymous_cannot_dispute');
  assertTransition('origin', 'removal_disputed', o.state, { actor, origin: o });
  const alertText = `Disputa abierta en el reporte ${o.code} (${sectorName(o.sectorId)}): el ciudadano dice que el escombro sigue ahí.`;
  appendEvent({ type: 'removal_disputed', objectType: 'origin', objectId: o.id, actor, data: { closureId: closure.id, comment: comment ?? null, alertText }, deviceTime });
  const text = pickText('dispute');
  notifyOrigin(o, 'dispute', text);
  notifyRole('coordinator', 'dispute', pickText('notif_coord_dispute', { código: o.code, sector: sectorName(o.sectorId) }), { link: '/panel/coordinador' });
  return { origin: db().get('origins', o.id)!, text };
}

export function resolveDispute(id: string, actor: Actor, result: 'removed' | 'reopened', evidencePhotoId?: string | null, note?: string | null, deviceTime?: string | null): Origin {
  const o = getOriginOrThrow(id);
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
