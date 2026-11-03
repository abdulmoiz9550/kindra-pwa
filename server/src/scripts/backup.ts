/**
 * Copia de seguridad diaria (18.6). Uso: npm run backup -w server
 * - memory: copia server/data/db.json a server/data/backups/db-AAAA-MM-DD.json
 * - postgres: exporta documentos y eventos a server/data/backups/pg-AAAA-MM-DD.json
 * Programar con cron (Linux) o el Programador de tareas (Windows) una vez al día.
 */
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env';
import { PostgresPersistence, defaultSchemaPath } from '../persistence/postgres';

async function main() {
  const dir = path.join(env.dataDir, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  if (env.dbDriver === 'postgres') {
    const p = new PostgresPersistence(env.databaseUrl, env.databaseSsl, defaultSchemaPath(env.serverRoot));
    const state = await p.load();
    const out = path.join(dir, `pg-${stamp}.json`);
    fs.writeFileSync(out, JSON.stringify(state));
    await p.close();
    console.log(`[backup] exportado a ${out} (${state.events.length} eventos)`);
    return;
  }
  const src = path.join(env.dataDir, 'db.json');
  if (!fs.existsSync(src)) {
    console.log('[backup] no hay archivo de estado todavía (PERSIST_FILE=false o sin datos).');
    return;
  }
  const out = path.join(dir, `db-${stamp}.json`);
  fs.copyFileSync(src, out);
  console.log(`[backup] copiado a ${out}`);
}

main().catch((err) => {
  console.error('[backup] error:', err);
  process.exit(1);
});
