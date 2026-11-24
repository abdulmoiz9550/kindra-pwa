import { Router } from 'express';
import { z } from 'zod';
import { INSTITUTIONAL_ROLES } from '@kindra/shared';
import type { KEvent } from '@kindra/shared';
import { db } from '../core/db';
import { wrap, requireAuth } from '../middleware/auth';
import { appendEvent, verifyChain } from '../core/events';
import { eventView, maskReporter } from '../services/record';
import { badRequest, forbidden, notFound } from '../core/errors';
import { isSecurityTrail } from '../services/governance';
import { currentValues } from '../core/projections';

export const eventsRouter = Router();
eventsRouter.use(requireAuth);

eventsRouter.get('/', (req, res) => {
  if (!INSTITUTIONAL_ROLES.includes(req.auth!.role)) throw forbidden();
  const chain = typeof req.query.chain === 'string' ? req.query.chain : null;
  const limit = Math.min(500, Number(req.query.limit) || 200);
  // v4.0, sección 9: inicios de sesión, exportaciones y solicitudes de información solo las ve el administrador principal.
  const visible = (e: KEvent) => (req.auth!.role === 'admin' && req.auth!.mfa) || !isSecurityTrail(e);
  const events = chain ? db().eventsOfChain(chain).filter(visible) : db().allEvents().filter(visible).slice(-limit);
  const mask = ['supervisor', 'driver', 'processing'].includes(req.auth!.role);
  res.json({ events: events.map((e) => eventView(e, false)).map((v) => (mask ? maskReporter(v) : v)), verification: chain ? verifyChain(chain) : null });
});

/** 7.16 / 3.1: corrección con motivo. Nunca modifica el evento original; solo lo referencia. */
eventsRouter.post(
  '/:id/correct',
  wrap((req, res) => {
    if (!INSTITUTIONAL_ROLES.includes(req.auth!.role) || req.auth!.role === 'supervisor') throw forbidden('Solo la entidad que registró el dato puede corregirlo.');
    const original = db().eventById(String(req.params.id));
    if (!original) throw notFound('El evento no existe.');
    if (original.entityId && original.entityId !== req.auth!.user.entityId) throw forbidden('No puedes corregir registros de otra entidad (4.1).');
    if (isSecurityTrail(original)) throw forbidden('Este tipo de registro no admite correcciones.');
    const body = z.object({ reason: z.string().min(5), patch: z.record(z.unknown()) }).parse(req.body);
    if (!Object.keys(body.patch).length) throw badRequest('Indica al menos un campo a corregir.');
    const ev = appendEvent({ type: 'correction', objectType: original.objectType, objectId: original.objectId, actor: req.auth!.actor, data: { reason: body.reason, patch: body.patch, previous: currentValues(original.objectType, original.objectId, Object.keys(body.patch)), originalType: original.type }, correctedEventId: original.id, deviceTime: req.deviceTime });
    res.status(201).json(eventView(ev, false));
  }),
);
