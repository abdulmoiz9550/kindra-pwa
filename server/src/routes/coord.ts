import { Router } from 'express';
import { z } from 'zod';
import { db } from '../core/db';
import { wrap, requireRole } from '../middleware/auth';
import { createInstitutionalOrigin, validateOrigin, rejectOrigin, markDuplicate, setPriority, setOriginZone, setSectorAuthorization, markRemoved, resolveDispute, requestPhotoRetake } from '../services/origins';
import { decideMonitorRequest } from '../services/monitor';
import { originView } from './helpers';
import { sendSectorAnnouncement, listSectorAnnouncements, residentCount } from '../services/announcements';

export const coordRouter = Router();
coordRouter.use(requireRole('coordinator'));

const geo = z.object({ lat: z.number(), lng: z.number() }).nullable().optional();

// ---------------------------------------------------------------- avisos comunitarios por sector (addendum, parte 1)
coordRouter.get('/announcements', (req, res) => {
  const sectorId = typeof req.query.sector === 'string' && req.query.sector ? req.query.sector : null;
  const store = db();
  res.json({
    announcements: listSectorAnnouncements(sectorId).map((n) => ({ id: n.id, kind: n.kind, text: n.text, sectorName: n.sectorName, createdAt: n.createdAt })),
    sectors: store.list('sectors').map((s) => ({ id: s.id, name: s.name, residents: residentCount(s.id) })),
  });
});

coordRouter.post(
  '/announcements',
  wrap((req, res) => {
    const body = z.object({ sectorId: z.string(), text: z.string().min(10).max(400) }).parse(req.body);
    res.status(201).json(sendSectorAnnouncement(req.auth!.actor, body.sectorId, body.text));
  }),
);

coordRouter.get('/overview', (req, res) => {
  const store = db();
  const role = req.auth!.role;
  const origins = store.list('origins').map((o) => originView(o, role));
  const sectors = store.list('sectors');
  const inbox = sectors.map((s) => ({ sectorId: s.id, sectorName: s.name, authorized: s.authorized, items: origins.filter((o) => o.sectorId === s.id && o.state === 'registered').sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)) }));
  const alerts = store.filter('alerts', (a) => !a.resolvedAt).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map((a) => ({ ...a, objectCode: codeOf(a.objectType, a.objectId), sectorName: a.sectorId ? store.get('sectors', a.sectorId)?.name ?? null : null }));
  const disputes = origins.filter((o) => o.state === 'disputed');
  const monitorRequests = store.filter('monitorRequests', (r) => r.status === 'pending').map((r) => ({ ...r, alias: store.get('users', r.userId)?.alias ?? null, verificationStatus: store.get('users', r.userId)?.verificationStatus ?? null }));
  const manualReview = origins.filter((o) => o.manualReview && o.state === 'registered');
  res.json({
    inbox,
    origins,
    alerts,
    disputes,
    monitorRequests,
    manualReview,
    sectors: sectors.map((s) => ({ id: s.id, name: s.name, authorized: s.authorized, pendingOrigins: origins.filter((o) => o.sectorId === s.id && !o.zoneAuthorized && !['rejected', 'duplicate', 'closed'].includes(o.state)).length })),
    stats: { registered: origins.filter((o) => o.state === 'registered').length, validated: origins.filter((o) => o.state === 'validated').length, underRemoval: origins.filter((o) => o.state === 'under_removal').length, removed: origins.filter((o) => ['removed', 'in_batch', 'in_work', 'closed'].includes(o.state)).length, disputed: disputes.length, pendingZone: origins.filter((o) => o.effectiveState === 'pending_authorization').length },
  });
});

function codeOf(objectType: string, id: string): string | null {
  const store = db();
  if (objectType === 'origin') return store.get('origins', id)?.code ?? null;
  if (objectType === 'trip') return store.get('trips', id)?.code ?? null;
  if (objectType === 'batch') return store.get('batches', id)?.code ?? null;
  if (objectType === 'work') return store.get('works', id)?.code ?? null;
  return null;
}

coordRouter.get('/origins/:id', (req, res) => {
  const store = db();
  const o = store.get('origins', String(req.params.id)) || store.find('origins', (x) => x.code === String(req.params.id).toUpperCase());
  if (!o) return res.status(404).json({ error: 'No se encontró el origen.' });
  res.json(originView(o, req.auth!.role));
});

coordRouter.post(
  '/origins/institutional',
  wrap((req, res) => {
    const body = z
      .object({
        location: geo,
        street: z.string().nullable().optional(),
        reference: z.string().nullable().optional(),
        sectorId: z.string().nullable().optional(),
        size: z.enum(['small', 'medium', 'large']),
        subcategory: z.enum(['concrete_brick', 'wood', 'metal', 'mixed', 'possible_hazardous']).nullable().optional(),
        structureType: z.enum(['house', 'multifamily', 'commercial', 'institutional', 'roadway', 'other']),
        cause: z.enum(['collapse', 'demolition']),
        buildingReference: z.string().nullable().optional(),
        priority: z.enum(['high', 'medium', 'low']).nullable().optional(),
        photoIds: z.array(z.string()).optional(),
        date: z.string().nullable().optional(),
      })
      .parse(req.body);
    res.status(201).json(originView(createInstitutionalOrigin({ ...body, deviceTime: req.deviceTime }, req.auth!.actor), req.auth!.role));
  }),
);

coordRouter.post(
  '/origins/:id/validate',
  wrap((req, res) => {
    const body = z.object({ priority: z.enum(['high', 'medium', 'low']).nullable().optional() }).parse(req.body ?? {});
    res.json(originView(validateOrigin(String(req.params.id), req.auth!.actor, body.priority ?? null, req.deviceTime), req.auth!.role));
  }),
);
coordRouter.post(
  '/origins/:id/reject',
  wrap((req, res) => {
    const body = z.object({ reason: z.enum(['false', 'outside_area', 'not_earthquake_debris', 'duplicate_intentional', 'other']), note: z.string().nullable().optional() }).parse(req.body);
    res.json(originView(rejectOrigin(String(req.params.id), req.auth!.actor, body.reason, body.note ?? null, req.deviceTime), req.auth!.role));
  }),
);
coordRouter.post(
  '/origins/:id/duplicate',
  wrap((req, res) => {
    const body = z.object({ mainId: z.string() }).parse(req.body);
    res.json(originView(markDuplicate(String(req.params.id), body.mainId, req.auth!.actor, req.deviceTime), req.auth!.role));
  }),
);
coordRouter.post(
  '/origins/:id/priority',
  wrap((req, res) => {
    const body = z.object({ priority: z.enum(['high', 'medium', 'low']) }).parse(req.body);
    res.json(originView(setPriority(String(req.params.id), req.auth!.actor, body.priority, req.deviceTime), req.auth!.role));
  }),
);
coordRouter.post(
  '/origins/:id/removed',
  wrap((req, res) => {
    const body = z.object({ evidencePhotoId: z.string().nullable().optional() }).parse(req.body ?? {});
    res.json(originView(markRemoved(String(req.params.id), req.auth!.actor, body.evidencePhotoId ?? null, req.deviceTime), req.auth!.role));
  }),
);
coordRouter.post(
  '/origins/:id/zone',
  wrap((req, res) => {
    const body = z.object({ authorized: z.boolean() }).parse(req.body);
    res.json(originView(setOriginZone(String(req.params.id), req.auth!.actor, body.authorized, req.deviceTime), req.auth!.role));
  }),
);
coordRouter.post(
  '/origins/:id/resolve-dispute',
  wrap((req, res) => {
    const body = z.object({ result: z.enum(['removed', 'reopened']), evidencePhotoId: z.string().nullable().optional(), note: z.string().nullable().optional() }).parse(req.body);
    res.json(originView(resolveDispute(String(req.params.id), req.auth!.actor, body.result, body.evidencePhotoId ?? null, body.note ?? null, req.deviceTime), req.auth!.role));
  }),
);
coordRouter.post(
  '/origins/:id/unreadable-photo',
  wrap((req, res) => {
    const body = z.object({ photoId: z.string() }).parse(req.body);
    res.json(originView(requestPhotoRetake(String(req.params.id), req.auth!.actor, body.photoId, req.deviceTime), req.auth!.role));
  }),
);
coordRouter.post(
  '/sectors/:id/authorization',
  wrap((req, res) => {
    const body = z.object({ authorized: z.boolean() }).parse(req.body);
    res.json(setSectorAuthorization(String(req.params.id), req.auth!.actor, body.authorized));
  }),
);
coordRouter.post(
  '/monitor/requests/:id/decide',
  wrap((req, res) => {
    const body = z.object({ status: z.enum(['approved', 'rejected']) }).parse(req.body);
    res.json(decideMonitorRequest(String(req.params.id), req.auth!.actor, body.status));
  }),
);
