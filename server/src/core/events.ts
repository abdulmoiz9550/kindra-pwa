import { createHash } from 'node:crypto';
import type { KEvent, ChainObjectType, Role, ChainVerification } from '@kindra/shared';
import { db, PROJECTION_COLLECTIONS } from './db';
import { newId, nowIso } from './ids';
import { getConfig } from '../services/config';
import { applyEvent } from './projections';
import { broadcast } from '../realtime/sse';

const GENESIS = 'GENESIS';

/** JSON canónico (claves ordenadas) para que el hash sea determinista. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`;
}

export const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

/** 3.2 (1): hash del contenido propio del evento. */
export function contentHashOf(e: Pick<KEvent, 'type' | 'objectType' | 'objectId' | 'chainId' | 'actorId' | 'actorRole' | 'entityId' | 'deviceTime' | 'serverTime' | 'data' | 'correctedEventId'>): string {
  return sha256(
    canonical({
      type: e.type,
      objectType: e.objectType,
      objectId: e.objectId,
      chainId: e.chainId,
      actorId: e.actorId,
      actorRole: e.actorRole,
      entityId: e.entityId,
      deviceTime: e.deviceTime,
      serverTime: e.serverTime,
      data: e.data,
      correctedEventId: e.correctedEventId ?? null,
    }),
  );
}

/** 3.2 (3): hash final sobre el hash propio y el del evento anterior de la cadena. */
export const finalHashOf = (contentHash: string, prevHash: string) => sha256(contentHash + prevHash);

export interface Actor {
  id: string | null;
  role: Role | 'system' | null;
  entityId: string | null;
}

export const SYSTEM_ACTOR: Actor = { id: null, role: 'system', entityId: null };

export interface AppendInput {
  type: string;
  objectType: ChainObjectType;
  objectId: string;
  actor: Actor;
  data?: Record<string, unknown>;
  deviceTime?: string | null;
  offlineQueuedAt?: string | null;
  correctedEventId?: string | null;
  /** Solo para la semilla: fija la hora del servidor para simular historial. */
  serverTimeOverride?: string | null;
  silent?: boolean;
}

export const chainIdOf = (objectType: ChainObjectType, objectId: string) => `${objectType}:${objectId}`;

/**
 * Anexa un evento a la bitácora: calcula sello, doble marca de tiempo,
 * aplica la proyección y notifica en tiempo real. Nunca modifica eventos previos.
 */
export function appendEvent(input: AppendInput): KEvent {
  const store = db();
  const cfg = getConfig();
  const serverTime = input.serverTimeOverride || nowIso();
  const deviceTime = input.deviceTime || serverTime;
  const chainId = chainIdOf(input.objectType, input.objectId);
  const prev = store.lastEventOfChain(chainId);
  const prevHash = prev ? prev.hash : GENESIS;

  // 3.4 doble marca de tiempo
  const skewMs = Math.abs(new Date(serverTime).getTime() - new Date(deviceTime).getTime());
  const thresholdMs = (cfg.thresholds.timeSkewMinutes ?? 30) * 60_000;
  const inconsistentTime = skewMs > thresholdMs && !input.offlineQueuedAt;

  const base = {
    type: input.type,
    objectType: input.objectType,
    objectId: input.objectId,
    chainId,
    actorId: input.actor.id,
    actorRole: input.actor.role,
    entityId: input.actor.entityId,
    deviceTime,
    serverTime,
    data: input.data || {},
    correctedEventId: input.correctedEventId ?? null,
  };
  const contentHash = contentHashOf(base);
  const event: KEvent = {
    id: newId('ev'),
    seq: store.nextSeq(),
    ...base,
    prevHash,
    contentHash,
    hash: finalHashOf(contentHash, prevHash),
    inconsistentTime,
    offlineQueuedAt: input.offlineQueuedAt ?? null,
  };
  store.appendEvent(event);
  applyEvent(event);
  if (!input.silent) broadcast({ type: event.type, objectType: event.objectType, objectId: event.objectId, chainId, at: serverTime, seq: event.seq });
  return event;
}

/** Recalcula toda la cadena y devuelve "intacto" o "alterado" nombrando el evento donde se rompe. */
export function verifyChain(chainId: string): ChainVerification {
  const events = db().eventsOfChain(chainId);
  let prevHash = GENESIS;
  for (const e of events) {
    const content = contentHashOf(e);
    if (content !== e.contentHash) {
      return { chainId, status: 'altered', checked: events.length, brokenAt: { eventId: e.id, seq: e.seq, type: e.type, reason: 'El contenido del evento no coincide con su hash propio.' } };
    }
    if (e.prevHash !== prevHash) {
      return { chainId, status: 'altered', checked: events.length, brokenAt: { eventId: e.id, seq: e.seq, type: e.type, reason: 'El hash del evento anterior no coincide: falta o se alteró un evento previo.' } };
    }
    if (finalHashOf(content, prevHash) !== e.hash) {
      return { chainId, status: 'altered', checked: events.length, brokenAt: { eventId: e.id, seq: e.seq, type: e.type, reason: 'El hash final del evento no coincide.' } };
    }
    prevHash = e.hash;
  }
  return { chainId, status: 'intact', checked: events.length, brokenAt: null };
}

export function verifyChains(chainIds: string[]): { status: 'intact' | 'altered'; chains: ChainVerification[] } {
  const chains = chainIds.map(verifyChain);
  return { status: chains.every((c) => c.status === 'intact') ? 'intact' : 'altered', chains };
}

/**
 * Reconstruye todas las proyecciones reproduciendo la bitácora en orden.
 * Garantiza que lo que se ve se calcula desde los eventos (3.1).
 */
export function replayAll(): number {
  const store = db();
  for (const c of PROJECTION_COLLECTIONS) store.clearCollection(c);
  store.setPersistEnabled(false);
  let n = 0;
  try {
    for (const e of store.allEvents()) {
      applyEvent(e, { replay: true });
      n++;
    }
  } finally {
    store.setPersistEnabled(true);
  }
  return n;
}
