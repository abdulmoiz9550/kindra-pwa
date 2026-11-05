import type { ReferralSummary, User } from '@kindra/shared';
import { CODE_ALPHABET } from '@kindra/shared';
import { customAlphabet } from 'nanoid';
import { db } from '../core/db';
import { env } from '../config/env';
import { notify, pickText } from './notifications';
import { computePoints, refreshRecognition } from './points';
import { isFeatureOn } from './features';

/** Debe coincidir con el motivo que escribe computePoints para los referidos. */
export const REFERRAL_REASON = 'Primer reporte validado de una persona que invitaste';

const refGen = customAlphabet(CODE_ALPHABET, 6);
const cardGen = customAlphabet(CODE_ALPHABET, 4);

/** Asigna, si faltan, el código de tarjeta Kindra y el código de invitación (usuarios creados antes del addendum). */
export function ensureUserCodes(user: User): User {
  const store = db();
  const patch: Partial<User> = {};
  if (!user.cardCode) patch.cardCode = newCardCode();
  if (!user.referralCode) patch.referralCode = newReferralCode();
  if (!Object.keys(patch).length) return user;
  return store.update('users', user.id, patch);
}

export function newCardCode(): string {
  for (let i = 0; i < 50; i++) {
    const c = `KC-${cardGen()}-${cardGen()}`;
    if (!db().find('users', (u) => u.cardCode === c)) return c;
  }
  return `KC-${cardGen()}${cardGen()}-${cardGen()}${cardGen()}`;
}

export function newReferralCode(): string {
  for (let i = 0; i < 50; i++) {
    const c = `INV-${refGen()}`;
    if (!db().find('users', (u) => u.referralCode === c)) return c;
  }
  return `INV-${refGen()}${refGen()}`;
}

/** Busca a quien invita. Acepta el código con o sin prefijo y en cualquier caja. */
export function findReferrer(code: string | null | undefined): User | undefined {
  if (!code?.trim()) return undefined;
  const raw = code.trim().toUpperCase();
  const norm = raw.startsWith('INV-') ? raw : `INV-${raw}`;
  return db().find('users', (u) => u.active && u.referralCode === norm);
}

/**
 * Tras validar un reporte: si es el primero validado de una persona invitada, avisa a quien la invitó.
 * Los puntos se derivan de la bitácora en computePoints; aquí solo se refresca y se notifica.
 */
export function rewardReferrerIfFirstValidated(reporterId: string, originId: string): void {
  if (!isFeatureOn('referrals')) return;
  const store = db();
  const reporter = store.get('users', reporterId);
  if (!reporter?.referredBy) return;
  const validatedEvents = store.allEvents().filter((e) => e.type === 'origin_validated' && store.get('origins', e.objectId)?.reporterId === reporterId);
  if (validatedEvents.length !== 1 || validatedEvents[0].objectId !== originId) return;
  const referrer = store.get('users', reporter.referredBy);
  if (!referrer?.active) return;
  refreshRecognition(referrer.id);
  notify({ recipientKeys: [`user:${referrer.id}`], kind: 'referral_validated', text: pickText('referral_validated', { alias: reporter.alias }), link: '/perfil' });
}

export function referralSummary(user: User): ReferralSummary {
  const u = ensureUserCodes(user);
  const invitedUsers = db().filter('users', (x) => x.referredBy === u.id);
  const pts = computePoints(u.id);
  return {
    referralCode: u.referralCode!,
    shareUrl: `${env.publicBaseUrl}/registro?ref=${encodeURIComponent(u.referralCode!)}`,
    invited: invitedUsers.length,
    validated: pts.validatedReferrals,
    pointsEarned: pts.history.filter((h) => h.applied && h.reason === REFERRAL_REASON).reduce((sum, h) => sum + h.delta, 0),
  };
}
