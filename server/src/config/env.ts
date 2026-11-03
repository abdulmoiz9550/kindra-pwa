import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, '..', '..');
const repoRoot = path.resolve(serverRoot, '..');

dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(serverRoot, '.env') });

function bool(v: string | undefined, def: boolean): boolean {
  if (v === undefined || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}
function num(v: string | undefined, def: number): number {
  const n = Number(v);
  return Number.isFinite(n) && v !== undefined && v !== '' ? n : def;
}

export const env = {
  port: num(process.env.PORT, 4000),
  jwtSecret: process.env.JWT_SECRET || 'kindra-dev-secret-change-me',
  dbDriver: (process.env.DB_DRIVER || 'memory') as 'memory' | 'postgres',
  databaseUrl: process.env.DATABASE_URL || '',
  databaseSsl: bool(process.env.DATABASE_SSL, false),
  persistFile: bool(process.env.PERSIST_FILE, true),
  demoMode: bool(process.env.DEMO_MODE, true),
  seedOnEmpty: bool(process.env.SEED_ON_EMPTY, true),
  timeSkewMinutes: num(process.env.TIME_SKEW_MINUTES, 30),
  uploadDir: path.resolve(serverRoot, process.env.UPLOAD_DIR || './data/uploads'),
  dataDir: path.resolve(serverRoot, './data'),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || 'http://localhost:5173').replace(/\/$/, ''),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  auraModel: process.env.AURA_MODEL || 'claude-opus-5-5',
  jobsIntervalSeconds: num(process.env.JOBS_INTERVAL_SECONDS, 60),
  serverRoot,
  repoRoot,
  clientDist: path.resolve(repoRoot, 'client', 'dist'),
  isTest: process.env.NODE_ENV === 'test',
};
