import type { Alert } from '@kindra/shared';
import { db } from '../core/db';
import { appendEvent, SYSTEM_ACTOR } from '../core/events';
import { nowIso } from '../core/ids';
import { getConfig } from './config';
import { markNoArrival } from './trips';
import { notifyOrigin, notifyRole, pickText } from './notifications';
import { sectorName } from './origins';

export interface JobsReport {
  ranAt: string;
  tripsNoArrival: number;
  originsNoTrip: number;
  batchesHeld: number;
  dispatchesUnconfirmed: number;
}

const hours = (ms: number) => ms / 3_600_000;
const days = (ms: number) => ms / 86_400_000;

/**
 * 7.13 Escalamientos (valores configurables): corre cada minuto y a demanda desde el panel de administración.
 * Cada caso genera un evento de alerta y un aviso al coordinador; el primero también avisa al ciudadano.
 */
export function runEscalations(now: Date = new Date()): JobsReport {
  const store = db();
  const cfg = getConfig();
  const nowMs = now.getTime();
  const report: JobsReport = { ranAt: nowIso(), tripsNoArrival: 0, originsNoTrip: 0, batchesHeld: 0, dispatchesUnconfirmed: 0 };
  const hasOpenAlert = (id: string) => {
    const a = store.get('alerts', id);
    return !!a && !a.resolvedAt;
  };

  // Viajes sin llegada (6.2)
  for (const t of store.filter('trips', (x) => x.state === 'in_transit')) {
    if (hours(nowMs - new Date(t.departure.serverTime).getTime()) < cfg.escalation.tripNoArrivalHours) continue;
    const center = store.get('centers', t.centerId);
    const text = pickText('notif_coord_trip_no_arrival', { código: t.code, número: cfg.escalation.tripNoArrivalHours, centro: center?.name ?? '' });
    markNoArrival(t, text);
    notifyRole('coordinator', 'trip_no_arrival', text, { link: '/panel/coordinador' });
    const count = store.filter('trips', (x) => x.centerId === t.centerId && x.state === 'no_arrival').length;
    notifyRole('supervisor', 'discrepancy', pickText('notif_supervisor_discrepancy', { número: count, centro: center?.name ?? '' }), { link: '/panel/supervisor' });
    report.tripsNoArrival++;
  }

  // Origen validado sin viaje
  for (const o of store.filter('origins', (x) => x.state === 'validated' && x.zoneAuthorized && !!x.validatedAt && x.tripIds.length === 0)) {
    const id = `al_notrip_${o.id}`;
    if (hasOpenAlert(id)) continue;
    const elapsed = days(nowMs - new Date(o.validatedAt!).getTime());
    if (elapsed < cfg.escalation.originNoTripDays) continue;
    const alert: Alert = { id, kind: 'origin_no_trip', objectType: 'origin', objectId: o.id, text: `El reporte ${o.code} lleva ${Math.floor(elapsed)} días validado sin camión asignado.`, createdAt: nowIso(), sectorId: o.sectorId };
    appendEvent({ type: 'escalation_alert', objectType: 'origin', objectId: o.id, actor: SYSTEM_ACTOR, data: { alert } });
    notifyRole('coordinator', 'origin_no_trip', pickText('notif_coord_delay', { sector: sectorName(o.sectorId), número: Math.floor(elapsed), código: o.code }), { link: '/panel/coordinador' });
    notifyOrigin(o, 'delay', pickText('delay', { código: o.code }));
    report.originsNoTrip++;
  }

  // Lote retenido sin decisión
  for (const b of store.filter('batches', (x) => x.state === 'held' && !!x.heldAt)) {
    const id = `al_heldlate_${b.id}`;
    if (hasOpenAlert(id)) continue;
    const elapsed = days(nowMs - new Date(b.heldAt!).getTime());
    if (elapsed < cfg.escalation.batchHeldDays) continue;
    const alert: Alert = { id, kind: 'batch_held', objectType: 'batch', objectId: b.id, text: `El lote ${b.code} lleva ${Math.floor(elapsed)} días retenido sin decisión del evaluador.`, createdAt: nowIso(), sectorId: null };
    appendEvent({ type: 'escalation_alert', objectType: 'batch', objectId: b.id, actor: SYSTEM_ACTOR, data: { alert } });
    notifyRole('coordinator', 'batch_held_late', pickText('notif_coord_batch_held', { código: b.code, número: Math.floor(elapsed) }), { link: '/panel/coordinador' });
    report.batchesHeld++;
  }

  // Despacho sin confirmar
  for (const d of store.filter('dispatches', (x) => x.state === 'pending')) {
    const id = `al_dispatch_${d.id}`;
    if (hasOpenAlert(id)) continue;
    const elapsed = days(nowMs - new Date(d.createdAt).getTime());
    if (elapsed < cfg.escalation.dispatchUnconfirmedDays) continue;
    const w = store.get('works', d.workId);
    const alert: Alert = { id, kind: 'dispatch_unconfirmed', objectType: 'work', objectId: d.workId, text: `El despacho ${d.code} lleva ${Math.floor(elapsed)} días sin confirmación de la obra ${w?.code ?? ''}.`, createdAt: nowIso(), sectorId: null };
    appendEvent({ type: 'escalation_alert', objectType: 'work', objectId: d.workId, actor: SYSTEM_ACTOR, data: { alert } });
    notifyRole('coordinator', 'dispatch_unconfirmed', pickText('notif_coord_dispatch_unconfirmed', { código: d.code, número: Math.floor(elapsed) }), { link: '/panel/coordinador' });
    report.dispatchesUnconfirmed++;
  }

  // Lotes retenidos recién creados: el reductor ya crea la alerta "al_held_*" (sin plazo) para el panel.
  // Lotes y despachos resueltos: los reductores cierran sus alertas.
  return report;
}

let timer: NodeJS.Timeout | null = null;
export function startScheduler(intervalSeconds: number): void {
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    try {
      runEscalations();
    } catch (err) {
      console.error('[jobs] error en escalamientos:', (err as Error).message);
    }
  }, Math.max(15, intervalSeconds) * 1000);
}
export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
