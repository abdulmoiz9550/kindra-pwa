import { Router } from 'express';
import { z } from 'zod';
import { MUTABLE_NOTIFICATIONS } from '@kindra/shared';
import { requireAuth, requireRole, wrap } from '../middleware/auth';
import { db } from '../core/db';
import { badRequest, forbidden } from '../core/errors';
import { checkPassword, hashPassword, toPublicUser } from '../services/auth';
import { logAccountChange } from '../services/governance';
import { clearFailures, assertNotLocked, recordFailure } from '../services/lockout';
import { businessBody, completeActivity, createActivity, decideMembership, groupHome, groupImpact, inviteMember, joinActivity, listGroupsToJoin, myBusiness, myMembership, requestMembership, reviewQueue, reviewWaste, setActivityStatus, submitWaste, updateGroupProfile, upsertBusiness, validateActivity } from '../services/profiles';

/** Perfiles de la PWA (v4.0, sección 25) y cuenta personal. */
export const profilesRouter = Router();
profilesRouter.use(requireAuth);

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^\d{2}:\d{2}$/);
const dq = (v: unknown) => (date.safeParse(v).success ? String(v) : null);

// ---------------------------------------------------------------- cuenta personal (17.5 y 24)

profilesRouter.put(
  '/account',
  wrap((req, res) => {
    const u = req.auth!.user;
    const body = z.object({ name: z.string().max(80).nullable().optional(), phone: z.string().max(30).nullable().optional(), preferences: z.object({ mutedKinds: z.array(z.string()).max(20), available: z.boolean(), address: z.string().max(200).nullable() }).optional() }).parse(req.body);
    const changesName = body.name !== undefined && (body.name || undefined) !== u.name;
    // Los datos que respaldaron la verificación de identidad solo los cambia la administración.
    if (changesName && u.verificationStatus === 'verified') throw forbidden('Tu nombre está verificado. Pide el cambio a la administración.');
    if (body.preferences?.mutedKinds.some((k) => !MUTABLE_NOTIFICATIONS.some((m) => m.kind === k))) throw badRequest('Ese tipo de aviso no se puede silenciar.');
    const next = db().update('users', u.id, { ...(body.name !== undefined ? { name: body.name?.trim() || undefined } : {}), ...(body.phone !== undefined ? { phone: body.phone?.trim() || undefined } : {}), ...(body.preferences ? { preferences: body.preferences } : {}) });
    logAccountChange(u.id, u.id, 'profile_updated', null, Object.keys(body).join(','));
    res.json({ user: toPublicUser(next, req.auth!.role, req.auth!.mfa) });
  }),
);

profilesRouter.post(
  '/password',
  wrap((req, res) => {
    const u = req.auth!.user;
    const body = z.object({ current: z.string().min(1), next: z.string().min(8).max(100) }).parse(req.body);
    const key = `pwchange:${u.id}`;
    assertNotLocked(key);
    if (!checkPassword(body.current, u.passwordHash)) {
      recordFailure(key);
      throw badRequest('La contraseña actual no coincide.');
    }
    clearFailures(key);
    db().update('users', u.id, { passwordHash: hashPassword(body.next) });
    logAccountChange(u.id, u.id, 'password_changed', null, null);
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------- comunidades y grupos costeros

profilesRouter.get('/groups', (req, res) => res.json(listGroupsToJoin(req.auth!.actor)));
profilesRouter.post('/groups/:id/join', wrap((req, res) => {
  res.status(201).json(requestMembership(req.auth!.actor, String(req.params.id)));
}));

const group = requireRole('community', 'coastal');
profilesRouter.get('/group', group, wrap((req, res) => {
  res.json(groupHome(req.auth!.actor));
}));
profilesRouter.get('/group/impact', group, wrap((req, res) => {
  res.json(groupImpact(myMembership(req.auth!.actor).group.id, dq(req.query.from), dq(req.query.to)));
}));
profilesRouter.put('/group', group, wrap((req, res) => {
  res.json(updateGroupProfile(req.auth!.actor, z.object({ region: z.string().min(2).max(120), description: z.string().max(600), contact: z.string().max(120).nullable() }).parse(req.body)));
}));
profilesRouter.post('/group/members', group, wrap((req, res) => {
  res.status(201).json(inviteMember(req.auth!.actor, z.object({ alias: z.string().min(3).max(60) }).parse(req.body).alias));
}));
profilesRouter.post('/group/members/:id/:decision', group, wrap((req, res) => {
  res.json(decideMembership(req.auth!.actor, String(req.params.id), z.enum(['approve', 'remove']).parse(req.params.decision)));
}));
profilesRouter.post('/group/activities', group, wrap((req, res) => {
  const body = z.object({ title: z.string().min(3).max(120), date, time, place: z.string().min(2).max(160), meetingPoint: z.string().min(2).max(160), instructions: z.string().max(800).nullable(), capacity: z.number().int().positive().max(5000).nullable(), publish: z.boolean() }).parse(req.body);
  const { publish, ...input } = body;
  res.status(201).json(createActivity(req.auth!.actor, input, publish));
}));
profilesRouter.post('/group/activities/:id/status', group, wrap((req, res) => {
  res.json(setActivityStatus(req.auth!.actor, String(req.params.id), z.object({ to: z.enum(['published', 'cancelled']) }).parse(req.body).to));
}));
profilesRouter.post('/group/activities/:id/join', group, wrap((req, res) => {
  res.json(joinActivity(req.auth!.actor, String(req.params.id), z.object({ join: z.boolean() }).parse(req.body).join));
}));
profilesRouter.post('/group/activities/:id/complete', group, wrap((req, res) => {
  const body = z.object({ attendance: z.array(z.object({ userId: z.string(), attended: z.boolean(), hours: z.number().min(0).max(24).nullable() })).max(5000) }).parse(req.body);
  res.json(completeActivity(req.auth!.actor, String(req.params.id), body.attendance));
}));
profilesRouter.post('/group/reports', group, wrap((req, res) => {
  const body = z.object({ kind: z.enum(['observation', 'collection']), activityId: z.string().nullable(), category: z.enum(['plastic', 'glass', 'metal', 'organic', 'mixed', 'other']), quantity: z.number().positive().nullable(), unit: z.enum(['kg', 't', 'm3']).nullable(), place: z.string().min(2).max(160), location: z.object({ lat: z.number(), lng: z.number() }).nullable(), date, description: z.string().min(3).max(1000), photoIds: z.array(z.string()).max(5) }).parse(req.body);
  res.status(201).json(submitWaste(req.auth!.actor, body));
}));

// ---------------------------------------------------------------- revisión por la coordinación

const coord = requireRole('coordinator');
profilesRouter.get('/review', coord, (_req, res) => res.json(reviewQueue()));
profilesRouter.post('/review/reports/:id', coord, wrap((req, res) => {
  const body = z.object({ action: z.enum(['start', 'validate', 'reject']), quantity: z.number().min(0).nullable().optional(), note: z.string().max(500).nullable().optional() }).parse(req.body);
  res.json(reviewWaste(req.auth!.actor, String(req.params.id), body));
}));
profilesRouter.post('/review/activities/:id/validate', coord, wrap((req, res) => {
  res.json(validateActivity(req.auth!.actor, String(req.params.id)));
}));

// ---------------------------------------------------------------- comercio

const business = requireRole('business');
profilesRouter.get('/business', business, wrap((req, res) => {
  const b = myBusiness(req.auth!.user);
  res.json({ business: b, users: db().filter('users', (u) => u.businessId === b.id && u.active).map((u) => ({ alias: u.alias, name: u.name ?? null })) });
}));
profilesRouter.put('/business', business, wrap((req, res) => {
  const b = myBusiness(req.auth!.user);
  res.json(upsertBusiness(req.auth!.actor, { ...businessBody.parse(req.body), id: b.id }));
}));
