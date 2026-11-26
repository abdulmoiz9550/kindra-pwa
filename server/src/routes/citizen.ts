import { Router } from 'express';
import { z } from 'zod';
import { INSTITUTIONAL_ROLES } from '@kindra/shared';
import { db } from '../core/db';
import { wrap, requireAuth, citizenActor } from '../middleware/auth';
import { savePhoto } from '../services/photos';
import { createCitizenReport, getOriginOrThrow, listOriginsForReporter, lookupOrigins, respondRemovalClosure, answerSatisfaction, addRetakePhoto, originStatusView, sectorMonitors, reportStatus, sectorName, monitorReviewClosure, confirmLocation } from '../services/origins';
import { buildRecord, recordToCsv, verifyRecord } from '../services/record';
import { listNotifications, markRead, markAllRead } from '../services/notifications';
import { computePoints, certificateFor } from '../services/points';
import { listLessons, completeLesson, lessonAsText, listCourses, submitCourseQuiz, courseCompleted } from '../services/lessons';
import { requestMonitorRole, verifyOnSite, recordBeforeAfter } from '../services/monitor';
import { handleMessage, sessionView } from '../services/aura';
import { citizenOriginView } from './helpers';
import { forbidden, notFound } from '../core/errors';
import { toPublicUser } from '../services/auth';
import { env } from '../config/env';
import { cardFor, regenerateCard, achievementsFor } from '../services/card';
import { referralSummary } from '../services/referrals';
import { assertFeature } from '../services/features';

import { logExport } from '../services/governance';
import { persistUpload } from '../services/photoStore';

export const citizenRouter = Router();

const geo = z.object({ lat: z.number(), lng: z.number() }).nullable().optional();

// ---------------------------------------------------------------- fotos
citizenRouter.post(
  '/photos',
  wrap(async (req, res) => {
    const body = z.object({ dataUrl: z.string(), kind: z.string().default('origin'), location: geo, takenAt: z.string().nullable().optional() }).parse(req.body);
    const photo = savePhoto({ dataUrl: body.dataUrl, kind: body.kind as never, uploadedBy: req.auth?.user.id ?? null, location: body.location ?? null, takenAt: body.takenAt ?? null });
    await persistUpload(photo.url);
    res.status(201).json(photo);
  }),
);

// ---------------------------------------------------------------- reportes ciudadanos
citizenRouter.post(
  '/origins',
  wrap((req, res) => {
    const body = z
      .object({
        photoIds: z.array(z.string()).max(5).default([]),
        location: geo,
        locationAccuracyM: z.number().min(0).max(100000).nullable().optional(),
        phone: z.string().max(30).nullable().optional(),
        viaMonitor: z.boolean().optional(),
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

/** Supervisor y Contralor Comunitario nunca ven la identidad de quien reportó (salvo su propio reporte). */
function hideReporter(req: Parameters<typeof citizenActor>[0], originId: string): boolean {
  if (!req.auth || !['monitor', 'supervisor', 'driver', 'processing'].includes(req.auth.role)) return false;
  return db().get('origins', originId)?.reporterId !== req.auth.user.id;
}

citizenRouter.get('/origins/:code', (req, res) => {
  const o = getOriginOrThrow(String(req.params.code));
  const full = canSeeFull(req, o.id);
  res.json(buildRecord(o, { publicVersion: !full, hideReporter: hideReporter(req, o.id) }));
});

citizenRouter.get('/origins/:code/verificar', (req, res) => {
  res.json(verifyRecord(getOriginOrThrow(String(req.params.code))));
});

citizenRouter.get('/origins/:code/export', (req, res) => {
  const o = getOriginOrThrow(String(req.params.code));
  const record = buildRecord(o, { publicVersion: !canSeeFull(req, o.id), hideReporter: hideReporter(req, o.id) });
  // v4.0, secciones 9 y 20: toda descarga queda registrada.
  logExport(citizenActor(req), 'origin_record', 1, { code: o.code, format: req.query.format === 'csv' ? 'csv' : 'json', publicVersion: record.isPublicVersion });
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

// ---------------------------------------------------------------- tarjeta Kindra, logros y referidos (addendum)
citizenRouter.get(
  '/me/card',
  requireAuth,
  wrap(async (req, res) => {
    assertFeature('kindra_card');
    res.json(await cardFor(req.auth!.user));
  }),
);

citizenRouter.post(
  '/me/card/regenerate',
  requireAuth,
  wrap(async (req, res) => {
    assertFeature('kindra_card');
    const u = regenerateCard(req.auth!.user);
    res.json(await cardFor(u));
  }),
);

citizenRouter.get('/me/achievements', requireAuth, wrap((req, res) => {
  assertFeature('achievements');
  res.json(achievementsFor(req.auth!.user));
}));

citizenRouter.get('/me/referrals', requireAuth, wrap((req, res) => {
  assertFeature('referrals');
  res.json(referralSummary(req.auth!.user));
}));

citizenRouter.get('/me/profile', requireAuth, (req, res) => {
  const u = req.auth!.user;
  const pts = computePoints(u.id);
  const cert = certificateFor(u.id);
  const monitorRequest = db().find('monitorRequests', (r) => r.userId === u.id && r.status === 'pending');
  res.json({
    user: toPublicUser(u, req.auth!.role, req.auth!.mfa),
    points: pts,
    certificate: cert ? { ...cert, verifyUrl: `${env.publicBaseUrl}/publico/certificado/${cert.code}` } : null,
    monitorRequestPending: !!monitorRequest,
    // Addendum v4.2, 3.2: la acreditación exige el curso Contralor Comunitario.
    canRequestMonitor: courseCompleted(u.id, 'contralor') && !u.roles.includes('monitor') && !monitorRequest,
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

/** Los avisos que la persona silenció no se muestran (v4.0, 17.5). */
const visibleNotifications = (req: Parameters<typeof citizenActor>[0]) => {
  const muted = new Set(req.auth?.user.preferences?.mutedKinds ?? []);
  return listNotifications(recipientKeys(req)).filter((n) => !muted.has(n.kind));
};
citizenRouter.get('/me/notifications', (req, res) => {
  res.json(visibleNotifications(req));
});
citizenRouter.post('/me/notifications/lookup', (req, res) => {
  res.json(visibleNotifications(req));
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
citizenRouter.get('/courses', (req, res) => {
  res.json(listCourses(req.auth?.user.id ?? null, req.auth?.role ?? null));
});
citizenRouter.post(
  '/courses/:id/quiz',
  requireAuth,
  wrap((req, res) => {
    const body = z.object({ answers: z.array(z.number().int()) }).parse(req.body);
    res.json(submitCourseQuiz(String(req.params.id), citizenActor(req), body.answers));
  }),
);
citizenRouter.get('/lessons/:id/text', (req, res) => {
  const l = db().get('lessons', String(req.params.id));
  if (!l) throw notFound('La lección no existe.');
  res.type('text/plain; charset=utf-8').send(lessonAsText(l, typeof req.query.sector === 'string' ? req.query.sector : null));
});

// ---------------------------------------------------------------- Contralor Comunitario
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
    if (req.auth!.role !== 'monitor') throw forbidden('Activa el rol de Contralor Comunitario para verificar en sitio.');
    const body = z.object({ photoId: z.string(), result: z.enum(['exists', 'not_exists', 'already_cleared']).optional() }).parse(req.body);
    res.json(citizenOriginView(verifyOnSite(String(req.params.code), req.auth!.user, req.auth!.actor, body.photoId, req.deviceTime, body.result)));
  }),
);

// ---------------------------------------------------------------- addendum v4.2: Contralor Comunitario
/** Casos del sector del Contralor, sin datos personales de quien reporta. */
citizenRouter.get('/contralor/cases', requireAuth, (req, res) => {
  if (req.auth!.role !== 'monitor') throw forbidden('Activa el rol de Contralor Comunitario.');
  const store = db();
  const me = req.auth!.user;
  const cases = store
    .filter('origins', (o) => o.type === 'citizen' && sectorMonitors(o.sectorId).includes(me.id) && !['rejected', 'duplicate'].includes(o.state))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 200)
    .map((o) => {
      const st = reportStatus(o);
      const closure = store.find('closures', (c) => c.originId === o.id && c.type === 'removal');
      return { id: o.id, code: o.code, sector: sectorName(o.sectorId), street: o.street ?? null, reference: o.reference ?? null, location: o.confirmedLocation ?? o.location, photoIds: o.photoIds, afterPhotoId: o.afterPhotoId ?? o.disputeEvidencePhotoId ?? null, createdAt: o.createdAt, status: st, own: o.reporterId === me.id, viaMonitor: !!o.viaMonitor, verified: o.fieldVerification ?? (o.verifiedOnSiteAt ? { result: 'exists', at: o.verifiedOnSiteAt } : null), closurePending: !!closure && closure.citizenResponse === 'no_response', disputed: o.state === 'disputed' };
    });
  res.json(cases);
});
citizenRouter.post(
  '/contralor/cases/:id/closure',
  requireAuth,
  wrap((req, res) => {
    const body = z.object({ ok: z.boolean(), photoId: z.string(), note: z.string().max(500).nullable().optional() }).parse(req.body);
    const o = monitorReviewClosure(String(req.params.id), req.auth!.actor, body.ok, body.photoId, body.note);
    res.json({ code: o.code, status: reportStatus(o) });
  }),
);
citizenRouter.post(
  '/origins/:id/confirm-location',
  requireAuth,
  wrap((req, res) => {
    const body = z.object({ lat: z.number(), lng: z.number() }).parse(req.body);
    const o = confirmLocation(String(req.params.id), req.auth!.actor, body);
    res.json({ code: o.code, confirmedLocation: o.confirmedLocation });
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
