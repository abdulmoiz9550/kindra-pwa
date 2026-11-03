import { Router } from 'express';
import { z } from 'zod';
import { db } from '../core/db';
import { wrap, requireRole } from '../middleware/auth';
import { registerDeparture, tripView, findVehicle, estimatedVolume } from '../services/trips';
import { recordBeforeAfter } from '../services/monitor';
import { originView } from './helpers';
import { effectiveOriginState } from '@kindra/shared';

export const removalRouter = Router();
removalRouter.use(requireRole('removal'));

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

removalRouter.get('/overview', (req, res) => {
  const store = db();
  const role = req.auth!.role;
  const entityId = req.auth!.user.entityId;
  const origins = store
    .filter('origins', (o) => ['validated', 'under_removal', 'disputed'].includes(o.state))
    .map((o) => originView(o, role))
    .sort((a, b) => {
      const pa = PRIORITY_ORDER[(a.priority || 'low') as keyof typeof PRIORITY_ORDER];
      const pb = PRIORITY_ORDER[(b.priority || 'low') as keyof typeof PRIORITY_ORDER];
      return pa - pb || (a.validatedAt || a.createdAt).localeCompare(b.validatedAt || b.createdAt);
    });
  const vehicles = store.filter('vehicles', (v) => v.active && v.entityId === entityId).map((v) => ({ ...v, typeName: store.get('vehicleTypes', v.typeId)?.name ?? null, capacityM3: store.get('vehicleTypes', v.typeId)?.capacityM3 ?? null }));
  const trips = store.filter('trips', (t) => t.departure.entityId === entityId).sort((a, b) => (a.departure.serverTime < b.departure.serverTime ? 1 : -1)).map(tripView);
  res.json({
    origins,
    pendingZone: store.filter('origins', (o) => effectiveOriginState(o) === 'pending_authorization').map((o) => originView(o, role)),
    vehicles,
    centers: store.list('centers').map((c) => ({ id: c.id, name: c.name, type: c.type })),
    trips,
  });
});

removalRouter.get('/vehicles/qr/:qr', (req, res) => {
  const v = findVehicle({ vehicleQr: String(req.params.qr) });
  const type = db().get('vehicleTypes', v.typeId);
  res.json({ ...v, typeName: type?.name ?? null, capacityM3: type?.capacityM3 ?? null, estimatedFull: estimatedVolume(v, 'full'), estimatedHalf: estimatedVolume(v, 'half') });
});

removalRouter.post(
  '/trips',
  wrap((req, res) => {
    const body = z
      .object({
        vehicleId: z.string().nullable().optional(),
        vehicleQr: z.string().nullable().optional(),
        originIds: z.array(z.string()).min(1),
        centerId: z.string(),
        photoId: z.string(),
        location: z.object({ lat: z.number(), lng: z.number() }).nullable().optional(),
        fillLevel: z.enum(['full', 'half']).nullable().optional(),
      })
      .parse(req.body);
    const trip = registerDeparture(req.auth!.actor, { ...body, deviceTime: req.deviceTime, offlineQueuedAt: req.offlineQueuedAt });
    res.status(201).json(tripView(trip));
  }),
);

removalRouter.post(
  '/origins/:id/before-after',
  wrap((req, res) => {
    const body = z.object({ afterPhotoId: z.string(), beforePhotoId: z.string().nullable().optional() }).parse(req.body);
    res.json(originView(recordBeforeAfter(String(req.params.id), req.auth!.actor, { ...body, deviceTime: req.deviceTime }), req.auth!.role));
  }),
);
