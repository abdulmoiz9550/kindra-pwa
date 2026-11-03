/**
 * Aplica el esquema SQL a la base PostgreSQL indicada en DATABASE_URL.
 * Uso: npm run db:schema -w server
 */
import fs from 'node:fs';
import pg from 'pg';
import { env } from '../config/env';
import { defaultSchemaPath } from '../persistence/postgres';

async function main() {
  if (!env.databaseUrl) throw new Error('Define DATABASE_URL en .env');
  const pool = new pg.Pool({ connectionString: env.databaseUrl, ssl: env.databaseSsl ? { rejectUnauthorized: false } : undefined });
  const sql = fs.readFileSync(defaultSchemaPath(env.serverRoot), 'utf8');
  await pool.query(sql);
  await pool.end();
  console.log('[db] esquema aplicado correctamente');
}

main().catch((err) => {
  console.error('[db] error:', err);
  process.exit(1);
});
