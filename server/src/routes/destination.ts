import { Router } from 'express';
import { z } from 'zod';
import { db } from '../core/db';
import { wrap, requireRole } from '../middleware/auth';
import { registerWork, receiveDispatch, recordUse, workView, getWorkOrThrow } from '../services/works';

export const destRouter = Router();
destRouter.use(requireRole('destination'));

destRouter.get('/overview', (req, res) => {
  const store = db();
  const entityId = req.auth!.user.entityId;
  const works = store.filter('works', (w) => w.entityId === entityId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map(workView);
  const workIds = new Set(works.map((w) => w.id));
  const pending = store.filter('dispatches', (d) => d.state === 'pending' && workIds.has(d.workId)).map((d) => ({ ...d, batchCode: store.get('batches', d.batchId)?.code ?? null, centerName: store.get('centers', store.get('batches', d.batchId)?.centerId || '')?.name ?? null, workCode: store.get('works', d.workId)?.code ?? null, workName: store.get('works', d.workId)?.name ?? null }));
  res.json({ works, pendingDispatches: pending, sectors: store.list('sectors').map((s) => ({ id: s.id, name: s.name })) });
});

destRouter.get('/works/:id', (req, res) => {
  res.json(workView(getWorkOrThrow(String(req.params.id))));
});

destRouter.post(
  '/works',
  wrap((req, res) => {
    const body = z.object({ name: z.string().min(2), useType: z.enum(['road_base', 'sidewalks', 'curbs', 'blocks', 'fill', 'other']), locality: z.string().min(2), sectorId: z.string().nullable().optional(), dateOfUse: z.string().nullable().optional() }).parse(req.body);
    res.status(201).json(workView(registerWork(req.auth!.actor, { ...body, deviceTime: req.deviceTime })));
  }),
);

destRouter.post(
  '/dispatches/:id/receive',
  wrap((req, res) => {
    const body = z.object({ quantityReceived: z.number().min(0), note: z.string().nullable().optional() }).parse(req.body);
    res.json(receiveDispatch(String(req.params.id), req.auth!.actor, { ...body, deviceTime: req.deviceTime }));
  }),
);

destRouter.post(
  '/works/:id/use',
  wrap((req, res) => {
    const body = z.object({ useType: z.enum(['road_base', 'sidewalks', 'curbs', 'blocks', 'fill', 'other']).optional(), locality: z.string().min(2).optional(), dateOfUse: z.string().nullable().optional(), sectorId: z.string().nullable().optional() }).parse(req.body);
    const r = recordUse(String(req.params.id), req.auth!.actor, { ...body, deviceTime: req.deviceTime });
    res.json({ work: workView(r.work), closedOrigins: r.closedOrigins });
  }),
);
