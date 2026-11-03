import type { Work, WorkUseType, Dispatch, Origin } from '@kindra/shared';
import { stageOf } from '@kindra/shared';
import { db } from '../core/db';
import { appendEvent, SYSTEM_ACTOR, type Actor } from '../core/events';
import { assertTransition } from '../core/transitions';
import { newId, newWorkCode, nowIso } from '../core/ids';
import { badRequest, conflict, forbidden, notFound } from '../core/errors';
import { batchComposition, type SectorShare } from './batches';
import { sendFinalClosure } from './origins';

export function getWorkOrThrow(idOrCode: string): Work {
  const w = db().get('works', idOrCode) || db().find('works', (x) => x.code === idOrCode.toUpperCase() || x.qrCode === idOrCode);
  if (!w) throw notFound('La obra no existe.');
  return w;
}

export interface WorkInput {
  name: string;
  useType: WorkUseType;
  locality: string;
  sectorId?: string | null;
  dateOfUse?: string | null;
  deviceTime?: string | null;
}

export function registerWork(actor: Actor, input: WorkInput): Work {
  if (actor.role !== 'destination' || !actor.entityId) throw forbidden('Solo el destino final registra obras.');
  if (!input.name?.trim() || !input.locality?.trim()) throw badRequest('Nombre genérico y localidad beneficiada son obligatorios.');
  const store = db();
  const code = newWorkCode(store.count('works') + 1);
  const work: Work = {
    id: newId('ob'),
    code,
    name: input.name.trim(),
    useType: input.useType,
    locality: input.locality.trim(),
    sectorId: input.sectorId ?? null,
    dateOfUse: input.dateOfUse ?? null,
    qrCode: `KO-${code}`,
    entityId: actor.entityId,
    useRecordedAt: null,
    dispatchIds: [],
    createdAt: nowIso(),
  };
  appendEvent({ type: 'work_registered', objectType: 'work', objectId: work.id, actor, data: { work }, deviceTime: input.deviceTime });
  return store.get('works', work.id)!;
}

export function receiveDispatch(dispatchId: string, actor: Actor, input: { quantityReceived: number; note?: string | null; deviceTime?: string | null }): Dispatch {
  const store = db();
  if (actor.role !== 'destination' || !actor.entityId) throw forbidden('Solo el destino final confirma despachos.');
  const d = store.get('dispatches', dispatchId) || store.find('dispatches', (x) => x.code === dispatchId.toUpperCase());
  if (!d) throw notFound('El despacho no existe.');
  const work = getWorkOrThrow(d.workId);
  if (work.entityId !== actor.entityId) throw forbidden('Este despacho pertenece a una obra de otra entidad.');
  if (d.state !== 'pending') throw conflict('Este despacho ya fue confirmado.');
  if (!(input.quantityReceived >= 0)) throw badRequest('Indica la cantidad recibida.');
  const matches = Math.abs(input.quantityReceived - d.quantity) < 1e-9;
  appendEvent({
    type: matches ? 'dispatch_received' : 'dispatch_discrepancy',
    objectType: 'work',
    objectId: work.id,
    actor,
    data: { dispatchId: d.id, batchId: d.batchId, quantityDispatched: d.quantity, quantityReceived: input.quantityReceived, note: input.note ?? null },
    deviceTime: input.deviceTime,
  });
  return store.get('dispatches', d.id)!;
}

export interface UseInput {
  useType?: WorkUseType;
  locality?: string;
  dateOfUse?: string | null;
  sectorId?: string | null;
  deviceTime?: string | null;
}

/** Registra el uso en obra, pasa los orígenes de los sectores involucrados a "en obra" y envía el cierre final (6.1, 7.7). */
export function recordUse(workId: string, actor: Actor, input: UseInput): { work: Work; closedOrigins: number } {
  const store = db();
  if (actor.role !== 'destination' || !actor.entityId) throw forbidden('Solo el destino final registra el uso.');
  const work = getWorkOrThrow(workId);
  if (work.entityId !== actor.entityId) throw forbidden('Esta obra pertenece a otra entidad.');
  const received = work.dispatchIds.map((id) => store.get('dispatches', id)).filter((d) => d && d.state !== 'pending') as Dispatch[];
  if (!received.length) throw conflict('La obra no tiene despachos confirmados; confirma la recepción antes de registrar el uso.', 'no_received_dispatch');
  appendEvent({ type: 'use_recorded', objectType: 'work', objectId: work.id, actor, data: { useType: input.useType ?? work.useType, locality: input.locality ?? work.locality, dateOfUse: input.dateOfUse ?? nowIso(), sectorId: input.sectorId ?? work.sectorId ?? null }, deviceTime: input.deviceTime });
  const nextWork = store.get('works', work.id)!;

  let closed = 0;
  for (const d of received) {
    const batch = store.get('batches', d.batchId);
    if (!batch) continue;
    const comp = batchComposition(batch);
    const sectorIds = new Set(comp.map((c) => c.sectorId));
    const tripIds = new Set(batch.receptionIds.map((rid) => store.get('receptions', rid)?.tripId).filter(Boolean));
    const candidates = store.filter('origins', (o: Origin) => {
      if (['rejected', 'duplicate', 'closed', 'in_work', 'disputed'].includes(o.state)) return false;
      const direct = o.tripIds.some((t) => tripIds.has(t));
      const sameSector = sectorIds.has(o.sectorId) && stageOf(o.state) >= stageOf('removed');
      return direct || sameSector;
    });
    for (const o of candidates) {
      try {
        assertTransition('origin', 'origin_in_work', o.state, { actor: SYSTEM_ACTOR, origin: o });
      } catch {
        continue;
      }
      appendEvent({ type: 'origin_in_work', objectType: 'origin', objectId: o.id, actor: SYSTEM_ACTOR, data: { workId: work.id, batchId: batch.id } });
      const fresh = store.get('origins', o.id)!;
      assertTransition('origin', 'final_closure_sent', fresh.state, { actor: SYSTEM_ACTOR, origin: fresh });
      sendFinalClosure(fresh, nextWork, batch);
      closed++;
    }
  }
  return { work: store.get('works', work.id)!, closedOrigins: closed };
}

/** 7.6: composición de la obra = la de sus lotes, ponderada por cantidad despachada. */
export function workComposition(work: Work): SectorShare[] {
  const store = db();
  const acc = new Map<string, { weight: number; trips: number; name: string }>();
  let total = 0;
  for (const did of work.dispatchIds) {
    const d = store.get('dispatches', did);
    const b = d && store.get('batches', d.batchId);
    if (!d || !b) continue;
    const qty = d.quantityReceived ?? d.quantity;
    total += qty;
    for (const c of batchComposition(b)) {
      const cur = acc.get(c.sectorId) || { weight: 0, trips: 0, name: c.sectorName };
      acc.set(c.sectorId, { weight: cur.weight + c.share * qty, trips: cur.trips + c.trips, name: c.sectorName });
    }
  }
  if (!total) return [];
  return [...acc.entries()]
    .map(([sectorId, v]) => ({ sectorId, sectorName: v.name, weight: Math.round(v.weight * 100) / 100, share: v.weight / total, trips: v.trips }))
    .sort((a, b) => b.share - a.share);
}

export function workView(w: Work) {
  const store = db();
  const dispatches = w.dispatchIds.map((id) => store.get('dispatches', id)).filter(Boolean) as Dispatch[];
  return {
    ...w,
    entityName: store.get('entities', w.entityId)?.name ?? null,
    sectorName: w.sectorId ? store.get('sectors', w.sectorId)?.name ?? null : null,
    dispatches: dispatches.map((d) => ({ ...d, batchCode: store.get('batches', d.batchId)?.code ?? null, centerName: store.get('centers', store.get('batches', d.batchId)?.centerId || '')?.name ?? null })),
    composition: workComposition(w),
    totalReceived: dispatches.reduce((s, d) => s + (d.quantityReceived ?? 0), 0),
    unit: dispatches[0]?.unit ?? null,
  };
}
