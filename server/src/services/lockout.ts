import { HttpError } from '../core/errors';

/**
 * v4.0, sección 10: tras varios intentos fallidos la cuenta queda en pausa un rato. El límite aplica igual a
 * identificadores que no existen, así que la respuesta no revela si la cuenta existe.
 */
export const MAX_FAILURES = 5;
export const WINDOW_MS = 15 * 60_000;
export const LOCK_MS = 15 * 60_000;

const state = new Map<string, { failures: number[]; lockedUntil: number }>();

export function assertNotLocked(key: string): void {
  const s = state.get(key);
  if (s && s.lockedUntil > Date.now()) throw new HttpError(429, 'Demasiados intentos. Espera 15 minutos antes de volver a probar.', 'locked');
}

export function recordFailure(key: string): void {
  const now = Date.now();
  if (state.size > 5000) for (const [k, v] of state) if (v.lockedUntil < now && v.failures.every((t) => now - t > WINDOW_MS)) state.delete(k);
  const s = state.get(key) ?? { failures: [], lockedUntil: 0 };
  s.failures = [...s.failures.filter((t) => now - t < WINDOW_MS), now];
  if (s.failures.length >= MAX_FAILURES) {
    s.lockedUntil = now + LOCK_MS;
    s.failures = [];
  }
  state.set(key, s);
}

export function clearFailures(key: string): void {
  state.delete(key);
}
