import fs from 'node:fs';
import path from 'node:path';
import type { KEvent } from '@kindra/shared';
import { env } from '../config/env';
import { db } from '../core/db';
import { contentHashOf, finalHashOf } from '../core/events';
import { badRequest, notFound } from '../core/errors';
import { MemoryPersistence } from '../persistence/memory';
import type { LoadedState, Persistence } from '../persistence/types';

/**
 * Copias de seguridad y restauración probada (v4.0, sección 10). Las copias contienen información crítica:
 * quedan en el servidor y no se descargan desde la aplicación.
 */
const backupDir = () => path.join(env.dataDir, 'backups');
const KEEP = 14;

export function listBackups() {
  const dir = backupDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((file) => {
      const st = fs.statSync(path.join(dir, file));
      return { file, size: st.size, createdAt: st.mtime.toISOString() };
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** Copia lo que está realmente persistido (no el estado en memoria). */
export async function createBackup(): Promise<{ file: string; events: number }> {
  const store = db();
  await store.flush();
  const state = await store.persistence.load();
  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = `auto-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(path.join(dir, file), JSON.stringify(state));
  for (const old of listBackups().filter((b) => b.file.startsWith('auto-')).slice(KEEP)) fs.unlinkSync(path.join(dir, old.file));
  return { file, events: state.events.length };
}

export function readBackup(fullPath: string): LoadedState {
  if (!fs.existsSync(fullPath)) throw notFound('La copia no existe.');
  let raw: LoadedState;
  try {
    raw = JSON.parse(fs.readFileSync(fullPath, 'utf8')) as LoadedState;
  } catch {
    throw badRequest('La copia está dañada: no se puede leer.');
  }
  if (!raw.documents || !Array.isArray(raw.events)) throw badRequest('La copia no tiene el formato esperado.');
  return raw;
}

/** Recalcula todos los sellos de una lista de eventos, sin depender del estado en memoria. */
export function verifyEvents(events: KEvent[]): { chains: number; broken: string[] } {
  const last = new Map<string, string>();
  const broken = new Set<string>();
  for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
    const content = contentHashOf(e);
    if (content !== e.contentHash || e.prevHash !== (last.get(e.chainId) ?? 'GENESIS') || finalHashOf(content, e.prevHash) !== e.hash) broken.add(e.chainId);
    last.set(e.chainId, e.hash);
  }
  return { chains: last.size, broken: [...broken] };
}

const countDocs = (s: LoadedState) => Object.values(s.documents).reduce((n, c) => n + Object.keys(c).length, 0);

/** Restaura en un destino vacío y comprueba que lo leído de vuelta coincide con la copia. Nunca escribe sobre datos existentes. */
export async function restoreInto(target: Persistence, state: LoadedState) {
  const current = await target.load();
  if (current.events.length || countDocs(current)) throw badRequest('El destino no está vacío: la restauración solo se hace sobre una base vacía.');
  for (const [col, docs] of Object.entries(state.documents)) for (const [id, doc] of Object.entries(docs)) await target.saveDocument(col, id, doc);
  for (const e of [...state.events].sort((a, b) => a.seq - b.seq)) await target.appendEvent(e);
  const back = await target.load();
  const integrity = verifyEvents(back.events);
  const ok = back.events.length === state.events.length && countDocs(back) === countDocs(state) && integrity.broken.length === 0;
  return { ok, events: back.events.length, documents: countDocs(back), chains: integrity.chains, broken: integrity.broken };
}

/** Prueba de restauración en una base temporal en memoria: no toca los datos reales. */
export async function verifyBackupFile(file: string) {
  const state = readBackup(path.join(backupDir(), path.basename(file)));
  return { file, testedAt: new Date().toISOString(), ...(await restoreInto(new MemoryPersistence(null), state)) };
}
