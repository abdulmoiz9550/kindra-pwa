import type { ReportSnapshot, ReportSnapshotRow, ReportSnapshotTotals } from '@kindra/shared';
import { db } from '../core/db';
import { appendEvent, type Actor } from '../core/events';
import { newId, nowIso } from '../core/ids';
import { badRequest, conflict, forbidden, notFound } from '../core/errors';
import { notifyRole } from './notifications';

/**
 * Addendum v4.2, sección 14: conciliación semanal con el reporte oficial «Plan de Despeje Digno y Seguro / Totalidad
 * de Vestigios». Cada reporte se importa a mano como instantánea con su fecha y hora de fuente, sin pisar las
 * anteriores. Se compara por centro y operador, en t y m³ por separado; una diferencia mayor al 5 % o una cifra
 * oficial que cambia sin explicación abre una discrepancia con responsable y fecha de resolución.
 */

export const RECON_THRESHOLD = 0.05;
export const OFFICIAL_FACTOR = 1.1;

export interface ReconDiscrepancy {
  id: string;
  snapshotId: string;
  facilityId: string | null;
  operatorEntityId: string | null;
  label: string;
  metric: 'tonnes' | 'm3' | 'changed';
  official: number | null;
  kindra: number | null;
  differencePct: number | null;
  reason: string;
  ownerId: string | null;
  dueDate: string | null;
  status: 'open' | 'resolved';
  resolution?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
}

export interface ImportInput {
  title: string;
  source: string;
  reportedAt: string;
  note: string;
  rows: Omit<ReportSnapshotRow, 'id'>[];
  reportedTotals?: Partial<ReportSnapshotTotals>;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Importación manual (archivo o carga de datos). Nunca reemplaza una instantánea anterior. */
export function importSnapshot(actor: Actor, input: ImportInput): { snapshot: ReportSnapshot; discrepancies: ReconDiscrepancy[] } {
  if (actor.role !== 'coordinator' && actor.role !== 'admin') throw forbidden('Importa el reporte oficial el Ente Coordinador o el Administrador Principal.');
  if (!input.rows.length) throw badRequest('El reporte no tiene filas.');
  if (Number.isNaN(Date.parse(input.reportedAt))) throw badRequest('Indica la fecha y hora del reporte en la fuente.');
  const store = db();
  if (store.find('reportSnapshots', (s) => s.reportedAt === input.reportedAt && s.source === input.source)) throw conflict('Ya existe una instantánea de esa fuente con esa fecha y hora.');
  for (const r of input.rows) if (r.facilityId && !store.get('centers', r.facilityId)) throw badRequest(`El centro ${r.facilityId} no existe.`);
  const rows: ReportSnapshotRow[] = input.rows.map((r) => ({ ...r, id: newId('rr') }));
  const sum = (k: keyof ReportSnapshotTotals) => {
    const v = rows.map((r) => r[k]).filter((x): x is number => x != null);
    return v.length ? r2(v.reduce((a, b) => a + b, 0)) : null;
  };
  const rowSums: ReportSnapshotTotals = { m3Today: sum('m3Today'), m3Accumulated: sum('m3Accumulated'), tonnesToday: sum('tonnesToday'), tonnesAccumulated: sum('tonnesAccumulated') };
  const reportedTotals: ReportSnapshotTotals = { m3Today: input.reportedTotals?.m3Today ?? null, m3Accumulated: input.reportedTotals?.m3Accumulated ?? null, tonnesToday: input.reportedTotals?.tonnesToday ?? null, tonnesAccumulated: input.reportedTotals?.tonnesAccumulated ?? null };
  const snapshot = {
    id: newId('snap'),
    title: input.title.trim(),
    source: input.source.trim(),
    reportedAt: new Date(input.reportedAt).toISOString(),
    importedAt: nowIso(),
    importedBy: actor.id,
    note: input.note.trim(),
    indicators: [],
    rows,
    reportedTotals,
    rowSums,
    sourceDiscrepancies: (Object.keys(reportedTotals) as (keyof ReportSnapshotTotals)[]).filter((k) => reportedTotals[k] != null && reportedTotals[k] !== rowSums[k]).map((k) => ({ field: k, official: reportedTotals[k], rowSum: rowSums[k] })),
  } as unknown as ReportSnapshot;
  store.put('reportSnapshots', snapshot);
  appendEvent({ type: 'report_snapshot_imported', objectType: 'system', objectId: 'report_snapshots', actor, data: { snapshotId: snapshot.id, reportedAt: snapshot.reportedAt, rows: rows.length, source: snapshot.source, manual: true } });
  const discrepancies = reconcile(snapshot.id);
  if (discrepancies.length) notifyRole('coordinator', 'reconciliation', `Conciliación: ${discrepancies.length} diferencia(s) con el reporte oficial del ${snapshot.reportedAt.slice(0, 10)}.`, { link: '/panel/reportes?tab=reconciliation' });
  return { snapshot, discrepancies };
}

/** Totales de Kindra recibidos en un centro por operador hasta una fecha (acumulado) y ese día, por unidad. */
function kindraTotals(facilityId: string | null, operatorId: string | null, until: string) {
  const store = db();
  const day = until.slice(0, 10);
  const recs = store.filter('receptions', (r) => (!facilityId || r.centerId === facilityId) && (!operatorId || r.operatorEntityId === operatorId) && r.receivedQuantity != null && r.receivedAt <= until);
  const tot = (unit: 't' | 'm3', today: boolean) => {
    const v = recs.filter((r) => r.receivedUnit === unit && (!today || r.receivedAt.slice(0, 10) === day));
    return v.length ? r2(v.reduce((a, r) => a + (r.receivedQuantity ?? 0), 0)) : null;
  };
  const weighed = recs.filter((r) => r.receivedUnit === 't' && r.measurementMethod === 'weighbridge');
  return { tAcc: tot('t', false), tDay: tot('t', true), m3Acc: tot('m3', false), m3Day: tot('m3', true), tWeighed: weighed.length ? r2(weighed.reduce((a, r) => a + (r.receivedQuantity ?? 0), 0)) : null };
}

/** Compara una instantánea con Kindra y con la instantánea anterior de la misma fuente. */
export function reconcile(snapshotId: string): ReconDiscrepancy[] {
  const store = db();
  const snap = store.get('reportSnapshots', snapshotId);
  if (!snap) throw notFound('La instantánea no existe.');
  const previous = store
    .filter('reportSnapshots', (s) => s.source === snap.source && s.reportedAt < snap.reportedAt)
    .sort((a, b) => (a.reportedAt < b.reportedAt ? 1 : -1))[0];
  const created: ReconDiscrepancy[] = [];
  const open = (d: Omit<ReconDiscrepancy, 'id' | 'ownerId' | 'dueDate' | 'status' | 'createdAt'>) => {
    if (store.find('reconDiscrepancies', (x) => x.snapshotId === d.snapshotId && x.label === d.label && x.metric === d.metric)) return;
    const disc: ReconDiscrepancy = { ...d, id: newId('rd'), ownerId: null, dueDate: null, status: 'open', createdAt: nowIso() };
    store.put('reconDiscrepancies', disc);
    created.push(disc);
  };
  for (const row of snap.rows) {
    const k = kindraTotals(row.facilityId, row.operatorEntityId, snap.reportedAt);
    const pairs: ['tonnes' | 'm3', number | null, number | null][] = [
      ['tonnes', row.tonnesAccumulated, k.tAcc],
      ['m3', row.m3Accumulated, k.m3Acc],
    ];
    for (const [metric, official, kindra] of pairs) {
      if (official == null || official === 0) continue;
      const diff = Math.abs((kindra ?? 0) - official) / official;
      if (diff > RECON_THRESHOLD) open({ snapshotId: snap.id, facilityId: row.facilityId, operatorEntityId: row.operatorEntityId, label: row.label, metric, official, kindra, differencePct: Math.round(diff * 1000) / 10, reason: `Diferencia mayor al 5 % en ${metric === 'tonnes' ? 'toneladas' : 'm³'} acumulados.` });
    }
    // Cifra oficial cambiada sin explicación: el acumulado no puede bajar respecto del reporte anterior.
    const prev = previous?.rows.find((p) => p.label === row.label);
    if (prev) {
      for (const [metric, now, before] of [['tonnes', row.tonnesAccumulated, prev.tonnesAccumulated], ['m3', row.m3Accumulated, prev.m3Accumulated]] as const) {
        if (now != null && before != null && now < before && !/correcci|ajuste|rectific/i.test(snap.note)) open({ snapshotId: snap.id, facilityId: row.facilityId, operatorEntityId: row.operatorEntityId, label: row.label, metric: 'changed', official: now, kindra: before, differencePct: null, reason: `El reporte oficial bajó el acumulado de ${metric === 'tonnes' ? 'toneladas' : 'm³'} (${before} → ${now}) sin explicación.` });
      }
    }
  }
  return created;
}

/** Vista de conciliación: por fila, cifras oficiales y de Kindra lado a lado, con marca de estimación por factor. */
export function reconciliationView(snapshotId: string) {
  const store = db();
  const snap = store.get('reportSnapshots', snapshotId);
  if (!snap) throw notFound('La instantánea no existe.');
  return {
    snapshot: { id: snap.id, title: snap.title, source: snap.source, reportedAt: snap.reportedAt, importedAt: snap.importedAt },
    rows: snap.rows.map((row) => {
      const k = kindraTotals(row.facilityId, row.operatorEntityId, snap.reportedAt);
      // Toneladas oficiales calculadas con el factor fijo 1,10 t/m³: se marcan como estimación por factor.
      const factorEstimate = row.tonnesAccumulated != null && row.m3Accumulated != null && Math.abs(row.tonnesAccumulated - row.m3Accumulated * OFFICIAL_FACTOR) <= Math.max(0.5, row.m3Accumulated * 0.005);
      return {
        label: row.label,
        facility: row.facilityId ? store.get('centers', row.facilityId)?.name ?? row.facilityId : null,
        operator: row.operatorEntityId ? store.get('entities', row.operatorEntityId)?.name ?? row.operatorEntityId : null,
        official: { tonnesToday: row.tonnesToday, tonnesAccumulated: row.tonnesAccumulated, m3Today: row.m3Today, m3Accumulated: row.m3Accumulated, tonnesMethod: factorEstimate ? 'Estimación por factor (1,10 t/m³)' : 'Según el reporte' },
        kindra: { tonnesToday: k.tDay, tonnesAccumulated: k.tAcc, m3Today: k.m3Day, m3Accumulated: k.m3Acc, tonnesWeighed: k.tWeighed },
      };
    }),
    discrepancies: store.filter('reconDiscrepancies', (d) => d.snapshotId === snap.id),
  };
}

export function listReconDiscrepancies() {
  return db().list('reconDiscrepancies').sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** Cada discrepancia tiene responsable y fecha de resolución; se resuelve con explicación. */
export function updateReconDiscrepancy(actor: Actor, id: string, patch: { ownerId?: string | null; dueDate?: string | null; resolution?: string | null }): ReconDiscrepancy {
  if (actor.role !== 'coordinator' && actor.role !== 'admin') throw forbidden();
  const store = db();
  const d = store.get('reconDiscrepancies', id);
  if (!d) throw notFound('La discrepancia no existe.');
  if (patch.ownerId && !store.get('users', patch.ownerId)) throw badRequest('El responsable no existe.');
  const next: Partial<ReconDiscrepancy> = {};
  if (patch.ownerId !== undefined) next.ownerId = patch.ownerId;
  if (patch.dueDate !== undefined) next.dueDate = patch.dueDate;
  if (patch.resolution) Object.assign(next, { resolution: patch.resolution.trim(), status: 'resolved', resolvedAt: nowIso() });
  const out = store.update('reconDiscrepancies', id, next);
  appendEvent({ type: 'governance_action', objectType: 'system', objectId: 'governance', actor, data: { action: 'reconciliation_discrepancy', target: id, ...next }, silent: true });
  if (patch.ownerId) notifyRole('coordinator', 'reconciliation', `Te asignaron una discrepancia de conciliación (${d.label}).`, { link: '/panel/reportes?tab=reconciliation' });
  return out;
}
