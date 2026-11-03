import { Router } from 'express';
import { z } from 'zod';
import { db } from '../core/db';
import { wrap, requireRole } from '../middleware/auth';
import { decideHazard, verifyQuality, batchView, getBatchOrThrow } from '../services/batches';
import { getConfig } from '../services/config';

export const evalRouter = Router();
evalRouter.use(requireRole('evaluator'));

evalRouter.get('/overview', (_req, res) => {
  const store = db();
  const cfg = getConfig();
  const batches = store.filter('batches', (b) => ['held', 'under_verification'].includes(b.state)).map(batchView);
  const centers = store.list('centers').map((c) => ({ centerId: c.id, centerName: c.name, held: batches.filter((b) => b.centerId === c.id && b.state === 'held'), underVerification: batches.filter((b) => b.centerId === c.id && b.state === 'under_verification') }));
  const decided = store.filter('batches', (b) => ['approved', 'rejected', 'partially_dispatched', 'fully_dispatched'].includes(b.state)).sort((a, b) => ((a.verifiedAt || '') < (b.verifiedAt || '') ? 1 : -1)).slice(0, 20).map(batchView);
  res.json({ centers, batches, decided, hazardChecklist: cfg.hazardChecklist, qualityChecklist: cfg.qualityChecklist });
});

evalRouter.get('/batches/:id', (req, res) => {
  res.json(batchView(getBatchOrThrow(String(req.params.id))));
});

evalRouter.post(
  '/batches/:id/hazard-decision',
  wrap((req, res) => {
    const body = z.object({ receptionIds: z.array(z.string()).min(1), checklist: z.record(z.boolean()), decision: z.enum(['release', 'special_disposal']), justification: z.string().min(5) }).parse(req.body);
    const r = decideHazard(String(req.params.id), req.auth!.actor, { ...body, deviceTime: req.deviceTime });
    res.json({ batch: batchView(r.batch), decision: r.decision });
  }),
);

evalRouter.post(
  '/batches/:id/quality',
  wrap((req, res) => {
    const body = z.object({ checklist: z.record(z.boolean()), result: z.enum(['approved', 'rejected']), justification: z.string().min(5), documentId: z.string().nullable().optional() }).parse(req.body);
    const r = verifyQuality(String(req.params.id), req.auth!.actor, { ...body, deviceTime: req.deviceTime });
    res.json({ batch: batchView(r.batch), verification: r.verification });
  }),
);
