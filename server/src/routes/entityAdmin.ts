import { Router } from 'express';
import { z } from 'zod';
import { ROLES } from '@kindra/shared';
import type { Role } from '@kindra/shared';
import { db } from '../core/db';
import { wrap, requireRole } from '../middleware/auth';
import { entityUsers, upsertEntityUser, proposeEvaluator, entityVehicles, upsertEntityVehicle, entityOperations } from '../services/entityAdmin';

/** Panel del administrador de entidad (addendum, parte 3). Todo queda limitado a su propia entidad. */
export const entityAdminRouter = Router();
entityAdminRouter.use(requireRole('entity_admin'));

entityAdminRouter.get('/overview', (req, res) => {
  res.json(entityOperations(req.auth!.actor));
});

entityAdminRouter.get('/users', (req, res) => {
  res.json(entityUsers(req.auth!.actor));
});

entityAdminRouter.post(
  '/users',
  wrap((req, res) => {
    const body = z
      .object({
        id: z.string().optional(),
        alias: z.string().min(3),
        name: z.string().optional(),
        phone: z.string().optional(),
        roles: z.array(z.enum(ROLES as [Role, ...Role[]])).min(1),
        centerId: z.string().nullable().optional(),
        password: z.string().min(6).optional(),
        active: z.boolean().optional(),
      })
      .parse(req.body);
    res.json(upsertEntityUser(req.auth!.actor, body));
  }),
);

entityAdminRouter.post(
  '/users/:id/propose-evaluator',
  wrap((req, res) => {
    const body = z.object({ note: z.string().max(300).nullable().optional() }).parse(req.body);
    res.json(proposeEvaluator(req.auth!.actor, String(req.params.id), body.note));
  }),
);

entityAdminRouter.get('/vehicles', (req, res) => {
  res.json({ vehicles: entityVehicles(req.auth!.actor), types: db().list('vehicleTypes') });
});

entityAdminRouter.post(
  '/vehicles',
  wrap((req, res) => {
    const body = z.object({ id: z.string().optional(), plate: z.string().min(3), typeId: z.string(), active: z.boolean().optional() }).parse(req.body);
    res.json(upsertEntityVehicle(req.auth!.actor, body));
  }),
);
