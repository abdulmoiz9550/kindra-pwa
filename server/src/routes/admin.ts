import { Router } from 'express';
import { z } from 'zod';
import QRCode from 'qrcode';
import { ROLES } from '@kindra/shared';
import type { Role } from '@kindra/shared';
import { db } from '../core/db';
import { wrap, requireRole } from '../middleware/auth';
import { getConfig, updateConfig } from '../services/config';
import { upsertEntity, upsertUser, setVerification, listUsersPublic, upsertSector, upsertCenter, upsertVehicleType, upsertVehicle, updateAuraText, upsertLesson, createPreregCode, updateTransitions, deleteDocument } from '../services/admin';
import { moderatePhoto } from '../services/photos';
import { runEscalations } from '../services/escalation';
import { resetDemo } from '../seed/demo';
import { badRequest } from '../core/errors';
import { clientCount } from '../realtime/sse';

export const adminRouter = Router();
adminRouter.use(requireRole('admin'));

adminRouter.get('/overview', (_req, res) => {
  const store = db();
  res.json({
    counts: {
      entities: store.count('entities'),
      users: store.count('users'),
      sectors: store.count('sectors'),
      centers: store.count('centers'),
      vehicles: store.count('vehicles'),
      origins: store.count('origins'),
      trips: store.count('trips'),
      batches: store.count('batches'),
      works: store.count('works'),
      events: store.allEvents().length,
      photosPending: store.filter('photos', (p) => p.moderation === 'pending').length,
      usersPendingVerification: store.filter('users', (u) => u.verificationStatus === 'pending').length,
    },
    persistence: store.persistence.name,
    sseClients: clientCount(),
  });
});

// ---------------------------------------------------------------- entidades y usuarios
adminRouter.get('/entities', (_req, res) => res.json(db().list('entities')));
adminRouter.post(
  '/entities',
  wrap((req, res) => {
    const rule = z.object({ mode: z.enum(['public', 'delayed', 'internal']), delayDays: z.number().int().min(0).optional() });
    const body = z
      .object({
        id: z.string().optional(),
        name: z.string().min(2),
        type: z.enum(['coordinating', 'removal', 'center', 'technical', 'supervisor', 'destination']),
        description: z.string().min(2),
        logoUrl: z.string().nullable().optional(),
        active: z.boolean().optional(),
        publicationPolicy: z.object({ officialFigures: rule, discrepancies: rule, photos: rule, observations: rule }).optional(),
      })
      .parse(req.body);
    res.json(upsertEntity(body));
  }),
);

adminRouter.get('/users', (_req, res) => res.json(listUsersPublic()));
adminRouter.post(
  '/users',
  wrap((req, res) => {
    const body = z
      .object({
        id: z.string().optional(),
        alias: z.string().min(3),
        name: z.string().optional(),
        phone: z.string().optional(),
        roles: z.array(z.enum(ROLES as [Role, ...Role[]])).min(1),
        entityId: z.string().nullable().optional(),
        centerId: z.string().nullable().optional(),
        sectorId: z.string().nullable().optional(),
        password: z.string().min(6).optional(),
        active: z.boolean().optional(),
        verificationStatus: z.enum(['not_required', 'pending', 'verified', 'rejected']).optional(),
      })
      .parse(req.body);
    const { passwordHash: _p, ...u } = upsertUser(body);
    res.json(u);
  }),
);
adminRouter.post(
  '/users/:id/verification',
  wrap((req, res) => {
    const body = z.object({ status: z.enum(['not_required', 'pending', 'verified', 'rejected']) }).parse(req.body);
    const { passwordHash: _p, ...u } = setVerification(String(req.params.id), body.status);
    res.json(u);
  }),
);

// ---------------------------------------------------------------- sectores, centros, vehículos
adminRouter.get('/sectors', (_req, res) => res.json(db().list('sectors')));
adminRouter.post(
  '/sectors',
  wrap((req, res) => {
    const body = z.object({ id: z.string().optional(), name: z.string().min(2), parish: z.string().optional(), polygon: z.array(z.tuple([z.number(), z.number()])).min(3), authorized: z.boolean().optional(), provisional: z.boolean().optional() }).parse(req.body);
    res.json(upsertSector(body));
  }),
);
adminRouter.get('/centers', (_req, res) => res.json(db().list('centers')));
adminRouter.post(
  '/centers',
  wrap((req, res) => {
    const body = z.object({ id: z.string().optional(), name: z.string().min(2), shortCode: z.string().optional(), type: z.enum(['CDT', 'CDF']), sectorId: z.string(), entityId: z.string(), location: z.object({ lat: z.number(), lng: z.number() }).nullable().optional() }).parse(req.body);
    res.json(upsertCenter(body));
  }),
);
adminRouter.get('/vehicle-types', (_req, res) => res.json(db().list('vehicleTypes')));
adminRouter.post(
  '/vehicle-types',
  wrap((req, res) => {
    const body = z.object({ id: z.string().optional(), name: z.string().min(2), capacityM3: z.number().positive(), provisional: z.boolean().optional() }).parse(req.body);
    res.json(upsertVehicleType(body));
  }),
);
adminRouter.get('/vehicles', (_req, res) => {
  const store = db();
  res.json(store.list('vehicles').map((v) => ({ ...v, typeName: store.get('vehicleTypes', v.typeId)?.name ?? null, entityName: store.get('entities', v.entityId)?.name ?? null })));
});
adminRouter.post(
  '/vehicles',
  wrap((req, res) => {
    const body = z.object({ id: z.string().optional(), plate: z.string().min(3), typeId: z.string(), entityId: z.string(), active: z.boolean().optional() }).parse(req.body);
    res.json(upsertVehicle(body));
  }),
);
adminRouter.get(
  '/vehicles/:id/qr.svg',
  wrap(async (req, res) => {
    const v = db().get('vehicles', String(req.params.id));
    if (!v) throw badRequest('El vehículo no existe.');
    res.type('image/svg+xml').send(await QRCode.toString(v.qrCode, { type: 'svg', margin: 1, width: 512 }));
  }),
);
adminRouter.delete(
  '/:collection/:id',
  wrap((req, res) => {
    const col = ({ vehicles: 'vehicles', 'vehicle-types': 'vehicleTypes', 'prereg-codes': 'preregistrationCodes', lessons: 'lessons' } as const)[String(req.params.collection) as 'vehicles'];
    if (!col) throw badRequest('Colección no válida.');
    deleteDocument(col, String(req.params.id));
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------- configuración
adminRouter.get('/config', (_req, res) => res.json(getConfig()));
adminRouter.put(
  '/config',
  wrap((req, res) => {
    const body = z.object({}).passthrough().parse(req.body);
    delete (body as Record<string, unknown>).transitions;
    res.json(updateConfig(body as never));
  }),
);
adminRouter.get('/transitions', (_req, res) => res.json(getConfig().transitions));
adminRouter.put(
  '/transitions',
  wrap((req, res) => {
    const body = z.array(z.object({ object: z.enum(['origin', 'trip', 'batch']), action: z.string(), from: z.array(z.string()), to: z.string(), roles: z.array(z.string()), conditions: z.array(z.string()), description: z.string().optional() })).parse(req.body);
    res.json(updateTransitions(body as never).transitions);
  }),
);

// ---------------------------------------------------------------- textos y lecciones
adminRouter.get('/texts', (_req, res) => res.json(db().list('auraTexts').map(({ key, label, variants }) => ({ key, label, variants }))));
adminRouter.put(
  '/texts/:key',
  wrap((req, res) => {
    const body = z.object({ variants: z.array(z.string()).min(3), label: z.string().optional() }).parse(req.body);
    res.json(updateAuraText(String(req.params.key), body.variants, body.label));
  }),
);
adminRouter.get('/lessons', (_req, res) => res.json(db().list('lessons').sort((a, b) => a.order - b.order)));
adminRouter.post(
  '/lessons',
  wrap((req, res) => {
    const body = z.object({ id: z.string().optional(), order: z.number().int().optional(), title: z.string().min(2), content: z.string().min(10), imageUrl: z.string().nullable().optional(), question: z.string().min(2), options: z.array(z.string()).min(2), correctIndex: z.number().int(), validationStatus: z.enum(['pending', 'validated']).optional(), provisional: z.boolean().optional() }).parse(req.body);
    res.json(upsertLesson(body));
  }),
);
adminRouter.post(
  '/lessons/:id/validate',
  wrap((req, res) => {
    const l = db().get('lessons', String(req.params.id));
    if (!l) throw badRequest('La lección no existe.');
    res.json(db().update('lessons', l.id, { validationStatus: 'validated' }));
  }),
);

// ---------------------------------------------------------------- moderación de fotos (7.14)
adminRouter.get('/photos', (req, res) => {
  const status = typeof req.query.moderation === 'string' ? req.query.moderation : 'pending';
  res.json(db().filter('photos', (p) => status === 'all' || p.moderation === status).sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1)));
});
adminRouter.post(
  '/photos/:id/moderate',
  wrap((req, res) => {
    const body = z.object({ decision: z.enum(['approved', 'rejected']) }).parse(req.body);
    res.json(moderatePhoto(String(req.params.id), body.decision));
  }),
);

// ---------------------------------------------------------------- pre-registro, trabajos, reset
adminRouter.get('/prereg-codes', (_req, res) => res.json(db().list('preregistrationCodes')));
adminRouter.post(
  '/prereg-codes',
  wrap((req, res) => {
    const body = z.object({ alias: z.string().min(2) }).parse(req.body);
    res.status(201).json(createPreregCode(body.alias));
  }),
);
adminRouter.post(
  '/run-jobs',
  wrap((_req, res) => {
    res.json(runEscalations());
  }),
);
adminRouter.post(
  '/reset-demo',
  wrap(async (req, res) => {
    const body = z.object({ confirm: z.string() }).parse(req.body);
    if (body.confirm !== 'REINICIAR') throw badRequest('Escribe REINICIAR para confirmar el reinicio de los datos de demostración.');
    const started = Date.now();
    const summary = await resetDemo();
    res.json({ ok: true, ms: Date.now() - started, ...summary });
  }),
);
