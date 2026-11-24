import { FEATURES, featureOn } from '@kindra/shared';
import { getConfig, updateConfig } from './config';
import { badRequest, HttpError } from '../core/errors';
import { db } from '../core/db';

/** Una función activable está encendida (addendum: el administrador principal enciende y apaga funciones). */
export function isFeatureOn(key: string): boolean {
  return featureOn(getConfig().features, key);
}

/** Corta la operación si la función está apagada u oculta en este módulo. */
export function assertFeature(key: string): void {
  if (!isFeatureOn(key)) throw new HttpError(403, 'Esta función no está disponible en este momento.', 'feature_off');
}

/** v4.0, sección 2: un módulo futuro solo se enciende con su definición completa y la referencia de aprobación. */
export function assertModuleDefined(id: string): void {
  const d = db().get('moduleDefinitions', id);
  const ok = d && [d.workflow, d.dataFields, d.units, d.validationRules, d.roles, d.risks, d.approvalReference].every((v) => v.trim().length >= 3);
  if (!ok) throw new HttpError(409, 'Completa primero la definición del módulo: flujo, datos, unidades, validación, roles, riesgos y referencia de aprobación.', 'module_not_defined');
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
    if (def.locked && value !== featureOn(getConfig().features, key)) throw badRequest(`"${def.label}" no se puede cambiar en esta fase.`, 'feature_locked');
    if (key === 'oil_module' && value) assertModuleDefined(key);
    next[key] = !!value;
  }
  updateConfig({ features: next });
  return listFeatures();
}
