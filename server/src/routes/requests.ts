import { Router } from 'express';
import { z } from 'zod';
import { requireRole, wrap } from '../middleware/auth';
import { forbidden } from '../core/errors';
import { db } from '../core/db';
import { isFeatureOn } from '../services/features';
import { acceptPickup, advancePickup, collectPickup, createPickup, cancelOwn, listPickups, managePickup, pickupImpact, pickupView, receivePickup, rejectPickup, reportIssue, requestService, schedulePickup, validatePickup } from '../services/pickups';

/** Solicitudes de recolección (v4.0, sección 17). La recepción la confirma el centro por su ruta de llegada. */
export const requestsRouter = Router();
requestsRouter.use(requireRole('coordinator', 'entity_admin', 'removal', 'driver', 'center', 'admin', 'householder', 'business'));
requestsRouter.use((req, _res, next) => {
  if (req.auth!.role === 'admin' && !req.auth!.mfa) return next(forbidden('Confirma la verificación en dos pasos.'));
  next();
});

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^\d{2}:\d{2}$/);
const unit = z.enum(['l', 'kg', 't', 'm3']);

requestsRouter.get('/', (req, res) => {
  const a = req.auth!.actor;
  res.json(listPickups(a).map((r) => pickupView(r, a)));
});

/** Listas que necesitan los formularios: solo lo que corresponde a cada rol. */
requestsRouter.get('/context', (req, res) => {
  const store = db();
  const { role, user } = req.auth!;
  const staff = ['coordinator', 'entity_admin', 'removal', 'admin'].includes(role);
  res.json({
    modules: [{ key: 'debris', label: 'Escombros', units: ['m3', 't'] }, ...(isFeatureOn('oil_module') ? [{ key: 'oil', label: 'Aceite de cocina usado', units: ['l'] }] : [])].filter((m) => !user.modules || user.modules.includes(m.key)),
    vehicles: role === 'driver' ? store.filter('vehicles', (v) => v.active && v.entityId === user.entityId).map((v) => ({ id: v.id, plate: v.plate })) : [],
    centers: staff || role === 'driver' ? store.list('centers').map((c) => ({ id: c.id, name: c.name })) : [],
    operators: staff ? store.filter('entities', (e) => e.type === 'removal' && e.active && (role === 'coordinator' || role === 'admin' || e.id === user.entityId)).map((e) => ({ id: e.id, name: e.name })) : [],
    origins: role === 'coordinator' || role === 'entity_admin' || role === 'removal' ? store.filter('origins', (o) => ['validated', 'under_removal'].includes(o.state) && o.zoneAuthorized).map((o) => ({ id: o.id, code: o.code, sectorName: store.get('sectors', o.sectorId)?.name ?? null })) : [],
  });
});

requestsRouter.get('/impact', requireRole('driver', 'householder', 'business'), (req, res) => {
  const d = (v: unknown) => (date.safeParse(v).success ? String(v) : null);
  res.json(pickupImpact(req.auth!.actor, d(req.query.from), d(req.query.to), typeof req.query.module === 'string' && req.query.module ? req.query.module : null, req.query.status === 'received' ? 'received' : 'completed'));
});

requestsRouter.post(
  '/',
  wrap((req, res) => {
    const body = z
      .object({ module: z.string(), originId: z.string(), operatorEntityId: z.string(), centerId: z.string(), material: z.string().min(2).max(120), estimatedQuantity: z.number().positive(), unit, date, windowFrom: time, windowTo: time, instructions: z.string().max(500).nullable().optional(), handlingNotes: z.string().max(500).nullable().optional() })
      .parse(req.body);
    res.status(201).json(pickupView(createPickup(req.auth!.actor, body), req.auth!.actor));
  }),
);

requestsRouter.post(
  '/:id/accept',
  wrap((req, res) => {
    res.json(pickupView(acceptPickup(req.auth!.actor, String(req.params.id)), req.auth!.actor));
  }),
);

requestsRouter.post(
  '/:id/reject',
  wrap((req, res) => {
    const body = z.object({ reason: z.enum(['vehicle_unavailable', 'schedule_conflict', 'unsafe_access', 'outside_area', 'other']), note: z.string().max(300).nullable().optional() }).parse(req.body);
    res.json(pickupView(rejectPickup(req.auth!.actor, String(req.params.id), body.reason, body.note), req.auth!.actor));
  }),
);

requestsRouter.post(
  '/:id/status',
  wrap((req, res) => {
    const body = z.object({ to: z.enum(['en_route', 'arrived']) }).parse(req.body);
    res.json(pickupView(advancePickup(req.auth!.actor, String(req.params.id), body.to), req.auth!.actor));
  }),
);

requestsRouter.post(
  '/:id/collect',
  wrap((req, res) => {
    const body = z
      .object({ quantity: z.number().positive(), unit, photoId: z.string(), vehicleId: z.string(), fillLevel: z.enum(['full', 'half']).nullable().optional(), note: z.string().max(500).nullable().optional(), location: z.object({ lat: z.number(), lng: z.number() }).nullable().optional() })
      .parse(req.body);
    res.json(pickupView(collectPickup(req.auth!.actor, String(req.params.id), { ...body, deviceTime: req.deviceTime, offlineQueuedAt: req.offlineQueuedAt }), req.auth!.actor));
  }),
);

requestsRouter.post(
  '/:id/validate',
  wrap((req, res) => {
    res.json(pickupView(validatePickup(req.auth!.actor, String(req.params.id)), req.auth!.actor));
  }),
);

requestsRouter.post(
  '/:id/issue',
  wrap((req, res) => {
    const { text } = z.object({ text: z.string().min(3).max(500) }).parse(req.body);
    res.json(pickupView(reportIssue(req.auth!.actor, String(req.params.id), text), req.auth!.actor));
  }),
);

requestsRouter.post(
  '/:id/manage',
  wrap((req, res) => {
    const body = z.object({ action: z.enum(['reassign', 'cancel']), note: z.string().min(3).max(300) }).parse(req.body);
    res.json(pickupView(managePickup(req.auth!.actor, String(req.params.id), body.action, body.note), req.auth!.actor));
  }),
);

// ---------------------------------------------------------------- hogares, comercios y recepción directa

requestsRouter.post(
  '/service',
  wrap((req, res) => {
    const body = z
      .object({ module: z.string(), material: z.string().min(2).max(120), estimatedQuantity: z.number().positive(), unit, address: z.string().min(4).max(200), location: z.object({ lat: z.number(), lng: z.number() }).nullable(), sectorId: z.string().nullable(), date, windowFrom: time, windowTo: time, instructions: z.string().max(500).nullable(), photoIds: z.array(z.string()).max(3) })
      .parse(req.body);
    res.status(201).json(pickupView(requestService(req.auth!.actor, body), req.auth!.actor));
  }),
);

requestsRouter.post(
  '/:id/schedule',
  wrap((req, res) => {
    const body = z.object({ operatorEntityId: z.string(), centerId: z.string(), date, windowFrom: time, windowTo: time, handlingNotes: z.string().max(500).nullable() }).parse(req.body);
    res.json(pickupView(schedulePickup(req.auth!.actor, String(req.params.id), body), req.auth!.actor));
  }),
);

requestsRouter.post(
  '/:id/cancel',
  wrap((req, res) => {
    const { note } = z.object({ note: z.string().min(3).max(300) }).parse(req.body);
    res.json(pickupView(cancelOwn(req.auth!.actor, String(req.params.id), note), req.auth!.actor));
  }),
);

requestsRouter.post(
  '/:id/receive',
  wrap((req, res) => {
    const body = z.object({ quantity: z.number().min(0), unit, condition: z.string().max(300).nullable() }).parse(req.body);
    res.json(pickupView(receivePickup(req.auth!.actor, String(req.params.id), body), req.auth!.actor));
  }),
);
