import type { LevelInfo, RaicesValues, User } from '@kindra/shared';
import { levelFor } from '@kindra/shared';
import { db, type Certificate } from '../core/db';
import { getConfig } from './config';
import { newCertificateCode, newId, nowIso } from '../core/ids';
import { notify, pickText } from './notifications';
import { appendEvent, SYSTEM_ACTOR } from '../core/events';

/** Addendum v4.2, 3.1: una entrada del libro de Raíces. Se deriva de la bitácora encadenada, nunca se guarda aparte. */
export interface RaicesEntry {
  at: string;
  module: string;
  action: string;
  label: string;
  code: string | null;
  validatorId: string | null;
  points: number;
  status: 'applied' | 'reversed' | 'capped';
  reason?: string | null;
  /** Hash del evento de la bitácora que respalda la entrada. */
  eventHash: string;
}

export interface PointsSummary {
  points: number;
  level: LevelInfo;
  consecutiveRejections: number;
  suspendedUntil: string | null;
  history: { at: string; delta: number; reason: string; applied: boolean }[];
  ledger: RaicesEntry[];
  closedReports: number;
  validatedReports: number;
  confirmedRemovals: number;
  lessonsCompleted: number;
  onSiteVerifications: number;
  validatedReferrals: number;
  accredited: number;
  streakWeeks: number;
  /** Momento en que se sumó cada hecho, por contador (para fechar los logros). */
  milestones: Record<'closedReports' | 'validatedReports' | 'confirmedRemovals' | 'lessonsCompleted' | 'onSiteVerifications' | 'validatedReferrals' | 'accredited' | 'streakWeeks', string[]>;
}

export const RAICES_LABELS: Record<keyof RaicesValues, string> = {
  reportValidated: 'Reporte validado',
  closureConfirmed: 'Cierre confirmado',
  reportFinalDestination: 'Tu reporte llegó a Destino Final',
  disputeValid: 'Disputa con razón',
  fieldVerification: 'Verificación en campo',
  disputeResolved: 'Disputa resuelta',
  accreditation: 'Acreditación de Contralor Comunitario',
  tripNoDiscrepancy: 'Viaje recibido sin diferencias',
  receptionWithin24h: 'Recepción completa en 24 h',
  massBalanceClosed: 'Balance de masa cerrado',
  testValidated: 'Ensayo registrado y validado',
  destinationReceipt: 'Recepción en destino registrada',
  lessonCompleted: 'Lección de Training completada',
  courseCompleted: 'Curso de Training completado',
  weeklyStreak: 'Semana activa consecutiva',
};

const caracasDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
/** Número de semana (lunes a domingo, hora de Venezuela) para las rachas. */
function weekKey(iso: string): number {
  const d = new Date(`${caracasDay(iso)}T00:00:00Z`);
  return Math.floor((d.getTime() / 86_400_000 + 3) / 7);
}

type Ev = { serverTime: string; hash: string; actorId: string | null };

/**
 * Raíces (addendum v4.2, 3.1). Un solo saldo por persona en todos los módulos, calculado desde la bitácora
 * encadenada. Solo suma cuando otra persona valida el hecho; nadie gana por lo que valida él mismo; topes diarios
 * configurables; si el registro se rechaza, se marca duplicado o se disputa con razón, la entrada se revierte con motivo.
 */
export function computePoints(userId: string): PointsSummary {
  const store = db();
  const r = getConfig().raices;
  const v = r.values;
  const ledger: RaicesEntry[] = [];
  const counters = { closedReports: 0, validatedReports: 0, confirmedRemovals: 0, lessonsCompleted: 0, onSiteVerifications: 0, validatedReferrals: 0, accredited: 0, streakWeeks: 0 };
  const milestones = Object.fromEntries(Object.keys(counters).map((k) => [k, [] as string[]])) as PointsSummary['milestones'];
  const bump = (k: keyof typeof counters, at: string) => {
    counters[k]++;
    milestones[k].push(at);
  };
  const perDay = new Map<string, number>();
  const byRecord = new Map<string, RaicesEntry>();
  const activeWeeks = new Set<number>();
  /** `validator` es quien valida el hecho; si es la misma persona, no hay Raíces. */
  const add = (e: Ev, validator: string | null, action: keyof RaicesValues, code: string | null, recordKey: string, module = 'debris') => {
    const points = v[action] ?? 0;
    if (!points || byRecord.has(recordKey)) return;
    if (validator && validator === userId) return;
    const dayKey = `${action}:${caracasDay(e.serverTime)}`;
    const cap = r.dailyCaps[action];
    const used = perDay.get(dayKey) ?? 0;
    const capped = cap != null && used >= cap;
    const entry: RaicesEntry = { at: e.serverTime, module, action, label: RAICES_LABELS[action], code, validatorId: validator, points, status: capped ? 'capped' : 'applied', reason: capped ? `tope diario de ${cap} alcanzado` : null, eventHash: e.hash };
    if (!capped) {
      perDay.set(dayKey, used + 1);
      activeWeeks.add(weekKey(e.serverTime));
    }
    ledger.push(entry);
    byRecord.set(recordKey, entry);
  };
  const reverse = (recordKey: string, e: Ev, reason: string) => {
    const entry = byRecord.get(recordKey);
    if (!entry || entry.status !== 'applied') return;
    entry.status = 'reversed';
    entry.reason = reason;
    ledger.push({ ...entry, at: e.serverTime, points: -entry.points, status: 'reversed', reason, validatorId: e.actorId, eventHash: e.hash });
  };
  const mine = (o: { reporterId?: string | null; anonymous: boolean } | undefined) => !!o && o.reporterId === userId && !o.anonymous;
  const lessons = store.list('lessons');
  const validatedBy = new Map<string, string | null>();

  for (const e of store.allEvents()) {
    const d = e.data as Record<string, any>;
    switch (e.type) {
      case 'origin_validated': {
        const o = store.get('origins', e.objectId);
        validatedBy.set(e.objectId, e.actorId);
        // Sin foto: no cuenta como validado hasta que un Contralor lo confirme en campo.
        if (mine(o) && (o!.photoIds.length > 0 || !!o!.verifiedOnSiteAt)) {
          bump('validatedReports', e.serverTime);
          add(e, e.actorId, 'reportValidated', o!.code, `rv:${e.objectId}`);
        }
        break;
      }
      case 'origin_verified_on_site': {
        const o = store.get('origins', e.objectId);
        if (e.actorId === userId && o?.reporterId !== userId) {
          bump('onSiteVerifications', e.serverTime);
          add(e, null, 'fieldVerification', o?.code ?? null, `fv:${e.objectId}`);
        }
        if (mine(o) && !o!.photoIds.length && validatedBy.has(e.objectId)) {
          bump('validatedReports', e.serverTime);
          add(e, e.actorId, 'reportValidated', o!.code, `rv:${e.objectId}`);
        }
        break;
      }
      case 'origin_rejected':
      case 'origin_marked_duplicate': {
        const o = store.get('origins', e.objectId);
        if (mine(o)) reverse(`rv:${e.objectId}`, e, e.type === 'origin_rejected' ? 'reporte rechazado' : 'reporte marcado como duplicado');
        break;
      }
      case 'removal_confirmed': {
        const o = store.get('origins', e.objectId);
        // El cierre lo propuso otra persona (Ente de Retiro); la confirmación del ciudadano lo valida.
        if (mine(o)) {
          bump('confirmedRemovals', e.serverTime);
          add(e, null, 'closureConfirmed', o!.code, `cc:${e.objectId}`);
        }
        break;
      }
      case 'dispute_resolved': {
        const o = store.get('origins', e.objectId);
        if (d.result === 'reopened') {
          if (mine(o)) add(e, e.actorId, 'disputeValid', o!.code, `dv:${e.objectId}:${e.serverTime}`);
          // Disputa con razón: se revierten las Raíces de los viajes de ese punto.
          for (const tid of o?.tripIds ?? []) reverse(`trip:${tid}`, e, `disputa con razón en ${o!.code}`);
        }
        if (e.actorId === userId && e.actorRole === 'monitor' && o?.reporterId !== userId) add(e, null, 'disputeResolved', o?.code ?? null, `dr:${e.objectId}:${e.serverTime}`);
        break;
      }
      case 'monitor_request_decided': {
        if (e.objectId === userId && d.status === 'approved') {
          bump('accredited', e.serverTime);
          add(e, e.actorId, 'accreditation', null, 'accreditation');
        }
        break;
      }
      case 'trip_arrival': {
        const trip = store.get('trips', e.objectId);
        if (!trip) break;
        const rec = d.reception as { quantityCheck?: { flagged?: boolean } | null } | undefined;
        // Quien confirma la llegada valida el viaje: nadie gana por confirmar su propio viaje.
        if (trip.departure.userId === userId && !rec?.quantityCheck?.flagged) add(e, e.actorId, 'tripNoDiscrepancy', trip.code, `trip:${trip.id}`);
        if (e.actorId === userId && trip.departure.userId !== userId && Date.parse(e.serverTime) - Date.parse(trip.departure.serverTime) <= 86_400_000) add(e, trip.departure.userId, 'receptionWithin24h', trip.code, `rec:${trip.id}`);
        break;
      }
      case 'quality_verified': {
        const b = store.get('batches', e.objectId);
        const ver = d.verification as { result?: string } | undefined;
        if (!b || ver?.result !== 'approved') break;
        const outputs = store.allEvents().find((x) => x.type === 'outputs_recorded' && x.objectId === b.id);
        if (outputs?.actorId === userId) add(e, e.actorId, 'massBalanceClosed', b.code, `mb:${b.id}`);
        // El ensayo validado cuenta cuando el lote sigue a destino (otro actor lo despacha).
        break;
      }
      case 'dispatch_created': {
        const b = store.get('batches', e.objectId);
        const ver = b?.qualityVerificationId ? store.get('qualityVerifications', b.qualityVerificationId) : undefined;
        if (ver?.evaluatorId === userId && ver.result === 'approved') add(e, e.actorId, 'testValidated', b!.code, `tv:${b!.id}`);
        break;
      }
      case 'dispatch_received': {
        if (e.actorId === userId) add(e, null, 'destinationReceipt', null, `dest:${e.objectId}:${e.serverTime}`);
        break;
      }
      case 'final_closure_sent': {
        const o = store.get('origins', e.objectId);
        if (mine(o)) {
          bump('closedReports', e.serverTime);
          add(e, null, 'reportFinalDestination', o!.code, `fd:${e.objectId}`);
        }
        break;
      }
      case 'lesson_completed': {
        if (e.objectType === 'user' && e.objectId === userId) {
          if (d.course) add(e, null, 'courseCompleted', String(d.courseTitle ?? d.courseKey), `course:${d.courseKey}`, 'training');
          else {
            bump('lessonsCompleted', e.serverTime);
            add(e, null, 'lessonCompleted', lessons.find((l) => l.id === d.lessonId)?.title ?? null, `lesson:${d.lessonId}`, 'training');
          }
        }
        break;
      }
      default:
        break;
    }
  }
  // Rachas: cada semana activa que sigue a otra semana activa suma una vez.
  const weeks = [...activeWeeks].sort((a, b) => a - b);
  let run = 0;
  const now = nowIso();
  for (let i = 0; i < weeks.length; i++) {
    run = i > 0 && weeks[i] === weeks[i - 1] + 1 ? run + 1 : 1;
    counters.streakWeeks = Math.max(counters.streakWeeks, run);
    if (run < 2) continue;
    // Se acredita al cerrar la semana (domingo, fin del día).
    const at = new Date(((weeks[i] + 1) * 7 - 3) * 86_400_000 + 4 * 3_600_000 - 1000).toISOString();
    if (at > now) continue;
    ledger.push({ at, module: 'kindra', action: 'weeklyStreak', label: RAICES_LABELS.weeklyStreak, code: null, validatorId: null, points: v.weeklyStreak, status: 'applied', reason: `${run} semanas seguidas`, eventHash: '' });
    if (run === 4) milestones.streakWeeks.push(at);
  }
  ledger.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  // Una entrada revertida conserva su valor original; la línea de reversión lo resta.
  const points = Math.max(0, ledger.reduce((s, x) => s + (x.status === 'capped' ? 0 : x.points), 0));
  const history = ledger.map((x) => ({
    at: x.at,
    delta: x.status === 'capped' ? 0 : x.points,
    reason: `${x.label}${x.code ? ` (${x.code})` : ''}${x.points < 0 ? `: revertido, ${x.reason}` : x.status === 'capped' ? `: ${x.reason}` : x.reason && x.action === 'weeklyStreak' ? ` · ${x.reason}` : ''}`,
    applied: x.status !== 'capped',
  }));
  return {
    points,
    level: levelFor(points, r.levels),
    consecutiveRejections: 0,
    suspendedUntil: null,
    history,
    ledger,
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
  // Certificado al llegar a los dos niveles superiores de Kindra.
  const levels = getConfig().raices.levels;
  const certLevels = levels.slice(-2).map((l) => l.key);
  if (levels.length < 2 || !certLevels.includes(summary.level.key)) return null;
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
