import type { PublicationPolicy } from '@kindra/shared';
import { db } from '../core/db';

export type DataType = keyof PublicationPolicy;

/**
 * 13.4 Política de publicación por entidad y tipo de dato:
 * público de inmediato, público con retraso de N días, o interno.
 */
export function isPublished(entityId: string | null | undefined, dataType: DataType, recordedAt?: string | null, now: Date = new Date()): boolean {
  if (!entityId) return true;
  const entity = db().get('entities', entityId);
  if (!entity) return true;
  const rule = entity.publicationPolicy?.[dataType];
  if (!rule || rule.mode === 'public') return true;
  if (rule.mode === 'internal') return false;
  const delayMs = (rule.delayDays ?? 0) * 86_400_000;
  const at = recordedAt ? new Date(recordedAt).getTime() : now.getTime();
  return now.getTime() - at >= delayMs;
}
