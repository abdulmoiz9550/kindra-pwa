import type { MeasurementMethod } from '@kindra/shared';
import type { Trip, Reception, FillLevel, GeoPoint, Vehicle, TripLeg, OutputUnit, QuantityCheck } from '@kindra/shared';
import { assertNoOpenTrip, centerPoint, geofenceCheck, ingestPoints, planRoute, raiseTrackingAlert, traceHash } from './tracking';
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
  // Sin capacidad registrada no hay estimado: el viaje se registra igual en ambos extremos (addendum, parte 2).
  const type = db().get('vehicleTypes', vehicle.typeId);
  if (!type || type.capacityM3 == null) return null;
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
  // Addendum v1.3: el mismo vehículo no puede tener dos viajes abiertos.
  assertNoOpenTrip(vehicle.id);
  const center = store.get('centers', input.centerId);
  if (!center) throw notFound('El centro de destino no existe.');
  const origins = input.originIds.map((id) => {
    const o = store.get('origins', id);
    if (!o) throw notFound(`El origen ${id} no existe.`);
    // 7.2 y 4.1: la tabla de transiciones bloquea zona no autorizada y auto-retiro.
    assertTransition('origin', 'trip_departure', o.state, { actor, origin: o });
    // Addendum v4.2: quien reportó el punto no se asigna su retiro.
    if (actor.id && o.reporterId === actor.id) throw forbidden(`No puedes registrar la salida de ${o.code}: lo reportaste tú.`, 'own_report');
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
    // Perímetro del escaneo de salida: el teléfono debe estar cerca del origen.
    departureCheck: input.location ? (origins.some((o) => geofenceCheck(input.location, o.location) === 'inside') ? 'inside' : origins.some((o) => o.location) ? 'outside' : 'no_reference') : 'no_location',
  };
  appendEvent({ type: 'trip_departure', objectType: 'trip', objectId: trip.id, actor, data: { trip }, deviceTime: input.deviceTime, offlineQueuedAt: input.offlineQueuedAt });
  if (input.location) ingestPoints(trip.id, [{ ...input.location, at: serverTime, label: 'Salida' }], 'checkpoint', { delayed: !!input.offlineQueuedAt });
  if (trip.departureCheck === 'outside') raiseTrackingAlert(`al_depfence_${trip.id}`, 'gate_alert', trip.id, `La salida del viaje ${trip.code} se escaneó fuera del perímetro del origen.`);
  planRoute(trip.id);

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
  /** Cierre por el escolta escaneando el QR de la puerta del centro, verificado dentro del perímetro (addendum v1.3). */
  viaGate?: boolean;
  /** v4.0, sección 7: datos de la recepción en el centro. */
  operatorEntityId?: string | null;
  receivedQuantity?: number | null;
  receivedUnit?: OutputUnit | null;
  condition?: string | null;
  discrepancyNote?: string | null;
  measurementMethod?: MeasurementMethod | null;
  conversionFactor?: { value: number; source: string } | null;
}

/** Compara lo recibido con lo despachado solo si comparten unidad; marca la diferencia sin tocar la cifra de salida. */
function quantityCheck(trip: Trip, input: ArrivalInput): QuantityCheck | null {
  if (input.receivedQuantity == null) return null;
  if (input.measurementMethod === 'factor_estimate' && !(input.conversionFactor && input.conversionFactor.value > 0 && input.conversionFactor.source.trim())) throw badRequest('Con «Estimación por factor» indica el valor del factor y su fuente.');
  if (!(input.receivedQuantity >= 0)) throw badRequest('La cantidad recibida debe ser cero o mayor.');
  if (!input.receivedUnit) throw badRequest('Indica la unidad de la cantidad recibida (t o m³).');
  const comparable = input.receivedUnit === 'm3' && trip.estimatedVolumeM3 != null;
  const difference = comparable ? Math.round((input.receivedQuantity - trip.estimatedVolumeM3!) * 100) / 100 : null;
  return { dispatched: comparable ? trip.estimatedVolumeM3! : null, received: input.receivedQuantity, unit: input.receivedUnit, difference, flagged: difference !== null && difference !== 0 };
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
  if (!input.photoId && !input.viaGate) throw badRequest('La foto de llegada es obligatoria.');
  if (input.viaGate) {
    // La puerta ya verificó destino y perímetro; se mantienen estado y "nadie recibe lo que reportó" (4.1).
    if (!['in_transit', 'no_arrival'].includes(trip.state)) throw conflict('Este viaje ya tiene la llegada confirmada.', 'bad_state');
    if (trip.originIds.some((id) => store.get('origins', id)?.reporterId === actor.id)) throw conflict('Nadie puede validar, retirar o recibir algo que reportó él mismo (regla 4.1).', 'notOwnReport');
  } else {
    // Addendum v1.3: llegada a un centro distinto del declarado → alerta al coordinador y al supervisor.
    const scanner = store.get('users', actor.id);
    if (actor.role === 'center' && scanner?.centerId && scanner.centerId !== trip.centerId) {
      raiseTrackingAlert(`al_wrongcenter_${trip.id}_${scanner.centerId}`, 'gate_alert', trip.id, `El viaje ${trip.code} llegó a ${store.get('centers', scanner.centerId)?.name ?? 'otro centro'}, distinto del declarado (${store.get('centers', trip.centerId)?.name ?? ''}).`);
    }
    // sameCenter + notOwnReport (4.1: nadie recibe lo que reportó)
    assertTransition('trip', 'trip_arrival', trip.state, { actor, trip });
  }
  const destination = store.get('centers', trip.centerId);
  const operators = destination ? [destination.entityId, ...(destination.operatorEntityIds || [])] : [];
  if (input.operatorEntityId && !operators.includes(input.operatorEntityId)) throw badRequest('Ese operador no está asociado a este centro.');
  const check = quantityCheck(trip, input);
  const serverTime = nowIso();
  const batch = ensureOpenBatch(trip.centerId, serverTime);
  const arrival: TripLeg & { via?: string } = { userId: actor.id, entityId: actor.entityId, deviceTime: input.deviceTime || serverTime, serverTime, photoId: input.photoId ?? null, location: input.location ?? null, ...(input.viaGate ? { via: 'gate_qr' } : {}) };
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
    // Con un solo operador en el centro no hay duda; con varios, lo indica quien recibe.
    operatorEntityId: input.operatorEntityId ?? (operators.length === 1 ? operators[0] : null),
    receivedQuantity: input.receivedQuantity ?? null,
    receivedUnit: input.receivedQuantity == null ? null : input.receivedUnit ?? null,
    condition: input.condition?.trim() || null,
    discrepancyNote: input.discrepancyNote?.trim() || null,
    receivedBy: actor.id,
    measurementMethod: input.receivedQuantity == null ? null : input.measurementMethod ?? null,
    conversionFactor: input.measurementMethod === 'factor_estimate' ? input.conversionFactor ?? null : null,
    weighbridgeUnavailable: input.receivedQuantity != null && !!input.measurementMethod && input.measurementMethod !== 'weighbridge',
    quantityCheck: check,
  };
  // Perímetro del centro (punto de descarga si existe) y sello del trazado completo en la cadena del viaje.
  const arrivalCheck = geofenceCheck(input.location, centerPoint(store.get('centers', trip.centerId)));
  if (input.location) ingestPoints(trip.id, [{ ...input.location, at: serverTime, label: 'Llegada' }], 'checkpoint', { delayed: !!input.offlineQueuedAt });
  const seal = traceHash(trip.id);
  appendEvent({ type: 'trip_arrival', objectType: 'trip', objectId: trip.id, actor, data: { arrival, reception, late: trip.state === 'no_arrival', arrivalCheck, traceHash: seal.hash, traceCount: seal.count }, deviceTime: input.deviceTime, offlineQueuedAt: input.offlineQueuedAt });
  if (check?.flagged || reception.discrepancyNote) raiseTrackingAlert(`al_qty_${trip.id}`, 'manual_review', trip.id, `El viaje ${trip.code} tiene una discrepancia por revisar${check?.flagged ? `: salida estimada ${check.dispatched} m³, recibido ${check.received} m³` : ''}${reception.discrepancyNote ? `: ${reception.discrepancyNote}` : ''}.`);
  if (arrivalCheck === 'outside') raiseTrackingAlert(`al_arrfence_${trip.id}`, 'gate_alert', trip.id, `La llegada del viaje ${trip.code} se escaneó fuera del perímetro del centro: no cuenta como llegada verificada.`);
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
    // Addendum v4.2, sección 12: la ubicación de salida y llegada del vehículo no sale en las vistas generales.
    departure: { ...t.departure, location: null },
    arrival: t.arrival ? { ...t.arrival, location: null } : t.arrival,
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
