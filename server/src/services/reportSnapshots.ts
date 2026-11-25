import type { Entity, ReportSnapshot, ReportSnapshotRow, ReportSnapshotTotals, GeoPoint } from '@kindra/shared';
import { DEFAULT_SPACE_ID } from '@kindra/shared';
import { db } from '../core/db';
import { appendEvent, SYSTEM_ACTOR } from '../core/events';
import { nowIso } from '../core/ids';
import { notFound } from '../core/errors';

/**
 * Especificación v4.0, secciones 3, 4 y 8: reportes operativos por CDT.
 * - Cada fila une un centro físico canónico (una sola ubicación) con un operador.
 * - Un guion en el reporte se guarda como null; nunca se convierte en cero.
 * - Diario y acumulado, m³ y toneladas van en campos separados y nunca se suman entre sí.
 * - Se conserva la fecha y hora de la fuente: son cifras reportadas, no datos en vivo.
 */

/** Operadores genéricos por tipo: los reales se registran desde Administración, nunca en el código. */
export const OPERATOR_PUBLIC_ID = 'en_csur';
export const OPERATOR_CONTRACTOR_ID = 'en_cnorte';

const OPERATORS: Pick<Entity, 'id' | 'name' | 'description' | 'legalType'>[] = [
  { id: OPERATOR_PUBLIC_ID, name: 'Operador Público', description: 'Operador público que registra material en centros de disposición.', legalType: 'public_institution' },
  { id: OPERATOR_CONTRACTOR_ID, name: 'Operador Contratista', description: 'Operador contratista que registra material en centros de disposición.', legalType: 'company' },
];

/** Sitios confirmados por el cliente (reemplazan las secciones 1 y 4 de los datos v0.3). Coordenadas exactas. */
const CONFIRMED_SITES: { id: string; name: string; type: 'CDT' | 'CDF'; sectorId: string; location: GeoPoint; unloadingPoint?: GeoPoint; twoOperators: boolean }[] = [
  { id: 'ce_norte', name: 'Caraballeda', type: 'CDT', sectorId: 'sc_este', location: { lat: 10.61911, lng: -66.85436 }, twoOperators: true },
  { id: 'ce_sur', name: 'Playa Escondida', type: 'CDT', sectorId: 'sc_este', location: { lat: 10.61144, lng: -66.83332 }, twoOperators: true },
  { id: 'ce_playa_grande', name: 'Playa Grande', type: 'CDT', sectorId: 'sc_oeste', location: { lat: 10.61039, lng: -67.01919 }, twoOperators: true },
  { id: 'ce_final', name: 'Santa Eduvigis (Parque Tecnológico Ambiental)', type: 'CDF', sectorId: 'sc_oeste', location: { lat: 10.58962, lng: -67.0022 }, unloadingPoint: { lat: 10.58703, lng: -67.00575 }, twoOperators: false },
];

/** Cambia cuando el cliente entrega datos nuevos: se aplica una sola vez y respeta lo que la administración edite después. */
const REVISION = 2;

export const NOV22_SNAPSHOT_ID = 'rs_2026-11-22_1800';

/** Reporte "Plan de Despeje Digno y Seguro / Totalidad de Vestigios", 22 de noviembre de 2026, 18:00. */
function nov22Snapshot(): ReportSnapshot {
  const row = (id: string, label: string, facilityId: string | null, operatorEntityId: string | null, m3Today: number | null, m3Accumulated: number, tonnesToday: number | null, tonnesAccumulated: number, facilityPending: string | null = null): ReportSnapshotRow => ({
    id, label, facilityId, operatorEntityId, m3Today, m3Accumulated, tonnesToday, tonnesAccumulated, facilityPending,
  });
  return {
    id: NOV22_SNAPSHOT_ID,
    title: 'Plan de Despeje Digno y Seguro / Totalidad de Vestigios',
    source: 'Reporte operativo oficial (VESTIGIOS.pdf)',
    reportedAt: '2026-11-22T18:00:00-04:00',
    importedAt: nowIso(),
    importedBy: null,
    revision: REVISION,
    note: 'Cifras reportadas a esa fecha y hora. No son datos en vivo ni metas permanentes de la plataforma. Un guion (—) significa que el reporte no trae cifra diaria para esa fila.',
    indicators: [
      { key: 'target_tonnes', label: 'Meta de vestigios a trasladar', value: 2100000, unit: 't' },
      { key: 'processed_tonnes', label: 'Vestigios procesados', value: 1521013.66, unit: 't' },
      { key: 'pending_tonnes', label: 'Vestigios pendientes por procesar o trasladar', value: 578986.34, unit: 't' },
      { key: 'progress_percent', label: 'Avance general', value: 72.43, unit: '%' },
      { key: 'cleared_fronts', label: 'Frentes despejados', value: 221, unit: 'frentes', breakdown: [{ label: 'Oeste (Catia La Mar)', value: 105 }, { label: 'Este (Caraballeda)', value: 116 }] },
      { key: 'active_fronts_east', label: 'Frentes activos — Este / Caraballeda', value: null, unit: 'frentes', breakdown: [{ label: 'Operador Público', value: 6 }, { label: 'Operador Contratista', value: 96 }] },
      { key: 'active_fronts_west', label: 'Frentes activos — Oeste / Catia La Mar', value: null, unit: 'frentes', breakdown: [{ label: 'Operador Público', value: 86 }] },
      { key: 'buildings_demolished', label: 'Edificaciones demolidas', value: 346, unit: 'edificaciones' },
    ],
    rows: [
      row('r1', 'Parque Tecnológico Ambiental Santa Eduvigis', 'ce_final', null, 1178.18, 147227.14, 1296.0, 161949.85),
      row('r2', 'Caraballeda (operador público)', 'ce_norte', OPERATOR_PUBLIC_ID, null, 450473.0, null, 495520.3),
      row('r3', 'Caraballeda (operador contratista)', 'ce_norte', OPERATOR_CONTRACTOR_ID, 850.47, 222580.19, 935.52, 244838.21),
      row('r4', 'Playa Escondida', 'ce_sur', OPERATOR_PUBLIC_ID, null, 204798.19, null, 225278.01),
      row('r5', 'Playa Escondida (operador contratista)', 'ce_sur', OPERATOR_CONTRACTOR_ID, 2799.38, 232902.26, 3079.32, 256192.49),
      row('r6', 'Playa Grande', 'ce_playa_grande', OPERATOR_PUBLIC_ID, null, 72738.82, null, 80012.7),
      row('r7', 'Playa Grande - Calle 6', 'ce_playa_grande', OPERATOR_CONTRACTOR_ID, 778.0, 52020.09, 855.8, 57222.1),
    ],
    reportedTotals: { m3Today: 5606.04, m3Accumulated: 1382738.94, tonnesToday: 6166.64, tonnesAccumulated: 1521013.66 },
  };
}

/** Crea lo que falte y aplica una sola vez los sitios y operadores confirmados por el cliente. */
export function ensureReportSnapshots(): void {
  const store = db();
  if ((store.get('reportSnapshots', NOV22_SNAPSHOT_ID)?.revision ?? 0) >= REVISION) return;
  for (const op of OPERATORS) {
    if (store.get('entities', op.id)) continue;
    store.put('entities', { ...op, type: 'center', logoUrl: null, active: true, taxId: null, spaceId: DEFAULT_SPACE_ID, publicationPolicy: { officialFigures: { mode: 'public' }, discrepancies: { mode: 'public' }, photos: { mode: 'public' }, observations: { mode: 'public' } } } as Entity);
  }
  // Un registro por sitio físico. No se crea ningún centro: solo se completan los existentes.
  for (const site of CONFIRMED_SITES) {
    const center = store.get('centers', site.id);
    if (!center) continue;
    const links = site.twoOperators ? { entityId: OPERATOR_CONTRACTOR_ID, operatorEntityIds: [OPERATOR_PUBLIC_ID] } : {};
    store.update('centers', site.id, { name: site.name, type: site.type, location: site.location, ...(site.unloadingPoint ? { unloadingPoint: site.unloadingPoint } : {}), ...(store.get('sectors', site.sectorId) ? { sectorId: site.sectorId } : {}), ...links });
  }
  // Las organizaciones con nombre propio de la versión anterior se retiran; si ya tienen registros, quedan inactivas.
  for (const id of ['en_op_mop', 'en_op_miyamoto']) {
    if (!store.get('entities', id)) continue;
    const used = store.find('receptions', (r) => r.operatorEntityId === id) || store.find('users', (u) => u.entityId === id);
    if (used) store.update('entities', id, { active: false });
    else store.remove('entities', id);
  }
  const snap = nov22Snapshot();
  for (const r of snap.rows) {
    if (r.facilityId && !store.get('centers', r.facilityId)) {
      r.facilityPending = `El centro "${r.facilityId}" no existe en esta instalación.`;
      r.facilityId = null;
    }
  }
  // Total oficial tal como se imprimió y suma de filas: se guardan ambos y la diferencia queda marcada.
  const sums = totalsOf(snap.rows);
  snap.rowSums = { m3Today: sums.m3Today.value, m3Accumulated: sums.m3Accumulated.value, tonnesToday: sums.tonnesToday.value, tonnesAccumulated: sums.tonnesAccumulated.value };
  snap.sourceDiscrepancies = (Object.keys(snap.reportedTotals) as (keyof ReportSnapshotTotals)[]).filter((k) => snap.reportedTotals[k] !== snap.rowSums![k]).map((k) => ({ field: k, official: snap.reportedTotals[k], rowSum: snap.rowSums![k] }));
  store.put('reportSnapshots', snap);
  appendEvent({ type: 'report_snapshot_imported', objectType: 'system', objectId: 'report_snapshots', actor: SYSTEM_ACTOR, data: { snapshotId: snap.id, revision: REVISION, reportedAt: snap.reportedAt, rows: snap.rows.length, source: snap.source, sourceDiscrepancies: snap.sourceDiscrepancies }, silent: true });
}

/** Suma que respeta los vacíos: si ninguna fila trae cifra, el total es null (no cero). */
function sumNullable(values: (number | null)[]): { value: number | null; missing: number } {
  const present = values.filter((v): v is number => v !== null);
  const missing = values.length - present.length;
  if (!present.length) return { value: null, missing };
  return { value: Math.round(present.reduce((s, v) => s + v, 0) * 100) / 100, missing };
}

function totalsOf(rows: ReportSnapshotRow[]) {
  return {
    m3Today: sumNullable(rows.map((r) => r.m3Today)),
    m3Accumulated: sumNullable(rows.map((r) => r.m3Accumulated)),
    tonnesToday: sumNullable(rows.map((r) => r.tonnesToday)),
    tonnesAccumulated: sumNullable(rows.map((r) => r.tonnesAccumulated)),
  };
}

export interface SnapshotFilters {
  operatorId?: string | null;
  facilityId?: string | null;
}

/** Valor especial del filtro de operador: filas donde el reporte no indica operador. */
export const NO_OPERATOR = 'none';

export function listSnapshots(): ReportSnapshot[] {
  return db().list('reportSnapshots').sort((a, b) => (a.reportedAt < b.reportedAt ? 1 : -1));
}

/**
 * Vista de un reporte: un grupo por centro físico (un solo pin, ubicación canónica exacta o "sin coordenadas"),
 * con sus filas por operador. Los totales se calculan una sola vez sobre las filas filtradas (sin doble conteo).
 */
export function snapshotView(id: string | null, filters: SnapshotFilters = {}) {
  const store = db();
  const snap = id ? store.get('reportSnapshots', id) : listSnapshots()[0];
  if (!snap) throw notFound('No hay reportes operativos registrados.');
  const opName = (opId: string | null) => (opId ? store.get('entities', opId)?.name ?? opId : null);
  let rows = snap.rows;
  if (filters.operatorId) rows = rows.filter((r) => (filters.operatorId === NO_OPERATOR ? r.operatorEntityId === null : r.operatorEntityId === filters.operatorId));
  if (filters.facilityId) rows = rows.filter((r) => r.facilityId === filters.facilityId);

  const facilityIds = [...new Set(snap.rows.map((r) => r.facilityId).filter((x): x is string => !!x))];
  const facilities = facilityIds.map((fid) => {
    const c = store.get('centers', fid)!;
    const location: GeoPoint | null = c.location ?? null;
    const own = rows.filter((r) => r.facilityId === fid);
    return {
      facilityId: fid,
      name: c.name,
      type: c.type,
      location,
      coordinates: location ? ('exact' as const) : ('missing' as const),
      operators: [...new Set(snap.rows.filter((r) => r.facilityId === fid).map((r) => r.operatorEntityId))].map((o) => ({ id: o, name: opName(o) })),
      /** Activo si alguno de sus operadores reporta material del día. */
      active: snap.rows.some((r) => r.facilityId === fid && ((r.m3Today ?? 0) > 0 || (r.tonnesToday ?? 0) > 0)),
      rows: own.map((r) => ({ ...r, operatorName: opName(r.operatorEntityId) })),
      totals: totalsOf(own),
    };
  });
  const unlinked = rows.filter((r) => !r.facilityId).map((r) => ({ ...r, operatorName: opName(r.operatorEntityId) }));
  const totals = totalsOf(rows);
  const full = totalsOf(snap.rows);
  const diff = (k: keyof ReportSnapshotTotals) => {
    const reported = snap.reportedTotals[k];
    const computed = full[k].value;
    return { reported, computed, difference: reported !== null && computed !== null ? Math.round((reported - computed) * 100) / 100 : null };
  };
  const operators = [...new Set(snap.rows.map((r) => r.operatorEntityId))].map((o) => ({ id: o ?? NO_OPERATOR, name: opName(o) ?? 'Sin operador indicado en el reporte' }));
  return {
    snapshot: { id: snap.id, title: snap.title, source: snap.source, reportedAt: snap.reportedAt, importedAt: snap.importedAt, note: snap.note },
    indicators: snap.indicators,
    facilities,
    unlinked,
    totals,
    filtered: !!(filters.operatorId || filters.facilityId),
    /** Revisión de consistencia: total impreso en el reporte frente a la suma de sus filas. */
    consistency: { m3Today: diff('m3Today'), m3Accumulated: diff('m3Accumulated'), tonnesToday: diff('tonnesToday'), tonnesAccumulated: diff('tonnesAccumulated') },
    operators,
  };
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV del reporte: celdas vacías donde el reporte trae guion (no ceros). */
export function snapshotCsv(id: string | null, filters: SnapshotFilters = {}): { filename: string; csv: string; rows: number } {
  const v = snapshotView(id, filters);
  const header = ['fecha_hora_reporte', 'fuente', 'etiqueta_reporte', 'centro_fisico', 'tipo_centro', 'coordenadas', 'operador', 'm3_dia', 'm3_acumulado', 't_dia', 't_acumulado'];
  const lines = [header.join(',')];
  const push = (r: ReportSnapshotRow & { operatorName: string | null }, facilityName: string, facilityType: string, coords: string) =>
    lines.push([v.snapshot.reportedAt, v.snapshot.source, r.label, facilityName, facilityType, coords, r.operatorName ?? '', r.m3Today, r.m3Accumulated, r.tonnesToday, r.tonnesAccumulated].map(csvCell).join(','));
  for (const f of v.facilities) for (const r of f.rows) push(r, f.name, f.type, f.location ? `${f.location.lat},${f.location.lng}` : 'sin coordenadas');
  for (const r of v.unlinked) push(r, 'Sitio por confirmar', '', 'sin coordenadas');
  return { filename: `reporte-operativo-${v.snapshot.reportedAt.slice(0, 10)}.csv`, csv: '﻿' + lines.join('\n'), rows: lines.length - 1 };
}

// ---------------------------------------------------------------- actividad registrada en la plataforma

export interface ActivityFilters extends SnapshotFilters {
  sectorId?: string | null;
  from?: string | null;
  to?: string | null;
}

/**
 * Recepciones registradas en Kindra por centro físico y operador: del día (último día del rango) y acumuladas en el rango.
 * Cada recepción cuenta una sola vez; m³ y toneladas en columnas separadas; sin cantidad ≠ cero.
 */
export function facilityActivity(filters: ActivityFilters) {
  const store = db();
  const day = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
  const to = filters.to || day(nowIso());
  const receptions = store.filter('receptions', (r) => {
    const d = day(r.receivedAt);
    if (d > to || (filters.from && d < filters.from)) return false;
    if (filters.facilityId && r.centerId !== filters.facilityId) return false;
    if (filters.operatorId && (filters.operatorId === NO_OPERATOR ? !!r.operatorEntityId : r.operatorEntityId !== filters.operatorId)) return false;
    if (filters.sectorId) {
      const t = store.get('trips', r.tripId);
      if (!t?.originIds.some((o) => store.get('origins', o)?.sectorId === filters.sectorId)) return false;
    }
    return true;
  });
  const qty = (rs: typeof receptions, unit: 'm3' | 't') => sumNullable(rs.map((r) => (r.receivedUnit === unit ? r.receivedQuantity ?? null : null))).value;
  const groups = new Map<string, typeof receptions>();
  for (const r of receptions) {
    const k = `${r.centerId}|${r.operatorEntityId ?? ''}`;
    groups.set(k, [...(groups.get(k) || []), r]);
  }
  const summary = (rs: typeof receptions) => {
    const today = rs.filter((r) => day(r.receivedAt) === to);
    return { loadsDay: today.length, loads: rs.length, m3Day: qty(today, 'm3'), m3: qty(rs, 'm3'), tonnesDay: qty(today, 't'), tonnes: qty(rs, 't'), withoutQuantity: rs.filter((r) => r.receivedQuantity == null).length, flagged: rs.filter((r) => r.quantityCheck?.flagged || r.discrepancyNote).length };
  };
  return {
    from: filters.from || null,
    to,
    source: 'Recepciones confirmadas por los centros en Kindra',
    rows: [...groups.entries()].map(([k, rs]) => {
      const [centerId, operatorId] = k.split('|');
      return { facilityId: centerId, facilityName: store.get('centers', centerId)?.name ?? centerId, operatorId: operatorId || null, operatorName: operatorId ? store.get('entities', operatorId)?.name ?? operatorId : 'Sin operador registrado', ...summary(rs) };
    }),
    totals: summary(receptions),
    records: receptions
      .sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1))
      .slice(0, 300)
      .map((r) => ({ id: r.id, tripId: r.tripId, tripCode: store.get('trips', r.tripId)?.code ?? null, originCodes: (store.get('trips', r.tripId)?.originIds || []).map((o) => store.get('origins', o)?.code).filter(Boolean), facilityId: r.centerId, facilityName: store.get('centers', r.centerId)?.name ?? null, operatorId: r.operatorEntityId ?? null, receivedAt: r.receivedAt, quantity: r.receivedQuantity ?? null, unit: r.receivedUnit ?? null, flagged: !!(r.quantityCheck?.flagged || r.discrepancyNote), check: r.quantityCheck ?? null })),
  };
}
