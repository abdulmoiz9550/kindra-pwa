/**
 * Prueba o aplica una restauración (v4.0, sección 10).
 *   npm run restore -w server -- <copia.json>            prueba en una base temporal en memoria
 *   npm run restore -w server -- <copia.json> --apply    restaura en DATABASE_URL, solo si está vacía
 */
import path from 'node:path';
import { env } from '../config/env';
import { MemoryPersistence } from '../persistence/memory';
import { PostgresPersistence, defaultSchemaPath } from '../persistence/postgres';
import { readBackup, restoreInto } from '../services/backup';

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Indica el archivo de la copia.');
  const apply = process.argv.includes('--apply');
  if (apply && env.dbDriver !== 'postgres') throw new Error('--apply requiere DB_DRIVER=postgres y una DATABASE_URL vacía.');
  const target = apply ? new PostgresPersistence(env.databaseUrl, env.databaseSsl, defaultSchemaPath(env.serverRoot)) : new MemoryPersistence(null);
  await target.init();
  const r = await restoreInto(target, readBackup(path.resolve(file)));
  await target.close();
  console.log(`[restore] ${apply ? 'aplicada' : 'prueba'}: ${r.ok ? 'correcta' : 'CON ERRORES'} · ${r.events} eventos · ${r.documents} documentos · ${r.chains} cadenas`);
  if (!r.ok) process.exit(1);
}

main().catch((err) => {
  console.error('[restore] error:', (err as Error).message);
  process.exit(1);
});
