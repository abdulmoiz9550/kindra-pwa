import { createHmac, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';

/**
 * v4.0, sección 9: enlaces firmados para las imágenes. La firma vence; el vencimiento se alinea a bloques de
 * 12 horas para que el mismo archivo conserve su enlace dentro del bloque y el navegador pueda reutilizarlo.
 */
const PREFIX = '/uploads/';
const BLOCK_MS = 12 * 3_600_000;

export const isUploadPath = (v: unknown): v is string => typeof v === 'string' && v.startsWith(PREFIX) && v.length < 400 && !v.includes(' ');

const signature = (file: string, exp: number) => createHmac('sha256', env.jwtSecret).update(`upload:${file}:${exp}`).digest('base64url').slice(0, 32);

export const unsignUpload = (url: string) => url.split('?')[0];

export function signUpload(url: string): string {
  const clean = unsignUpload(url);
  const exp = (Math.floor(Date.now() / BLOCK_MS) + 2) * BLOCK_MS;
  return `${clean}?e=${exp.toString(36)}&s=${signature(clean.slice(PREFIX.length), exp)}`;
}

export function requireSignedUpload(req: Request, res: Response, next: NextFunction): void {
  let file = '';
  try {
    file = path.posix.normalize(decodeURIComponent(req.path)).replace(/^\/+/, '');
  } catch {
    /* ruta mal formada: se rechaza abajo */
  }
  const exp = parseInt(String(req.query.e ?? ''), 36);
  const given = Buffer.from(String(req.query.s ?? ''));
  const ok = !!file && Number.isFinite(exp) && exp > Date.now() && (() => {
    const good = Buffer.from(signature(file, exp));
    return good.length === given.length && timingSafeEqual(good, given);
  })();
  if (!ok) {
    res.status(403).json({ error: 'Este enlace no es válido o ya venció.', code: 'upload_link' });
    return;
  }
  next();
}
