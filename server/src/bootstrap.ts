import { env } from './config/env';
import { Db, setDb } from './core/db';
import { MemoryPersistence } from './persistence/memory';
import { PostgresPersistence, defaultSchemaPath } from './persistence/postgres';
import type { Persistence } from './persistence/types';
import { ensureDefaults } from './services/config';
import { replayAll } from './core/events';
import { seedDemo } from './seed/demo';
import path from 'node:path';

export interface BootOptions {
  persistence?: Persistence;
  seed?: boolean;
  quiet?: boolean;
}

/** Inicializa persistencia, estado en memoria, proyecciones y datos de demostración. */
export async function initPlatform(opts: BootOptions = {}): Promise<Db> {
  const log = opts.quiet ? () => undefined : console.log;
  let persistence: Persistence;
  if (opts.persistence) persistence = opts.persistence;
  else if (env.dbDriver === 'postgres') {
    if (!env.databaseUrl) throw new Error('DB_DRIVER=postgres requiere DATABASE_URL');
    persistence = new PostgresPersistence(env.databaseUrl, env.databaseSsl, defaultSchemaPath(env.serverRoot));
  } else {
    persistence = new MemoryPersistence(env.persistFile ? path.join(env.dataDir, 'db.json') : null);
  }
  await persistence.init();
  const db = new Db(persistence);
  setDb(db);
  await db.load();
  log(`[kindra] persistencia: ${persistence.name}${persistence.name === 'memory' && env.persistFile ? ' (archivo data/db.json)' : ''}`);
  ensureDefaults();
  const replayed = replayAll();
  log(`[kindra] proyecciones reconstruidas desde ${replayed} eventos`);
  const shouldSeed = opts.seed ?? (env.seedOnEmpty && db.count('origins') === 0 && db.allEvents().length === 0);
  if (shouldSeed) {
    const summary = await seedDemo();
    log(`[kindra] datos simulados cargados: ${summary.origins} orígenes, ${summary.trips} viajes, ${summary.batches} lotes, ${summary.events} eventos`);
  }
  return db;
}
