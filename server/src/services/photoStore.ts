import fs from 'node:fs';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { db } from '../core/db';
import { PostgresPersistence } from '../persistence/postgres';

/**
 * Fotos permanentes en Supabase. El disco del servidor es solo una copia rápida: puede borrarse en cada despliegue.
 *  - Con SUPABASE_SERVICE_KEY: Supabase Storage, en un contenedor privado.
 *  - Sin esa clave: la base de datos de Supabase (tabla photo_files), que ya está conectada.
 */
const BUCKET = 'kindra-fotos';
const MIME: Record<string, string> = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.webm': 'audio/webm', '.ogg': 'audio/ogg', '.mp4': 'audio/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
const mimeOf = (name: string) => MIME[path.extname(name).toLowerCase()] || 'application/octet-stream';

interface Store {
  save(name: string, data: Buffer): Promise<void>;
  load(name: string): Promise<Buffer | null>;
}

const auth = () => ({ Authorization: `Bearer ${env.supabaseServiceKey}`, apikey: env.supabaseServiceKey });
let bucketReady: Promise<void> | null = null;
async function ensureBucket(bucket = BUCKET): Promise<void> {
  const res = await fetch(`${env.supabaseUrl}/storage/v1/bucket/${bucket}`, { headers: auth(), signal: AbortSignal.timeout(15_000) });
  if (res.ok) return;
  const made = await fetch(`${env.supabaseUrl}/storage/v1/bucket`, { method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify({ id: bucket, name: bucket, public: false }), signal: AbortSignal.timeout(15_000) });
  if (!made.ok && made.status !== 409) throw new Error(`no se pudo crear el contenedor (${made.status})`);
}

const supabaseStorage: Store = {
  async save(name, data) {
    bucketReady ??= ensureBucket().catch((err) => {
      bucketReady = null;
      throw err;
    });
    await bucketReady;
    const res = await fetch(`${env.supabaseUrl}/storage/v1/object/${BUCKET}/${encodeURIComponent(name)}`, { method: 'POST', headers: { ...auth(), 'Content-Type': mimeOf(name), 'x-upsert': 'true' }, body: new Uint8Array(data), signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`Supabase Storage respondió ${res.status}`);
  },
  async load(name) {
    const res = await fetch(`${env.supabaseUrl}/storage/v1/object/${BUCKET}/${encodeURIComponent(name)}`, { headers: auth(), signal: AbortSignal.timeout(30_000) });
    return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  },
};

function store(): Store | null {
  if (env.supabaseUrl && env.supabaseServiceKey) return supabaseStorage;
  const p = db().persistence;
  return p instanceof PostgresPersistence ? { save: (n, d) => p.saveFile(n, mimeOf(n), d), load: (n) => p.loadFile(n) } : null;
}

export const photoStoreName = () => (env.supabaseUrl && env.supabaseServiceKey ? 'supabase-storage' : db().persistence instanceof PostgresPersistence ? 'supabase-database' : 'local');

/** Nombres que todavía no quedaron guardados: se reintentan hasta lograrlo. */
const pending = new Set<string>();
let timer: NodeJS.Timeout | null = null;

export async function persistUpload(url: string): Promise<void> {
  const s = store();
  if (!s) return;
  const name = path.basename(url);
  try {
    await s.save(name, await fs.promises.readFile(path.join(env.uploadDir, name)));
    pending.delete(name);
  } catch (err) {
    pending.add(name);
    console.warn('[fotos] pendiente de guardar:', (err as Error).message);
    timer ??= setInterval(() => {
      for (const n of [...pending]) void persistUpload(n);
      if (!pending.size && timer) {
        clearInterval(timer);
        timer = null;
      }
    }, 30_000).unref() as NodeJS.Timeout;
  }
}

/** Trae la foto al disco si el despliegue la borró. */
export async function ensureLocalUpload(url: string): Promise<boolean> {
  const name = path.basename(url);
  const file = path.join(env.uploadDir, name);
  if (fs.existsSync(file)) return true;
  const data = await store()?.load(name).catch(() => null);
  if (!data) return false;
  await fs.promises.mkdir(env.uploadDir, { recursive: true });
  await fs.promises.writeFile(`${file}.tmp`, data);
  await fs.promises.rename(`${file}.tmp`, file);
  return true;
}

export function restoreMissingUpload(req: Request, _res: Response, next: NextFunction): void {
  const name = path.basename(decodeURIComponent(req.path));
  if (!/^[\w.-]+$/.test(name)) return next();
  ensureLocalUpload(name).then(() => next(), () => next());
}

// ---------------------------------------------------------------- copias de seguridad fuera del servidor

/** Contenedor privado aparte; sin la clave de Storage, la base de datos. Nunca se sirven por la web. */
const COPIES = 'kindra-copias';
const COPY_PREFIX = 'copia/';
export interface RemoteCopy {
  name: string;
  size: number;
  createdAt: string;
}
export interface RemoteCopies {
  save(name: string, data: Buffer): Promise<void>;
  load(name: string): Promise<Buffer | null>;
  list(): Promise<RemoteCopy[]>;
  remove(name: string): Promise<void>;
}

export function remoteCopies(): RemoteCopies | null {
  if (env.supabaseUrl && env.supabaseServiceKey) {
    const api = `${env.supabaseUrl}/storage/v1`;
    const call = (url: string, init: RequestInit) => fetch(url, { ...init, headers: { ...auth(), ...(init.headers || {}) }, signal: AbortSignal.timeout(60_000) });
    return {
      async save(name, data) {
        await ensureBucket(COPIES);
        const r = await call(`${api}/object/${COPIES}/${encodeURIComponent(name)}`, { method: 'POST', headers: { 'Content-Type': 'application/gzip', 'x-upsert': 'true' }, body: new Uint8Array(data) });
        if (!r.ok) throw new Error(`Supabase Storage respondió ${r.status}`);
      },
      async load(name) {
        const r = await call(`${api}/object/${COPIES}/${encodeURIComponent(name)}`, { method: 'GET' });
        return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
      },
      async list() {
        const r = await call(`${api}/object/list/${COPIES}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: '', limit: 100, sortBy: { column: 'created_at', order: 'desc' } }) });
        if (!r.ok) return [];
        const rows = (await r.json()) as { name: string; created_at: string; metadata?: { size?: number } | null }[];
        return rows.map((x) => ({ name: x.name, size: x.metadata?.size ?? 0, createdAt: x.created_at }));
      },
      async remove(name) {
        await call(`${api}/object/${COPIES}/${encodeURIComponent(name)}`, { method: 'DELETE' });
      },
    };
  }
  const p = db().persistence;
  if (!(p instanceof PostgresPersistence)) return null;
  return {
    save: (n, d) => p.saveFile(COPY_PREFIX + n, 'application/gzip', d),
    load: (n) => p.loadFile(COPY_PREFIX + n),
    list: async () => (await p.listFiles(COPY_PREFIX)).map((x) => ({ ...x, name: x.name.slice(COPY_PREFIX.length) })),
    remove: (n) => p.deleteFile(COPY_PREFIX + n),
  };
}
