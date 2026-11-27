import type { AppConfig, AuraTextEntry, Sector } from '@kindra/shared';
import { PARISHES } from '@kindra/shared';
import { db } from '../core/db';
import { DEFAULT_CONFIG } from '../config/defaults';
import { DEFAULT_AURA_TEXTS } from '../config/auraTexts';
import { DEFAULT_LESSONS } from '../config/lessons';
import { COURSE_LESSONS, DEFAULT_COURSES, LESSON_COURSE } from '../config/courses';
import { env } from '../config/env';
import { ensureDefaultSpace } from './spaces';

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
  // Addendum v4.2, 3.2: cursos de Training. Solo se agregan los que faltan; nunca se pisa lo editado.
  for (const c of DEFAULT_COURSES) if (!store.get('courses', c.id)) store.put('courses', c);
  for (const l of store.list('lessons')) if (l.courseId === undefined && LESSON_COURSE[l.id]) store.update('lessons', l.id, { courseId: LESSON_COURSE[l.id] });
  for (const l of COURSE_LESSONS) if (!store.get('lessons', l.id)) store.put('lessons', l);
  if (!store.get('news', 'nw_inicio')) {
    store.put('news', { id: 'nw_inicio', kind: 'news', title: 'Cómo avisar de un escombro', body: 'Desde «Avisar de un escombro» puedes enviar la ubicación y una foto, con o sin cuenta. Al terminar recibes un código. Guárdalo: con él puedes consultar cómo va tu reporte.', audience: [], published: true, publishedAt: '2026-11-25T12:00:00.000Z', updatedAt: '2026-11-25T12:00:00.000Z' });
  }
  ensureDefaultSpace();
  // Addendum v4.2, sección 7: cada sector pertenece a una de las tres parroquias del Módulo 1.
  for (const s of store.list('sectors')) {
    if (PARISHES.some((p) => p.name === s.parish)) continue;
    const hit = PARISHES.find((p) => s.name.toLowerCase().includes(p.name.toLowerCase()));
    if (hit) store.update('sectors', s.id, { parish: hit.name });
  }
  // Macuto y Urimare todavía no tienen sectores cargados: una zona provisional, sin polígono, hasta recibir las listas.
  for (const [id, parish] of [['sc_macuto', 'Macuto'], ['sc_urimare', 'Urimare']] as const) {
    if (store.count('sectors') && !store.find('sectors', (s) => s.parish === parish)) {
      store.put('sectors', { id, name: `${parish} (provisional)`, parish, polygon: [], authorized: true, provisional: true, spaceId: store.get('sectors', 'sc_este')?.spaceId ?? null } as Sector);
    }
  }
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
