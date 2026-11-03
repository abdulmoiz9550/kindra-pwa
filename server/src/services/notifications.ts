import type { Notification, Origin, Role } from '@kindra/shared';
import { fillTemplate, FORBIDDEN_EXPRESSIONS } from '@kindra/shared';
import { db } from '../core/db';
import { newId, nowIso } from '../core/ids';
import { getAuraText } from './config';
import { reporterKeys } from '../core/projections';
import { broadcast } from '../realtime/sse';

const rotation = new Map<string, number>();

/**
 * Elige una variante del texto (8.3: al menos tres versiones rotadas) y rellena los marcadores.
 * Nunca inventa datos: los valores vienen siempre de quien llama, que los lee de la base.
 */
export function pickText(key: string, vars: Record<string, string | number | null | undefined> = {}, rotationKey?: string): string {
  const entry = getAuraText(key);
  if (!entry || !entry.variants.length) return `[texto "${key}" no configurado]`;
  const rk = rotationKey ? `${rotationKey}:${key}` : key;
  const idx = rotation.get(rk) ?? -1;
  const next = (idx + 1) % entry.variants.length;
  rotation.set(rk, next);
  return fillTemplate(entry.variants[next], vars);
}

export function containsForbiddenExpression(text: string): string | null {
  const lower = text.toLowerCase();
  for (const f of FORBIDDEN_EXPRESSIONS) if (lower.includes(f.toLowerCase())) return f;
  if (/[\u{1F389}\u{1F38A}\u{1F973}\u{1F3C6}\u{1F947}]/u.test(text)) return 'emoji de celebración';
  return null;
}

export interface NotifyInput {
  recipientKeys: string[];
  kind: string;
  text: string;
  link?: string | null;
  originCode?: string | null;
  sectorName?: string | null;
}

export function notify(input: NotifyInput): Notification[] {
  const store = db();
  const out: Notification[] = [];
  for (const key of new Set(input.recipientKeys)) {
    const n: Notification = {
      id: newId('nt'),
      recipientKey: key,
      kind: input.kind,
      text: input.text,
      link: input.link ?? null,
      createdAt: nowIso(),
      readAt: null,
      originCode: input.originCode ?? null,
      sectorName: input.sectorName ?? null,
    };
    store.put('notifications', n);
    out.push(n);
  }
  broadcast({ type: 'notification', objectType: 'system', objectId: input.kind, chainId: 'system', at: nowIso(), seq: 0 });
  return out;
}

/** Mensaje a quien reportó un origen (cuenta o código) y a los reportantes de sus duplicados. */
export function notifyOrigin(origin: Origin, kind: string, text: string, link?: string | null): Notification[] {
  const keys = [...reporterKeys(origin), ...origin.linkedReporterKeys];
  const sector = db().get('sectors', origin.sectorId);
  return notify({ recipientKeys: keys, kind, text, link: link ?? `/reporte/${origin.code}`, originCode: origin.code, sectorName: sector?.name ?? null });
}

/** Mensaje a todos los usuarios activos con un rol (y opcionalmente de una entidad o centro). */
export function notifyRole(role: Role, kind: string, text: string, opts: { entityId?: string | null; centerId?: string | null; link?: string | null } = {}): Notification[] {
  const users = db().filter('users', (u) => u.active && u.roles.includes(role) && (!opts.entityId || u.entityId === opts.entityId) && (!opts.centerId || u.centerId === opts.centerId));
  if (!users.length) return [];
  return notify({ recipientKeys: users.map((u) => `user:${u.id}`), kind, text, link: opts.link ?? null });
}

export function listNotifications(keys: string[]): Notification[] {
  const set = new Set(keys);
  return db()
    .filter('notifications', (n) => set.has(n.recipientKey))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function markRead(id: string, keys: string[]): void {
  const n = db().get('notifications', id);
  if (n && keys.includes(n.recipientKey) && !n.readAt) db().update('notifications', id, { readAt: nowIso() });
}

export function markAllRead(keys: string[]): void {
  for (const n of listNotifications(keys)) if (!n.readAt) db().update('notifications', n.id, { readAt: nowIso() });
}
