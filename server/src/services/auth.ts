import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { PublicUser, Role, User } from '@kindra/shared';
import { INSTITUTIONAL_ROLES, DEFAULT_SPACE_ID } from '@kindra/shared';
import { db } from '../core/db';
import { env } from '../config/env';
import { newId, nowIso } from '../core/ids';
import { badRequest, forbidden, notFound, unauthorized } from '../core/errors';
import { computePoints } from './points';
import { getConfig } from './config';
import { assertFeature, isFeatureOn } from './features';
import { findReferrer, newCardCode, newReferralCode } from './referrals';
import { spaceOfSector } from './spaces';
import { checkTwoFactorCode } from './twoFactor';

export interface TokenPayload {
  userId: string;
  activeRole: Role;
  /** La sesión completó la verificación en dos pasos. */
  mfa?: boolean;
}

export const hashPassword = (pw: string) => bcrypt.hashSync(pw, 8);
export const checkPassword = (pw: string, hash?: string) => !!hash && bcrypt.compareSync(pw, hash);

export function issueToken(userId: string, activeRole: Role, mfa = false): string {
  // Una sesión verificada en dos pasos dura menos: 12 horas.
  return jwt.sign({ userId, activeRole, mfa } satisfies TokenPayload, env.jwtSecret, { expiresIn: mfa ? '12h' : '30d' });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, env.jwtSecret) as TokenPayload;
  } catch {
    return null;
  }
}

export function toPublicUser(user: User, activeRole: Role, mfa = false): PublicUser {
  const { passwordHash: _ph, ...rest } = user;
  const pts = computePoints(user.id);
  const entity = user.entityId ? db().get('entities', user.entityId) : undefined;
  return {
    ...rest,
    activeRole,
    points: pts.points,
    level: pts.level,
    consecutiveRejections: pts.consecutiveRejections,
    suspendedUntil: pts.suspendedUntil,
    entityName: entity?.name ?? null,
    mfa,
  };
}

function defaultRole(user: User): Role {
  const order: Role[] = ['admin', 'entity_admin', 'coordinator', 'removal', 'center', 'evaluator', 'supervisor', 'destination', 'monitor', 'citizen'];
  for (const r of order) if (user.roles.includes(r)) return r;
  return 'citizen';
}

export function login(identifier: string, password: string): { token: string; user: PublicUser } {
  const id = identifier.trim().toLowerCase();
  const digits = id.replace(/\D/g, '');
  const user = db().find('users', (u) => u.active && (u.alias.toLowerCase() === id || (digits.length >= 7 && (u.phone || '').replace(/\D/g, '') === digits)));
  if (!user || !checkPassword(password, user.passwordHash)) throw unauthorized('Alias o contraseña incorrectos.');
  const role = defaultRole(user);
  return { token: issueToken(user.id, role), user: toPublicUser(user, role) };
}

export function registerCitizen(input: { alias: string; password: string; phone?: string; name?: string; sectorId?: string | null; referralCode?: string | null }): { token: string; user: PublicUser } {
  const alias = input.alias.trim();
  if (alias.length < 3) throw badRequest('El alias debe tener al menos 3 caracteres.');
  if (input.password.length < 6) throw badRequest('La contraseña debe tener al menos 6 caracteres.');
  if (db().find('users', (u) => u.alias.toLowerCase() === alias.toLowerCase())) throw badRequest('Ese alias ya está en uso. Elige otro.');
  // Referidos (addendum, parte 2): se guarda quién invitó; los puntos llegan solo cuando el primer reporte se valida.
  let referredBy: string | null = null;
  if (input.referralCode?.trim() && isFeatureOn('referrals')) {
    const referrer = findReferrer(input.referralCode);
    if (!referrer) throw badRequest('Ese código de invitación no existe. Revísalo o deja el campo vacío.', 'bad_referral');
    referredBy = referrer.id;
  }
  const user: User = {
    id: newId('us'),
    alias,
    name: input.name?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    roles: ['citizen'],
    entityId: null,
    centerId: null,
    sectorId: input.sectorId ?? null,
    passwordHash: hashPassword(input.password),
    verificationStatus: 'not_required',
    active: true,
    createdAt: nowIso(),
    spaceId: input.sectorId ? spaceOfSector(input.sectorId) : DEFAULT_SPACE_ID,
    cardCode: newCardCode(),
    referralCode: newReferralCode(),
    referredBy,
  };
  db().put('users', user);
  return { token: issueToken(user.id, 'citizen'), user: toPublicUser(user, 'citizen') };
}

/** 18.4: pre-registro por código para personas sin teléfono. El código actúa como credencial. */
export function loginWithPreregCode(code: string): { token: string; user: PublicUser } {
  assertFeature('preregistration');
  const store = db();
  const c = store.get('preregistrationCodes', code.trim().toUpperCase());
  if (!c) throw notFound('Ese código de pre-registro no existe.');
  let user = c.userId ? store.get('users', c.userId) : undefined;
  if (!user) {
    user = {
      id: newId('us'),
      alias: c.alias,
      roles: ['citizen'],
      entityId: null,
      centerId: null,
      sectorId: null,
      verificationStatus: 'not_required',
      preregCode: c.code,
      active: true,
      createdAt: nowIso(),
    };
    store.put('users', user);
    store.put('preregistrationCodes', { ...c, used: true, userId: user.id });
  }
  return { token: issueToken(user.id, 'citizen'), user: toPublicUser(user, 'citizen') };
}

export function switchActiveRole(user: User, role: Role, mfa = false): { token: string; user: PublicUser } {
  if (!user.roles.includes(role)) throw forbidden('No tienes ese rol activado.');
  if (INSTITUTIONAL_ROLES.includes(role) || role === 'monitor') {
    if (user.verificationStatus !== 'verified') throw forbidden('Este rol requiere completar la verificación de identidad.');
  }
  return { token: issueToken(user.id, role, mfa), user: toPublicUser(user, role, mfa) };
}

/** Segundo paso: con el código de la aplicación, la sesión queda verificada (requisito del administrador principal). */
export function completeTwoFactor(user: User, activeRole: Role, code: string): { token: string; user: PublicUser } {
  checkTwoFactorCode(user, code);
  return { token: issueToken(user.id, activeRole, true), user: toPublicUser(user, activeRole, true) };
}

export function sessionAfterEnable(user: User, activeRole: Role): { token: string; user: PublicUser } {
  return { token: issueToken(user.id, activeRole, true), user: toPublicUser(user, activeRole, true) };
}

/** 19.3: cambio rápido entre usuarios de prueba, uno por rol. Solo en modo demo. */
export function demoSwitch(role: Role): { token: string; user: PublicUser } {
  if (!getConfig().demoMode) throw forbidden('El cambio rápido de rol solo está disponible en modo demostración.');
  const user = db().find('users', (u) => !!u.isDemo && u.roles.includes(role) && u.active);
  if (!user) throw notFound(`No hay usuario de prueba para el rol ${role}.`);
  return { token: issueToken(user.id, role), user: toPublicUser(user, role) };
}

export function submitSelfie(user: User, photoId: string): PublicUser {
  const p = db().get('photos', photoId);
  if (!p) throw badRequest('La foto no existe.');
  const next = db().update('users', user.id, { selfiePhotoId: photoId, verificationStatus: 'pending' });
  return toPublicUser(next, defaultRole(next));
}

export function listDemoRoles(): { role: Role; alias: string }[] {
  if (!getConfig().demoMode) return [];
  const out: { role: Role; alias: string }[] = [];
  const roles: Role[] = ['citizen', 'monitor', 'coordinator', 'removal', 'center', 'evaluator', 'supervisor', 'destination', 'entity_admin', 'admin'];
  for (const r of roles) {
    const u = db().find('users', (x) => !!x.isDemo && x.roles.includes(r) && x.active);
    if (u) out.push({ role: r, alias: u.alias });
  }
  return out;
}
