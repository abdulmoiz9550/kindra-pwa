import type { AppConfig, AuraTextEntry } from '@kindra/shared';
import { db } from '../core/db';
import { DEFAULT_CONFIG } from '../config/defaults';
import { DEFAULT_AURA_TEXTS } from '../config/auraTexts';
import { DEFAULT_LESSONS } from '../config/lessons';
import { env } from '../config/env';

const CONFIG_ID = 'main';

/** Devuelve la configuración vigente (sección 17). Si no existe, la crea con los valores provisionales. */
export function getConfig(): AppConfig {
  const store = db();
  let cfg = store.get('config', CONFIG_ID);
  if (!cfg) {
    cfg = { ...structuredClone(DEFAULT_CONFIG), demoMode: env.demoMode };
    store.put('config', { ...cfg, id: CONFIG_ID } as AppConfig & { id: string });
  }
  // Completa claves nuevas que no existan en una configuración guardada antes.
  return deepMerge(structuredClone(DEFAULT_CONFIG), cfg) as AppConfig;
}

export function updateConfig(patch: Partial<AppConfig>): AppConfig {
  const current = getConfig();
  const next = deepMerge(current, patch) as AppConfig;
  db().put('config', { ...next, id: CONFIG_ID } as AppConfig & { id: string });
  return next;
}

export function ensureDefaults(): void {
  const store = db();
  getConfig();
  if (store.count('auraTexts') === 0) {
    for (const t of DEFAULT_AURA_TEXTS) store.put('auraTexts', { ...t, id: t.key } as AuraTextEntry & { id: string });
  } else {
    // añade claves nuevas sin tocar las editadas
    for (const t of DEFAULT_AURA_TEXTS) if (!store.get('auraTexts', t.key)) store.put('auraTexts', { ...t, id: t.key } as AuraTextEntry & { id: string });
  }
  if (store.count('lessons') === 0) for (const l of DEFAULT_LESSONS) store.put('lessons', l);
}

export function getAuraText(key: string): AuraTextEntry | undefined {
  return db().get('auraTexts', key) || DEFAULT_AURA_TEXTS.find((t) => t.key === key);
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

export function deepMerge(base: unknown, patch: unknown): unknown {
  if (!isObj(base) || !isObj(patch)) return patch === undefined ? base : patch;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    out[k] = isObj(v) && isObj(base[k]) ? deepMerge(base[k], v) : v;
  }
  return out;
}
