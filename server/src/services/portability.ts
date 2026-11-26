import { ALL_COLLECTIONS, db, type CollectionName } from '../core/db';
import { nowIso } from '../core/ids';
import { notFound } from '../core/errors';

/**
 * Addendum v4.2, sección 13: exportación completa en formato abierto (JSON y CSV) con documentación, solo para el
 * Administrador Principal y siempre registrada. Nunca incluye contraseñas ni secretos de verificación; los datos
 * confidenciales (teléfono y nombre de AURA) salen cifrados, igual que están guardados.
 */
const EXCLUDED: string[] = ['twoFactorSecrets'];
const SECRET_FIELDS = /^(passwordHash|secret|pendingSecret|recoveryCodes)$/;

const DOCS: Partial<Record<CollectionName, string>> = {
  origins: 'Reportes ciudadanos (R-…) y lotes de origen (LG-…): sector, estado, fechas, fotos, viajes, lotes y obras vinculados.',
  trips: 'Viajes: vehículo, orígenes, centro, salida y llegada.',
  receptions: 'Recepciones en el centro: cantidad, unidad, método de medición y control de diferencias.',
  batches: 'Lotes de centro: recepciones, salidas por fracción, balance y ensayos.',
  qualityVerifications: 'Ensayos y verificaciones de calidad del Evaluador Técnico.',
  dispatches: 'Despachos a obras y su confirmación.',
  works: 'Obras y usos del material.',
  closures: 'Cierres propuestos y respuesta del ciudadano (confirmado o disputado).',
  reportSnapshots: 'Reportes oficiales importados con su fecha de fuente.',
  reconDiscrepancies: 'Discrepancias de la conciliación semanal.',
  sectors: 'Sectores por parroquia.',
  centers: 'Centros CDT y CDF con coordenadas y operadores.',
  entities: 'Organizaciones.',
  users: 'Cuentas (sin contraseñas).',
  lessons: 'Lecciones de Training.',
  courses: 'Cursos de Training.',
  auraProfiles: 'Memoria de AURA (teléfono y nombre cifrados).',
  supportTickets: 'Conversaciones pasadas a una persona.',
};

function clean(doc: unknown): unknown {
  if (Array.isArray(doc)) return doc.map(clean);
  if (!doc || typeof doc !== 'object') return doc;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc)) if (!SECRET_FIELDS.test(k)) out[k] = clean(v);
  return out;
}

export function exportCollections(): CollectionName[] {
  return ALL_COLLECTIONS.filter((c) => !EXCLUDED.includes(c));
}

export function fullExport(collections: CollectionName[]) {
  const store = db();
  const data: Record<string, unknown[]> = {};
  for (const c of collections) data[c] = store.list(c).map(clean);
  return {
    format: 'Kindra · exportación completa',
    exportedAt: nowIso(),
    documentation: {
      encoding: 'UTF-8. Fechas en ISO 8601 (UTC). Cantidades con su unidad (t o m³) y método de medición; nunca se mezclan.',
      integrity: 'events es la bitácora encadenada: cada evento guarda el hash del contenido y el del evento anterior de su cadena.',
      collections: Object.fromEntries(collections.map((c) => [c, DOCS[c] ?? 'Colección de la plataforma.'])),
      excluded: 'Contraseñas y secretos de verificación en dos pasos.',
    },
    data,
    events: store.allEvents(),
  };
}

export function collectionCsv(name: string): string {
  const store = db();
  if (EXCLUDED.includes(name)) throw notFound('La colección no se exporta.');
  if (!exportCollections().includes(name as CollectionName)) throw notFound('La colección no existe.');
  const rows = store.list(name as CollectionName).map((d) => clean(d) as Record<string, unknown>);
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v: unknown) => {
    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
}
