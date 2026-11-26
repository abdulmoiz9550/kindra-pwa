import { db } from '../core/db';
import { Router } from 'express';
import type { Request } from 'express';
import { REPORT_ROLES } from '@kindra/shared';
import { requireRole, wrap } from '../middleware/auth';
import { forbidden } from '../core/errors';
import { listSnapshots, snapshotView, snapshotCsv, facilityActivity, type SnapshotFilters } from '../services/reportSnapshots';
import { assertCanExport, logExport } from '../services/governance';
import { z } from 'zod';
import { importSnapshot, listReconDiscrepancies, reconciliationView, updateReconDiscrepancy } from '../services/reconciliation';

/**
 * v4.0, secciones 3, 4, 8 y 20: reportes operativos por CDT para roles institucionales.
 * Diario y acumulado, m³ y toneladas por separado, filtro por operador y por centro físico.
 * Alcance: el centro ve solo su sitio; el administrador de entidad ve solo las filas de su organización.
 */
export const reportsRouter = Router();
reportsRouter.use(requireRole(...REPORT_ROLES));
reportsRouter.use((req, _res, next) => {
  if (req.auth!.role === 'admin' && !req.auth!.mfa) return next(forbidden('Confirma la verificación en dos pasos para ver los reportes.'));
  next();
});

function scopedFilters(req: Request): SnapshotFilters {
  const q = req.query;
  const filters: SnapshotFilters = {
    operatorId: typeof q.operator === 'string' && q.operator ? q.operator : null,
    facilityId: typeof q.facility === 'string' && q.facility ? q.facility : null,
  };
  const { role, user } = req.auth!;
  if (role === 'center') filters.facilityId = user.centerId ?? '__none__';
  if (role === 'entity_admin') filters.operatorId = user.entityId ?? '__none__';
  return filters;
}

reportsRouter.get('/snapshots', (_req, res) => {
  res.json(listSnapshots().map((s) => ({ id: s.id, title: s.title, source: s.source, reportedAt: s.reportedAt, importedAt: s.importedAt })));
});

reportsRouter.get(
  '/snapshots/view',
  wrap((req, res) => {
    const id = typeof req.query.id === 'string' && req.query.id ? req.query.id : null;
    const filters = scopedFilters(req);
    res.json({ ...snapshotView(id, filters), scope: req.auth!.role === 'center' ? 'facility' : req.auth!.role === 'entity_admin' ? 'organization' : 'global' });
  }),
);

/** Exportación controlada: solo roles con permiso; cada descarga queda registrada. */
reportsRouter.get(
  '/snapshots/export',
  wrap((req, res) => {
    assertCanExport(req.auth!.role, req.auth!.mfa);
    const id = typeof req.query.id === 'string' && req.query.id ? req.query.id : null;
    const filters = scopedFilters(req);
    const out = snapshotCsv(id, filters);
    logExport(req.auth!.actor, 'report_snapshot_csv', out.rows, { snapshotId: id, ...filters });
    res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
    res.type('text/csv; charset=utf-8').send(out.csv);
  }),
);

/** Registros propios de la plataforma, con rango de fechas y detalle de cada recepción (para abrir desde cada cifra). */
reportsRouter.get(
  '/activity',
  wrap((req, res) => {
    const q = req.query;
    const date = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
    res.json(facilityActivity({ ...scopedFilters(req), sectorId: typeof q.sector === 'string' && q.sector ? q.sector : null, from: date(q.from), to: date(q.to) }));
  }),
);

// ---------------------------------------------------------------- addendum v4.2, sección 14: conciliación semanal
const num = z.number().min(0).nullable();
reportsRouter.post(
  '/snapshots/import',
  wrap((req, res) => {
    const body = z
      .object({
        title: z.string().min(3).max(200),
        source: z.string().min(3).max(200),
        reportedAt: z.string().min(10),
        note: z.string().max(1000).default(''),
        rows: z.array(z.object({ label: z.string().min(1).max(120), facilityId: z.string().nullable(), operatorEntityId: z.string().nullable(), m3Today: num, m3Accumulated: num, tonnesToday: num, tonnesAccumulated: num })).min(1).max(200),
        reportedTotals: z.object({ m3Today: num.optional(), m3Accumulated: num.optional(), tonnesToday: num.optional(), tonnesAccumulated: num.optional() }).optional(),
      })
      .parse(req.body);
    res.status(201).json(importSnapshot(req.auth!.actor, body));
  }),
);
reportsRouter.get(
  '/reconciliation',
  wrap((req, res) => {
    const id = typeof req.query.id === 'string' && req.query.id ? req.query.id : listSnapshots()[0]?.id;
    if (!id) {
      res.json(null);
      return;
    }
    res.json(reconciliationView(id));
  }),
);
reportsRouter.get('/reconciliation/discrepancies', (_req, res) => res.json(listReconDiscrepancies()));
reportsRouter.post(
  '/reconciliation/discrepancies/:id',
  wrap((req, res) => {
    const body = z.object({ ownerId: z.string().nullable().optional(), dueDate: z.string().nullable().optional(), resolution: z.string().min(5).max(1000).nullable().optional() }).parse(req.body);
    res.json(updateReconDiscrepancy(req.auth!.actor, String(req.params.id), body));
  }),
);
reportsRouter.get('/reconciliation/catalog', (_req, res) => {
  const store = db();
  res.json({ centers: store.list('centers').map((c) => ({ id: c.id, name: c.name })), operators: store.filter('entities', (e) => e.active && e.type === 'center').map((e) => ({ id: e.id, name: e.name })) });
});
reportsRouter.get('/reconciliation/owners', requireRole('coordinator', 'admin'), (_req, res) => {
  res.json(db().filter('users', (u) => u.active && u.roles.some((r) => ['coordinator', 'supervisor', 'admin', 'entity_admin'].includes(r))).map((u) => ({ id: u.id, alias: u.alias })));
});
