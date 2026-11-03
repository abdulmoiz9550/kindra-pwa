import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { Role, User } from '@kindra/shared';
import { db } from '../core/db';
import { verifyToken } from '../services/auth';
import { forbidden, unauthorized, HttpError } from '../core/errors';
import type { Actor } from '../core/events';

export interface AuthInfo {
  user: User;
  role: Role;
  actor: Actor;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthInfo;
    deviceTime: string | null;
    offlineQueuedAt: string | null;
    clientKey: string | null;
  }
}

/** Lee el token si existe (rutas públicas y ciudadanas lo aceptan de forma opcional). */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  req.deviceTime = (req.header('x-device-time') as string) || (req.body && typeof req.body.deviceTime === 'string' ? req.body.deviceTime : null);
  req.offlineQueuedAt = (req.header('x-offline-queued-at') as string) || (req.body && typeof req.body.offlineQueuedAt === 'string' ? req.body.offlineQueuedAt : null);
  req.clientKey = (req.header('x-client-key') as string) || null;
  const header = req.header('authorization');
  if (header?.startsWith('Bearer ')) {
    const payload = verifyToken(header.slice(7));
    if (payload) {
      const user = db().get('users', payload.userId);
      if (user && user.active) {
        const role = user.roles.includes(payload.activeRole) ? payload.activeRole : user.roles[0];
        req.auth = { user, role, actor: { id: user.id, role, entityId: user.entityId ?? null } };
      }
    }
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) return next(unauthorized());
  next();
}

/** 3.5: los permisos por rol se validan en el servidor en cada operación. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(unauthorized());
    if (!roles.includes(req.auth.role)) return next(forbidden(`Esta acción requiere el rol: ${roles.join(' o ')}.`));
    const institutional: Role[] = ['coordinator', 'removal', 'center', 'evaluator', 'supervisor', 'destination', 'admin', 'monitor'];
    if (institutional.includes(req.auth.role) && req.auth.user.verificationStatus !== 'verified') {
      return next(forbidden('Debes completar la verificación de identidad para usar este rol.'));
    }
    next();
  };
}

/** Actor ciudadano (con cuenta o anónimo) para rutas abiertas. */
export function citizenActor(req: Request): Actor {
  if (req.auth) return { id: req.auth.user.id, role: 'citizen', entityId: null };
  return { id: null, role: 'citizen', entityId: null };
}

export const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown): RequestHandler => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code, details: err.details ?? null });
    return;
  }
  const anyErr = err as { type?: string; status?: number; message?: string; issues?: unknown };
  if (anyErr?.type === 'entity.too.large') {
    res.status(413).json({ error: 'El contenido enviado es demasiado grande.', code: 'too_large' });
    return;
  }
  if (anyErr?.issues) {
    res.status(400).json({ error: 'Datos inválidos.', code: 'validation', details: anyErr.issues });
    return;
  }
  console.error('[error]', err);
  res.status(500).json({ error: 'Ocurrió un error inesperado en el servidor.', code: 'internal' });
}
