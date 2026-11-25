import type { Batch, CorrectionRequest, NewsItem, Origin, OutputUnit, Role } from '@kindra/shared';
import { effectiveOriginState, FEATURES, featureOn, REVIEW_SCHEDULE } from '@kindra/shared';
import { db } from '../core/db';
import { appendEvent, chainIdOf, type Actor } from '../core/events';
import { currentValues } from '../core/projections';
import { newId, nowIso } from '../core/ids';
import { badRequest, conflict, forbidden, notFound } from '../core/errors';
import { getConfig } from './config';
import { getBatchOrThrow, hasProcessingStaff } from './batches';
import { listSnapshots } from './reportSnapshots';
import { notify, notifyRole } from './notifications';
import { effectiveStatus } from './pickups';
import { recordCompleteness } from './record';

/** Vistas de administración, calidad de datos, correcciones pedidas y contenido (v4.0, secciones 5, 8, 11 y 25.6). */

const day = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
export const isCorrected = (type: 'origin' | 'trip' | 'batch' | 'work', id: string) => db().eventsOfChain(chainIdOf(type, id)).some((e) => e.type === 'correction');

// ---------------------------------------------------------------- alcance por organización

const centerOf = (id: string) => db().get('centers', id);
const centerIn = (id: string, entityId: string) => {
  const c = centerOf(id);
  return !!c && (c.entityId === entityId || (c.operatorEntityIds || []).includes(entityId));
};
function originIn(o: Origin, entityId: string | null): boolean {
  if (!entityId) return true;
  if (o.entityId === entityId) return true;
  return o.tripIds.some((id) => {
    const t = db().get('trips', id);
    return !!t && (t.departure.entityId === entityId || centerIn(t.centerId, entityId));
  });
}

// ---------------------------------------------------------------- trazabilidad

const STAGES = ['Origen', 'Transporte', 'Recepción', 'Procesamiento', 'Evaluación', 'Destino'] as const;

export function traceability(entityId: string | null) {
  const store = db();
  return store
    .filter('origins', (o) => originIn(o, entityId) && o.state !== 'duplicate')
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 400)
    .map((o) => {
      const trips = o.tripIds.map((id) => store.get('trips', id)).filter(Boolean).map((t) => t!);
      const receptions = trips.map((t) => (t.receptionId ? store.get('receptions', t.receptionId) : undefined)).filter(Boolean).map((r) => r!);
      const batches = [...new Set([...o.batchIds, ...receptions.map((r) => r.batchId)])].map((id) => store.get('batches', id)).filter(Boolean).map((b) => b!);
      const delivered = batches.some((b) => b.dispatchIds.some((id) => store.get('dispatches', id)?.state !== 'pending'));
      const done = [o.state !== 'registered' && o.state !== 'rejected', trips.length > 0, receptions.length > 0, batches.some((b) => !!b.outputs), batches.some((b) => !!b.qualityResult), delivered];
      return {
        id: o.id,
        code: o.code,
        type: o.type,
        sectorName: store.get('sectors', o.sectorId)?.name ?? null,
        state: effectiveOriginState(o),
        material: o.material ?? null,
        quantity: o.quantity ?? null,
        unit: o.unit ?? null,
        createdAt: o.createdAt,
        trips: trips.map((t) => ({ id: t.id, code: t.code, state: t.state, centerName: centerOf(t.centerId)?.name ?? null })),
        batches: batches.map((b) => ({ code: b.code, state: b.state })),
        discrepancies: receptions.filter((r) => r.quantityCheck?.flagged || r.discrepancyNote).length,
        completeness: recordCompleteness(o),
        missing: STAGES.filter((_, i) => !done[i]),
        corrected: isCorrected('origin', o.id),
      };
    });
}

// ---------------------------------------------------------------- calidad de datos

interface Check {
  key: string;
  label: string;
  items: { code: string; link: string | null }[];
}

export function dataQuality() {
  const store = db();
  const origins = store.list('origins');
  const receptions = store.list('receptions');
  const tripCode = (id: string) => store.get('trips', id)?.code ?? id;
  const dup = (values: string[]) => [...new Set(values.filter((v, i) => values.indexOf(v) !== i))];
  const checks: Check[] = [
    { key: 'origin_fields', label: 'Orígenes institucionales sin material, cantidad o unidad', items: origins.filter((o) => o.type === 'institutional' && (!o.material || o.quantity == null || !o.unit)).map((o) => ({ code: o.code, link: `/reporte/${o.code}` })) },
    { key: 'reception_quantity', label: 'Recepciones sin cantidad recibida', items: receptions.filter((r) => r.receivedQuantity == null).map((r) => ({ code: tripCode(r.tripId), link: `/panel/viaje/${r.tripId}` })) },
    { key: 'reception_operator', label: 'Recepciones sin operador', items: receptions.filter((r) => !r.operatorEntityId).map((r) => ({ code: tripCode(r.tripId), link: `/panel/viaje/${r.tripId}` })) },
    { key: 'discrepancy', label: 'Recepciones con diferencia por revisar', items: receptions.filter((r) => r.quantityCheck?.flagged || r.discrepancyNote).map((r) => ({ code: tripCode(r.tripId), link: `/panel/viaje/${r.tripId}` })) },
    { key: 'processing_fields', label: 'Lotes procesados sin entrada o método', items: store.filter('batches', (b) => !!b.outputs && (b.outputs.input == null || !b.outputs.method)).map((b) => ({ code: b.code, link: `/publico/lote/${b.code}` })) },
    { key: 'duplicates', label: 'Códigos o placas repetidos', items: [...dup(origins.map((o) => o.code)), ...dup(store.list('trips').map((t) => t.code)), ...dup(store.list('batches').map((b) => b.code)), ...dup(store.list('vehicles').map((v) => v.plate))].map((code) => ({ code, link: null })) },
    { key: 'dates', label: 'Viajes con llegada anterior a la salida', items: store.filter('trips', (t) => !!t.arrival && t.arrival.serverTime < t.departure.serverTime).map((t) => ({ code: t.code, link: `/panel/viaje/${t.id}` })) },
    { key: 'sync', label: 'Eventos con hora inconsistente', items: store.allEvents().filter((e) => e.inconsistentTime).slice(-100).map((e) => ({ code: `#${e.seq}`, link: null })) },
    { key: 'coordinates', label: 'Centros sin coordenadas', items: store.filter('centers', (c) => !c.location).map((c) => ({ code: c.name, link: '/admin/centros' })) },
  ];
  return { checkedAt: nowIso(), total: checks.reduce((n, c) => n + c.items.length, 0), checks: checks.map((c) => ({ ...c, count: c.items.length, items: c.items.slice(0, 25) })) };
}

// ---------------------------------------------------------------- resumen del administrador

export function adminOverview(entityId: string | null) {
  const store = db();
  const cfg = getConfig();
  const origins = store.filter('origins', (o) => originIn(o, entityId) && !['duplicate', 'rejected'].includes(o.state));
  const trips = store.filter('trips', (t) => !entityId || t.departure.entityId === entityId || centerIn(t.centerId, entityId));
  const batches = store.filter('batches', (b) => !entityId || centerIn(b.centerId, entityId));
  const today = day(nowIso());
  const inScope = (a: { objectType: string; objectId: string }) => !entityId || (a.objectType === 'trip' ? trips.some((t) => t.id === a.objectId) : a.objectType === 'batch' ? batches.some((b) => b.id === a.objectId) : a.objectType === 'origin' ? origins.some((o) => o.id === a.objectId) : true);
  const alerts = store.filter('alerts', (a) => !a.resolvedAt && inScope(a)).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const snap = listSnapshots()[0];
  return {
    asOf: nowIso(),
    entityId,
    indicators: [
      { label: 'Orígenes abiertos', value: origins.filter((o) => o.state !== 'closed').length, to: '/admin/trazabilidad' },
      { label: 'Orígenes cerrados', value: origins.filter((o) => o.state === 'closed').length, to: '/admin/trazabilidad' },
      { label: 'Viajes en tránsito', value: trips.filter((t) => t.state === 'in_transit').length, to: '/panel/seguimiento' },
      { label: 'Llegadas confirmadas hoy', value: trips.filter((t) => t.arrival && day(t.arrival.serverTime) === today).length, to: '/panel/reportes?tab=activity' },
      { label: 'Lotes abiertos o en proceso', value: batches.filter((b) => ['open', 'closed', 'held', 'processed', 'under_verification'].includes(b.state)).length, to: '/admin/trazabilidad' },
      { label: 'Lotes aprobados', value: batches.filter((b) => ['approved', 'partially_dispatched', 'fully_dispatched'].includes(b.state)).length, to: '/admin/trazabilidad' },
    ],
    trend: monthTrend(origins, trips),
    alerts: alerts.slice(0, 12).map((a) => ({ id: a.id, text: a.text, createdAt: a.createdAt, link: a.objectType === 'trip' ? `/panel/viaje/${a.objectId}` : null })),
    alertCount: alerts.length,
    modules: FEATURES.filter((f) => f.group === 'module').map((f) => ({ label: f.label, active: featureOn(cfg.features, f.key) })),
    quality: entityId ? null : dataQuality().checks.map((c) => ({ label: c.label, count: c.count })),
    approvals: entityId
      ? []
      : [
          { label: 'Reportes por validar', count: store.filter('origins', (o) => o.state === 'registered').length, to: '/admin/reportes' },
          { label: 'Usuarios por verificar', count: store.filter('users', (u) => u.verificationStatus === 'pending').length, to: '/admin/usuarios' },
          { label: 'Propuestas de rol', count: store.filter('users', (u) => (u.proposedRoles || []).length > 0).length, to: '/admin/usuarios' },
          { label: 'Fotos por moderar', count: store.filter('photos', (p) => p.moderation === 'pending').length, to: '/admin/fotos' },
          { label: 'Solicitudes de información', count: store.filter('infoRequests', (r) => ['submitted', 'under_review'].includes(r.status)).length, to: '/admin/gobierno' },
          { label: 'Recuperaciones de acceso', count: store.filter('recoveryRequests', (r) => r.status === 'pending').length, to: '/admin/gobierno' },
          { label: 'Recolecciones por validar', count: store.filter('pickupRequests', (r) => effectiveStatus(r) === 'received').length, to: '/panel/solicitudes?tab=review' },
          { label: 'Correcciones pedidas', count: store.filter('correctionRequests', (r) => r.status === 'open').length, to: '/admin/trazabilidad' },
        ],
    report: snap && !entityId ? { title: snap.title, reportedAt: snap.reportedAt, indicators: snap.indicators.filter((i) => i.value !== null).slice(0, 4) } : null,
  };
}

function monthTrend(origins: Origin[], trips: { arrival?: { serverTime: string } | null }[]) {
  const months = new Map<string, { month: string; origins: number; arrivals: number }>();
  const at = (m: string) => months.get(m) ?? months.set(m, { month: m, origins: 0, arrivals: 0 }).get(m)!;
  for (const o of origins) at(day(o.createdAt).slice(0, 7)).origins++;
  for (const t of trips) if (t.arrival) at(day(t.arrival.serverTime).slice(0, 7)).arrivals++;
  return [...months.values()].sort((a, b) => (a.month < b.month ? -1 : 1)).slice(-12);
}

// ---------------------------------------------------------------- cola de reportes ciudadanos

export function citizenQueue() {
  const store = db();
  return {
    coordinators: store.filter('users', (u) => u.active && u.roles.includes('coordinator')).map((u) => ({ id: u.id, alias: u.alias })),
    reports: store
      .filter('origins', (o) => o.type === 'citizen' && o.state !== 'duplicate')
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((o) => {
        const a = store.get('reportAssignments', o.id);
        return { id: o.id, code: o.code, sectorName: store.get('sectors', o.sectorId)?.name ?? null, state: effectiveOriginState(o), createdAt: o.createdAt, closedAt: o.closedAt ?? null, assignedTo: a?.userId ?? null, escalated: !!a?.escalatedAt, note: a?.note ?? null };
      }),
  };
}

export function assignReport(actor: Actor, originId: string, input: { userId?: string | null; escalate?: boolean; note?: string | null }) {
  const store = db();
  const o = store.get('origins', originId);
  if (!o || o.type !== 'citizen') throw notFound('El reporte no existe.');
  const cur = store.get('reportAssignments', originId);
  if (input.userId && !store.get('users', input.userId)?.roles.includes('coordinator')) throw badRequest('Solo se asigna a una persona de coordinación.');
  if (input.escalate && !input.note?.trim()) throw badRequest('Indica por qué se escala.');
  const next = { id: originId, userId: input.userId !== undefined ? input.userId : cur?.userId ?? null, escalatedAt: input.escalate ? nowIso() : cur?.escalatedAt ?? null, note: input.note?.trim() || cur?.note || null, updatedAt: nowIso() };
  store.put('reportAssignments', next);
  appendEvent({ type: 'report_assigned', objectType: 'origin', objectId: originId, actor, data: { assigned: !!next.userId, escalated: !!input.escalate }, silent: true });
  if (input.userId) notify({ recipientKeys: [`user:${input.userId}`], kind: 'report_assigned', text: `Se te asignó el reporte ${o.code}.`, link: '/panel/coordinador' });
  if (input.escalate) notifyRole('coordinator', 'report_escalated', `El reporte ${o.code} fue escalado.`, { link: '/panel/coordinador' });
  return next;
}

// ---------------------------------------------------------------- correcciones pedidas por el evaluador

const correctionView = (c: CorrectionRequest) => ({ ...c, batchCode: db().get('batches', c.batchId)?.code ?? null });

export function listCorrections(actor: Actor) {
  const store = db();
  const u = actor.id ? store.get('users', actor.id) : undefined;
  return store
    .filter('correctionRequests', (c) => actor.role === 'evaluator' || store.get('batches', c.batchId)?.centerId === u?.centerId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(correctionView);
}

export function requestCorrection(actor: Actor, batchId: string, note: string): CorrectionRequest {
  if (actor.role !== 'evaluator') throw forbidden('Solo el evaluador pide una corrección.');
  const b = getBatchOrThrow(batchId);
  if (b.state !== 'under_verification') throw conflict('Solo se pide corrección de un lote por verificar.');
  if (openCorrection(b.id)) throw conflict('Ya hay una corrección pendiente para este lote.');
  const c: CorrectionRequest = { id: newId('cr'), batchId: b.id, note: note.trim(), requestedBy: actor.id!, createdAt: nowIso(), status: 'open', resolvedBy: null, resolvedAt: null, resolutionNote: null };
  db().put('correctionRequests', c);
  appendEvent({ type: 'correction_requested', objectType: 'batch', objectId: b.id, actor, data: { note: c.note } });
  for (const role of ['center', 'processing'] as Role[]) notifyRole(role, 'correction_requested', `El evaluador pidió corregir el lote ${b.code}.`, { centerId: b.centerId, link: role === 'center' ? '/panel/centro?tab=batches' : '/panel/procesamiento?tab=queue' });
  return c;
}

export const openCorrection = (batchId: string) => db().find('correctionRequests', (c) => c.batchId === batchId && c.status === 'open');

/** Corrige las salidas del lote: el valor anterior queda en la bitácora junto al motivo. */
export function resolveCorrection(actor: Actor, id: string, input: { note: string; outputs: { unit: OutputUnit; aggregate: number; metal: number; specialDisposal: number; rejects: number; input?: number | null; method?: string | null } }): CorrectionRequest {
  const store = db();
  const c = store.get('correctionRequests', id);
  if (!c) throw notFound('La corrección no existe.');
  if (c.status !== 'open') throw conflict('La corrección ya fue atendida.');
  const b = store.get('batches', c.batchId)!;
  const u = actor.id ? store.get('users', actor.id) : undefined;
  if (!['center', 'processing'].includes(actor.role || '') || u?.centerId !== b.centerId) throw forbidden('La corrección la hace el personal de ese centro.');
  if (actor.role === 'center' && hasProcessingStaff(b.centerId)) throw forbidden('Este centro tiene personal de procesamiento: la corrección le corresponde a ese rol.');
  const original = store.eventsOfChain(chainIdOf('batch', b.id)).filter((e) => e.type === 'outputs_recorded').at(-1);
  appendEvent({ type: 'correction', objectType: 'batch', objectId: b.id, actor, correctedEventId: original?.id ?? null, data: { reason: input.note.trim(), patch: { outputs: { ...b.outputs, ...input.outputs } }, previous: currentValues('batch', b.id, ['outputs']), originalType: 'outputs_recorded' } });
  notifyRole('evaluator', 'correction_resolved', `El lote ${b.code} fue corregido.`, { link: '/panel/evaluador?tab=verification' });
  return store.update('correctionRequests', id, { status: 'resolved', resolvedBy: actor.id, resolvedAt: nowIso(), resolutionNote: input.note.trim() });
}

export const batchExtras = (b: Batch) => ({ corrected: isCorrected('batch', b.id), openCorrection: openCorrection(b.id) ?? null });

// ---------------------------------------------------------------- noticias y campañas

export function listNews(role: Role | null, all = false): NewsItem[] {
  const now = nowIso();
  return db()
    .list('news')
    .filter((n) => all || (n.published && n.publishedAt <= now && (n.audience.length === 0 || (role !== null && n.audience.includes(role)))))
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
}

export function upsertNews(input: Omit<NewsItem, 'id' | 'updatedAt'> & { id?: string }): NewsItem {
  const existing = input.id ? db().get('news', input.id) : undefined;
  if (input.id && !existing) throw notFound('La noticia no existe.');
  return db().put('news', { ...input, id: existing?.id || newId('nw'), updatedAt: nowIso() });
}

// ---------------------------------------------------------------- revisiones periódicas

const PERIOD_DAYS: Record<string, number> = { daily: 1, weekly: 7, monthly: 31, quarterly: 92 };

export function reviewStatus() {
  const store = db();
  return REVIEW_SCHEDULE.map((r) => {
    const last = store.filter('reviewLogs', (l) => l.key === r.key).sort((a, b) => (a.doneAt < b.doneAt ? 1 : -1))[0];
    const due = PERIOD_DAYS[r.key] ? !last || Date.now() - Date.parse(last.doneAt) > PERIOD_DAYS[r.key] * 86_400_000 : false;
    return { ...r, lastAt: last?.doneAt ?? null, lastBy: last?.userId ? store.get('users', last.userId)?.alias ?? null : null, lastNote: last?.note ?? null, due };
  });
}

export function logReview(actor: Actor, key: string, note: string) {
  if (!REVIEW_SCHEDULE.some((r) => r.key === key)) throw badRequest('Esa revisión no existe.');
  const l = { id: newId('rv'), key, note: note.trim(), userId: actor.id, doneAt: nowIso() };
  appendEvent({ type: 'governance_action', objectType: 'system', objectId: 'governance', actor, data: { action: 'review_done', target: key, note: l.note }, silent: true });
  return db().put('reviewLogs', l);
}
