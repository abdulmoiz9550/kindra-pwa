import { Router } from 'express';
import { z } from 'zod';
import { KINDRA_TAGLINE, USE_TYPE_LABELS, SIZE_LABELS, URGENCY_LABELS, SUBCATEGORY_LABELS, REJECTION_REASON_LABELS, STRUCTURE_TYPE_LABELS, CAUSE_LABELS, ROLE_LABELS } from '@kindra/shared';
import { db } from '../core/db';
import { wrap } from '../middleware/auth';
import { getConfig } from '../services/config';
import { listDemoRoles } from '../services/auth';
import { buildDashboard, sectorProgress } from '../services/dashboard';
import { addClient } from '../realtime/sse';
import { batchPage, workPage, qrSvg, qrTarget, certificatePage, brandingBlock } from '../services/publicPages';
import { getOriginOrThrow, originStatusView } from '../services/origins';
import { buildRecord, verifyRecord } from '../services/record';
import { verifyChain, verifyChains } from '../core/events';
import { listLessons, lessonAsText } from '../services/lessons';
import { listNotifications } from '../services/notifications';
import { notFound } from '../core/errors';
import { env } from '../config/env';

export const publicRouter = Router();

publicRouter.get('/config', (_req, res) => {
  const cfg = getConfig();
  const store = db();
  res.json({
    branding: { ...cfg.branding, tagline: cfg.branding.tagline, kindraLine: KINDRA_TAGLINE },
    demoMode: cfg.demoMode,
    simulatedLabel: cfg.demoMode ? cfg.simulatedDataLabel : null,
    sectors: store.list('sectors').map((s) => ({ id: s.id, name: s.name, parish: s.parish, polygon: s.polygon, authorized: s.authorized, provisional: !!s.provisional })),
    centers: store.list('centers').map((c) => ({ id: c.id, name: c.name, type: c.type, sectorId: c.sectorId, location: c.location ?? null })),
    demoRoles: listDemoRoles(),
    publicBaseUrl: env.publicBaseUrl,
    complaintChannelUrl: cfg.complaintChannelUrl,
    levels: cfg.levels,
    points: cfg.points,
    thresholds: cfg.thresholds,
    hazardChecklist: cfg.hazardChecklist,
    qualityChecklist: cfg.qualityChecklist,
    labels: { useTypes: USE_TYPE_LABELS, sizes: SIZE_LABELS, urgencies: URGENCY_LABELS, subcategories: SUBCATEGORY_LABELS, rejectionReasons: REJECTION_REASON_LABELS, structureTypes: STRUCTURE_TYPE_LABELS, causes: CAUSE_LABELS, roles: ROLE_LABELS },
    provisionalFlags: cfg.provisionalFlags,
  });
});

publicRouter.get('/dashboard', (req, res) => {
  const sector = typeof req.query.sector === 'string' && req.query.sector ? req.query.sector : null;
  res.json(buildDashboard(sector));
});

publicRouter.get('/stream', (_req, res) => {
  addClient(res);
});

publicRouter.get('/lotes/:code', (req, res) => {
  res.json(batchPage(String(req.params.code)));
});

publicRouter.get('/obras/:code', (req, res) => {
  res.json(workPage(String(req.params.code)));
});

publicRouter.get('/ficha/:code', (req, res) => {
  const o = getOriginOrThrow(String(req.params.code));
  res.json(buildRecord(o, { publicVersion: true }));
});

publicRouter.get('/ficha/:code/verificar', (req, res) => {
  const o = getOriginOrThrow(String(req.params.code));
  res.json(verifyRecord(o));
});

publicRouter.get('/verificar/:chainId', (req, res) => {
  res.json(verifyChain(String(req.params.chainId)));
});

publicRouter.post(
  '/verificar',
  wrap((req, res) => {
    const { chainIds } = z.object({ chainIds: z.array(z.string()).min(1).max(50) }).parse(req.body);
    res.json(verifyChains(chainIds));
  }),
);

publicRouter.get('/certificados/:code', (req, res) => {
  res.json(certificatePage(String(req.params.code)));
});

publicRouter.get('/lecciones', (_req, res) => {
  res.json(listLessons(null));
});

publicRouter.get('/lecciones/:id/texto', (req, res) => {
  const l = db().get('lessons', String(req.params.id));
  if (!l) throw notFound('La lección no existe.');
  res.type('text/plain; charset=utf-8').send(lessonAsText(l, typeof req.query.sector === 'string' ? req.query.sector : null));
});

publicRouter.get(
  '/qr/:kind/:code',
  wrap(async (req, res) => {
    const code = String(req.params.code).replace(/\.svg$/i, '');
    const svg = await qrSvg(String(req.params.kind), code);
    res.type('image/svg+xml').send(svg);
  }),
);

publicRouter.get('/qr-target/:kind/:code', (req, res) => {
  res.json({ url: qrTarget(String(req.params.kind), String(req.params.code)), branding: brandingBlock() });
});

publicRouter.get('/sectores/:id/progreso', (req, res) => {
  const p = sectorProgress(String(req.params.id));
  if (!p) throw notFound('El sector no existe.');
  res.json(p);
});

/** Consultar mi reporte por código (16.1): estado en lenguaje claro y mensajes dirigidos a ese código. */
publicRouter.get('/reportes/:code/estado', (req, res) => {
  const o = getOriginOrThrow(String(req.params.code));
  const status = originStatusView(o);
  const messages = listNotifications([`origin:${o.code}`]).map((n) => ({ id: n.id, text: n.text, kind: n.kind, createdAt: n.createdAt, link: n.link }));
  res.json({ status, messages, publicRecordUrl: `${env.publicBaseUrl}/publico/ficha/${o.code}` });
});

publicRouter.get('/branding', (_req, res) => {
  res.json(brandingBlock());
});
