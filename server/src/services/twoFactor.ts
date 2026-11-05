import QRCode from 'qrcode';
import type { User } from '@kindra/shared';
import { db } from '../core/db';
import { nowIso } from '../core/ids';
import { badRequest, conflict } from '../core/errors';
import { appendEvent } from '../core/events';
import { generateSecret, otpauthUrl, totp, verifyTotp } from './totp';
import { getConfig } from './config';

/**
 * Verificación en dos pasos (addendum, parte 3): obligatoria para el administrador principal de Kindra.
 * El secreto vive en una colección propia que nunca se envía al cliente.
 */
export const twoFactorRequired = (user: User) => user.roles.includes('admin');

const secretDoc = (userId: string) => db().get('twoFactorSecrets', userId);

/** Solo en modo demostración y solo para usuarios de prueba: se muestra el código vigente para poder probar el flujo. */
function demoCodeFor(user: User, secret: string | null | undefined): string | null {
  if (!secret || !user.isDemo || !getConfig().demoMode) return null;
  return totp(secret);
}

export function twoFactorStatus(user: User, sessionVerified: boolean) {
  const doc = secretDoc(user.id);
  const enabled = !!user.twoFactor?.enabled && !!doc?.secret;
  return {
    enabled,
    required: twoFactorRequired(user),
    sessionVerified: enabled && sessionVerified,
    pendingSetup: !enabled && !!doc?.pendingSecret,
    demoCode: enabled ? demoCodeFor(user, doc?.secret) : null,
  };
}

export async function beginSetup(user: User) {
  if (user.twoFactor?.enabled && secretDoc(user.id)?.secret) throw conflict('La verificación en dos pasos ya está activa.', 'mfa_already_enabled');
  const pendingSecret = generateSecret();
  db().put('twoFactorSecrets', { id: user.id, secret: null, pendingSecret, updatedAt: nowIso() });
  const url = otpauthUrl(pendingSecret, user.alias);
  return {
    secret: pendingSecret,
    otpauthUrl: url,
    qrSvg: await QRCode.toString(url, { type: 'svg', margin: 1, width: 240 }),
    demoCode: demoCodeFor(user, pendingSecret),
  };
}

export function enableTwoFactor(user: User, code: string): User {
  const doc = secretDoc(user.id);
  if (!doc?.pendingSecret) throw badRequest('Primero genera el código QR de configuración.');
  if (!verifyTotp(doc.pendingSecret, code)) throw badRequest('El código no coincide. Revisa la hora del teléfono y prueba con el código nuevo.', 'mfa_bad_code');
  db().put('twoFactorSecrets', { id: user.id, secret: doc.pendingSecret, pendingSecret: null, updatedAt: nowIso() });
  const next = db().update('users', user.id, { twoFactor: { enabled: true, enabledAt: nowIso() } });
  appendEvent({ type: 'admin_action', objectType: 'system', objectId: 'admin', actor: { id: user.id, role: user.roles.includes('admin') ? 'admin' : user.roles[0], entityId: user.entityId ?? null }, data: { action: 'mfa_enabled', target: user.id } });
  return next;
}

export function checkTwoFactorCode(user: User, code: string): void {
  const doc = secretDoc(user.id);
  if (!user.twoFactor?.enabled || !doc?.secret) throw badRequest('La verificación en dos pasos no está configurada.', 'mfa_not_enabled');
  if (!verifyTotp(doc.secret, code)) throw badRequest('El código no coincide. Usa el código que muestra ahora tu aplicación.', 'mfa_bad_code');
}

/** Para la semilla de demostración: deja la verificación activa con un secreto conocido. */
export function seedTwoFactor(userId: string, secret: string): void {
  db().put('twoFactorSecrets', { id: userId, secret, pendingSecret: null, updatedAt: nowIso() });
  db().update('users', userId, { twoFactor: { enabled: true, enabledAt: nowIso() } });
}

/** Recuperación fuera de línea (script de servidor) si se pierde el teléfono. */
export function resetTwoFactor(userId: string): void {
  db().put('twoFactorSecrets', { id: userId, secret: null, pendingSecret: null, updatedAt: nowIso() });
  db().update('users', userId, { twoFactor: { enabled: false, enabledAt: null } });
}
