import { Router } from 'express';
import { z } from 'zod';
import { ROLES } from '@kindra/shared';
import type { Role } from '@kindra/shared';
import { wrap, requireAuth } from '../middleware/auth';
import { findLoginUser, login, registerCitizen, loginWithPreregCode, demoSwitch, switchActiveRole, submitSelfie, toPublicUser, completeTwoFactor, sessionAfterEnable } from '../services/auth';
import { twoFactorStatus, beginSetup, enableTwoFactor } from '../services/twoFactor';
import { logSignIn, requestRecovery } from '../services/governance';
import { assertNotLocked, recordFailure, clearFailures } from '../services/lockout';

export const authRouter = Router();

authRouter.post(
  '/login',
  wrap((req, res) => {
    const body = z.object({ identifier: z.string().min(1), password: z.string().min(1) }).parse(req.body);
    // v4.0, sección 10: cada inicio de sesión, correcto o fallido, queda registrado (sin contraseña ni identificador escrito).
    const key = `pw:${findLoginUser(body.identifier)?.id ?? body.identifier.trim().toLowerCase()}`;
    assertNotLocked(key);
    let session: ReturnType<typeof login>;
    try {
      session = login(body.identifier, body.password);
    } catch (err) {
      logSignIn(false, findLoginUser(body.identifier)?.id ?? null, 'password', req.ip ?? null);
      recordFailure(key);
      throw err;
    }
    clearFailures(key);
    logSignIn(true, session.user.id, 'password', req.ip ?? null);
    res.json(session);
  }),
);

authRouter.post(
  '/register',
  wrap((req, res) => {
    const body = z.object({ email: z.string().email().nullable().optional(), alias: z.string().min(3), password: z.string().min(6), phone: z.string().optional(), name: z.string().optional(), sectorId: z.string().nullable().optional(), referralCode: z.string().max(20).nullable().optional() }).parse(req.body);
    res.json(registerCitizen(body));
  }),
);

authRouter.post(
  '/prereg',
  wrap((req, res) => {
    const body = z.object({ code: z.string().min(4) }).parse(req.body);
    const session = loginWithPreregCode(body.code);
    logSignIn(true, session.user.id, 'prereg', req.ip ?? null);
    res.json(session);
  }),
);

authRouter.post(
  '/demo-switch',
  wrap((req, res) => {
    const body = z.object({ role: z.enum(ROLES as [Role, ...Role[]]) }).parse(req.body);
    const session = demoSwitch(body.role);
    logSignIn(true, session.user.id, 'demo_switch', req.ip ?? null);
    res.json(session);
  }),
);

/** v4.0, sección 24: recuperación de acceso. La respuesta es idéntica exista o no la cuenta. */
authRouter.post(
  '/recovery',
  wrap((req, res) => {
    const body = z.object({ identifier: z.string().min(1).max(80) }).parse(req.body);
    requestRecovery(findLoginUser(body.identifier)?.id ?? null);
    res.json({ ok: true });
  }),
);

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: toPublicUser(req.auth!.user, req.auth!.role, req.auth!.mfa) });
});

authRouter.post(
  '/active-role',
  requireAuth,
  wrap((req, res) => {
    const body = z.object({ role: z.enum(ROLES as [Role, ...Role[]]) }).parse(req.body);
    res.json(switchActiveRole(req.auth!.user, body.role, req.auth!.mfa));
  }),
);

// ---------------------------------------------------------------- verificación en dos pasos (addendum, parte 3)
const codeBody = z.object({ code: z.string().min(6).max(10) });

authRouter.get('/2fa/status', requireAuth, (req, res) => {
  res.json(twoFactorStatus(req.auth!.user, req.auth!.mfa));
});

authRouter.post(
  '/2fa/setup',
  requireAuth,
  wrap(async (req, res) => {
    res.json(await beginSetup(req.auth!.user));
  }),
);

authRouter.post(
  '/2fa/enable',
  requireAuth,
  wrap((req, res) => {
    const { code } = codeBody.parse(req.body);
    const user = enableTwoFactor(req.auth!.user, code);
    res.json(sessionAfterEnable(user, req.auth!.role));
  }),
);

authRouter.post(
  '/2fa/verify',
  requireAuth,
  wrap((req, res) => {
    const { code } = codeBody.parse(req.body);
    const key = `mfa:${req.auth!.user.id}`;
    assertNotLocked(key);
    let session: ReturnType<typeof completeTwoFactor>;
    try {
      session = completeTwoFactor(req.auth!.user, req.auth!.role, code);
    } catch (err) {
      logSignIn(false, req.auth!.user.id, 'mfa', req.ip ?? null);
      recordFailure(key);
      throw err;
    }
    clearFailures(key);
    logSignIn(true, req.auth!.user.id, 'mfa', req.ip ?? null);
    res.json(session);
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
