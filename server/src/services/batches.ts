import type { Batch, BatchOutputs, Reception, Subcategory, HazardDecision, QualityVerification, Dispatch, DailySummary, JobsRecord, Center } from '@kindra/shared';
import { db } from '../core/db';
import { appendEvent, SYSTEM_ACTOR, type Actor } from '../core/events';
import { assertTransition } from '../core/transitions';
import { newId, newBatchCode, newDispatchCode, nowIso } from '../core/ids';
import { badRequest, conflict, forbidden, notFound } from '../core/errors';
import { getConfig } from './config';
import { notifyRole, pickText } from './notifications';

// ---------------------------------------------------------------- lotes

export function getBatchOrThrow(idOrCode: string): Batch {
  const b = db().get('batches', idOrCode) || db().find('batches', (x) => x.code === idOrCode.toUpperCase());
  if (!b) throw notFound('El lote no existe.');
  return b;
}

function requireCenterUser(actor: Actor, centerId: string): void {
  if (actor.role === 'system' || actor.role === 'admin') return;
  const u = actor.id ? db().get('users', actor.id) : undefined;
  if (!u || u.centerId !== centerId) throw forbidden('Solo el personal asignado a este centro puede operar sobre él.');
}

/** Lote abierto del centro para el periodo actual (5.9: semanal por defecto). Lo crea si no existe. */
export function ensureOpenBatch(centerId: string, at: string = nowIso()): Batch {
  const store = db();
  const center = store.get('centers', centerId);
  if (!center) throw notFound('El centro no existe.');
  const current = store.find('batches', (b) => b.centerId === centerId && (b.state === 'open' || (b.state === 'held' && b.previousState === 'open')) && b.periodStart <= at && at < b.periodEnd);
  if (current) return current;
  const anyOpen = store.find('batches', (b) => b.centerId === centerId && (b.state === 'open' || (b.state === 'held' && b.previousState === 'open')));
  if (anyOpen) return anyOpen; // periodo vencido pero no cerrado: sigue recibiendo hasta que el centro lo cierre
  const cfg = getConfig();
  const start = new Date(at);
  const end = new Date(start.getTime() + cfg.batchPeriodDays * 86_400_000);
  const seq = store.filter('batches', (b) => b.centerId === centerId).length + 1;
  const batch: Batch = {
    id: newId('lt'),
    code: newBatchCode(center.shortCode, seq),
    centerId,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    state: 'open',
    previousState: null,
    receptionIds: [],
    outputs: null,
    qualityVerificationId: null,
    qualityResult: null,
    hazardDecisionIds: [],
    dispatchIds: [],
    openedAt: at,
  };
  appendEvent({ type: 'batch_opened', objectType: 'batch', objectId: batch.id, actor: SYSTEM_ACTOR, data: { batch }, serverTimeOverride: at });
  return store.get('batches', batch.id)!;
}

export interface ClassifyInput {
  subcategory: Subcategory;
  photoId?: string | null;
  note?: string | null;
  deviceTime?: string | null;
}

export function classifyReception(receptionId: string, actor: Actor, input: ClassifyInput): { reception: Reception; batch: Batch } {
  const store = db();
  const r = store.get('receptions', receptionId);
  if (!r) throw notFound('La recepción no existe.');
  requireCenterUser(actor, r.centerId);
  const batch = getBatchOrThrow(r.batchId);
  if (['processed', 'under_verification', 'approved', 'rejected', 'partially_dispatched', 'fully_dispatched'].includes(batch.state)) {
    throw conflict('El lote ya fue procesado; la clasificación no puede cambiar. Usa una corrección si hace falta.');
  }
  appendEvent({ type: 'reception_classified', objectType: 'batch', objectId: batch.id, actor, data: { receptionId: r.id, tripId: r.tripId, subcategory: input.subcategory, photoId: input.photoId ?? null, note: input.note ?? null }, deviceTime: input.deviceTime });
  let next = store.get('batches', batch.id)!;
  if (input.subcategory === 'possible_hazardous' && next.state !== 'held') {
    assertTransition('batch', 'batch_held', next.state, { actor: SYSTEM_ACTOR, batch: next });
    appendEvent({ type: 'batch_held', objectType: 'batch', objectId: batch.id, actor: SYSTEM_ACTOR, data: { receptionIds: [r.id] } });
    next = store.get('batches', batch.id)!;
    notifyRole('evaluator', 'batch_held', pickText('notif_evaluator_held', { código: next.code }), { link: '/panel/evaluador' });
  }
  return { reception: store.get('receptions', r.id)!, batch: next };
}

export interface HazardInput {
  receptionIds: string[];
  checklist: Record<string, boolean>;
  decision: 'release' | 'special_disposal';
  justification: string;
  deviceTime?: string | null;
}

function assertChecklist(checklist: Record<string, boolean>, keys: string[]): void {
  for (const k of keys) if (typeof checklist?.[k] !== 'boolean') throw badRequest(`La lista de verificación está incompleta (falta "${k}").`, 'checklist_incomplete');
}

export function decideHazard(batchId: string, actor: Actor, input: HazardInput): { batch: Batch; decision: HazardDecision } {
  const store = db();
  if (actor.role !== 'evaluator' || !actor.id || !actor.entityId) throw forbidden('Solo el evaluador técnico decide sobre material peligroso.');
  const batch = getBatchOrThrow(batchId);
  if (batch.state !== 'held') throw conflict('El lote no está retenido.');
  if (!input.receptionIds?.length) throw badRequest('Indica las recepciones afectadas.');
  const cfg = getConfig();
  assertChecklist(input.checklist, cfg.hazardChecklist.map((c) => c.key));
  if (!input.justification?.trim()) throw badRequest('La justificación escrita es obligatoria.');
  for (const rid of input.receptionIds) {
    const r = store.get('receptions', rid);
    if (!r || r.batchId !== batch.id) throw badRequest('Una de las recepciones no pertenece a este lote.');
    if (r.subcategory !== 'possible_hazardous') throw badRequest('Solo se decide sobre recepciones con posible material peligroso.');
    if (r.hazardDecision) throw conflict('Esa recepción ya tiene decisión.');
  }
  const decision: HazardDecision = {
    id: newId('hz'),
    batchId: batch.id,
    receptionIds: input.receptionIds,
    checklist: input.checklist,
    decision: input.decision,
    justification: input.justification.trim(),
    evaluatorId: actor.id,
    entityId: actor.entityId,
    createdAt: nowIso(),
  };
  appendEvent({ type: 'hazard_decided', objectType: 'batch', objectId: batch.id, actor, data: { decision }, deviceTime: input.deviceTime });
  let next = store.get('batches', batch.id)!;
  const pending = next.receptionIds.some((rid) => {
    const r = store.get('receptions', rid);
    return r?.subcategory === 'possible_hazardous' && !r.hazardDecision;
  });
  if (!pending) {
    assertTransition('batch', 'batch_released', next.state, { actor: SYSTEM_ACTOR, batch: next });
    appendEvent({ type: 'batch_released', objectType: 'batch', objectId: batch.id, actor: SYSTEM_ACTOR, data: { decisionId: decision.id } });
    next = store.get('batches', batch.id)!;
  }
  return { batch: next, decision };
}

const HELD_MESSAGE = 'El lote está retenido por posible material peligroso: no se puede procesar hasta que el evaluador decida sobre todas las recepciones sospechosas (regla 7.3).';

export function closeBatch(batchId: string, actor: Actor, deviceTime?: string | null): Batch {
  const batch = getBatchOrThrow(batchId);
  if (batch.state === 'held') throw conflict(HELD_MESSAGE, 'batch_held');
  assertTransition('batch', 'batch_closed', batch.state, { actor, batch });
  appendEvent({ type: 'batch_closed', objectType: 'batch', objectId: batch.id, actor, data: {}, deviceTime });
  return db().get('batches', batch.id)!;
}

export function recordOutputs(batchId: string, actor: Actor, outputs: BatchOutputs, deviceTime?: string | null): Batch {
  const batch = getBatchOrThrow(batchId);
  if (!['t', 'm3'].includes(outputs.unit)) throw badRequest('La unidad debe ser toneladas (t) o metros cúbicos (m3).');
  for (const k of ['aggregate', 'metal', 'specialDisposal', 'rejects'] as const) {
    if (typeof outputs[k] !== 'number' || outputs[k] < 0) throw badRequest('Las salidas deben ser números no negativos.');
  }
  // 7.3: desde "closed", no retenido, sin sospechosas pendientes (tabla de transiciones)
  if (batch.state === 'held') throw conflict(HELD_MESSAGE, 'batch_held');
  assertTransition('batch', 'outputs_recorded', batch.state, { actor, batch });
  appendEvent({ type: 'outputs_recorded', objectType: 'batch', objectId: batch.id, actor, data: { outputs, composition: batchComposition(batch) }, deviceTime });
  const processed = db().get('batches', batch.id)!;
  assertTransition('batch', 'batch_processed', processed.state, { actor: SYSTEM_ACTOR, batch: processed });
  appendEvent({ type: 'batch_processed', objectType: 'batch', objectId: batch.id, actor: SYSTEM_ACTOR, data: {} });
  const center = db().get('centers', batch.centerId);
  notifyRole('evaluator', 'batch_verification', pickText('notif_evaluator_verification', { código: batch.code, centro: center?.name ?? '' }), { link: '/panel/evaluador' });
  return db().get('batches', batch.id)!;
}

export interface QualityInput {
  checklist: Record<string, boolean>;
  result: 'approved' | 'rejected';
  justification: string;
  documentId?: string | null;
  deviceTime?: string | null;
}

export function verifyQuality(batchId: string, actor: Actor, input: QualityInput): { batch: Batch; verification: QualityVerification } {
  if (actor.role !== 'evaluator' || !actor.id || !actor.entityId) throw forbidden('Solo el evaluador técnico registra la verificación de calidad.');
  const batch = getBatchOrThrow(batchId);
  const cfg = getConfig();
  assertChecklist(input.checklist, cfg.qualityChecklist.map((c) => c.key));
  if (!input.justification?.trim()) throw badRequest('La justificación escrita es obligatoria.');
  assertTransition('batch', 'quality_verified', batch.state, { actor, batch, resolvedTo: input.result });
  const verification: QualityVerification = {
    id: newId('qv'),
    batchId: batch.id,
    checklist: input.checklist,
    result: input.result,
    justification: input.justification.trim(),
    evaluatorId: actor.id,
    entityId: actor.entityId,
    documentId: input.documentId ?? null,
    createdAt: nowIso(),
  };
  appendEvent({ type: 'quality_verified', objectType: 'batch', objectId: batch.id, actor, data: { verification }, deviceTime: input.deviceTime });
  return { batch: db().get('batches', batch.id)!, verification };
}

export function dispatchedQuantity(batch: Batch): number {
  return batch.dispatchIds.reduce((s, id) => s + (db().get('dispatches', id)?.quantity || 0), 0);
}

export function createDispatch(batchId: string, actor: Actor, input: { workId: string; quantity: number; deviceTime?: string | null }): { batch: Batch; dispatch: Dispatch } {
  const store = db();
  const batch = getBatchOrThrow(batchId);
  if (!(input.quantity > 0)) throw badRequest('La cantidad despachada debe ser mayor que cero.');
  const produced = batch.outputs?.aggregate || 0;
  const already = dispatchedQuantity(batch);
  const resolvedTo = already + input.quantity >= produced ? 'fully_dispatched' : 'partially_dispatched';
  // 7.4: la tabla exige verificación de calidad aprobada (se valida antes que cualquier otro dato)
  if (batch.qualityResult !== 'approved') throw conflict('El lote no tiene una verificación de calidad aprobada; no se puede despachar a una obra (regla 7.4).', 'qualityApproved');
  assertTransition('batch', 'dispatch_created', batch.state, { actor, batch, resolvedTo });
  const work = store.get('works', input.workId);
  if (!work) throw notFound('La obra no existe.');
  if (already + input.quantity > produced + 1e-9) throw conflict(`La cantidad supera el agregado disponible del lote (${produced - already} ${batch.outputs?.unit}).`, 'quantity_exceeds');
  const dispatch: Dispatch = {
    id: newId('dp'),
    code: newDispatchCode(store.count('dispatches') + 1),
    batchId: batch.id,
    workId: work.id,
    quantity: input.quantity,
    unit: batch.outputs!.unit,
    quantityReceived: null,
    state: 'pending',
    createdAt: nowIso(),
  };
  appendEvent({ type: 'dispatch_created', objectType: 'batch', objectId: batch.id, actor, data: { dispatch }, deviceTime: input.deviceTime });
  notifyRole('destination', 'dispatch_pending', pickText('notif_destination_dispatch', { código: batch.code }), { entityId: work.entityId, link: '/panel/destino' });
  return { batch: store.get('batches', batch.id)!, dispatch };
}

// ---------------------------------------------------------------- balance de masas (7.5)

export interface SectorShare {
  sectorId: string;
  sectorName: string;
  weight: number;
  share: number;
  trips: number;
}

export function batchComposition(batch: Batch): SectorShare[] {
  const store = db();
  const trips = batch.receptionIds.map((rid) => store.get('receptions', rid)).filter(Boolean).map((r) => store.get('trips', r!.tripId)).filter(Boolean);
  if (!trips.length) return [];
  const useVolume = trips.every((t) => typeof t!.estimatedVolumeM3 === 'number' && t!.estimatedVolumeM3! > 0);
  const weights = new Map<string, { weight: number; trips: number }>();
  for (const t of trips) {
    const sectors = [...new Set(t!.originIds.map((id) => store.get('origins', id)?.sectorId).filter(Boolean))] as string[];
    if (!sectors.length) continue;
    const w = (useVolume ? t!.estimatedVolumeM3! : 1) / sectors.length; // viaje con varios sectores: partes iguales
    for (const s of sectors) {
      const cur = weights.get(s) || { weight: 0, trips: 0 };
      weights.set(s, { weight: cur.weight + w, trips: cur.trips + 1 });
    }
  }
  const total = [...weights.values()].reduce((s, v) => s + v.weight, 0) || 1;
  return [...weights.entries()]
    .map(([sectorId, v]) => ({ sectorId, sectorName: store.get('sectors', sectorId)?.name || sectorId, weight: Math.round(v.weight * 100) / 100, share: v.weight / total, trips: v.trips }))
    .sort((a, b) => b.share - a.share);
}

export function valorizationRate(batches: Batch[]): { rate: number | null; aggregate: number; total: number; unitMix: boolean } {
  let aggregate = 0;
  let total = 0;
  const units = new Set<string>();
  for (const b of batches) {
    if (!b.outputs) continue;
    units.add(b.outputs.unit);
    aggregate += b.outputs.aggregate;
    total += b.outputs.aggregate + b.outputs.metal + b.outputs.specialDisposal + b.outputs.rejects;
  }
  return { rate: total > 0 ? aggregate / total : null, aggregate, total, unitMix: units.size > 1 };
}

export function batchView(b: Batch) {
  const store = db();
  const center = store.get('centers', b.centerId);
  const receptions = b.receptionIds.map((id) => store.get('receptions', id)).filter(Boolean) as Reception[];
  return {
    ...b,
    centerName: center?.name ?? null,
    composition: batchComposition(b),
    receptions: receptions.map((r) => {
      const t = store.get('trips', r.tripId);
      return { ...r, tripCode: t?.code ?? null, originCodes: (t?.originIds || []).map((id) => store.get('origins', id)?.code).filter(Boolean), sectorNames: [...new Set((t?.originIds || []).map((id) => store.get('sectors', store.get('origins', id)?.sectorId || '')?.name).filter(Boolean))], photoUrl: r.photoId ? store.get('photos', r.photoId)?.url ?? null : null };
    }),
    hazardDecisions: b.hazardDecisionIds.map((id) => store.get('hazardDecisions', id)).filter(Boolean),
    qualityVerification: b.qualityVerificationId ? store.get('qualityVerifications', b.qualityVerificationId) : null,
    dispatches: b.dispatchIds.map((id) => store.get('dispatches', id)).filter(Boolean).map((d) => ({ ...d!, workCode: store.get('works', d!.workId)?.code ?? null, workName: store.get('works', d!.workId)?.name ?? null })),
    dispatchedQuantity: dispatchedQuantity(b),
    pendingHazard: receptions.filter((r) => r.subcategory === 'possible_hazardous' && !r.hazardDecision).length,
    unclassified: receptions.filter((r) => !r.subcategory).length,
  };
}

// ---------------------------------------------------------------- resumen diario y empleos

export function enterDailySummary(actor: Actor, input: { centerId: string; date: string; tripsReceived: number; officialTonnes?: number | null; deviceTime?: string | null }): DailySummary {
  if (!actor.entityId) throw forbidden();
  requireCenterUser(actor, input.centerId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw badRequest('La fecha debe tener formato AAAA-MM-DD.');
  if (!(input.tripsReceived >= 0)) throw badRequest('Indica los viajes recibidos.');
  const summary: DailySummary = { id: `ds_${input.centerId}_${input.date}`, entityId: actor.entityId, centerId: input.centerId, date: input.date, tripsReceived: input.tripsReceived, officialTonnes: input.officialTonnes ?? null, createdAt: nowIso() };
  appendEvent({ type: 'daily_summary_entered', objectType: 'center', objectId: input.centerId, actor, data: { summary }, deviceTime: input.deviceTime });
  return summary;
}

export function recordJobs(actor: Actor, input: { centerId?: string | null; positions: number; type: 'direct' | 'indirect'; date: string; deviceTime?: string | null }): JobsRecord {
  if (!actor.entityId) throw forbidden();
  if (input.centerId) requireCenterUser(actor, input.centerId);
  if (!(input.positions > 0)) throw badRequest('Indica el número de puestos.');
  const jobs: JobsRecord = { id: newId('jb'), entityId: actor.entityId, centerId: input.centerId ?? null, positions: input.positions, type: input.type, date: input.date, createdAt: nowIso() };
  appendEvent({ type: 'jobs_recorded', objectType: input.centerId ? 'center' : 'system', objectId: input.centerId || actor.entityId, actor, data: { jobs }, deviceTime: input.deviceTime });
  return jobs;
}

export function centerOf(actor: Actor): Center {
  const u = actor.id ? db().get('users', actor.id) : undefined;
  const c = u?.centerId ? db().get('centers', u.centerId) : undefined;
  if (!c) throw forbidden('Tu usuario no tiene un centro asignado.');
  return c;
}
