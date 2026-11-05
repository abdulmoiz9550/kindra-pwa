import type { LevelInfo, User } from '@kindra/shared';
import { levelFor } from '@kindra/shared';
import { db, type Certificate } from '../core/db';
import { getConfig } from './config';
import { newCertificateCode, newId, nowIso } from '../core/ids';
import { notify, pickText } from './notifications';
import { appendEvent, SYSTEM_ACTOR } from '../core/events';

export interface PointsSummary {
  points: number;
  level: LevelInfo;
  consecutiveRejections: number;
  suspendedUntil: string | null;
  history: { at: string; delta: number; reason: string; applied: boolean }[];
  closedReports: number;
  validatedReports: number;
  confirmedRemovals: number;
  lessonsCompleted: number;
  onSiteVerifications: number;
  validatedReferrals: number;
  /** Momento en que se sumó cada hecho, por contador (para fechar los logros). */
  milestones: Record<'closedReports' | 'validatedReports' | 'confirmedRemovals' | 'lessonsCompleted' | 'onSiteVerifications' | 'validatedReferrals', string[]>;
}

/**
 * Puntos y nivel calculados desde la bitácora (9.1–9.3). Nunca se guardan: se derivan.
 * Solo suman hechos verificados por otro actor; reportar no da puntos.
 */
export function computePoints(userId: string): PointsSummary {
  const store = db();
  const cfg = getConfig();
  const p = cfg.points;
  const history: PointsSummary['history'] = [];
  let points = 0;
  let consecutive = 0;
  let suspendedUntil: string | null = null;
  const counters = { closedReports: 0, validatedReports: 0, confirmedRemovals: 0, lessonsCompleted: 0, onSiteVerifications: 0, validatedReferrals: 0 };
  const milestones: PointsSummary['milestones'] = { closedReports: [], validatedReports: [], confirmedRemovals: [], lessonsCompleted: [], onSiteVerifications: [], validatedReferrals: [] };
  const bump = (k: keyof typeof counters, at: string) => {
    counters[k]++;
    milestones[k].push(at);
  };
  // Referidos: solo cuenta el primer reporte validado de cada persona invitada (nunca el registro).
  const invited = new Set(store.filter('users', (u) => u.referredBy === userId).map((u) => u.id));
  const firstValidatedSeen = new Set<string>();

  const add = (at: string, delta: number, reason: string) => {
    const suspended = !!suspendedUntil && at < suspendedUntil && delta > 0;
    const applied = !suspended;
    if (applied) points = Math.max(0, points + delta);
    history.push({ at, delta, reason, applied });
  };

  for (const e of store.allEvents()) {
    const d = e.data as Record<string, any>;
    switch (e.type) {
      case 'origin_validated': {
        const o = store.get('origins', e.objectId);
        if (o?.reporterId === userId && !o.anonymous) {
          consecutive = 0;
          bump('validatedReports', e.serverTime);
          add(e.serverTime, p.reportValidated, 'Reporte validado por el coordinador');
        }
        if (o?.reporterId && !o.anonymous && !firstValidatedSeen.has(o.reporterId)) {
          firstValidatedSeen.add(o.reporterId);
          if (invited.has(o.reporterId)) {
            bump('validatedReferrals', e.serverTime);
            add(e.serverTime, p.referralValidated, 'Primer reporte validado de una persona que invitaste');
          }
        }
        break;
      }
      case 'origin_rejected': {
        const o = store.get('origins', e.objectId);
        if (o?.reporterId === userId && !o.anonymous) {
          consecutive++;
          if (d.reason === 'false' || d.reason === 'duplicate_intentional') add(e.serverTime, -p.rejectionPenalty, 'Reporte rechazado como falso o duplicado intencional');
          else history.push({ at: e.serverTime, delta: 0, reason: 'Reporte rechazado', applied: true });
          if (consecutive >= p.suspensionAfterRejections) {
            const until = new Date(new Date(e.serverTime).getTime() + p.suspensionDays * 86_400_000).toISOString();
            suspendedUntil = until;
            consecutive = 0;
            history.push({ at: e.serverTime, delta: 0, reason: `Suma de puntos suspendida ${p.suspensionDays} días por rechazos consecutivos`, applied: true });
          }
        }
        break;
      }
      case 'removal_confirmed': {
        const c = store.get('closures', d.closureId);
        const o = c ? store.get('origins', c.originId) : undefined;
        if (o?.reporterId === userId && !o.anonymous) {
          bump('confirmedRemovals', e.serverTime);
          add(e.serverTime, p.removalConfirmed, 'Retiro confirmado por el ciudadano');
        }
        break;
      }
      case 'final_closure_sent': {
        const o = store.get('origins', e.objectId);
        if (o?.reporterId === userId && !o.anonymous) {
          bump('closedReports', e.serverTime);
          add(e.serverTime, p.finalClosure, 'Cierre final de un reporte propio');
        }
        break;
      }
      case 'lesson_completed': {
        if (e.objectType === 'user' && e.objectId === userId) {
          bump('lessonsCompleted', e.serverTime);
          add(e.serverTime, p.lessonCompleted, 'Lección completada');
        }
        break;
      }
      case 'origin_verified_on_site': {
        if (e.actorId === userId) {
          bump('onSiteVerifications', e.serverTime);
          add(e.serverTime, p.onSiteVerification, 'Verificación en sitio como contralor comunitario');
        }
        break;
      }
      default:
        break;
    }
  }
  const now = nowIso();
  return {
    points,
    level: levelFor(points, cfg.levels),
    consecutiveRejections: consecutive,
    suspendedUntil: suspendedUntil && suspendedUntil > now ? suspendedUntil : null,
    history,
    ...counters,
    milestones,
  };
}

const lastKnownLevel = new Map<string, string>();

/**
 * Tras cualquier hecho que cambie puntos: avisa si subió de nivel (15.1) y genera certificado (9.7).
 */
export function refreshRecognition(userId: string): void {
  const store = db();
  const user = store.get('users', userId);
  if (!user) return;
  const summary = computePoints(userId);
  const prev = lastKnownLevel.get(userId);
  lastKnownLevel.set(userId, summary.level.key);
  if (prev && prev !== summary.level.key) {
    notify({ recipientKeys: [`user:${userId}`], kind: 'level_reached', text: pickText('level_reached', { nivel: summary.level.name }), link: '/perfil' });
  }
  ensureCertificate(user, summary);
}

export function ensureCertificate(user: User, summary: PointsSummary): Certificate | null {
  const store = db();
  const certLevels = ['vigilante', 'contralor'];
  if (!certLevels.includes(summary.level.key)) return null;
  const existing = store.find('certificates', (c) => c.userId === user.id && c.levelKey === summary.level.key);
  if (existing) return existing;
  const cert: Certificate = {
    id: newId('cert'),
    code: newCertificateCode(),
    userId: user.id,
    alias: user.alias,
    levelKey: summary.level.key,
    levelName: summary.level.name,
    closedReports: summary.closedReports,
    issuedAt: nowIso(),
  };
  store.put('certificates', cert);
  return cert;
}

export function certificateFor(userId: string): Certificate | null {
  const certs = db().filter('certificates', (c) => c.userId === userId);
  if (!certs.length) return null;
  return certs.sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : -1))[0];
}

/** Aviso respetuoso de suspensión de puntos (9.2). Se llama desde el rechazo. */
export function maybeNotifySuspension(userId: string): void {
  const summary = computePoints(userId);
  if (!summary.suspendedUntil) return;
  const last = summary.history[summary.history.length - 1];
  if (last && last.reason.startsWith('Suma de puntos suspendida')) {
    const cfg = getConfig();
    appendEvent({ type: 'points_suspended', objectType: 'user', objectId: userId, actor: SYSTEM_ACTOR, data: { until: summary.suspendedUntil }, silent: true });
    notify({ recipientKeys: [`user:${userId}`], kind: 'points_suspended', text: pickText('points_suspended', { días: cfg.points.suspensionDays }), link: '/perfil' });
  }
}
