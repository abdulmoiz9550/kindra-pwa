import { Router } from 'express';
import { z } from 'zod';
import { resolveCorrection } from '../services/ops';
import { db } from '../core/db';
import { wrap, requireRole } from '../middleware/auth';
import { batchView, centerOf, closeBatch, getBatchOrThrow, recordOutputs } from '../services/batches';
import { forbidden } from '../core/errors';
import type { Request } from 'express';

/** v4.0, 5.6: personal de procesamiento. Solo los lotes de su centro; no recibe, no evalúa y no despacha. */
export const processingRouter = Router();
processingRouter.use(requireRole('processing'));

function ownBatch(req: Request) {
  const b = getBatchOrThrow(String(req.params.id));
  if (b.centerId !== centerOf(req.auth!.actor).id) throw forbidden('El lote es de otro centro.');
  return b;
}

processingRouter.get('/overview', (req, res) => {
  const center = centerOf(req.auth!.actor);
  const batches = db().filter('batches', (b) => b.centerId === center.id).sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1)).map(batchView);
  res.json({
    center: { id: center.id, name: center.name },
    queue: batches.filter((b) => ['open', 'held', 'closed'].includes(b.state)),
    history: batches.filter((b) => !['open', 'held', 'closed'].includes(b.state)),
    flagged: batches.filter((b) => b.materialBalance?.flagged).length,
  });
});

processingRouter.post(
  '/batches/:id/close',
  wrap((req, res) => {
    res.json(batchView(closeBatch(ownBatch(req).id, req.auth!.actor, req.deviceTime)));
  }),
);

processingRouter.post(
  '/batches/:id/outputs',
  wrap((req, res) => {
    const n = z.number().min(0);
    const body = z.object({ unit: z.enum(['t', 'm3']), aggregate: n, metal: n, specialDisposal: n, rejects: n, input: z.number().positive(), method: z.string().min(2).max(200), evidencePhotoId: z.string().nullable().optional() }).parse(req.body);
    res.json(batchView(recordOutputs(ownBatch(req).id, req.auth!.actor, body, req.deviceTime)));
  }),
);

processingRouter.post(
  '/corrections/:id/resolve',
  wrap((req, res) => {
    const n = z.number().min(0);
    const body = z.object({ note: z.string().min(5).max(500), outputs: z.object({ unit: z.enum(['t', 'm3']), aggregate: n, metal: n, specialDisposal: n, rejects: n, input: z.number().positive().nullable().optional(), method: z.string().max(200).nullable().optional() }) }).parse(req.body);
    res.json(resolveCorrection(req.auth!.actor, String(req.params.id), body));
  }),
);
