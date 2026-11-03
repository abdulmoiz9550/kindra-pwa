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
