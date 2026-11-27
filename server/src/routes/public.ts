import { whatsappStatus } from '../services/whatsapp';
import { logExport } from '../services/governance';
import { openData, openDataCsv, parishPage, publicFacilities, publicLookup, publicReconciliation, sectorProgressAll } from '../services/portal';
import { Router } from 'express';
import { z } from 'zod';
import { KINDRA_TAGLINE, USE_TYPE_LABELS, SIZE_LABELS, URGENCY_LABELS, SUBCATEGORY_LABELS, REJECTION_REASON_LABELS, STRUCTURE_TYPE_LABELS, CAUSE_LABELS, ROLE_LABELS } from '@kindra/shared';
import { db } from '../core/db';
import { wrap, citizenActor } from '../middleware/auth';
import { listNews } from '../services/ops';
import { listSnapshots } from '../services/reportSnapshots';
import { submitInfoRequest, publicInfoRequest } from '../services/governance';
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

import { FEATURES, featureOn } from '@kindra/shared';
import { publicCard } from '../services/card';
import { assertFeature } from '../services/features';

export const publicRouter = Router();

publicRouter.get('/config', (_req, res) => {
  const cfg = getConfig();
  const store = db();
  res.json({
    branding: { ...cfg.branding, tagline: cfg.branding.tagline, kindraLine: KINDRA_TAGLINE },
    demoMode: cfg.demoMode,
    simulatedLabel: cfg.demoMode ? cfg.simulatedDataLabel : null,
    sectors: store.list('sectors').map((s) => ({ id: s.id, name: s.name, parish: s.parish, polygon: s.polygon, authorized: s.authorized, provisional: !!s.provisional })),
    centers: store.list('centers').map((c) => ({ id: c.id, name: c.name, type: c.type, sectorId: c.sectorId, location: c.location ?? null, unloadingPoint: c.unloadingPoint ?? null })),
    demoRoles: listDemoRoles(),
    publicBaseUrl: env.publicBaseUrl,
    complaintChannelUrl: cfg.complaintChannelUrl,
    levels: cfg.raices.levels,
    sessionIdleMinutes: cfg.sessionIdleMinutes ?? 30,
    whatsapp: whatsappStatus(),
    raices: { values: cfg.raices.values, dailyCaps: cfg.raices.dailyCaps, catalogApproved: cfg.raices.catalogApproved },
    incentives: cfg.incentives ?? { status: 'pending', reference: null, approvedAt: null, approvedBy: null },
    points: cfg.points,
    thresholds: cfg.thresholds,
    hazardChecklist: cfg.hazardChecklist,
    qualityChecklist: cfg.qualityChecklist,
    labels: { useTypes: USE_TYPE_LABELS, sizes: SIZE_LABELS, urgencies: URGENCY_LABELS, subcategories: SUBCATEGORY_LABELS, rejectionReasons: REJECTION_REASON_LABELS, structureTypes: STRUCTURE_TYPE_LABELS, causes: CAUSE_LABELS, roles: ROLE_LABELS },
    provisionalFlags: cfg.provisionalFlags,
    // Solo el estado efectivo (encendida o no); nunca la lista de funciones ocultas.
    features: Object.fromEntries(FEATURES.filter((f) => f.group === 'debris' || (['oil_module', 'ai_photo_detection', 'community_groups', 'eco_challenges', 'english_language', 'vehicle_tracking_level2', 'institutional_2fa'].includes(f.key) && featureOn(cfg.features, f.key))).map((f) => [f.key, featureOn(cfg.features, f.key)])),
  });
});

/** Página pública del QR personal de la tarjeta Kindra (sin datos sensibles). */
publicRouter.get(
  '/tarjeta/:code',
  wrap((req, res) => {
    assertFeature('kindra_card');
    res.json(publicCard(String(req.params.code)));
  }),
);

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

// ---------------------------------------------------------------- addendum v4.2, sección 9: portal público
publicRouter.get('/consulta/:code', (req, res) => res.json(publicLookup(String(req.params.code))));
publicRouter.get('/portal', (req, res) => res.json({ ...sectorProgressAll(typeof req.query.parroquia === 'string' ? req.query.parroquia : null), facilities: publicFacilities() }));
publicRouter.get('/conciliacion', (_req, res) => res.json(publicReconciliation()));
publicRouter.get('/parroquias/:code', (req, res) => res.json(parishPage(String(req.params.code))));
publicRouter.get('/datos-abiertos.json', (req, res) => {
  logExport(req.auth?.actor ?? { id: null, role: 'citizen', entityId: null }, 'open_data', 0, { format: 'json' });
  res.setHeader('Content-Disposition', 'attachment; filename="kindra-datos-abiertos.json"');
  res.json(openData());
});
publicRouter.get('/datos-abiertos.csv', (req, res) => {
  logExport(req.auth?.actor ?? { id: null, role: 'citizen', entityId: null }, 'open_data', 0, { format: 'csv' });
  res.setHeader('Content-Disposition', 'attachment; filename="kindra-datos-abiertos.csv"');
  res.type('text/csv; charset=utf-8').send('﻿' + openDataCsv());
});
publicRouter.get('/datos-abiertos', (_req, res) => {
  const d = openData();
  res.json({ title: d.title, cutoff: d.cutoff, license: d.license, dictionary: d.dictionary, rows: d.rows.length });
});

publicRouter.get('/branding', (_req, res) => {
  res.json(brandingBlock());
});

// v4.0, sección 9: solicitudes de información. Se registran y las decide una persona autorizada.
publicRouter.post(
  '/solicitudes-informacion',
  wrap((req, res) => {
    const body = z.object({ subject: z.string().max(120), description: z.string().max(2000), name: z.string().max(80).nullable().optional(), contact: z.string().max(120).nullable().optional() }).parse(req.body);
    const r = submitInfoRequest(citizenActor(req), body);
    res.status(201).json(publicInfoRequest(r.code));
  }),
);

publicRouter.get(
  '/solicitudes-informacion/:code',
  wrap((req, res) => {
    res.json(publicInfoRequest(String(req.params.code)));
  }),
);

publicRouter.get('/noticias', (req, res) => res.json(listNews(req.auth?.role ?? null)));
publicRouter.get('/ayuda', (_req, res) => {
  const cfg = getConfig();
  res.json({ ...(cfg.help || { about: '', privacy: '', contact: '', updatedAt: null }), complaintChannelUrl: cfg.complaintChannelUrl });
});

/** Cifras del reporte oficial con aprobación para ser públicas. Ninguna por defecto. */
publicRouter.get('/reporte-oficial', (_req, res) => {
  const p = getConfig().publicReport;
  const snap = listSnapshots()[0];
  if (!p?.keys.length || !p.approvalReference || !snap) return res.json(null);
  res.json({ title: snap.title, reportedAt: snap.reportedAt, source: snap.source, indicators: snap.indicators.filter((i) => p.keys.includes(i.key)) });
});
