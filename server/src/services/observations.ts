import type { Observation, ObservedObjectType } from '@kindra/shared';
import { db } from '../core/db';
import { appendEvent, type Actor } from '../core/events';
import { newId, nowIso } from '../core/ids';
import { badRequest, forbidden, notFound } from '../core/errors';
import { notifyRole, pickText } from './notifications';

const COLLECTION: Record<ObservedObjectType, 'origins' | 'trips' | 'batches' | 'works'> = { origin: 'origins', trip: 'trips', batch: 'batches', work: 'works' };

/** Supervisor ambiental: observación sobre cualquier origen, viaje, lote u obra; opcionalmente como alerta (4). */
export function addObservation(actor: Actor, input: { objectType: ObservedObjectType; objectId: string; text: string; isAlert: boolean; deviceTime?: string | null }): Observation {
  const store = db();
  if (actor.role !== 'supervisor' || !actor.id || !actor.entityId) throw forbidden('Solo el supervisor ambiental registra observaciones.');
  if (!input.text?.trim()) throw badRequest('El texto de la observación es obligatorio.');
  const col = COLLECTION[input.objectType];
  if (!col) throw badRequest('Tipo de objeto no válido.');
  const target = store.get(col, input.objectId) || store.find(col, (x: { code?: string }) => x.code === input.objectId.toUpperCase());
  if (!target) throw notFound('El objeto observado no existe.');
  const observation: Observation = { id: newId('ob'), authorId: actor.id, entityId: actor.entityId, objectType: input.objectType, objectId: target.id, text: input.text.trim(), isAlert: !!input.isAlert, createdAt: nowIso() };
  appendEvent({ type: 'observation_recorded', objectType: input.objectType, objectId: target.id, actor, data: { observation }, deviceTime: input.deviceTime });
  if (observation.isAlert) notifyRole('coordinator', 'supervisor_alert', pickText('notif_coord_alert_observation', { texto: observation.text }), { link: '/panel/coordinador' });
  return observation;
}

export function listObservations(filter: { objectType?: ObservedObjectType; objectId?: string } = {}): Observation[] {
  return db()
    .filter('observations', (o) => (!filter.objectType || o.objectType === filter.objectType) && (!filter.objectId || o.objectId === filter.objectId))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
