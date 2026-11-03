import { Router } from 'express';
import { z } from 'zod';
import { db } from '../core/db';
import { wrap, requireRole } from '../middleware/auth';
import { addObservation, listObservations } from '../services/observations';
import { tripView } from '../services/trips';
import { batchView } from '../services/batches';
import { workView } from '../services/works';
import { buildDashboard } from '../services/dashboard';
import { eventView } from '../services/record';
import { originView } from './helpers';

export const supervisorRouter = Router();
supervisorRouter.use(requireRole('supervisor'));

/** 16.10: vista de toda la cadena con filtros, discrepancias, horas inconsistentes, observaciones y alertas. */
supervisorRouter.get('/overview', (req, res) => {
  const store = db();
  const role = req.auth!.role;
  const sector = typeof req.query.sector === 'string' && req.query.sector ? req.query.sector : null;
  const origins = store.filter('origins', (o) => !sector || o.sectorId === sector).map((o) => originView(o, role));
  const originIds = new Set(origins.map((o) => o.id));
  const trips = store.filter('trips', (t) => !sector || t.originIds.some((id) => originIds.has(id))).map(tripView);
  const batches = store.list('batches').map(batchView).filter((b) => !sector || b.composition.some((c) => c.sectorId === sector));
  const batchIds = new Set(batches.map((b) => b.id));
  const works = store.list('works').map(workView).filter((w) => !sector || w.dispatches.some((d) => batchIds.has(d.batchId)));
  const inconsistent = store.allEvents().filter((e) => e.inconsistentTime).map((e) => eventView(e, false));
  const alerts = store.list('alerts').sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  res.json({
    origins,
    trips,
    batches,
    works,
    discrepancies: buildDashboard(sector).discrepancies || [],
    inconsistentTimes: inconsistent,
    observations: listObservations().map((o) => ({ ...o, entityName: store.get('entities', o.entityId)?.name ?? null, objectCode: codeOf(o.objectType, o.objectId) })),
    alerts: alerts.map((a) => ({ ...a, objectCode: codeOf(a.objectType, a.objectId) })),
    sectors: store.list('sectors').map((s) => ({ id: s.id, name: s.name })),
  });
});

function codeOf(objectType: string, id: string): string | null {
  const store = db();
  const col = ({ origin: 'origins', trip: 'trips', batch: 'batches', work: 'works' } as const)[objectType as 'origin' | 'trip' | 'batch' | 'work'];
  return col ? ((store.get(col, id) as { code?: string } | undefined)?.code ?? null) : null;
}

supervisorRouter.post(
  '/observations',
  wrap((req, res) => {
    const body = z.object({ objectType: z.enum(['origin', 'trip', 'batch', 'work']), objectId: z.string(), text: z.string().min(2), isAlert: z.boolean().default(false) }).parse(req.body);
    res.status(201).json(addObservation(req.auth!.actor, { ...body, deviceTime: req.deviceTime }));
  }),
);
