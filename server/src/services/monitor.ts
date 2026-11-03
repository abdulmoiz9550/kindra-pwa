import type { MonitorRequest, Origin, User } from '@kindra/shared';
import { db } from '../core/db';
import { appendEvent, type Actor } from '../core/events';
import { newId, nowIso } from '../core/ids';
import { badRequest, conflict, forbidden, notFound } from '../core/errors';
import { computePoints, refreshRecognition } from './points';
import { notify, notifyRole, pickText } from './notifications';
import { getOriginOrThrow } from './origins';

/** 4. Contralor comunitario: nivel Contralor + solicitud + selfie verificada + aprobación del coordinador. */
export function requestMonitorRole(user: User, actor: Actor): MonitorRequest {
  const store = db();
  if (user.roles.includes('monitor')) throw conflict('Ya tienes el rol de contralor comunitario.');
  const pts = computePoints(user.id);
  if (pts.level.key !== 'contralor') throw conflict('Para solicitar el rol de contralor comunitario hace falta alcanzar el nivel Contralor comunitario.', 'level_required');
  if (store.find('monitorRequests', (r) => r.userId === user.id && r.status === 'pending')) throw conflict('Ya tienes una solicitud pendiente.');
  const request: MonitorRequest = { id: newId('mr'), userId: user.id, status: 'pending', createdAt: nowIso() };
  appendEvent({ type: 'monitor_requested', objectType: 'user', objectId: user.id, actor, data: { request } });
  notifyRole('coordinator', 'monitor_request', pickText('notif_coord_monitor_request', { alias: user.alias }), { link: '/panel/coordinador' });
  return request;
}

export function decideMonitorRequest(requestId: string, actor: Actor, status: 'approved' | 'rejected'): MonitorRequest {
  const store = db();
  if (actor.role !== 'coordinator') throw forbidden('Solo el coordinador aprueba solicitudes de contralor.');
  const r = store.get('monitorRequests', requestId);
  if (!r) throw notFound('La solicitud no existe.');
  if (r.status !== 'pending') throw conflict('La solicitud ya fue decidida.');
  const user = store.get('users', r.userId);
  if (!user) throw notFound('El usuario no existe.');
  if (status === 'approved' && user.verificationStatus !== 'verified') throw conflict('El ciudadano debe completar la verificación por selfie antes de activar el rol.', 'verification_required');
  appendEvent({ type: 'monitor_request_decided', objectType: 'user', objectId: user.id, actor, data: { requestId: r.id, status } });
  if (status === 'approved' && !user.roles.includes('monitor')) store.update('users', user.id, { roles: [...user.roles, 'monitor'] });
  notify({ recipientKeys: [`user:${user.id}`], kind: 'monitor_decided', text: pickText('notif_citizen_monitor_decided', { resultado: status === 'approved' ? 'aprobada. Ya puedes activar el rol desde tu perfil' : 'rechazada por ahora' }), link: '/perfil' });
  return store.get('monitorRequests', r.id)!;
}

function assertMonitorInSector(user: User, origin: Origin): void {
  if (!user.roles.includes('monitor')) throw forbidden('Esta acción es solo para contralores comunitarios.');
  if (user.sectorId && user.sectorId !== origin.sectorId) throw forbidden('Solo puedes verificar orígenes de tu sector.');
  if (origin.reporterId === user.id) throw conflict('No puedes verificar un origen que reportaste tú.', 'notOwnReport');
}

/** Marca un origen como "verificado en sitio" con foto (+15 puntos, 9.1). */
export function verifyOnSite(code: string, user: User, actor: Actor, photoId: string, deviceTime?: string | null): Origin {
  const o = getOriginOrThrow(code);
  assertMonitorInSector(user, o);
  if (!db().get('photos', photoId)) throw badRequest('La foto es obligatoria.');
  if (o.verifiedOnSiteAt) throw conflict('Este origen ya fue verificado en sitio.');
  appendEvent({ type: 'origin_verified_on_site', objectType: 'origin', objectId: o.id, actor: { ...actor, role: 'monitor' }, data: { photoId }, deviceTime });
  refreshRecognition(user.id);
  return db().get('origins', o.id)!;
}

/** Foto "después" para confirmar despeje (contralor) o fotos antes/después (ente de retiro). */
export function recordBeforeAfter(code: string, actor: Actor, input: { beforePhotoId?: string | null; afterPhotoId: string; deviceTime?: string | null }, user?: User): Origin {
  const o = getOriginOrThrow(code);
  if (actor.role === 'monitor' || actor.role === 'citizen') {
    if (!user) throw forbidden();
    assertMonitorInSector(user, o);
  } else if (actor.role !== 'removal') throw forbidden('Solo el ente de retiro o un contralor comunitario registran fotos de antes y después.');
  if (!db().get('photos', input.afterPhotoId)) throw badRequest('La foto de después es obligatoria.');
  appendEvent({ type: 'before_after_photo', objectType: 'origin', objectId: o.id, actor, data: { beforePhotoId: input.beforePhotoId ?? o.photoIds[0] ?? null, afterPhotoId: input.afterPhotoId }, deviceTime: input.deviceTime });
  return db().get('origins', o.id)!;
}
