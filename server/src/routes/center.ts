import { Router } from 'express';
import { z } from 'zod';
import { db } from '../core/db';
import { wrap, requireRole } from '../middleware/auth';
import { confirmArrival, tripView } from '../services/trips';
import { classifyReception, closeBatch, recordOutputs, createDispatch, batchView, getBatchOrThrow, enterDailySummary, recordJobs, centerOf } from '../services/batches';
import { isoDay } from '@kindra/shared';

export const centerRouter = Router();
centerRouter.use(requireRole('center'));

centerRouter.get('/overview', (req, res) => {
  const store = db();
  const center = centerOf(req.auth!.actor);
  const trips = store.filter('trips', (t) => t.centerId === center.id);
  const batches = store.filter('batches', (b) => b.centerId === center.id).sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1)).map(batchView);
  const openBatch = batches.find((b) => b.state === 'open' || (b.state === 'held' && b.previousState === 'open')) || null;
  const today = isoDay(new Date());
  const todayDeparted = trips.filter((t) => isoDay(t.departure.serverTime) === today).length;
  const todayConfirmed = trips.filter((t) => t.state === 'received' && t.arrival && isoDay(t.arrival.serverTime) === today).length;
  res.json({
    center: { ...center, entityName: store.get('entities', center.entityId)?.name ?? null },
    inTransit: trips.filter((t) => t.state === 'in_transit').sort((a, b) => (a.departure.serverTime < b.departure.serverTime ? -1 : 1)).map(tripView),
    noArrival: trips.filter((t) => t.state === 'no_arrival').map(tripView),
    received: trips.filter((t) => t.state === 'received').sort((a, b) => ((a.arrival?.serverTime || '') < (b.arrival?.serverTime || '') ? 1 : -1)).slice(0, 50).map(tripView),
    openBatch,
    batches,
    unclassified: store.filter('receptions', (r) => r.centerId === center.id && !r.subcategory).map((r) => ({ ...r, tripCode: store.get('trips', r.tripId)?.code ?? null, batchCode: store.get('batches', r.batchId)?.code ?? null })),
    dispatches: store.filter('dispatches', (d) => store.get('batches', d.batchId)?.centerId === center.id).map((d) => ({ ...d, batchCode: store.get('batches', d.batchId)?.code ?? null, workCode: store.get('works', d.workId)?.code ?? null, workName: store.get('works', d.workId)?.name ?? null })),
    works: store.list('works').map((w) => ({ id: w.id, code: w.code, name: w.name, locality: w.locality, useType: w.useType, entityName: store.get('entities', w.entityId)?.name ?? null })),
    dailySummaries: store.filter('dailySummaries', (s) => s.centerId === center.id).sort((a, b) => (a.date < b.date ? 1 : -1)),
    jobs: store.filter('jobs', (j) => j.centerId === center.id).sort((a, b) => (a.date < b.date ? 1 : -1)),
    today: { date: today, departed: todayDeparted, confirmed: todayConfirmed },
  });
});

centerRouter.post(
  '/trips/:id/arrive',
  wrap((req, res) => {
    const body = z.object({ photoId: z.string(), vehicleQr: z.string().nullable().optional(), location: z.object({ lat: z.number(), lng: z.number() }).nullable().optional() }).parse(req.body);
    const r = confirmArrival(String(req.params.id), req.auth!.actor, { ...body, deviceTime: req.deviceTime, offlineQueuedAt: req.offlineQueuedAt });
    res.json({ trip: tripView(r.trip), reception: r.reception, batch: batchView(getBatchOrThrow(r.reception.batchId)) });
  }),
);

centerRouter.post(
  '/receptions/:id/classify',
  wrap((req, res) => {
    const body = z.object({ subcategory: z.enum(['concrete_brick', 'wood', 'metal', 'mixed', 'possible_hazardous']), photoId: z.string().nullable().optional(), note: z.string().nullable().optional() }).parse(req.body);
    const r = classifyReception(String(req.params.id), req.auth!.actor, { ...body, deviceTime: req.deviceTime });
    res.json({ reception: r.reception, batch: batchView(r.batch) });
  }),
);

centerRouter.get('/batches/:id', (req, res) => {
  res.json(batchView(getBatchOrThrow(String(req.params.id))));
});

centerRouter.post(
  '/batches/:id/close',
  wrap((req, res) => {
    res.json(batchView(closeBatch(String(req.params.id), req.auth!.actor, req.deviceTime)));
  }),
);

centerRouter.post(
  '/batches/:id/outputs',
  wrap((req, res) => {
    const body = z.object({ unit: z.enum(['t', 'm3']), aggregate: z.number().min(0), metal: z.number().min(0), specialDisposal: z.number().min(0), rejects: z.number().min(0) }).parse(req.body);
    res.json(batchView(recordOutputs(String(req.params.id), req.auth!.actor, body, req.deviceTime)));
  }),
);

centerRouter.post(
  '/batches/:id/dispatch',
  wrap((req, res) => {
    const body = z.object({ workId: z.string(), quantity: z.number().positive() }).parse(req.body);
    const r = createDispatch(String(req.params.id), req.auth!.actor, { ...body, deviceTime: req.deviceTime });
    res.status(201).json({ batch: batchView(r.batch), dispatch: r.dispatch });
  }),
);

centerRouter.post(
  '/daily-summary',
  wrap((req, res) => {
    const center = centerOf(req.auth!.actor);
    const body = z.object({ date: z.string(), tripsReceived: z.number().int().min(0), officialTonnes: z.number().min(0).nullable().optional() }).parse(req.body);
    res.status(201).json(enterDailySummary(req.auth!.actor, { ...body, centerId: center.id, deviceTime: req.deviceTime }));
  }),
);

centerRouter.post(
  '/jobs',
  wrap((req, res) => {
    const center = centerOf(req.auth!.actor);
    const body = z.object({ positions: z.number().int().positive(), type: z.enum(['direct', 'indirect']), date: z.string() }).parse(req.body);
    res.status(201).json(recordJobs(req.auth!.actor, { ...body, centerId: center.id, deviceTime: req.deviceTime }));
  }),
);
