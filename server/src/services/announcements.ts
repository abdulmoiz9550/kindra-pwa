import type { Notification, User } from '@kindra/shared';
import { isoDay } from '@kindra/shared';
import { db } from '../core/db';
import { appendEvent, SYSTEM_ACTOR, type Actor } from '../core/events';
import { nowIso } from '../core/ids';
import { badRequest, notFound } from '../core/errors';
import { notify, pickText, containsForbiddenExpression } from './notifications';
import { isFeatureOn } from './features';

/**
 * Avisos comunitarios por proximidad (addendum, parte 1): se avisa a los vecinos de un sector
 * cuando hay orígenes asignados para retiro. Destinatarios: personas con cuenta cuyo sector de residencia es ese.
 * Cada vecino recibe su propia copia (para que "leído" sea individual) y queda una copia con la clave
 * del sector como historial para el coordinador.
 */
export const sectorKey = (sectorId: string) => `sector:${sectorId}`;

const ASSIGNED_STATES = new Set(['validated', 'under_removal']);

function residents(sectorId: string): User[] {
  return db().filter('users', (u) => u.active && u.sectorId === sectorId);
}

/**
 * Llamado cuando un origen entra en la lista de retiro. Para no saturar a los vecinos
 * se envía un solo aviso automático por sector y por día, con la cuenta actual.
 */
export function announceSectorAssigned(sectorId: string): Notification[] {
  if (!isFeatureOn('community_announcements')) return [];
  const store = db();
  const sector = store.get('sectors', sectorId);
  if (!sector) return [];
  const today = isoDay(nowIso());
  const already = store.find('notifications', (n) => n.recipientKey === sectorKey(sectorId) && n.kind === 'sector_assigned' && isoDay(n.createdAt) === today);
  if (already) return [];
  const count = store.filter('origins', (o) => o.sectorId === sectorId && ASSIGNED_STATES.has(o.state)).length;
  if (!count) return [];
  const text = pickText('sector_assigned', { sector: sector.name, número: count }, sectorId);
  appendEvent({ type: 'sector_announcement', objectType: 'system', objectId: `sector:${sectorId}`, actor: SYSTEM_ACTOR, data: { sectorId, kind: 'sector_assigned', count, automatic: true }, silent: true });
  return notify({ recipientKeys: [sectorKey(sectorId), ...residents(sectorId).map((u) => `user:${u.id}`)], kind: 'sector_assigned', text, link: '/tablero', sectorName: sector.name });
}

/** Aviso manual del coordinador a un sector (mismo canal). */
export function sendSectorAnnouncement(actor: Actor, sectorId: string, text: string): { notifications: Notification[]; residents: number } {
  if (!isFeatureOn('community_announcements')) throw badRequest('Los avisos comunitarios están apagados.');
  const sector = db().get('sectors', sectorId);
  if (!sector) throw notFound('El sector no existe.');
  const clean = text.trim();
  if (clean.length < 10) throw badRequest('Escribe un aviso de al menos 10 caracteres.');
  if (clean.length > 400) throw badRequest('El aviso no puede pasar de 400 caracteres.');
  const bad = containsForbiddenExpression(clean);
  if (bad) throw badRequest(`El texto contiene una expresión prohibida: "${bad}" (8.3).`);
  appendEvent({ type: 'sector_announcement', objectType: 'system', objectId: `sector:${sectorId}`, actor, data: { sectorId, kind: 'manual', text: clean } });
  const people = residents(sectorId);
  notify({ recipientKeys: [sectorKey(sectorId), ...people.map((u) => `user:${u.id}`)], kind: 'sector_announcement', text: clean, link: null, sectorName: sector.name });
  return { notifications: listSectorAnnouncements(sectorId).slice(0, 1), residents: people.length };
}

export function listSectorAnnouncements(sectorId?: string | null): Notification[] {
  return db()
    .filter('notifications', (n) => n.recipientKey.startsWith('sector:') && (!sectorId || n.recipientKey === sectorKey(sectorId)))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 50);
}

export const residentCount = (sectorId: string) => residents(sectorId).length;
