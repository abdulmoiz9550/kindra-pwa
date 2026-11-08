import type { Origin, SourcedFigure, Sector } from '@kindra/shared';
import { effectiveOriginState, stageOf, isoDay } from '@kindra/shared';
import { db } from '../core/db';
import { batchComposition, valorizationRate } from './batches';
import { recordCompleteness } from './record';
import { isPublished } from './publication';
import { nowIso } from '../core/ids';

const PLATFORM = 'Calculado por la plataforma a partir de los registros';

function latest(dates: (string | null | undefined)[]): string | null {
  let m: string | null = null;
  for (const d of dates) if (d && (!m || d > m)) m = d;
  return m;
}

function fig<T>(value: T, source: string, asOf: string | null, explanation: string, label?: string): SourcedFigure<T> {
  return { value, source, asOf, explanation, label };
}

export interface DashboardData {
  generatedAt: string;
  sectorId: string | null;
  sectorName: string | null;
  simulated: boolean;
  trafficLight: { sectorId: string; sectorName: string; pending: number; inProgress: number; done: number; total: number; authorized: boolean }[];
  heatMap: { sectorId: string; sectorName: string; polygon: [number, number][]; unattended: number; intensity: number }[];
  origins: { open: SourcedFigure; closed: SourcedFigure; total: SourcedFigure; rejected: SourcedFigure };
  completeness: SourcedFigure<number | null> & { full: number; counted: number };
  tripsPerCenter: { centerId: string; centerName: string; received: SourcedFigure; inTransit: number; noArrival: number }[];
  tonnes: { centerId: string; centerName: string; official: SourcedFigure<number | null>; estimatedM3: SourcedFigure<number | null> }[];
  discrepancies: { centerId: string; centerName: string; day: string; departed: number; confirmed: number; difference: number }[] | null;
  valorization: { total: SourcedFigure<number | null>; perCenter: { centerId: string; centerName: string; rate: SourcedFigure<number | null> }[]; perSector: { sectorId: string; sectorName: string; rate: SourcedFigure<number | null> }[] };
  works: { supplied: SourcedFigure; localities: SourcedFigure<string[]>; list: { code: string; name: string; useType: string; locality: string; dateOfUse: string | null }[] };
  jobs: { direct: SourcedFigure; indirect: SourcedFigure };
  satisfaction: SourcedFigure<number | null> & { answers: number };
  collectiveGoal: { sectorId: string; sectorName: string; percent: number; done: number; total: number }[];
  beforeAfter: { originCode: string; sectorName: string; beforeUrl: string; afterUrl: string }[];
}

/** 12. Tablero público. Cada cifra lleva su fuente y la fecha de su último dato (12.4) y una explicación (10.5). */
export function buildDashboard(sectorId: string | null): DashboardData {
  const store = db();
  const sectors = store.list('sectors');
  const sectorFilter = sectorId ? sectors.find((s) => s.id === sectorId) : undefined;
  const inScope = (o: Origin) => (!sectorFilter || o.sectorId === sectorFilter.id) && o.state !== 'duplicate';
  const origins = store.filter('origins', inScope);
  const counted = origins.filter((o) => o.state !== 'rejected');
  const latestOriginEvent = latest(store.allEvents().filter((e) => e.objectType === 'origin').map((e) => e.serverTime));

  // Semáforo y mapa de calor por sector
  const sectorsInScope = sectorFilter ? [sectorFilter] : sectors;
  const trafficLight = sectorsInScope.map((s: Sector) => {
    const os = store.filter('origins', (o) => o.sectorId === s.id && !['rejected', 'duplicate'].includes(o.state));
    let pending = 0, inProgress = 0, done = 0;
    for (const o of os) {
      const st = effectiveOriginState(o);
      if (['pending_authorization', 'registered', 'validated'].includes(st)) pending++;
      else if (['under_removal', 'disputed'].includes(st)) inProgress++;
      else done++;
    }
    return { sectorId: s.id, sectorName: s.name, pending, inProgress, done, total: os.length, authorized: s.authorized };
  });
  const maxUnattended = Math.max(1, ...trafficLight.map((t) => t.pending));
  const heatMap = sectorsInScope.map((s) => {
    const t = trafficLight.find((x) => x.sectorId === s.id)!;
    return { sectorId: s.id, sectorName: s.name, polygon: s.polygon, unattended: t.pending, intensity: t.pending / maxUnattended };
  });

  // Completitud de fichas (11.2)
  const completenessValues = counted.map(recordCompleteness);
  const full = completenessValues.filter((c) => c === 7).length;

  // Viajes y toneladas por centro
  const centers = store.list('centers');
  const tripsAll = store.filter('trips', (t) => !sectorFilter || t.originIds.some((id) => store.get('origins', id)?.sectorId === sectorFilter.id));
  const tripsPerCenter = centers.map((c) => {
    const ts = tripsAll.filter((t) => t.centerId === c.id);
    const received = ts.filter((t) => t.state === 'received');
    return {
      centerId: c.id,
      centerName: c.name,
      received: fig(received.length, store.get('entities', c.entityId)?.name || c.name, latest(received.map((t) => t.arrival?.serverTime)), 'Viajes cuya llegada confirmó el centro.'),
      inTransit: ts.filter((t) => t.state === 'in_transit').length,
      noArrival: ts.filter((t) => t.state === 'no_arrival').length,
    };
  });
  const tonnes = centers.map((c) => {
    const summaries = store.filter('dailySummaries', (s) => s.centerId === c.id && isPublished(s.entityId, 'officialFigures', s.createdAt));
    const official = summaries.reduce((s, x) => s + (x.officialTonnes || 0), 0);
    const received = tripsAll.filter((t) => t.centerId === c.id && t.state === 'received');
    const est = received.reduce((s, t) => s + (t.estimatedVolumeM3 || 0), 0);
    const entityName = store.get('entities', c.entityId)?.name || c.name;
    return {
      centerId: c.id,
      centerName: c.name,
      official: fig(summaries.length ? official : null, entityName, latest(summaries.map((s) => s.createdAt)), 'Toneladas que la entidad del centro reportó en sus resúmenes diarios. No se pesan: se estiman a partir del volumen (m³ × 1,1).', 'Toneladas oficiales (estimadas a partir del volumen)'),
      estimatedM3: fig(received.length ? Math.round(est * 10) / 10 : null, `${PLATFORM} de viajes (estimado)`, latest(received.map((t) => t.arrival?.serverTime)), 'Volumen estimado: capacidad nominal del vehículo × nivel de llenado, sumado por viaje recibido. No es una medición.', 'Volumen estimado (m³)'),
    };
  });

  // 7.9 discrepancia de conteo por centro y día
  const discrepancies: DashboardData['discrepancies'] = [];
  for (const c of centers) {
    if (!isPublished(c.entityId, 'discrepancies')) continue;
    const byDay = new Map<string, { departed: number; confirmed: number }>();
    for (const t of tripsAll.filter((x) => x.centerId === c.id)) {
      const day = isoDay(t.departure.serverTime);
      const cur = byDay.get(day) || { departed: 0, confirmed: 0 };
      cur.departed++;
      if (t.state === 'received') cur.confirmed++;
      byDay.set(day, cur);
    }
    for (const [day, v] of byDay) if (v.departed !== v.confirmed) discrepancies.push({ centerId: c.id, centerName: c.name, day, departed: v.departed, confirmed: v.confirmed, difference: v.departed - v.confirmed });
  }
  discrepancies.sort((a, b) => (a.day < b.day ? 1 : -1));

  // Valorización
  const batchesAll = store.filter('batches', (b) => !!b.outputs && isPublished(store.get('centers', b.centerId)?.entityId, 'officialFigures', b.processedAt));
  const batchesScope = sectorFilter ? batchesAll.filter((b) => batchComposition(b).some((c) => c.sectorId === sectorFilter.id)) : batchesAll;
  const total = valorizationRate(batchesScope);
  const latestBatch = latest(batchesScope.map((b) => b.processedAt));
  const valExplanation = 'Tasa de valorización: de todo lo que entró a los centros, qué parte se convirtió en material para otras obras.';
  const perCenter = centers.map((c) => {
    const bs = batchesScope.filter((b) => b.centerId === c.id);
    const v = valorizationRate(bs);
    return { centerId: c.id, centerName: c.name, rate: fig(v.rate, store.get('entities', c.entityId)?.name || c.name, latest(bs.map((b) => b.processedAt)), valExplanation) };
  });
  const perSector = sectorsInScope.map((s) => {
    let agg = 0, tot = 0, asOf: string | null = null;
    for (const b of batchesAll) {
      const share = batchComposition(b).find((c) => c.sectorId === s.id)?.share || 0;
      if (!share || !b.outputs) continue;
      agg += b.outputs.aggregate * share;
      tot += (b.outputs.aggregate + b.outputs.metal + b.outputs.specialDisposal + b.outputs.rejects) * share;
      asOf = latest([asOf, b.processedAt]);
    }
    return { sectorId: s.id, sectorName: s.name, rate: fig(tot > 0 ? agg / tot : null, `${PLATFORM} de los centros, ponderado por la participación del sector en cada lote`, asOf, valExplanation) };
  });

  // Obras y empleos
  const worksUsed = store.filter('works', (w) => !!w.useRecordedAt && (!sectorFilter || w.dispatchIds.some((did) => {
    const d = store.get('dispatches', did);
    const b = d && store.get('batches', d.batchId);
    return !!b && batchComposition(b).some((c) => c.sectorId === sectorFilter.id);
  })));
  const localities = [...new Set(worksUsed.map((w) => w.locality))];
  const jobs = store.filter('jobs', (j) => isPublished(j.entityId, 'officialFigures', j.createdAt));
  const direct = jobs.filter((j) => j.type === 'direct').reduce((s, j) => s + j.positions, 0);
  const indirect = jobs.filter((j) => j.type === 'indirect').reduce((s, j) => s + j.positions, 0);
  const jobEntities = [...new Set(jobs.map((j) => store.get('entities', j.entityId)?.name).filter(Boolean))].join(', ');

  // Satisfacción (porcentaje de "Sí")
  const answered = store.filter('closures', (c) => c.type === 'work' && !!c.satisfactionAnswer && (!sectorFilter || store.get('origins', c.originId)?.sectorId === sectorFilter.id));
  const yes = answered.filter((c) => c.satisfactionAnswer === 'yes').length;

  // Meta colectiva por sector (9.6)
  const collectiveGoal = sectorsInScope.map((s) => {
    const os = store.filter('origins', (o) => o.sectorId === s.id && !['rejected', 'duplicate'].includes(o.state));
    const done = os.filter((o) => stageOf(o.state) >= stageOf('removed') || (o.state === 'disputed' && stageOf(o.preDisputeState || '') >= stageOf('removed'))).length;
    return { sectorId: s.id, sectorName: s.name, percent: os.length ? Math.round((done / os.length) * 100) : 0, done, total: os.length };
  });

  // Fotos de antes y después moderadas
  const beforeAfter: DashboardData['beforeAfter'] = [];
  for (const o of counted) {
    if (!o.afterPhotoId || !o.photoIds.length) continue;
    const before = store.get('photos', o.photoIds[0]);
    const after = store.get('photos', o.afterPhotoId);
    if (before?.moderation === 'approved' && after?.moderation === 'approved') beforeAfter.push({ originCode: o.code, sectorName: store.get('sectors', o.sectorId)?.name || '', beforeUrl: before.url, afterUrl: after.url });
  }

  const cfg = store.get('config', 'main');
  return {
    generatedAt: nowIso(),
    sectorId: sectorFilter?.id ?? null,
    sectorName: sectorFilter?.name ?? null,
    simulated: !!cfg?.demoMode,
    trafficLight,
    heatMap,
    origins: {
      open: fig(counted.filter((o) => o.state !== 'closed').length, PLATFORM, latestOriginEvent, 'Reportes y orígenes institucionales que todavía no completaron el recorrido.'),
      closed: fig(counted.filter((o) => o.state === 'closed').length, PLATFORM, latestOriginEvent, 'Orígenes cuyo cierre final ya fue enviado al ciudadano.'),
      total: fig(counted.length, PLATFORM, latestOriginEvent, 'Orígenes registrados, sin contar rechazados ni duplicados.'),
      rejected: fig(origins.length - counted.length, 'Ente coordinador', latestOriginEvent, 'Reportes descartados por el coordinador con un motivo registrado.'),
    },
    completeness: { ...fig(counted.length ? full / counted.length : null, PLATFORM, latestOriginEvent, 'Porcentaje de fichas con los siete campos completos: origen, retiro, centro, clasificación, calidad, uso final y confirmación ciudadana.'), full, counted: counted.length },
    tripsPerCenter,
    tonnes,
    discrepancies: discrepancies.length || centers.some((c) => isPublished(c.entityId, 'discrepancies')) ? discrepancies : null,
    valorization: { total: fig(total.rate, PLATFORM + ' de los centros', latestBatch, valExplanation), perCenter, perSector },
    works: {
      supplied: fig(worksUsed.length, 'Ente de obras', latest(worksUsed.map((w) => w.useRecordedAt)), 'Obras públicas donde ya se registró el uso del agregado reciclado.'),
      localities: fig(localities, 'Ente de obras', latest(worksUsed.map((w) => w.useRecordedAt)), 'Localidades donde se usó material reciclado.'),
      list: worksUsed.map((w) => ({ code: w.code, name: w.name, useType: w.useType, locality: w.locality, dateOfUse: w.dateOfUse ?? null })),
    },
    jobs: {
      direct: fig(direct, jobEntities || 'Sin registros', latest(jobs.map((j) => j.createdAt)), 'Puestos de trabajo directos que las entidades reportaron en los centros y el retiro.'),
      indirect: fig(indirect, jobEntities || 'Sin registros', latest(jobs.map((j) => j.createdAt)), 'Puestos de trabajo indirectos reportados por las entidades.'),
    },
    satisfaction: { ...fig(answered.length ? yes / answered.length : null, 'Respuestas de ciudadanos', latest(answered.map((c) => c.respondedAt)), 'Porcentaje de personas que respondieron "Sí" a la pregunta: ¿sentiste que tu reporte fue tomado en cuenta?'), answers: answered.length },
    collectiveGoal,
    beforeAfter,
  };
}

/** Avance de un sector para AURA ("Sector progress"). */
export function sectorProgress(sectorId: string): { sector: Sector; total: number; done: number; inProgress: number; pending: number } | null {
  const store = db();
  const sector = store.get('sectors', sectorId);
  if (!sector) return null;
  const t = buildDashboard(sectorId).trafficLight[0];
  return { sector, total: t.total, done: t.done, inProgress: t.inProgress, pending: t.pending };
}
