import { Router } from 'express';
import { z } from 'zod';
import { db } from '../core/db';
import { appendEvent } from '../core/events';
import { newId, nowIso } from '../core/ids';
import { notFound, unauthorized } from '../core/errors';
import { wrap, requireAuth, requireRole } from '../middleware/auth';
import { activeTrips, assertCanView, assertEscort, etaOf, ingestPoints, openTripOfVehicle, recordGatePresence, trackingIndicators, tripRef, tripTrackView, verifyTrace, analyzeTrip } from '../services/tracking';
import { registerMovementDeparture, confirmMovementArrival, movementView } from '../services/movements';
import { handleTraccarForward, traccarEnv } from '../services/traccar';
import { getOriginByCode } from '../services/origins';
import { tripView, confirmArrival } from '../services/trips';
import { getConfig } from '../services/config';

/** Puntos de control QR en cada tramo y seguimiento de rutas (addendum v1.3). Nunca público. */
export const trackingRouter = Router();

const geo = z.object({ lat: z.number(), lng: z.number() }).nullable().optional();
const INTERNAL = ['admin', 'coordinator', 'supervisor', 'center', 'removal', 'driver', 'destination'] as const;

// ---------------------------------------------------------------- reenvío desde Traccar (sin sesión, con secreto)
trackingRouter.post('/traccar/forward', (req, res) => {
  const { secret } = traccarEnv();
  if (!secret || req.query.secret !== secret) {
    res.status(401).json({ error: 'Secreto de reenvío inválido.' });
    return;
  }
  res.json(handleTraccarForward(req.body || {}));
});

// ---------------------------------------------------------------- estado del viaje para el ciudadano (sin posición)
trackingRouter.get('/origins/:code/status', (req, res) => {
  const o = getOriginByCode(String(req.params.code).toUpperCase());
  if (!o) throw notFound('Ese código no existe.');
  const store = db();
  const trips = o.tripIds.map((id) => store.get('trips', id)).filter(Boolean);
  res.json(
    trips.map((t) => {
      const ref = tripRef(t!.id)!;
      const center = store.get('centers', t!.centerId)?.name ?? 'el centro';
      return {
        code: t!.code,
        state: t!.state,
        message: t!.state === 'in_transit' ? `El escombro va rumbo a ${center}.` : t!.state === 'received' ? `El escombro llegó a ${center}.` : `El viaje hacia ${center} está en revisión.`,
        eta: etaOf(ref),
      };
    }),
  );
});

trackingRouter.use(requireAuth);

// ---------------------------------------------------------------- escolta
trackingRouter.get('/config', (_req, res) => res.json(getConfig().tracking));

trackingRouter.get('/my-trips', (req, res) => {
  const me = req.auth!.user.id;
  res.json(activeTrips((r) => r.departureUserId === me).map((t) => ({ ...t, view: tripTrackView(tripRef(t.key)!) })));
});

trackingRouter.post(
  '/trips/:key/points',
  wrap((req, res) => {
    const ref = tripRef(String(req.params.key));
    if (!ref) throw notFound('El viaje no existe.');
    assertEscort(req.auth!.actor, ref);
    const body = z.object({ points: z.array(z.object({ lat: z.number(), lng: z.number(), at: z.string().nullable().optional(), accuracy: z.number().nullable().optional(), speedKmh: z.number().nullable().optional() })).max(500), delayed: z.boolean().optional() }).parse(req.body);
    res.json({ ...ingestPoints(ref.key, body.points, 'pwa', { delayed: body.delayed || !!req.offlineQueuedAt }), state: ref.state });
  }),
);

trackingRouter.post(
  '/trips/:key/stops',
  wrap((req, res) => {
    const ref = tripRef(String(req.params.key));
    if (!ref) throw notFound('El viaje no existe.');
    assertEscort(req.auth!.actor, ref);
    const body = z.object({ reason: z.enum(['traffic', 'fuel', 'breakdown', 'checkpoint', 'other']), note: z.string().max(300).nullable().optional(), photoId: z.string().nullable().optional(), location: geo }).parse(req.body);
    const stop = { id: newId('st'), tripKey: ref.key, reason: body.reason, note: body.note ?? null, photoId: body.photoId ?? null, location: body.location ?? null, at: req.deviceTime || nowIso(), userId: req.auth!.user.id };
    appendEvent({ type: 'stop_declared', objectType: 'trip', objectId: ref.key, actor: req.auth!.actor, data: { stop }, deviceTime: req.deviceTime, offlineQueuedAt: req.offlineQueuedAt });
    if (body.location) ingestPoints(ref.key, [{ ...body.location, at: stop.at, label: 'Parada declarada' }], 'checkpoint', { delayed: !!req.offlineQueuedAt });
    analyzeTrip(ref.key, true);
    res.status(201).json(stop);
  }),
);

trackingRouter.post(
  '/gate-scan',
  wrap((req, res) => {
    const body = z.object({ gateCode: z.string().min(3), tripKey: z.string().nullable().optional(), location: geo, photoId: z.string().nullable().optional() }).parse(req.body);
    const r = recordGatePresence(req.auth!.actor, { ...body, deviceTime: req.deviceTime, offlineQueuedAt: req.offlineQueuedAt });
    let closed = false;
    if (r.closes) {
      const opts = { photoId: body.photoId ?? null, location: body.location ?? null, deviceTime: req.deviceTime, offlineQueuedAt: req.offlineQueuedAt, viaGate: true };
      if (r.kind === 'trip') confirmArrival(r.tripKey, req.auth!.actor, opts);
      else confirmMovementArrival(req.auth!.actor, r.tripKey, opts);
      closed = true;
    }
    res.json({ ...r, closed });
  }),
);

// ---------------------------------------------------------------- puntos de control: QR del vehículo en la puerta
trackingRouter.get(
  '/vehicles/:qr/open',
  requireRole(...INTERNAL),
  wrap((req, res) => {
    const v = db().find('vehicles', (x) => x.qrCode === String(req.params.qr).trim());
    if (!v) throw notFound('No se encontró el vehículo de ese QR.');
    const open = openTripOfVehicle(v.id);
    if (!open) {
      res.json({ vehicle: { id: v.id, plate: v.plate }, open: null });
      return;
    }
    const store = db();
    res.json({ vehicle: { id: v.id, plate: v.plate }, open: { key: open.key, kind: open.kind, code: open.code, toLabel: open.toLabel, destCenterId: open.destCenterId, destWorkId: open.destWorkId, detail: open.kind === 'trip' ? tripView(store.get('trips', open.key)!) : movementView(store.get('movements', open.key)!) } });
  }),
);

/** Llegada escaneando solo el QR del vehículo (sirve para escaneos guardados sin señal). */
trackingRouter.post(
  '/arrive-by-qr',
  requireRole('center', 'destination', 'coordinator'),
  wrap((req, res) => {
    const body = z.object({ vehicleQr: z.string().min(3), photoId: z.string(), location: geo }).parse(req.body);
    const v = db().find('vehicles', (x) => x.qrCode === body.vehicleQr.trim());
    if (!v) throw notFound('No se encontró el vehículo de ese QR.');
    const open = openTripOfVehicle(v.id);
    if (!open) throw notFound(`${v.plate} no tiene un viaje abierto.`);
    const opts = { ...body, deviceTime: req.deviceTime, offlineQueuedAt: req.offlineQueuedAt };
    if (open.kind === 'trip') res.json({ kind: 'trip', code: open.code, trip: tripView(confirmArrival(open.key, req.auth!.actor, opts).trip) });
    else res.json({ kind: 'movement', code: open.code, movement: movementView(confirmMovementArrival(req.auth!.actor, open.key, opts)) });
  }),
);

trackingRouter.post(
  '/movements',
  requireRole('center'),
  wrap((req, res) => {
    const body = z
      .object({
        leg: z.enum(['cdt_cdf', 'cdt_work', 'cdt_state']),
        vehicleQr: z.string().nullable().optional(),
        vehicleId: z.string().nullable().optional(),
        batchId: z.string(),
        outputType: z.enum(['aggregate', 'rejects', 'metal']).nullable().optional(),
        quantity: z.number().positive(),
        destCenterId: z.string().nullable().optional(),
        workId: z.string().nullable().optional(),
        photoId: z.string(),
        location: geo,
      })
      .parse(req.body);
    res.status(201).json(movementView(registerMovementDeparture(req.auth!.actor, { ...body, deviceTime: req.deviceTime, offlineQueuedAt: req.offlineQueuedAt })));
  }),
);

trackingRouter.post(
  '/movements/:key/arrive',
  requireRole('center', 'destination', 'coordinator'),
  wrap((req, res) => {
    const body = z.object({ photoId: z.string(), vehicleQr: z.string().nullable().optional(), location: geo }).parse(req.body);
    res.json(movementView(confirmMovementArrival(req.auth!.actor, String(req.params.key), { ...body, deviceTime: req.deviceTime, offlineQueuedAt: req.offlineQueuedAt })));
  }),
);

/** Lo que llega y sale de mi puerta (centro, obra o recepción del Estado para el coordinador). */
trackingRouter.get(
  '/checkpoint',
  requireRole('center', 'destination', 'coordinator'),
  (req, res) => {
    const store = db();
    const u = req.auth!.user;
    const role = req.auth!.role;
    const myWorkIds = new Set(store.filter('works', (w) => w.entityId === u.entityId).map((w) => w.id));
    const incoming = activeTrips((r) => (role === 'center' ? r.destCenterId === u.centerId : role === 'destination' ? !!r.destWorkId && myWorkIds.has(r.destWorkId) : r.kind === 'movement' && store.get('movements', r.key)?.destination.kind === 'state'));
    const outgoing = role === 'center' ? store.filter('movements', (m) => m.fromCenterId === u.centerId).sort((a, b) => (a.departure.serverTime < b.departure.serverTime ? 1 : -1)).slice(0, 30).map(movementView) : [];
    const batches = role === 'center'
      ? store.filter('batches', (b) => b.centerId === u.centerId && !!b.outputs).map((b) => ({ id: b.id, code: b.code, state: b.state, qualityResult: b.qualityResult ?? null, outputs: b.outputs }))
      : [];
    res.json({
      role,
      incoming,
      outgoing,
      batches,
      cdfCenters: store.filter('centers', (c) => c.type === 'CDF').map((c) => ({ id: c.id, name: c.name })),
      works: store.list('works').map((w) => ({ id: w.id, code: w.code, name: w.name })),
    });
  },
);

// ---------------------------------------------------------------- vistas internas (roles autorizados)
trackingRouter.get('/active', requireRole('admin', 'coordinator', 'supervisor', 'center'), (req, res) => {
  const u = req.auth!.user;
  res.json(req.auth!.role === 'center' ? activeTrips((r) => r.destCenterId === u.centerId) : activeTrips());
});

trackingRouter.get('/indicators', requireRole('admin', 'coordinator', 'supervisor'), (_req, res) => res.json(trackingIndicators()));

trackingRouter.get('/trips/:key', (req, res) => {
  const ref = tripRef(String(req.params.key));
  if (!ref) throw notFound('El viaje no existe.');
  if (!req.auth) throw unauthorized();
  assertCanView(req.auth.user, req.auth.role, ref);
  res.json(tripTrackView(ref));
});

trackingRouter.get('/trips/:key/verify', (req, res) => {
  const ref = tripRef(String(req.params.key));
  if (!ref) throw notFound('El viaje no existe.');
  assertCanView(req.auth!.user, req.auth!.role, ref);
  res.json(verifyTrace(ref.key));
});

