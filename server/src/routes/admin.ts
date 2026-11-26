import { decryptField } from '../services/secureField';
import { sendText, whatsappStatus } from '../services/whatsapp';
import { Router } from 'express';
import { z } from 'zod';
import QRCode from 'qrcode';
import { ROLES } from '@kindra/shared';
import type { Role } from '@kindra/shared';
import { db } from '../core/db';
import { wrap, requireMainAdmin } from '../middleware/auth';
import { getConfig, updateConfig } from '../services/config';
import { upsertCourse } from '../services/lessons';
import { upsertEntity, upsertUser, setVerification, listUsersPublic, upsertSector, upsertCenter, upsertVehicleType, upsertVehicle, updateAuraText, upsertLesson, createPreregCode, updateTransitions, deleteDocument, stripUser, activateProposedRole, rejectProposedRole } from '../services/admin';
import { appendEvent, verifyChain } from '../core/events';
import { FIXED_GATES } from '../core/transitions';
import { listFeatures, setFeatures, assertFeature } from '../services/features';
import { listSpaces, upsertSpace, spaceUsage } from '../services/spaces';
import { notify, pickText } from '../services/notifications';
import { EVENT_LABELS } from '@kindra/shared';
import { gateCodeOfCenter, gateCodeOfWork, centerPoint } from '../services/tracking';
import { traccarStatus } from '../services/traccar';
import { env } from '../config/env';
import { moderatePhoto } from '../services/photos';
import { runEscalations } from '../services/escalation';
import { resetDemo } from '../seed/demo';
import { badRequest } from '../core/errors';
import { clientCount } from '../realtime/sse';
import { listInfoRequests, actOnInfoRequest, securityLog, listRecovery, resolveRecovery, upsertRisk, createIncident, updateIncident } from '../services/governance';
import { listAllBackups, createBackup, verifyBackupFile } from '../services/backup';
import { upsertChallenge } from '../services/challenges';
import { listSnapshots } from '../services/reportSnapshots';
import { adminGroups, upsertGroup, upsertBusiness, businessBody } from '../services/profiles';
import { nowIso } from '../core/ids';
import { adminOverview, assignReport, citizenQueue, dataQuality, listNews, logReview, reviewStatus, traceability, upsertNews } from '../services/ops';
import { photoStoreName } from '../services/photoStore';

export const adminRouter = Router();
// Administrador Principal de Kindra: rol admin + verificación de identidad + verificación en dos pasos.
adminRouter.use(...requireMainAdmin);

/** Addendum, parte 3: cada acción del Administrador Principal queda registrada como evento sellado. */
adminRouter.use((req, res, next) => {
  if (req.method === 'GET') return next();
  res.on('finish', () => {
    if (res.statusCode >= 400 || !req.auth) return;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const fields = Array.isArray(body) ? [] : Object.keys(body).filter((k) => !/password|secret|code|dataurl|confirm/i.test(k));
    try {
      appendEvent({
        type: 'admin_action',
        objectType: 'system',
        objectId: 'admin',
        actor: req.auth.actor,
        data: { method: req.method, path: req.originalUrl.replace(/^\/api\/admin/, '').split('?')[0], fields, items: Array.isArray(body) ? body.length : null, target: (body as { id?: string }).id ?? null },
      });
    } catch (err) {
      console.error('[admin] no se pudo registrar la acción:', (err as Error).message);
    }
  });
  next();
});

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
      roleProposals: store.filter('users', (u) => (u.proposedRoles || []).length > 0).length,
      entityAdmins: store.filter('users', (u) => u.active && u.roles.includes('entity_admin')).length,
      spaces: store.count('spaces'),
    },
    persistence: store.persistence.name,
    photoStore: photoStoreName(),
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
        legalType: z.enum(['public_institution', 'company']).nullable().optional(),
        taxId: z.string().max(30).nullable().optional(),
        spaceId: z.string().nullable().optional(),
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
        spaceId: z.string().nullable().optional(),
        businessId: z.string().nullable().optional(),
        email: z.string().email().nullable().optional(),
        modules: z.array(z.string()).nullable().optional(),
        vehicleId: z.string().nullable().optional(),
        operationalArea: z.string().max(160).nullable().optional(),
        appointmentDocumentRef: z.string().max(200).nullable().optional(),
        appointmentPhotoId: z.string().nullable().optional(),
      })
      .parse(req.body);
    res.json(stripUser(upsertUser(body, { id: req.auth!.user.id, kind: 'kindra' })));
  }),
);

// Propuestas de rol hechas por las entidades (evaluadores): las activa Kindra.
adminRouter.post(
  '/users/:id/proposals/:role/:decision',
  wrap((req, res) => {
    const role = z.enum(ROLES as [Role, ...Role[]]).parse(req.params.role);
    const decision = z.enum(['activate', 'reject']).parse(req.params.decision);
    const id = String(req.params.id);
    const u = decision === 'activate' ? activateProposedRole(id, role) : rejectProposedRole(id, role);
    if (decision === 'activate' && role === 'evaluator') notify({ recipientKeys: [`user:${u.id}`], kind: 'evaluator_activated', text: pickText('notif_evaluator_activated'), link: '/verificacion' });
    res.json(stripUser(u));
  }),
);
adminRouter.post(
  '/users/:id/verification',
  wrap((req, res) => {
    const body = z.object({ status: z.enum(['not_required', 'pending', 'verified', 'rejected']) }).parse(req.body);
    res.json(stripUser(setVerification(String(req.params.id), body.status)));
  }),
);

// ---------------------------------------------------------------- sectores, centros, vehículos
adminRouter.get('/sectors', (_req, res) => res.json(db().list('sectors')));
adminRouter.post(
  '/sectors',
  wrap((req, res) => {
    const body = z.object({ id: z.string().optional(), name: z.string().min(2), parish: z.string().optional(), polygon: z.array(z.tuple([z.number(), z.number()])).refine((p) => p.length === 0 || p.length >= 3, 'El polígono necesita al menos 3 vértices.'), authorized: z.boolean().optional(), provisional: z.boolean().optional(), spaceId: z.string().nullable().optional() }).parse(req.body);
    res.json(upsertSector(body));
  }),
);
adminRouter.get('/centers', (_req, res) => res.json(db().list('centers')));
adminRouter.post(
  '/centers',
  wrap((req, res) => {
    const body = z.object({ id: z.string().optional(), name: z.string().min(2), shortCode: z.string().optional(), type: z.enum(['CDT', 'CDF']), sectorId: z.string(), entityId: z.string(), location: z.object({ lat: z.number(), lng: z.number() }).nullable().optional(), operatorEntityIds: z.array(z.string()).optional(), unloadingPoint: z.object({ lat: z.number(), lng: z.number() }).nullable().optional() }).parse(req.body);
    res.json(upsertCenter(body));
  }),
);
adminRouter.get('/vehicle-types', (_req, res) => res.json(db().list('vehicleTypes')));
adminRouter.post(
  '/vehicle-types',
  wrap((req, res) => {
    const body = z.object({ id: z.string().optional(), name: z.string().min(2), capacityM3: z.number().positive().nullable().optional(), provisional: z.boolean().optional() }).parse(req.body);
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
    const body = z.object({ id: z.string().optional(), plate: z.string().min(3), typeId: z.string(), entityId: z.string(), active: z.boolean().optional(), imei: z.string().max(40).nullable().optional(), trackerType: z.enum(['gps', 'traccar_client']).nullable().optional() }).parse(req.body);
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
adminRouter.get('/transitions/fixed', (_req, res) => res.json(FIXED_GATES));

// ---------------------------------------------------------------- puertas (QR fijo) y seguimiento (addendum v1.3)
adminRouter.get(
  '/gates',
  wrap(async (_req, res) => {
    const store = db();
    const items = [
      ...store.list('centers').map((c) => ({ kind: 'center' as const, id: c.id, name: c.name, code: gateCodeOfCenter(c), hasPoint: !!centerPoint(c) })),
      ...store.list('works').map((w) => ({ kind: 'work' as const, id: w.id, name: `${w.code} · ${w.name}`, code: gateCodeOfWork(w), hasPoint: !!w.location })),
    ];
    res.json(await Promise.all(items.map(async (g) => ({ ...g, qrSvg: await QRCode.toString(`${env.publicBaseUrl}/puerta/${g.code}`, { type: 'svg', margin: 1, width: 360 }) }))));
  }),
);
adminRouter.get('/tracking/status', (_req, res) => res.json({ traccar: traccarStatus(), routing: process.env.OSRM_URL === 'off' ? 'off' : process.env.OSRM_URL || 'https://router.project-osrm.org', forwardUrl: `${env.publicBaseUrl}/api/tracking/traccar/forward?secret=…` }));

// ---------------------------------------------------------------- funciones activables (addendum, partes 1 y 4)
adminRouter.get('/features', (_req, res) => res.json(listFeatures()));
adminRouter.put(
  '/features',
  wrap((req, res) => {
    const body = z.record(z.string(), z.boolean()).parse(req.body);
    res.json(setFeatures(body));
  }),
);

// ---------------------------------------------------------------- espacios por convenio (27.1)
adminRouter.get('/spaces', (_req, res) => {
  const usage = spaceUsage();
  res.json(listSpaces().map((s) => ({ ...s, usage: usage[s.id] || { entities: 0, users: 0, sectors: 0, origins: 0 } })));
});
adminRouter.post(
  '/spaces',
  wrap((req, res) => {
    const body = z.object({ id: z.string().optional(), name: z.string().min(2), description: z.string().default(''), agreementRef: z.string().max(200).nullable().optional(), active: z.boolean().optional() }).parse(req.body);
    res.json(upsertSpace(body));
  }),
);

// ---------------------------------------------------------------- bitácora de administración
adminRouter.get('/audit', (_req, res) => {
  const store = db();
  const events = store
    .allEvents()
    .filter((e) => e.type === 'admin_action' || e.type === 'entity_admin_action')
    .slice(-300)
    .reverse()
    .map((e) => ({
      id: e.id,
      seq: e.seq,
      type: e.type,
      label: (EVENT_LABELS as Record<string, string>)[e.type] || e.type,
      serverTime: e.serverTime,
      userAlias: e.actorId ? store.get('users', e.actorId)?.alias ?? null : null,
      entityName: e.entityId ? store.get('entities', e.entityId)?.name ?? null : null,
      data: e.data,
      hash: e.hash,
      chainId: e.chainId,
    }));
  const chains = [...new Set(events.map((e) => e.chainId))];
  res.json({ events, integrity: chains.map((c) => verifyChain(c)) });
});
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
    const body = z.object({ id: z.string().optional(), order: z.number().int().optional(), title: z.string().min(2), content: z.string().min(10), imageUrl: z.string().nullable().optional(), videoUrl: z.string().url().nullable().optional(), courseId: z.string().nullable().optional(), question: z.string().min(2), options: z.array(z.string()).min(2), correctIndex: z.number().int(), validationStatus: z.enum(['pending', 'validated']).optional(), provisional: z.boolean().optional() }).parse(req.body);
    res.json(upsertLesson(body));
  }),
);
// Addendum v4.2, 3.2: cursos de Training (mismo editor que las lecciones).
adminRouter.get('/courses', (_req, res) => res.json(db().list('courses').sort((a, b) => a.order - b.order)));
adminRouter.post(
  '/courses',
  wrap((req, res) => {
    const q = z.object({ question: z.string().min(3).max(300), options: z.array(z.string().min(1).max(200)).min(2).max(6), correctIndex: z.number().int().min(0) });
    const body = z.object({ id: z.string().regex(/^[a-z0-9_]{3,40}$/), order: z.number().int().optional(), title: z.string().min(3).max(120), description: z.string().max(500), roles: z.array(z.enum(ROLES as [Role, ...Role[]])), quiz: z.array(q).max(10), validationStatus: z.enum(['pending', 'validated']), published: z.boolean() }).parse(req.body);
    for (const x of body.quiz) if (x.correctIndex >= x.options.length) throw badRequest('La respuesta correcta debe ser una de las opciones.');
    const c = upsertCourse(body);
    res.json(c);
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
    assertFeature('preregistration');
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

// ---------------------------------------------------------------- gobierno de datos y seguridad (v4.0, secciones 9 a 11)

adminRouter.get('/info-requests', (_req, res) => res.json(listInfoRequests()));
adminRouter.post(
  '/info-requests/:id/action',
  wrap((req, res) => {
    const body = z
      .object({
        action: z.enum(['classify', 'assign', 'start_review', 'release', 'partial_release', 'deny', 'close']),
        classification: z.enum(['public', 'restricted', 'confidential', 'critical']).nullable().optional(),
        reviewerId: z.string().nullable().optional(),
        note: z.string().max(2000).nullable().optional(),
        releasedItems: z.array(z.string().max(200)).max(50).optional(),
        redactions: z.string().max(2000).nullable().optional(),
      })
      .parse(req.body);
    res.json(actOnInfoRequest(req.auth!.actor, String(req.params.id), body));
  }),
);

adminRouter.get('/security', (_req, res) => res.json(securityLog()));
adminRouter.get('/recovery', (_req, res) => res.json(listRecovery()));
adminRouter.post(
  '/recovery/:id/resolve',
  wrap((req, res) => {
    resolveRecovery(req.auth!.actor, String(req.params.id));
    res.json({ ok: true });
  }),
);

const riskLevel = z.number().int().min(1).max(5);
adminRouter.get('/risks', (_req, res) => res.json(db().list('risks').sort((a, b) => b.score - a.score)));
adminRouter.post(
  '/risks',
  wrap((req, res) => {
    const body = z
      .object({
        id: z.string().optional(),
        description: z.string().min(5).max(500),
        affected: z.string().min(2).max(300),
        likelihood: riskLevel,
        impact: riskLevel,
        mitigation: z.string().min(2).max(800),
        owner: z.string().min(2).max(120),
        reviewDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        status: z.enum(['open', 'in_progress', 'resolved']),
        controlTestedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
        controlTestNote: z.string().max(500).nullable(),
      })
      .parse(req.body);
    res.json(upsertRisk(req.auth!.actor, body));
  }),
);

adminRouter.get('/incidents', (_req, res) => res.json(db().list('incidents').sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))));
adminRouter.post(
  '/incidents',
  wrap((req, res) => {
    const body = z.object({ title: z.string().min(3).max(150), description: z.string().min(5).max(2000), severity: z.enum(['low', 'medium', 'high', 'critical']) }).parse(req.body);
    res.status(201).json(createIncident(req.auth!.actor, body));
  }),
);
adminRouter.post(
  '/incidents/:id/status',
  wrap((req, res) => {
    const body = z.object({ status: z.enum(['contained', 'investigating', 'escalated', 'closed']), note: z.string().min(3).max(1000) }).parse(req.body);
    res.json(updateIncident(req.auth!.actor, String(req.params.id), body.status, body.note));
  }),
);

adminRouter.get('/backups', wrap(async (_req, res) => {
  res.json(await listAllBackups());
}));
adminRouter.post(
  '/backups',
  wrap(async (_req, res) => {
    res.status(201).json(await createBackup());
  }),
);
adminRouter.post(
  '/backups/verify',
  wrap(async (req, res) => {
    const { file } = z.object({ file: z.string().regex(/^[\w.-]+\.json$/) }).parse(req.body);
    res.json(await verifyBackupFile(file));
  }),
);

// ---------------------------------------------------------------- módulos, incentivos, grupos y comercios (v4.0)

adminRouter.get('/module-definitions', (_req, res) => res.json(db().list('moduleDefinitions')));
adminRouter.put(
  '/module-definitions/:id',
  wrap((req, res) => {
    const id = z.enum(['oil_module']).parse(req.params.id);
    const t = z.string().max(3000);
    const body = z.object({ workflow: t, dataFields: t, units: t, validationRules: t, roles: t, risks: t, approvalReference: z.string().max(200) }).parse(req.body);
    res.json(db().put('moduleDefinitions', { id, ...body, updatedBy: req.auth!.user.id, updatedAt: nowIso() }));
  }),
);

adminRouter.put(
  '/incentives',
  wrap((req, res) => {
    const body = z.object({ status: z.enum(['pending', 'approved']), reference: z.string().max(200).nullable() }).parse(req.body);
    if (body.status === 'approved' && (body.reference || '').trim().length < 3) throw badRequest('Indica la referencia del documento que aprueba el esquema.');
    res.json(updateConfig({ incentives: body.status === 'approved' ? { status: 'approved', reference: body.reference!.trim(), approvedAt: nowIso(), approvedBy: req.auth!.user.id } : { status: 'pending', reference: null, approvedAt: null, approvedBy: null } }).incentives);
  }),
);

adminRouter.use('/groups', (_req, _res, next) => {
  assertFeature('community_groups');
  next();
});
adminRouter.get('/groups', (_req, res) => res.json(adminGroups()));
adminRouter.post(
  '/groups',
  wrap((req, res) => {
    const body = z.object({ id: z.string().optional(), kind: z.enum(['community', 'coastal']), name: z.string().min(3).max(120), region: z.string().min(2).max(120), sectorId: z.string().nullable(), description: z.string().max(600), contact: z.string().max(120).nullable(), active: z.boolean(), leaderAlias: z.string().nullable().optional() }).parse(req.body);
    res.json(upsertGroup(req.auth!.actor, body));
  }),
);
adminRouter.get('/businesses', (_req, res) => res.json(db().list('businesses')));
adminRouter.post(
  '/businesses',
  wrap((req, res) => {
    res.json(upsertBusiness(req.auth!.actor, businessBody.extend({ id: z.string().optional(), active: z.boolean() }).parse(req.body)));
  }),
);

// ---------------------------------------------------------------- resumen, trazabilidad, reportes, contenido y revisiones (v4.0)

const entityOf = (q: unknown) => (typeof q === 'string' && q && db().get('entities', q) ? q : null);
adminRouter.get('/dashboard', (req, res) => res.json(adminOverview(entityOf(req.query.entity))));
adminRouter.get('/traceability', (req, res) => res.json(traceability(entityOf(req.query.entity))));
adminRouter.get('/data-quality', (_req, res) => res.json(dataQuality()));
adminRouter.get('/citizen-reports', (_req, res) => res.json(citizenQueue()));
adminRouter.post(
  '/citizen-reports/:id',
  wrap((req, res) => {
    const body = z.object({ userId: z.string().nullable().optional(), escalate: z.boolean().optional(), note: z.string().max(400).nullable().optional() }).parse(req.body);
    res.json(assignReport(req.auth!.actor, String(req.params.id), body));
  }),
);
adminRouter.get('/news', (_req, res) => res.json(listNews(null, true)));
adminRouter.post(
  '/news',
  wrap((req, res) => {
    const body = z.object({ id: z.string().optional(), kind: z.enum(['news', 'campaign']), title: z.string().min(3).max(160), body: z.string().min(3).max(5000), audience: z.array(z.enum(ROLES as [Role, ...Role[]])), published: z.boolean(), publishedAt: z.string().datetime({ offset: true }) }).parse(req.body);
    res.json(upsertNews(body));
  }),
);
adminRouter.put(
  '/help',
  wrap((req, res) => {
    const body = z.object({ about: z.string().max(6000), privacy: z.string().max(12000), contact: z.string().max(600) }).parse(req.body);
    res.json(updateConfig({ help: { ...body, updatedAt: nowIso() } }).help);
  }),
);
adminRouter.put(
  '/retention/:level',
  wrap((req, res) => {
    const level = z.enum(['public', 'restricted', 'confidential', 'critical']).parse(req.params.level);
    const body = z.object({ period: z.string().min(2).max(120), legalBasis: z.string().min(3).max(400), approvalReference: z.string().min(3).max(200) }).parse(req.body);
    res.json(updateConfig({ retention: { ...(getConfig().retention || {}), [level]: { ...body, updatedAt: nowIso() } } }).retention);
  }),
);
adminRouter.get('/reviews', (_req, res) => res.json(reviewStatus()));
adminRouter.post(
  '/reviews/:key',
  wrap((req, res) => {
    const { note } = z.object({ note: z.string().min(3).max(800) }).parse(req.body);
    res.status(201).json(logReview(req.auth!.actor, String(req.params.key), note));
  }),
);

adminRouter.get('/challenges', (_req, res) => res.json(db().list('ecoChallenges').sort((a, b) => (a.startDate < b.startDate ? 1 : -1))));
adminRouter.post(
  '/challenges',
  wrap((req, res) => {
    const d = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
    const body = z.object({ id: z.string().optional(), title: z.string().min(3).max(120), rules: z.string().min(5).max(3000), recognition: z.string().max(300), startDate: d, endDate: d, metric: z.enum(['pickups', 'reports', 'lessons']), target: z.number().int().min(1).max(1000), audience: z.array(z.enum(ROLES as [Role, ...Role[]])), approvalReference: z.string().max(200), published: z.boolean() }).parse(req.body);
    res.json(upsertChallenge(req.auth!.actor, body));
  }),
);
adminRouter.get('/public-report/options', (_req, res) => res.json(listSnapshots().slice(0, 1)));
adminRouter.put(
  '/public-report',
  wrap((req, res) => {
    const body = z.object({ keys: z.array(z.string().max(60)).max(30), approvalReference: z.string().max(200) }).parse(req.body);
    if (body.keys.length && body.approvalReference.trim().length < 3) throw badRequest('Indica la referencia de aprobación.');
    res.json(updateConfig({ publicReport: body }).publicReport);
  }),
);

// ---------------------------------------------------------------- addendum v4.2: bandeja de soporte de AURA
adminRouter.get('/support-tickets', (_req, res) => {
  res.json(
    db()
      .list('supportTickets')
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((t) => {
        const p = t.profileId ? db().get('auraProfiles', t.profileId) : undefined;
        return { ...t, name: decryptField(t.nameEnc), nameEnc: undefined, phone: p ? decryptField(p.waIdEnc) : null, blocked: !!p?.blocked };
      }),
  );
});
adminRouter.post(
  '/support-tickets/:id/reply',
  wrap(async (req, res) => {
    const { text } = z.object({ text: z.string().min(2).max(1000) }).parse(req.body);
    const store = db();
    const t = store.get('supportTickets', String(req.params.id));
    if (!t) throw badRequest('La conversación no existe.');
    let delivered = false;
    if (t.channel === 'whatsapp' && t.profileId) {
      const to = decryptField(store.get('auraProfiles', t.profileId)?.waIdEnc);
      if (to) delivered = await sendText(to, `Equipo Kindra: ${text}`);
    }
    if (t.userId) {
      notify({ recipientKeys: [`user:${t.userId}`], kind: 'support_reply', text: `Equipo Kindra: ${text}`, link: '/aura' });
      delivered = true;
    }
    const s = store.get('auraSessions', t.sessionId);
    if (s) store.update('auraSessions', s.id, { history: [...s.history, { role: 'aura' as const, text: `Equipo Kindra: ${text}`, at: nowIso() }].slice(-200) });
    res.json({ ...store.update('supportTickets', t.id, { history: [...t.history, { role: 'staff', text, at: nowIso() }] }), delivered });
  }),
);
adminRouter.post(
  '/support-tickets/:id/close',
  wrap((req, res) => {
    const t = db().get('supportTickets', String(req.params.id));
    if (!t) throw badRequest('La conversación no existe.');
    res.json(db().update('supportTickets', t.id, { status: 'closed', closedAt: nowIso() }));
  }),
);
/** Control de abuso (10.6): bloqueo manual de un número. */
adminRouter.post(
  '/aura-profiles/:id/block',
  wrap((req, res) => {
    const { blocked } = z.object({ blocked: z.boolean() }).parse(req.body);
    const p = db().get('auraProfiles', String(req.params.id));
    if (!p) throw badRequest('El perfil no existe.');
    res.json({ id: p.id, blocked: db().update('auraProfiles', p.id, { blocked }).blocked });
  }),
);
adminRouter.get('/aura-status', (_req, res) => res.json({ whatsapp: whatsappStatus(), profiles: db().count('auraProfiles'), openTickets: db().filter('supportTickets', (t) => t.status === 'open').length }));
