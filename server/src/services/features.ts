import { FEATURES, featureOn } from '@kindra/shared';
import { getConfig, updateConfig } from './config';
import { badRequest, HttpError } from '../core/errors';

/** Una función activable está encendida (addendum: el administrador principal enciende y apaga funciones). */
export function isFeatureOn(key: string): boolean {
  return featureOn(getConfig().features, key);
}

/** Corta la operación si la función está apagada u oculta en este módulo. */
export function assertFeature(key: string): void {
  if (!isFeatureOn(key)) throw new HttpError(403, 'Esta función no está disponible en este momento.', 'feature_off');
}

/** Vista de todas las funciones con su estado efectivo. */
export function listFeatures() {
  const cfg = getConfig();
  return FEATURES.map((f) => ({ ...f, enabled: featureOn(cfg.features, f.key) }));
}

/** Cambia interruptores. Las funciones no construidas en esta instalación no se pueden encender. */
export function setFeatures(patch: Record<string, boolean>) {
  const next: Record<string, boolean> = { ...getConfig().features };
  for (const [key, value] of Object.entries(patch)) {
    const def = FEATURES.find((f) => f.key === key);
    if (!def) throw badRequest(`La función "${key}" no existe.`);
    if (value && !def.available) throw badRequest(`"${def.label}" no está disponible en el módulo de escombros.`, 'feature_unavailable');
    next[key] = !!value;
  }
  updateConfig({ features: next });
  return listFeatures();
}
