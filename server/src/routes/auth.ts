import { Router } from 'express';
import { z } from 'zod';
import { ROLES } from '@kindra/shared';
import type { Role } from '@kindra/shared';
import { wrap, requireAuth } from '../middleware/auth';
import { login, registerCitizen, loginWithPreregCode, demoSwitch, switchActiveRole, submitSelfie, toPublicUser } from '../services/auth';

export const authRouter = Router();

authRouter.post(
  '/login',
  wrap((req, res) => {
    const body = z.object({ identifier: z.string().min(1), password: z.string().min(1) }).parse(req.body);
    res.json(login(body.identifier, body.password));
  }),
);

authRouter.post(
  '/register',
  wrap((req, res) => {
    const body = z.object({ alias: z.string().min(3), password: z.string().min(6), phone: z.string().optional(), name: z.string().optional(), sectorId: z.string().nullable().optional() }).parse(req.body);
    res.json(registerCitizen(body));
  }),
);

authRouter.post(
  '/prereg',
  wrap((req, res) => {
    const body = z.object({ code: z.string().min(4) }).parse(req.body);
    res.json(loginWithPreregCode(body.code));
  }),
);

authRouter.post(
  '/demo-switch',
  wrap((req, res) => {
    const body = z.object({ role: z.enum(ROLES as [Role, ...Role[]]) }).parse(req.body);
    res.json(demoSwitch(body.role));
  }),
);

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: toPublicUser(req.auth!.user, req.auth!.role) });
});

authRouter.post(
  '/active-role',
  requireAuth,
  wrap((req, res) => {
    const body = z.object({ role: z.enum(ROLES as [Role, ...Role[]]) }).parse(req.body);
    res.json(switchActiveRole(req.auth!.user, body.role));
  }),
);

authRouter.post(
  '/selfie',
  requireAuth,
  wrap((req, res) => {
    const body = z.object({ photoId: z.string() }).parse(req.body);
    res.json({ user: submitSelfie(req.auth!.user, body.photoId) });
  }),
);
