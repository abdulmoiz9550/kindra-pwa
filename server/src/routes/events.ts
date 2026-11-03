import { Router } from 'express';
import { z } from 'zod';
import { INSTITUTIONAL_ROLES } from '@kindra/shared';
import { db } from '../core/db';
import { wrap, requireAuth } from '../middleware/auth';
import { appendEvent, verifyChain } from '../core/events';
import { eventView } from '../services/record';
import { badRequest, forbidden, notFound } from '../core/errors';

export const eventsRouter = Router();
eventsRouter.use(requireAuth);

eventsRouter.get('/', (req, res) => {
  if (!INSTITUTIONAL_ROLES.includes(req.auth!.role)) throw forbidden();
  const chain = typeof req.query.chain === 'string' ? req.query.chain : null;
  const limit = Math.min(500, Number(req.query.limit) || 200);
  const events = chain ? db().eventsOfChain(chain) : db().allEvents().slice(-limit);
  res.json({ events: events.map((e) => eventView(e, false)), verification: chain ? verifyChain(chain) : null });
});

/** 7.16 / 3.1: corrección con motivo. Nunca modifica el evento original; solo lo referencia. */
eventsRouter.post(
  '/:id/correct',
  wrap((req, res) => {
    if (!INSTITUTIONAL_ROLES.includes(req.auth!.role) || req.auth!.role === 'supervisor') throw forbidden('Solo la entidad que registró el dato puede corregirlo.');
    const original = db().eventById(String(req.params.id));
    if (!original) throw notFound('El evento no existe.');
    if (original.entityId && original.entityId !== req.auth!.user.entityId) throw forbidden('No puedes corregir registros de otra entidad (4.1).');
    const body = z.object({ reason: z.string().min(5), patch: z.record(z.unknown()) }).parse(req.body);
    if (!Object.keys(body.patch).length) throw badRequest('Indica al menos un campo a corregir.');
    const ev = appendEvent({ type: 'correction', objectType: original.objectType, objectId: original.objectId, actor: req.auth!.actor, data: { reason: body.reason, patch: body.patch, originalType: original.type }, correctedEventId: original.id, deviceTime: req.deviceTime });
    res.status(201).json(eventView(ev, false));
  }),
);
