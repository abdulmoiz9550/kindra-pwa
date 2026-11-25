import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import type { KEvent } from '@kindra/shared';
import type { Persistence, LoadedState } from './types';

/**
 * Persistencia en PostgreSQL. Se activa con DB_DRIVER=postgres y DATABASE_URL.
 * Esquema: server/sql/schema.sql (se aplica automáticamente si falta).
 */
export class PostgresPersistence implements Persistence {
  readonly name = 'postgres';
  private pool: pg.Pool;

  constructor(connectionString: string, ssl: boolean, private readonly schemaPath: string) {
    this.pool = new pg.Pool({ connectionString, ssl: ssl ? { rejectUnauthorized: false } : undefined, max: 5 });
  }

  async init(): Promise<void> {
    const exists = await this.pool.query(
      `SELECT to_regclass('public.events') AS ev, to_regclass('public.documents') AS doc`,
    );
    if (!exists.rows[0].ev || !exists.rows[0].doc) {
      const sql = fs.readFileSync(this.schemaPath, 'utf8');
      await this.pool.query(sql);
      console.log('[persistence] esquema de PostgreSQL aplicado');
    }
    // Fotos: solo las lee este servidor (la seguridad por filas cierra el acceso por la API pública de Supabase).
    await this.pool.query('CREATE TABLE IF NOT EXISTS photo_files (name TEXT PRIMARY KEY, mime TEXT NOT NULL, data BYTEA NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    await this.pool.query('ALTER TABLE photo_files ENABLE ROW LEVEL SECURITY');
  }

  async load(): Promise<LoadedState> {
    const documents: Record<string, Record<string, unknown>> = {};
    const docs = await this.pool.query<{ collection: string; id: string; data: unknown }>(
      'SELECT collection, id, data FROM documents',
    );
    for (const r of docs.rows) (documents[r.collection] ||= {})[r.id] = r.data;
    const evs = await this.pool.query<{ data: KEvent; seq: string }>('SELECT seq, full_event AS data FROM events ORDER BY seq');
    const events = evs.rows.map((r) => ({ ...r.data, seq: Number(r.seq) }));
    return { documents, events };
  }

  async saveDocument(collection: string, id: string, doc: unknown): Promise<void> {
    await this.pool.query(
      `INSERT INTO documents (collection, id, data, updated_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [collection, id, JSON.stringify(doc)],
    );
  }

  async deleteDocument(collection: string, id: string): Promise<void> {
    await this.pool.query('DELETE FROM documents WHERE collection = $1 AND id = $2', [collection, id]);
  }

  async appendEvent(e: KEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO events (seq, id, type, object_type, object_id, chain_id, actor_id, actor_role, entity_id,
         device_time, server_time, data, corrected_event_id, prev_hash, content_hash, hash, inconsistent_time, full_event)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [
        e.seq, e.id, e.type, e.objectType, e.objectId, e.chainId, e.actorId, e.actorRole, e.entityId,
        e.deviceTime, e.serverTime, JSON.stringify(e.data), e.correctedEventId ?? null, e.prevHash, e.contentHash,
        e.hash, e.inconsistentTime, JSON.stringify(e),
      ],
    );
  }

  async saveFile(name: string, mime: string, data: Buffer): Promise<void> {
    await this.pool.query('INSERT INTO photo_files (name, mime, data) VALUES ($1, $2, $3) ON CONFLICT (name) DO UPDATE SET mime = EXCLUDED.mime, data = EXCLUDED.data', [name, mime, data]);
  }

  async loadFile(name: string): Promise<Buffer | null> {
    const r = await this.pool.query<{ data: Buffer }>('SELECT data FROM photo_files WHERE name = $1', [name]);
    return r.rows[0]?.data ?? null;
  }

  async listFiles(prefix: string): Promise<{ name: string; size: number; createdAt: string }[]> {
    const r = await this.pool.query<{ name: string; size: number; created_at: Date }>('SELECT name, length(data) AS size, created_at FROM photo_files WHERE starts_with(name, $1) ORDER BY created_at DESC', [prefix]);
    return r.rows.map((x) => ({ name: x.name, size: Number(x.size), createdAt: x.created_at.toISOString() }));
  }

  async deleteFile(name: string): Promise<void> {
    await this.pool.query('DELETE FROM photo_files WHERE name = $1', [name]);
  }

  async clearAll(): Promise<void> {
    // Único punto donde se borra la bitácora: reinicio de datos de demostración (19.5).
    await this.pool.query('SELECT kindra_reset_demo()');
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export function defaultSchemaPath(serverRoot: string): string {
  return path.join(serverRoot, 'sql', 'schema.sql');
}
