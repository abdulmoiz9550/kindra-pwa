import { Router } from 'express';
import { z } from 'zod';
import { INSTITUTIONAL_ROLES } from '@kindra/shared';
import { db } from '../core/db';
import { wrap, requireAuth, citizenActor } from '../middleware/auth';
import { savePhoto } from '../services/photos';
import { createCitizenReport, getOriginOrThrow, listOriginsForReporter, lookupOrigins, respondRemovalClosure, answerSatisfaction, addRetakePhoto, originStatusView } from '../services/origins';
import { buildRecord, recordToCsv, verifyRecord } from '../services/record';
import { listNotifications, markRead, markAllRead } from '../services/notifications';
import { computePoints, certificateFor } from '../services/points';
import { listLessons, completeLesson, lessonAsText } from '../services/lessons';
import { requestMonitorRole, verifyOnSite, recordBeforeAfter } from '../services/monitor';
import { handleMessage, sessionView } from '../services/aura';
import { citizenOriginView } from './helpers';
import { forbidden, notFound } from '../core/errors';
import { toPublicUser } from '../services/auth';
import { env } from '../config/env';

export const citizenRouter = Router();

const geo = z.object({ lat: z.number(), lng: z.number() }).nullable().optional();

// ---------------------------------------------------------------- fotos
citizenRouter.post(
  '/photos',
  wrap((req, res) => {
    const body = z.object({ dataUrl: z.string(), kind: z.string().default('origin'), location: geo, takenAt: z.string().nullable().optional() }).parse(req.body);
    const photo = savePhoto({ dataUrl: body.dataUrl, kind: body.kind as never, uploadedBy: req.auth?.user.id ?? null, location: body.location ?? null, takenAt: body.takenAt ?? null });
    res.status(201).json(photo);
  }),
);

// ---------------------------------------------------------------- reportes ciudadanos
citizenRouter.post(
  '/origins',
  wrap((req, res) => {
    const body = z
      .object({
        photoIds: z.array(z.string()).min(1),
        location: geo,
        street: z.string().nullable().optional(),
        reference: z.string().nullable().optional(),
        sectorId: z.string().nullable().optional(),
        size: z.enum(['small', 'medium', 'large']),
        urgency: z.enum(['blocks_access', 'risk', 'can_wait']).nullable().optional(),
        subcategory: z.enum(['concrete_brick', 'wood', 'metal', 'mixed', 'possible_hazardous']).nullable().optional(),
        voiceNoteId: z.string().nullable().optional(),
        reporterName: z.string().nullable().optional(),
        anonymous: z.boolean().optional(),
      })
      .parse(req.body);
    const r = createCitizenReport({ ...body, source: 'pwa', deviceTime: req.deviceTime, offlineQueuedAt: req.offlineQueuedAt, clientKey: req.clientKey }, citizenActor(req));
    res.status(201).json({ origin: citizenOriginView(r.origin), code: r.origin.code, sector: { id: r.sector.id, name: r.sector.name }, zonePending: r.zonePending, possibleDuplicate: r.possibleDuplicate ? r.possibleDuplicate.code : null, photoUnreadable: r.photoUnreadable, status: originStatusView(r.origin) });
  }),
);

citizenRouter.post(
  '/origins/lookup',
  wrap((req, res) => {
    const { codes } = z.object({ codes: z.array(z.string()).max(100) }).parse(req.body);
    res.json(lookupOrigins(codes).map(citizenOriginView));
  }),
);

function canSeeFull(req: Parameters<typeof citizenActor>[0], originId: string): boolean {
  if (!req.auth) return false;
  if (INSTITUTIONAL_ROLES.includes(req.auth.role) || req.auth.role === 'monitor') return true;
  const o = db().get('origins', originId);
  return !!o && o.reporterId === req.auth.user.id;
}

citizenRouter.get('/origins/:code', (req, res) => {
  const o = getOriginOrThrow(String(req.params.code));
  const full = canSeeFull(req, o.id);
  res.json(buildRecord(o, { publicVersion: !full }));
});

citizenRouter.get('/origins/:code/verificar', (req, res) => {
  res.json(verifyRecord(getOriginOrThrow(String(req.params.code))));
});

citizenRouter.get('/origins/:code/export', (req, res) => {
  const o = getOriginOrThrow(String(req.params.code));
  const record = buildRecord(o, { publicVersion: !canSeeFull(req, o.id) });
  if (req.query.format === 'csv') {
    res.setHeader('Content-Disposition', `attachment; filename="ficha-${o.code}.csv"`);
    res.type('text/csv; charset=utf-8').send('﻿' + recordToCsv(record));
    return;
  }
  res.setHeader('Content-Disposition', `attachment; filename="ficha-${o.code}.json"`);
  res.json(record);
});

citizenRouter.post(
  '/origins/:code/closure/removal',
  wrap((req, res) => {
    const body = z.object({ response: z.enum(['confirmed', 'disputed']), comment: z.string().nullable().optional() }).parse(req.body);
    const r = respondRemovalClosure(String(req.params.code), body.response, { userId: req.auth?.user.id ?? null, byCode: !req.auth }, body.comment ?? null, req.deviceTime);
    res.json({ text: r.text, origin: citizenOriginView(r.origin) });
  }),
);

citizenRouter.post(
  '/origins/:code/closure/work',
  wrap((req, res) => {
    const body = z.object({ answer: z.enum(['yes', 'somewhat', 'no']), comment: z.string().nullable().optional() }).parse(req.body);
    res.json(answerSatisfaction(String(req.params.code), body.answer, { userId: req.auth?.user.id ?? null }, body.comment ?? null, req.deviceTime));
  }),
);

citizenRouter.post(
  '/origins/:code/photo-retake',
  wrap((req, res) => {
    const body = z.object({ photoId: z.string() }).parse(req.body);
    const r = addRetakePhoto(String(req.params.code), body.photoId, { userId: req.auth?.user.id ?? null });
    res.json({ text: r.text, manualReview: r.manualReview, origin: citizenOriginView(r.origin) });
  }),
);

// ---------------------------------------------------------------- mi cuenta
citizenRouter.get('/me/origins', requireAuth, (req, res) => {
  res.json(listOriginsForReporter(req.auth!.user.id).map(citizenOriginView));
});

citizenRouter.get('/me/profile', requireAuth, (req, res) => {
  const u = req.auth!.user;
  const pts = computePoints(u.id);
  const cert = certificateFor(u.id);
  const monitorRequest = db().find('monitorRequests', (r) => r.userId === u.id && r.status === 'pending');
  res.json({
    user: toPublicUser(u, req.auth!.role),
    points: pts,
    certificate: cert ? { ...cert, verifyUrl: `${env.publicBaseUrl}/publico/certificado/${cert.code}` } : null,
    monitorRequestPending: !!monitorRequest,
    canRequestMonitor: pts.level.key === 'contralor' && !u.roles.includes('monitor') && !monitorRequest,
    sectorName: u.sectorId ? db().get('sectors', u.sectorId)?.name ?? null : null,
  });
});

function recipientKeys(req: Parameters<typeof citizenActor>[0]): string[] {
  const keys: string[] = [];
  if (req.auth) keys.push(`user:${req.auth.user.id}`);
  const codes = typeof req.query.codes === 'string' ? req.query.codes.split(',') : Array.isArray(req.body?.codes) ? (req.body.codes as string[]) : [];
  for (const c of codes) if (c.trim()) keys.push(`origin:${c.trim().toUpperCase()}`);
  return keys;
}

citizenRouter.get('/me/notifications', (req, res) => {
  res.json(listNotifications(recipientKeys(req)));
});
citizenRouter.post('/me/notifications/lookup', (req, res) => {
  res.json(listNotifications(recipientKeys(req)));
});
citizenRouter.post('/me/notifications/:id/read', (req, res) => {
  markRead(String(req.params.id), recipientKeys(req));
  res.json({ ok: true });
});
citizenRouter.post('/me/notifications/read-all', (req, res) => {
  markAllRead(recipientKeys(req));
  res.json({ ok: true });
});

// ---------------------------------------------------------------- lecciones
citizenRouter.get('/lessons', (req, res) => {
  res.json(listLessons(req.auth?.user.id ?? null));
});
citizenRouter.post(
  '/lessons/:id/complete',
  wrap((req, res) => {
    const body = z.object({ answerIndex: z.number().int() }).parse(req.body);
    res.json(completeLesson(String(req.params.id), citizenActor(req), body.answerIndex));
  }),
);
citizenRouter.get('/lessons/:id/text', (req, res) => {
  const l = db().get('lessons', String(req.params.id));
  if (!l) throw notFound('La lección no existe.');
  res.type('text/plain; charset=utf-8').send(lessonAsText(l, typeof req.query.sector === 'string' ? req.query.sector : null));
});

// ---------------------------------------------------------------- contralor comunitario
citizenRouter.post(
  '/monitor/request',
  requireAuth,
  wrap((req, res) => {
    res.json(requestMonitorRole(req.auth!.user, req.auth!.actor));
  }),
);
citizenRouter.post(
  '/origins/:code/on-site',
  requireAuth,
  wrap((req, res) => {
    if (req.auth!.role !== 'monitor') throw forbidden('Activa el rol de contralor comunitario para verificar en sitio.');
    const body = z.object({ photoId: z.string() }).parse(req.body);
    res.json(citizenOriginView(verifyOnSite(String(req.params.code), req.auth!.user, req.auth!.actor, body.photoId, req.deviceTime)));
  }),
);
citizenRouter.post(
  '/origins/:code/after-photo',
  requireAuth,
  wrap((req, res) => {
    const body = z.object({ afterPhotoId: z.string(), beforePhotoId: z.string().nullable().optional() }).parse(req.body);
    res.json(citizenOriginView(recordBeforeAfter(String(req.params.code), req.auth!.actor, { ...body, deviceTime: req.deviceTime }, req.auth!.user)));
  }),
);

// ---------------------------------------------------------------- AURA
citizenRouter.post(
  '/aura/message',
  wrap(async (req, res) => {
    const body = z
      .object({
        sessionId: z.string().nullable().optional(),
        text: z.string().max(2000).nullable().optional(),
        photoId: z.string().nullable().optional(),
        location: geo,
        sectorId: z.string().nullable().optional(),
        option: z.string().max(200).nullable().optional(),
        voiceNoteId: z.string().nullable().optional(),
      })
      .parse(req.body);
    const r = await handleMessage({ ...body, deviceTime: req.deviceTime, offlineQueuedAt: req.offlineQueuedAt, clientKey: req.clientKey }, citizenActor(req));
    res.json(r);
  }),
);
citizenRouter.get('/aura/session/:id', (req, res) => {
  const s = sessionView(String(req.params.id));
  if (!s) throw notFound('La conversación no existe.');
  res.json(s);
});
