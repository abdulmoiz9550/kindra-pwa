import type { Origin } from '@kindra/shared';
import { PARISHES, PUBLIC_LOT_STATES } from '@kindra/shared';
import { db } from '../core/db';
import { nowIso } from '../core/ids';
import { notFound } from '../core/errors';
import { env } from '../config/env';
import { getConfig } from './config';
import { getOriginOrThrow, publicLotStage, reportStatus, sectorName } from './origins';

/**
 * Addendum v4.2, sección 9: portal público sin cuenta. Solo datos agregados y validados, cada cifra con su fecha de
 * corte. Nunca posiciones de vehículos, ubicaciones exactas de reportes ni datos personales.
 */

type Light = 'red' | 'yellow' | 'green' | 'grey';
export const LIGHT_LABELS: Record<Light, string> = {
  red: 'Rojo: reportes validados sin lote asignado',
  yellow: 'Amarillo: lotes en curso',
  green: 'Verde: puntos cerrados y confirmados',
  grey: 'Gris: sin datos',
};

const active = (o: Origin) => !['rejected', 'duplicate'].includes(o.state);
export const MIN_PUBLISHED_REPORTS = 5;

/** Consulta por código de reporte (R-…) o de lote (LG-…): estado público y fechas. */
export function publicLookup(code: string) {
  const store = db();
  const o = getOriginOrThrow(code.trim().toUpperCase());
  const stage = publicLotStage(o);
  const timeline: { label: string; at: string }[] = [{ label: o.type === 'citizen' ? 'Recibido' : 'Lote registrado', at: o.createdAt }];
  if (o.validatedAt) timeline.push({ label: 'Validado', at: o.validatedAt });
  for (const e of store.eventsOfChain(`origin:${o.id}`)) if (e.type === 'report_linked_to_lot') timeline.push({ label: `Asignado a Lote ${(e.data as { lotCode?: string }).lotCode ?? ''}`.trim(), at: e.serverTime });
  const trips = o.tripIds.map((id) => store.get('trips', id)).filter((t): t is NonNullable<typeof t> => !!t);
  const first = trips.map((t) => t.departure.serverTime).sort()[0];
  if (first) timeline.push({ label: PUBLIC_LOT_STATES[0], at: first });
  const recv = trips.map((t) => (t.state === 'received' ? t.arrival?.serverTime : null)).filter((x): x is string => !!x).sort()[0];
  if (recv) timeline.push({ label: PUBLIC_LOT_STATES[1], at: recv });
  if (stage >= 3) {
    const q = o.batchIds.map((id) => store.get('batches', id)).map((b) => (b?.qualityVerificationId ? store.get('qualityVerifications', b.qualityVerificationId) : undefined)).filter((v) => v?.result === 'approved').map((v) => v!.createdAt).sort()[0];
    if (q) timeline.push({ label: PUBLIC_LOT_STATES[2], at: q });
  }
  if (stage >= 4 && o.inWorkAt) timeline.push({ label: PUBLIC_LOT_STATES[3], at: o.inWorkAt });
  const removal = store.find('closures', (c) => c.originId === o.id && c.type === 'removal');
  if (removal) timeline.push({ label: 'Cierre Propuesto', at: removal.sentAt });
  if (removal?.respondedAt) timeline.push({ label: removal.citizenResponse === 'confirmed' ? 'Confirmado' : 'Disputado', at: removal.respondedAt });
  if (o.closedNoConfirmationAt) timeline.push({ label: 'Cerrado sin Confirmación', at: o.closedNoConfirmationAt });
  const st = o.type === 'citizen' ? reportStatus(o) : null;
  return {
    code: o.code,
    kind: o.type === 'citizen' ? 'report' : 'lot',
    sector: sectorName(o.sectorId),
    parish: store.get('sectors', o.sectorId)?.parish ?? null,
    status: st ? { label: st.label, reason: st.reason } : null,
    lotCodes: st?.lotCodes ?? [],
    publicStage: stage,
    publicStageLabel: stage ? PUBLIC_LOT_STATES[stage - 1] : null,
    timeline: timeline.sort((a, b) => (a.at < b.at ? -1 : 1)),
    cutoff: nowIso(),
  };
}

/** Avance y semáforo por sector. `parish` limita a una parroquia (página del QR). */
export function sectorProgressAll(parish?: string | null) {
  const store = db();
  const sectors = store.list('sectors').filter((s) => !parish || s.parish === parish);
  const origins = store.list('origins').filter(active);
  const receptions = store.list('receptions');
  const rows = sectors.map((s) => {
    const os = origins.filter((o) => o.sectorId === s.id);
    const reports = os.filter((o) => o.type === 'citizen');
    const lots = os.filter((o) => o.type === 'institutional');
    const statuses = reports.map((o) => reportStatus(o));
    const received = reports.length;
    const validated = reports.filter((o) => !!o.validatedAt).length;
    const closed = statuses.filter((x) => ['confirmed', 'closed', 'closed_no_confirmation'].includes(x.key)).length;
    const confirmed = statuses.filter((x) => x.key === 'confirmed' || (x.key === 'closed' && x.reason === 'despejado y confirmado')).length;
    const lotStages = [0, 0, 0, 0];
    for (const l of [...lots, ...reports.filter((o) => !(o.lotIds ?? []).length)]) {
      const st = publicLotStage(l);
      if (st) lotStages[st - 1]++;
    }
    const redCount = reports.filter((o) => !!o.validatedAt && !(o.lotIds ?? []).length && publicLotStage(o) === 0).length;
    const inProgress = lotStages[0] + lotStages[1] + lotStages[2];
    // Toneladas pesadas en báscula y estimadas, siempre por separado; m³ aparte.
    const tripIds = new Set(os.flatMap((o) => o.tripIds));
    const recs = receptions.filter((r) => tripIds.has(r.tripId) && r.receivedQuantity != null);
    const sum = (f: (r: (typeof recs)[number]) => boolean) => Math.round(recs.filter(f).reduce((a, r) => a + (r.receivedQuantity ?? 0), 0) * 100) / 100;
    const tWeighed = sum((r) => r.receivedUnit === 't' && r.measurementMethod === 'weighbridge');
    const tEstimated = sum((r) => r.receivedUnit === 't' && r.measurementMethod !== 'weighbridge');
    const m3 = sum((r) => r.receivedUnit === 'm3');
    const light: Light = redCount ? 'red' : inProgress ? 'yellow' : confirmed ? 'green' : 'grey';
    // Regla de publicación: un sector con menos de 5 reportes no se publica.
    if (received < MIN_PUBLISHED_REPORTS) return { id: s.id, name: s.name, parish: s.parish, polygon: s.polygon, published: false, received: null, validated: null, closed: null, confirmed: null, lotsByState: PUBLIC_LOT_STATES.map((label) => ({ label, count: null })), tonnesWeighed: null, tonnesEstimated: null, m3: null, light: 'grey' as Light, lightLabel: 'Gris: menos de 5 reportes, no se publica' };
    return { id: s.id, name: s.name, parish: s.parish, polygon: s.polygon, published: true, received, validated, closed, confirmed, lotsByState: PUBLIC_LOT_STATES.map((label, i) => ({ label, count: lotStages[i] })), tonnesWeighed: tWeighed, tonnesEstimated: tEstimated, m3, light, lightLabel: LIGHT_LABELS[light] };
  });
  return { cutoff: nowIso(), source: 'Registros de Kindra validados', parish: parish ?? null, sectors: rows };
}

/** Centros CDT y CDF con su ubicación y operadores (públicos). */
export function publicFacilities() {
  const store = db();
  return store
    .list('centers')
    .filter((c) => !!c.location)
    .map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      location: c.location,
      unloadingPoint: c.unloadingPoint ?? null,
      operators: [...new Set([c.entityId, ...(c.operatorEntityIds ?? [])])].map((id) => store.get('entities', id)?.name).filter((n): n is string => !!n),
    }));
}

export function parishPage(code: string) {
  const p = PARISHES.find((x) => x.code === code.toUpperCase());
  if (!p) throw notFound('La parroquia no existe.');
  return { parish: p.name, code: p.code, url: `${env.publicBaseUrl}/tablero/parroquia/${p.code}`, progress: sectorProgressAll(p.name) };
}

/** Datos abiertos: indicadores agregados por sector, con diccionario, fecha de corte y licencia. Sin datos personales. */
export const OPEN_DATA_DICTIONARY: { field: string; description: string }[] = [
  { field: 'parroquia', description: 'Parroquia del sector (Caraballeda, Catia La Mar o Macuto).' },
  { field: 'sector', description: 'Nombre del sector.' },
  { field: 'reportes_recibidos', description: 'Reportes ciudadanos recibidos (sin rechazados ni duplicados).' },
  { field: 'reportes_validados', description: 'Reportes validados por el Ente Coordinador.' },
  { field: 'reportes_cerrados', description: 'Reportes cerrados: confirmados o sin confirmación en el plazo.' },
  { field: 'lotes_retirado', description: 'Lotes en estado público 1 (Retirado).' },
  { field: 'lotes_recibido', description: 'Lotes en estado público 2 (Recibido).' },
  { field: 'lotes_procesado_y_ensayado', description: 'Lotes en estado público 3 (Procesado y Ensayado, con ensayo validado).' },
  { field: 'lotes_destino_final', description: 'Lotes en estado público 4 (Destino Final).' },
  { field: 'toneladas_pesadas', description: 'Toneladas recibidas medidas en báscula.' },
  { field: 'toneladas_estimadas', description: 'Toneladas recibidas por otro método (estimación). Nunca se suman con las pesadas.' },
  { field: 'metros_cubicos', description: 'Metros cúbicos recibidos. No se convierten a toneladas.' },
  { field: 'semaforo', description: 'rojo, amarillo, verde o gris según el avance del sector.' },
  { field: 'fecha_corte', description: 'Fecha y hora de corte de los datos (UTC).' },
  { field: 'fuente', description: 'Atribución obligatoria al reutilizar los datos.' },
];

export function openData() {
  const p = sectorProgressAll();
  const cfg = getConfig();
  const license = cfg.openDataLicense?.trim() || 'Pendiente de definición por el equipo Kindra';
  const cut = new Date(p.cutoff).toLocaleDateString('es-VE', { timeZone: 'America/Caracas', day: 'numeric', month: 'long', year: 'numeric' });
  const attribution = (cfg.openDataAttribution?.trim() || `Fuente: Kindra, datos al [fecha de corte], ${license}`).replace(/\[fecha de corte\]/gi, cut);
  const lightEs: Record<Light, string> = { red: 'rojo', yellow: 'amarillo', green: 'verde', grey: 'gris' };
  const rows = p.sectors.filter((s) => s.published).map((s) => ({
    parroquia: s.parish,
    sector: s.name,
    reportes_recibidos: s.received,
    reportes_validados: s.validated,
    reportes_cerrados: s.closed,
    lotes_retirado: s.lotsByState[0].count ?? 0,
    lotes_recibido: s.lotsByState[1].count ?? 0,
    lotes_procesado_y_ensayado: s.lotsByState[2].count ?? 0,
    lotes_destino_final: s.lotsByState[3].count ?? 0,
    toneladas_pesadas: s.tonnesWeighed,
    toneladas_estimadas: s.tonnesEstimated,
    metros_cubicos: s.m3,
    semaforo: lightEs[s.light],
    fecha_corte: p.cutoff,
    fuente: attribution,
  }));
  return { title: 'Kindra · Módulo 1 — Escombros: indicadores por sector', cutoff: p.cutoff, license, attribution, scope: 'La licencia cubre solo los datos agregados que genera Kindra. Las cifras oficiales conservan su fuente original y no se incluyen aquí.', minimumReports: MIN_PUBLISHED_REPORTS, dictionary: OPEN_DATA_DICTIONARY, rows };
}

export function openDataCsv(): string {
  const d = openData();
  const cols = OPEN_DATA_DICTIONARY.map((x) => x.field);
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...d.rows.map((r) => cols.map((c) => esc((r as Record<string, unknown>)[c])).join(','))].join('\n');
}

/**
 * Comparación pública de cifras oficiales y pesadas (última conciliación), por centro. Las cifras oficiales conservan
 * su fuente; las de Kindra son las pesadas en báscula. Las discrepancias abiertas se muestran con su motivo.
 */
export function publicReconciliation() {
  const store = db();
  const snap = store.list('reportSnapshots').sort((a, b) => (a.reportedAt < b.reportedAt ? 1 : -1))[0];
  if (!snap) return null;
  const byFacility = new Map<string, { facility: string; official: number | null; weighed: number }>();
  for (const r of snap.rows) {
    if (!r.facilityId) continue;
    const name = store.get('centers', r.facilityId)?.name ?? r.label;
    const cur = byFacility.get(r.facilityId) ?? { facility: name, official: null, weighed: 0 };
    if (r.tonnesAccumulated != null) cur.official = Math.round(((cur.official ?? 0) + r.tonnesAccumulated) * 100) / 100;
    byFacility.set(r.facilityId, cur);
  }
  for (const rec of store.filter('receptions', (x) => x.receivedUnit === 't' && x.measurementMethod === 'weighbridge' && x.receivedAt <= snap.reportedAt)) {
    const cur = byFacility.get(rec.centerId);
    if (cur) cur.weighed = Math.round((cur.weighed + (rec.receivedQuantity ?? 0)) * 100) / 100;
  }
  return {
    source: snap.source,
    reportedAt: snap.reportedAt,
    note: 'Toneladas oficiales según la fuente (calculadas por el reporte, muchas con el factor fijo 1,10 t/m³) frente a toneladas pesadas en báscula registradas en Kindra.',
    rows: [...byFacility.values()],
    discrepancies: store.filter('reconDiscrepancies', (d) => d.snapshotId === snap.id).map((d) => ({ label: d.label, reason: d.reason, status: d.status })),
  };
}
