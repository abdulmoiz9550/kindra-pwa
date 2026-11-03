import type {
  KEvent, Origin, OriginState, Trip, Batch, Reception, HazardDecision, QualityVerification, Work, Dispatch, Closure,
  Observation, DailySummary, JobsRecord, LessonCompletion, MonitorRequest, Alert, TripLeg,
} from '@kindra/shared';
import { stageOf } from '@kindra/shared';
import { db } from './db';

/**
 * Reductores: cada evento actualiza las proyecciones (estado actual de los objetos).
 * Es la única forma en que cambian origins, trips, batches, works, etc. (3.1).
 * Son deterministas: reproducir la bitácora desde cero devuelve el mismo estado.
 */
export function applyEvent(e: KEvent, _opts: { replay?: boolean } = {}): void {
  const store = db();
  const d = e.data as Record<string, any>;
  const t = e.serverTime;

  const origin = () => store.get('origins', e.objectId);
  const trip = () => store.get('trips', e.objectId);
  const batch = () => store.get('batches', e.objectId);
  const work = () => store.get('works', e.objectId);

  switch (e.type) {
    // ------------------------------------------------------------- ORIGEN
    case 'origin_registered': {
      store.put('origins', { ...(d.origin as Origin) });
      break;
    }
    case 'origin_validated': {
      const o = origin();
      if (!o) break;
      advanceOrigin(o, 'validated', { validatedAt: t, priority: d.priority ?? o.priority ?? null, manualReview: false });
      break;
    }
    case 'origin_rejected': {
      const o = origin();
      if (!o) break;
      store.update('origins', o.id, { state: 'rejected', rejectionReason: d.reason, rejectionNote: d.note ?? null, manualReview: false });
      break;
    }
    case 'origin_marked_duplicate': {
      const o = origin();
      if (!o) break;
      store.update('origins', o.id, { state: 'duplicate', duplicateOfId: d.mainOriginId, manualReview: false });
      const main = store.get('origins', d.mainOriginId);
      if (main) {
        const keys = new Set(main.linkedReporterKeys);
        for (const k of reporterKeys(o)) keys.add(k);
        store.update('origins', main.id, { linkedOriginIds: uniq([...main.linkedOriginIds, o.id]), linkedReporterKeys: [...keys] });
      }
      break;
    }
    case 'zone_authorized':
    case 'zone_unauthorized': {
      const o = origin();
      if (o) store.update('origins', o.id, { zoneAuthorized: e.type === 'zone_authorized' });
      break;
    }
    case 'priority_set': {
      const o = origin();
      if (o) store.update('origins', o.id, { priority: d.priority });
      break;
    }
    case 'origin_removed': {
      const o = origin();
      if (!o) break;
      advanceOrigin(o, 'removed', { removedAt: t, disputeEvidencePhotoId: d.evidencePhotoId ?? o.disputeEvidencePhotoId ?? null });
      break;
    }
    case 'removal_closure_sent':
    case 'final_closure_sent': {
      const c = d.closure as Closure;
      store.put('closures', c);
      const o = origin();
      if (o && e.type === 'final_closure_sent') advanceOrigin(o, 'closed', { closedAt: t });
      break;
    }
    case 'removal_confirmed': {
      const c = store.get('closures', d.closureId);
      if (c) store.update('closures', c.id, { citizenResponse: 'confirmed', respondedAt: t, comment: d.comment ?? c.comment ?? null });
      break;
    }
    case 'removal_disputed': {
      const c = store.get('closures', d.closureId);
      if (c) store.update('closures', c.id, { citizenResponse: 'disputed', respondedAt: t, comment: d.comment ?? null });
      const o = origin();
      if (o && o.state !== 'disputed') store.update('origins', o.id, { state: 'disputed', preDisputeState: o.state });
      if (o) putAlert({ id: `al_dispute_${o.id}`, kind: 'dispute', objectType: 'origin', objectId: o.id, text: d.alertText || `Disputa abierta en el reporte ${o.code}.`, createdAt: t, sectorId: o.sectorId });
      break;
    }
    case 'dispute_resolved': {
      const o = origin();
      if (!o) break;
      if (d.result === 'reopened') {
        store.update('origins', o.id, { state: 'under_removal', preDisputeState: null, removedAt: null });
      } else {
        const back = (o.preDisputeState as OriginState) || 'removed';
        store.update('origins', o.id, { state: stageOf(back) >= stageOf('removed') ? back : 'removed', preDisputeState: null, disputeEvidencePhotoId: d.evidencePhotoId ?? null, removedAt: o.removedAt || t });
      }
      resolveAlert(`al_dispute_${o.id}`, t);
      break;
    }
    case 'origin_in_batch': {
      const o = origin();
      if (!o) break;
      advanceOrigin(o, 'in_batch', { inBatchAt: o.inBatchAt || t, batchIds: uniq([...o.batchIds, d.batchId]) });
      break;
    }
    case 'origin_in_work': {
      const o = origin();
      if (!o) break;
      advanceOrigin(o, 'in_work', { inWorkAt: o.inWorkAt || t, workIds: uniq([...o.workIds, d.workId]) });
      break;
    }
    case 'origin_verified_on_site': {
      const o = origin();
      if (o) store.update('origins', o.id, { verifiedOnSiteAt: t, verifiedOnSitePhotoId: d.photoId });
      break;
    }
    case 'before_after_photo': {
      const o = origin();
      if (o) store.update('origins', o.id, { afterPhotoId: d.afterPhotoId ?? o.afterPhotoId ?? null, photoIds: uniq([...o.photoIds, ...(d.beforePhotoId ? [d.beforePhotoId] : [])]) });
      break;
    }
    case 'photo_retake_requested': {
      const o = origin();
      if (!o) break;
      const count = (o.photoRetakeCount || 0) + 1;
      const manual = count >= 2;
      store.update('origins', o.id, { photoRetakeRequested: !manual, photoRetakeCount: count, manualReview: manual });
      if (manual) putAlert({ id: `al_manual_${o.id}`, kind: 'manual_review', objectType: 'origin', objectId: o.id, text: `El reporte ${o.code} pasa a revisión manual: dos fotos ilegibles.`, createdAt: t, sectorId: o.sectorId });
      break;
    }
    case 'photo_added': {
      const o = origin();
      if (o) store.update('origins', o.id, { photoIds: uniq([...o.photoIds, d.photoId]), photoRetakeRequested: false });
      break;
    }
    // ------------------------------------------------------------- VIAJE
    case 'trip_departure': {
      const tr = d.trip as Trip;
      store.put('trips', tr);
      for (const oid of tr.originIds) {
        const o = store.get('origins', oid);
        if (!o) continue;
        advanceOrigin(o, 'under_removal', { firstTripAt: o.firstTripAt || t, tripIds: uniq([...o.tripIds, tr.id]) });
        resolveAlert(`al_notrip_${o.id}`, t);
      }
      break;
    }
    case 'trip_arrival': {
      const tr = trip();
      if (!tr) break;
      const late = tr.state === 'no_arrival';
      store.update('trips', tr.id, { state: 'received', arrival: d.arrival as TripLeg, receptionId: d.reception?.id ?? tr.receptionId ?? null, discrepancyResolvedAt: late ? t : tr.discrepancyResolvedAt ?? null });
      if (d.reception) {
        const r = d.reception as Reception;
        store.put('receptions', r);
        const b = store.get('batches', r.batchId);
        if (b) store.update('batches', b.id, { receptionIds: uniq([...b.receptionIds, r.id]) });
      }
      resolveAlert(`al_noarrival_${tr.id}`, t);
      break;
    }
    case 'trip_no_arrival': {
      const tr = trip();
      if (tr) store.update('trips', tr.id, { state: 'no_arrival', noArrivalAt: t });
      if (tr) putAlert({ id: `al_noarrival_${tr.id}`, kind: 'trip_no_arrival', objectType: 'trip', objectId: tr.id, text: d.alertText || `El viaje ${tr.code} no tiene llegada confirmada.`, createdAt: t, sectorId: null });
      break;
    }
    // ------------------------------------------------------------- LOTE
    case 'batch_opened': {
      store.put('batches', d.batch as Batch);
      break;
    }
    case 'batch_closed': {
      const b = batch();
      if (!b) break;
      if (b.state === 'held') store.update('batches', b.id, { previousState: 'closed', closedAt: t });
      else store.update('batches', b.id, { state: 'closed', closedAt: t });
      break;
    }
    case 'batch_held': {
      const b = batch();
      if (b && b.state !== 'held') store.update('batches', b.id, { previousState: b.state, state: 'held', heldAt: t });
      if (b) putAlert({ id: `al_held_${b.id}`, kind: 'batch_held', objectType: 'batch', objectId: b.id, text: `El lote ${b.code} está retenido por posible material peligroso.`, createdAt: t, sectorId: null });
      break;
    }
    case 'batch_released': {
      const b = batch();
      if (b && b.state === 'held') store.update('batches', b.id, { state: b.previousState || 'open', previousState: null });
      if (b) resolveAlert(`al_held_${b.id}`, t);
      break;
    }
    case 'reception_classified': {
      const r = store.get('receptions', d.receptionId);
      if (r) store.update('receptions', r.id, { subcategory: d.subcategory, photoId: d.photoId ?? r.photoId ?? null, note: d.note ?? null, classifiedAt: t, classifiedBy: e.actorId });
      break;
    }
    case 'hazard_decided': {
      const hd = d.decision as HazardDecision;
      store.put('hazardDecisions', hd);
      for (const rid of hd.receptionIds) {
        const r = store.get('receptions', rid);
        if (r) store.update('receptions', r.id, { hazardDecision: hd.decision, hazardDecisionId: hd.id });
      }
      const b = batch();
      if (b) store.update('batches', b.id, { hazardDecisionIds: uniq([...b.hazardDecisionIds, hd.id]) });
      break;
    }
    case 'outputs_recorded': {
      const b = batch();
      if (b) store.update('batches', b.id, { outputs: d.outputs, state: 'processed', processedAt: t });
      break;
    }
    case 'batch_processed': {
      const b = batch();
      if (b) store.update('batches', b.id, { state: 'under_verification' });
      break;
    }
    case 'quality_verified': {
      const qv = d.verification as QualityVerification;
      store.put('qualityVerifications', qv);
      const b = batch();
      if (b) store.update('batches', b.id, { qualityVerificationId: qv.id, qualityResult: qv.result, state: qv.result, verifiedAt: t });
      break;
    }
    case 'dispatch_created': {
      const dp = d.dispatch as Dispatch;
      store.put('dispatches', dp);
      const b = batch();
      if (b) {
        const ids = uniq([...b.dispatchIds, dp.id]);
        const total = ids.reduce((s, id) => s + (store.get('dispatches', id)?.quantity || 0), 0);
        const produced = b.outputs?.aggregate || 0;
        store.update('batches', b.id, { dispatchIds: ids, state: total >= produced && produced > 0 ? 'fully_dispatched' : 'partially_dispatched' });
      }
      const w = store.get('works', dp.workId);
      if (w) store.update('works', w.id, { dispatchIds: uniq([...w.dispatchIds, dp.id]) });
      break;
    }
    case 'dispatch_received': {
      const dp = store.get('dispatches', d.dispatchId);
      if (dp) store.update('dispatches', dp.id, { state: 'received', quantityReceived: d.quantityReceived, receivedAt: t });
      resolveAlert(`al_dispatch_${d.dispatchId}`, t);
      break;
    }
    case 'dispatch_discrepancy': {
      const dp = store.get('dispatches', d.dispatchId);
      if (dp) store.update('dispatches', dp.id, { state: 'discrepancy', quantityReceived: d.quantityReceived, receivedAt: t, note: d.note ?? null });
      resolveAlert(`al_dispatch_${d.dispatchId}`, t);
      break;
    }
    // ------------------------------------------------------------- OBRA
    case 'work_registered': {
      store.put('works', d.work as Work);
      break;
    }
    case 'use_recorded': {
      const w = work();
      if (w) store.update('works', w.id, { useType: d.useType ?? w.useType, locality: d.locality ?? w.locality, dateOfUse: d.dateOfUse ?? t, sectorId: d.sectorId ?? w.sectorId ?? null, useRecordedAt: t });
      break;
    }
    // ------------------------------------------------------------- OTROS
    case 'satisfaction_answered': {
      const c = store.get('closures', d.closureId);
      if (c) store.update('closures', c.id, { satisfactionAnswer: d.answer, comment: d.comment ?? c.comment ?? null, respondedAt: t });
      break;
    }
    case 'observation_recorded': {
      const ob = d.observation as Observation;
      store.put('observations', ob);
      if (ob.isAlert) {
        const o = ob.objectType === 'origin' ? store.get('origins', ob.objectId) : null;
        putAlert({ id: `al_obs_${ob.id}`, kind: 'observation', objectType: ob.objectType, objectId: ob.objectId, text: ob.text, createdAt: t, sectorId: o?.sectorId ?? null });
      }
      break;
    }
    case 'daily_summary_entered': {
      store.put('dailySummaries', d.summary as DailySummary);
      break;
    }
    case 'jobs_recorded': {
      store.put('jobs', d.jobs as JobsRecord);
      break;
    }
    case 'lesson_completed': {
      store.put('lessonCompletions', d.completion as LessonCompletion);
      break;
    }
    case 'monitor_requested': {
      store.put('monitorRequests', d.request as MonitorRequest);
      break;
    }
    case 'monitor_request_decided': {
      const r = store.get('monitorRequests', d.requestId);
      if (r) store.update('monitorRequests', r.id, { status: d.status, decidedAt: t, decidedBy: e.actorId });
      break;
    }
    case 'escalation_alert': {
      putAlert(d.alert as Alert);
      break;
    }
    case 'alert_resolved': {
      resolveAlert(d.alertId, t);
      break;
    }
    case 'correction': {
      // 7.16: la corrección aplica un parche limitado al objeto; el evento original permanece.
      const patch = (d.patch || {}) as Record<string, unknown>;
      const allowed = CORRECTABLE_FIELDS[e.objectType] || [];
      const safe: Record<string, unknown> = {};
      for (const k of Object.keys(patch)) if (allowed.includes(k)) safe[k] = patch[k];
      if (!Object.keys(safe).length) break;
      const col = ({ origin: 'origins', trip: 'trips', batch: 'batches', work: 'works' } as const)[e.objectType as 'origin' | 'trip' | 'batch' | 'work'];
      if (col && store.get(col, e.objectId)) store.update(col, e.objectId, safe as never);
      break;
    }
    default:
      break;
  }

  // ---- helpers con cierre sobre el store ----
  function advanceOrigin(o: Origin, target: OriginState, patch: Partial<Origin>): void {
    if (o.state === 'rejected' || o.state === 'duplicate') {
      store.update('origins', o.id, patch);
      return;
    }
    if (o.state === 'disputed') {
      const pre = (o.preDisputeState as OriginState) || 'removed';
      const nextPre = stageOf(target) > stageOf(pre) ? target : pre;
      store.update('origins', o.id, { ...patch, preDisputeState: nextPre });
      return;
    }
    const next = stageOf(target) > stageOf(o.state) ? target : o.state;
    store.update('origins', o.id, { ...patch, state: next });
  }

  function putAlert(a: Alert): void {
    const existing = store.get('alerts', a.id);
    if (existing && !existing.resolvedAt) return;
    store.put('alerts', { ...a, resolvedAt: null });
  }

  function resolveAlert(id: string, at: string): void {
    const a = store.get('alerts', id);
    if (a && !a.resolvedAt) store.update('alerts', id, { resolvedAt: at });
  }
}

const CORRECTABLE_FIELDS: Record<string, string[]> = {
  origin: ['street', 'reference', 'size', 'urgency', 'subcategory', 'structureType', 'cause', 'buildingReference', 'reporterName', 'location', 'sectorId', 'date'],
  trip: ['originIds', 'estimatedVolumeM3'],
  batch: ['outputs', 'periodStart', 'periodEnd'],
  work: ['name', 'useType', 'locality', 'dateOfUse', 'sectorId'],
};

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

export function reporterKeys(o: Origin): string[] {
  const keys: string[] = [];
  if (o.reporterId) keys.push(`user:${o.reporterId}`);
  keys.push(`origin:${o.code}`);
  return keys;
}
