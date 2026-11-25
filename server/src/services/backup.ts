import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { KEvent } from '@kindra/shared';
import { env } from '../config/env';
import { db } from '../core/db';
import { contentHashOf, finalHashOf } from '../core/events';
import { badRequest, notFound } from '../core/errors';
import { MemoryPersistence } from '../persistence/memory';
import { remoteCopies } from './photoStore';
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

/** Copias del servidor y las guardadas en Supabase. */
export async function listAllBackups() {
  const local = listBackups();
  const remote = await remoteCopies()?.list().catch(() => []);
  const inRemote = new Map((remote || []).map((r) => [r.name.replace(/\.gz$/, ''), r]));
  const rows = [...local.map((b) => ({ ...b, remote: inRemote.has(b.file) })), ...[...inRemote].filter(([f]) => !local.some((b) => b.file === f)).map(([file, r]) => ({ file, size: r.size, createdAt: r.createdAt, remote: true }))];
  return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** Una copia diaria fuera del servidor: si la última tiene más de un día, se hace al arrancar y luego se revisa cada hora. */
export async function dailyRemoteBackup(): Promise<void> {
  const remote = remoteCopies();
  if (!remote) return;
  const last = (await remote.list()).map((r) => r.createdAt).sort().at(-1);
  if (!last || Date.now() - Date.parse(last) > 24 * 3_600_000) await createBackup();
}

/** Copia lo que está realmente persistido (no el estado en memoria). */
export async function createBackup(): Promise<{ file: string; events: number; remote: boolean }> {
  const store = db();
  await store.flush();
  const state = await store.persistence.load();
  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = `auto-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const json = JSON.stringify(state);
  fs.writeFileSync(path.join(dir, file), json);
  for (const old of listBackups().filter((b) => b.file.startsWith('auto-')).slice(KEEP)) fs.unlinkSync(path.join(dir, old.file));
  let saved = false;
  const remote = remoteCopies();
  if (remote) {
    try {
      await remote.save(`${file}.gz`, gzipSync(json));
      saved = true;
      for (const old of (await remote.list()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(KEEP)) await remote.remove(old.name);
    } catch (err) {
      console.error('[backup] no se pudo guardar fuera del servidor:', (err as Error).message);
    }
  }
  return { file, events: state.events.length, remote: saved };
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
  const local = path.join(backupDir(), path.basename(file));
  if (!fs.existsSync(local)) {
    const data = await remoteCopies()?.load(`${path.basename(file)}.gz`);
    if (data) {
      fs.mkdirSync(backupDir(), { recursive: true });
      fs.writeFileSync(local, gunzipSync(data));
    }
  }
  const state = readBackup(path.join(backupDir(), path.basename(file)));
  return { file, testedAt: new Date().toISOString(), ...(await restoreInto(new MemoryPersistence(null), state)) };
}
