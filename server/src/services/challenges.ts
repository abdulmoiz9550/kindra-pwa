import type { EcoChallenge, Role, User } from '@kindra/shared';
import { db } from '../core/db';
import { appendEvent, type Actor } from '../core/events';
import { newId, nowIso } from '../core/ids';
import { badRequest, conflict, forbidden, notFound } from '../core/errors';
import { assertFeature } from './features';
import { effectiveStatus } from './pickups';

/** Retos ecológicos (v4.0, 25.3): apagados hasta que el proyecto apruebe cada campaña. El avance sale solo de hechos verificados. */

const day = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });

function progressOf(c: EcoChallenge, u: User): number {
  const store = db();
  const joinedAt = c.participants.find((p) => p.userId === u.id)?.joinedAt;
  if (!joinedAt) return 0;
  const inRange = (iso: string | null | undefined) => !!iso && iso >= joinedAt && day(iso) >= c.startDate && day(iso) <= c.endDate;
  if (c.metric === 'pickups') return store.filter('pickupRequests', (r) => (r.requesterUserId === u.id || (!!r.businessId && r.businessId === u.businessId)) && effectiveStatus(r) === 'completed' && inRange(r.validatedAt)).length;
  return store.allEvents().filter((e) => {
    if (!inRange(e.serverTime)) return false;
    if (c.metric === 'lessons') return e.type === 'lesson_completed' && e.actorId === u.id;
    if (e.type !== 'origin_validated') return false;
    const o = store.get('origins', e.objectId);
    return o?.reporterId === u.id && !o.anonymous;
  }).length;
}

const isOpen = (c: EcoChallenge) => {
  const today = day(nowIso());
  return c.published && !!c.approvalReference && c.startDate <= today && c.endDate >= today;
};

export function listChallenges(u: User, role: Role) {
  assertFeature('eco_challenges');
  return db()
    .filter('ecoChallenges', (c) => c.published && !!c.approvalReference && (c.audience.length === 0 || c.audience.includes(role)))
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1))
    .map((c) => {
      const { participants, ...rest } = c;
      return { ...rest, open: isOpen(c), joined: participants.some((p) => p.userId === u.id), participantCount: participants.length, progress: Math.min(progressOf(c, u), c.target) };
    });
}

export function joinChallenge(u: User, role: Role, id: string): void {
  assertFeature('eco_challenges');
  const c = db().get('ecoChallenges', id);
  if (!c || !c.published) throw notFound('El reto no existe.');
  if (c.audience.length && !c.audience.includes(role)) throw forbidden('Este reto no es para tu perfil.');
  if (!isOpen(c)) throw conflict('El reto no está abierto.');
  if (c.participants.some((p) => p.userId === u.id)) return;
  db().update('ecoChallenges', id, { participants: [...c.participants, { userId: u.id, joinedAt: nowIso() }] });
}

export function upsertChallenge(actor: Actor, input: Omit<EcoChallenge, 'id' | 'participants' | 'updatedAt'> & { id?: string }): EcoChallenge {
  const store = db();
  const existing = input.id ? store.get('ecoChallenges', input.id) : undefined;
  if (input.id && !existing) throw notFound('El reto no existe.');
  if (input.endDate < input.startDate) throw badRequest('La fecha final es anterior a la inicial.');
  if (input.published && !input.approvalReference?.trim()) throw badRequest('Para publicar un reto indica la referencia de aprobación.');
  if (existing?.participants.length && (existing.metric !== input.metric || existing.target !== input.target)) throw conflict('El reto ya tiene participantes: su meta no se cambia.');
  const c: EcoChallenge = { ...input, id: existing?.id || newId('ec'), participants: existing?.participants ?? [], updatedAt: nowIso() };
  store.put('ecoChallenges', c);
  appendEvent({ type: 'governance_action', objectType: 'system', objectId: 'governance', actor, data: { action: 'eco_challenge_saved', target: c.id, published: c.published, approvalReference: c.approvalReference }, silent: true });
  return c;
}
