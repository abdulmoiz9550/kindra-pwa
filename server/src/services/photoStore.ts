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
async function ensureBucket(): Promise<void> {
  const res = await fetch(`${env.supabaseUrl}/storage/v1/bucket/${BUCKET}`, { headers: auth(), signal: AbortSignal.timeout(15_000) });
  if (res.ok) return;
  const made = await fetch(`${env.supabaseUrl}/storage/v1/bucket`, { method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }), signal: AbortSignal.timeout(15_000) });
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
