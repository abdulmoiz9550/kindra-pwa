import type { Trip, Reception, FillLevel, GeoPoint, Vehicle, TripLeg } from '@kindra/shared';
import { db } from '../core/db';
import { appendEvent, SYSTEM_ACTOR, type Actor } from '../core/events';
import { assertTransition } from '../core/transitions';
import { newId, newTripCode, nowIso } from '../core/ids';
import { badRequest, conflict, forbidden, notFound } from '../core/errors';
import { ensureOpenBatch } from './batches';
import { notifyOrigin, notifyRole, pickText } from './notifications';
import { sectorName } from './origins';

export function findVehicle(ref: { vehicleId?: string | null; vehicleQr?: string | null }): Vehicle {
  const store = db();
  const v = (ref.vehicleId && store.get('vehicles', ref.vehicleId)) || (ref.vehicleQr && store.find('vehicles', (x) => x.qrCode === ref.vehicleQr!.trim()));
  if (!v) throw notFound('No se encontró el vehículo. Escanea su QR o elígelo de la lista.');
  if (!v.active) throw conflict('El vehículo está inactivo.');
  return v;
}

/** 7.8: capacidad nominal × 1 (lleno o sin dato) o × 0.5 (medio). Siempre "estimado". */
export function estimatedVolume(vehicle: Vehicle, fillLevel?: FillLevel | null): number | null {
  const type = db().get('vehicleTypes', vehicle.typeId);
  if (!type) return null;
  return Math.round(type.capacityM3 * (fillLevel === 'half' ? 0.5 : 1) * 100) / 100;
}

export interface DepartureInput {
  vehicleId?: string | null;
  vehicleQr?: string | null;
  originIds: string[];
  centerId: string;
  photoId?: string | null;
  location?: GeoPoint | null;
  fillLevel?: FillLevel | null;
  deviceTime?: string | null;
  offlineQueuedAt?: string | null;
}

export function registerDeparture(actor: Actor, input: DepartureInput): Trip {
  const store = db();
  if (!actor.id || !actor.entityId) throw forbidden('Solo un usuario institucional de retiro registra salidas.');
  if (!input.originIds?.length) throw badRequest('Selecciona al menos un origen.');
  if (!input.photoId) throw badRequest('La foto de salida es obligatoria.');
  const vehicle = findVehicle(input);
  const center = store.get('centers', input.centerId);
  if (!center) throw notFound('El centro de destino no existe.');
  const origins = input.originIds.map((id) => {
    const o = store.get('origins', id);
    if (!o) throw notFound(`El origen ${id} no existe.`);
    // 7.2 y 4.1: la tabla de transiciones bloquea zona no autorizada y auto-retiro.
    assertTransition('origin', 'trip_departure', o.state, { actor, origin: o });
    return o;
  });
  const serverTime = nowIso();
  const trip: Trip = {
    id: newId('tr'),
    code: newTripCode(store.count('trips') + 1),
    vehicleId: vehicle.id,
    originIds: origins.map((o) => o.id),
    centerId: center.id,
    departure: {
      userId: actor.id,
      entityId: actor.entityId,
      deviceTime: input.deviceTime || serverTime,
      serverTime,
      photoId: input.photoId,
      location: input.location ?? origins[0].location ?? null,
      fillLevel: input.fillLevel ?? null,
    },
    arrival: null,
    estimatedVolumeM3: estimatedVolume(vehicle, input.fillLevel),
    state: 'in_transit',
  };
  appendEvent({ type: 'trip_departure', objectType: 'trip', objectId: trip.id, actor, data: { trip }, deviceTime: input.deviceTime, offlineQueuedAt: input.offlineQueuedAt });

  for (const o of origins) {
    if (o.state === 'validated' || o.state === 'under_removal') {
      notifyOrigin(o, 'under_removal', pickText('status_under_removal', { código: o.code, centro: center.name }));
    }
  }
  const sectors = [...new Set(origins.map((o) => sectorName(o.sectorId)))].join(', ');
  const inTransit = store.filter('trips', (t) => t.centerId === center.id && t.state === 'in_transit').length;
  notifyRole('center', 'trips_in_transit', pickText('notif_center_trips', { número: inTransit, sector: sectors, centro: center.name }), { centerId: center.id, link: '/panel/centro' });
  return store.get('trips', trip.id)!;
}

export interface ArrivalInput {
  photoId?: string | null;
  vehicleQr?: string | null;
  deviceTime?: string | null;
  offlineQueuedAt?: string | null;
  location?: GeoPoint | null;
}

export function confirmArrival(tripId: string, actor: Actor, input: ArrivalInput): { trip: Trip; reception: Reception } {
  const store = db();
  if (!actor.id || !actor.entityId) throw forbidden();
  const trip = store.get('trips', tripId) || store.find('trips', (t) => t.code === tripId);
  if (!trip) throw notFound('El viaje no existe.');
  if (input.vehicleQr) {
    const v = store.get('vehicles', trip.vehicleId);
    if (!v || v.qrCode !== input.vehicleQr.trim()) throw conflict('El QR escaneado no corresponde al vehículo de este viaje.', 'vehicle_mismatch');
  }
  if (!input.photoId) throw badRequest('La foto de llegada es obligatoria.');
  // sameCenter + notOwnReport (4.1: nadie recibe lo que reportó)
  assertTransition('trip', 'trip_arrival', trip.state, { actor, trip });
  const serverTime = nowIso();
  const batch = ensureOpenBatch(trip.centerId, serverTime);
  const arrival: TripLeg = { userId: actor.id, entityId: actor.entityId, deviceTime: input.deviceTime || serverTime, serverTime, photoId: input.photoId, location: input.location ?? null };
  const reception: Reception = {
    id: newId('rc'),
    tripId: trip.id,
    centerId: trip.centerId,
    batchId: batch.id,
    receivedAt: serverTime,
    subcategory: null,
    photoId: null,
    note: null,
    classifiedAt: null,
    classifiedBy: null,
    hazardDecision: null,
    hazardDecisionId: null,
  };
  appendEvent({ type: 'trip_arrival', objectType: 'trip', objectId: trip.id, actor, data: { arrival, reception, late: trip.state === 'no_arrival' }, deviceTime: input.deviceTime, offlineQueuedAt: input.offlineQueuedAt });
  for (const oid of trip.originIds) {
    const o = store.get('origins', oid);
    if (!o || ['rejected', 'duplicate', 'closed', 'in_work'].includes(o.state)) continue;
    try {
      assertTransition('origin', 'origin_in_batch', o.state === 'disputed' ? o.preDisputeState || 'removed' : o.state, { actor: SYSTEM_ACTOR, origin: o });
      appendEvent({ type: 'origin_in_batch', objectType: 'origin', objectId: o.id, actor: SYSTEM_ACTOR, data: { tripId: trip.id, batchId: batch.id, centerId: trip.centerId } });
    } catch {
      /* estado no elegible: se ignora */
    }
  }
  return { trip: store.get('trips', trip.id)!, reception: store.get('receptions', reception.id)! };
}

/** 6.2 / 7.13: plazo vencido sin confirmación. Lo ejecuta el planificador. */
export function markNoArrival(trip: Trip, alertText: string): Trip {
  assertTransition('trip', 'trip_no_arrival', trip.state, { actor: SYSTEM_ACTOR, trip });
  appendEvent({ type: 'trip_no_arrival', objectType: 'trip', objectId: trip.id, actor: SYSTEM_ACTOR, data: { alertText } });
  return db().get('trips', trip.id)!;
}

export function tripView(t: Trip) {
  const store = db();
  const vehicle = store.get('vehicles', t.vehicleId);
  const vtype = vehicle && store.get('vehicleTypes', vehicle.typeId);
  const center = store.get('centers', t.centerId);
  const origins = t.originIds.map((id) => store.get('origins', id)).filter(Boolean);
  return {
    ...t,
    vehiclePlate: vehicle?.plate ?? null,
    vehicleType: vtype?.name ?? null,
    centerName: center?.name ?? null,
    originCodes: origins.map((o) => o!.code),
    sectorNames: [...new Set(origins.map((o) => sectorName(o!.sectorId)))],
    departurePhotoUrl: t.departure.photoId ? store.get('photos', t.departure.photoId)?.url ?? null : null,
    arrivalPhotoUrl: t.arrival?.photoId ? store.get('photos', t.arrival.photoId)?.url ?? null : null,
    departureEntityName: store.get('entities', t.departure.entityId)?.name ?? null,
  };
}
