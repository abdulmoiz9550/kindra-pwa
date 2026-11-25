import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { initPlatform } from '../src/bootstrap';
import { MemoryPersistence } from '../src/persistence/memory';
import { db } from '../src/core/db';
import type { Actor } from '../src/core/events';
import { registerPhoto } from '../src/services/photos';
import { createCitizenReport, validateOrigin } from '../src/services/origins';
import { registerDeparture, confirmArrival } from '../src/services/trips';
import { registerMovementDeparture, confirmMovementArrival } from '../src/services/movements';
import { geofenceCheck, ingestPoints, verifyTrace, detectStops, analyzeTrip, recordGatePresence, gateCodeOfCenter, tripRef } from '../src/services/tracking';
import { handleTraccarForward } from '../src/services/traccar';
import { upsertVehicle } from '../src/services/admin';
import { setClockOffset } from '../src/core/ids';

const actor = (id: string, role: Actor['role'], entityId: string | null): Actor => ({ id, role, entityId });
let n = 0;
const photo = () => registerPhoto({ id: `ph_trk_${++n}`, url: '/uploads/x.svg', kind: 'trip_departure', moderation: 'approved', uploadedAt: new Date().toISOString() }).id;
const user = (alias: string) => db().list('users').find((u) => u.alias === alias)!;
const act = (alias: string, role: Actor['role']) => {
  const u = user(alias);
  return actor(u.id, role, u.entityId!);
};
const freeVehicle = () => {
  const store = db();
  const v = store.list('vehicles').find((x) => !store.find('trips', (t) => t.vehicleId === x.id && t.state === 'in_transit') && !store.find('movements', (m) => m.vehicleId === x.id && m.state === 'in_transit'));
  return v || upsertVehicle({ plate: `T${++n}XYZ`, typeId: 'vt_small', entityId: 'en_ejec' });
};

before(async () => {
  process.env.JOBS_INTERVAL_SECONDS = '0';
  process.env.OSRM_URL = 'off';
  await initPlatform({ persistence: new MemoryPersistence(null), seed: true, quiet: true });
});

function newValidatedOrigin(lat: number, lng: number) {
  const r = createCitizenReport({ photoIds: [photo()], location: { lat, lng }, size: 'small', source: 'pwa' }, { id: null, role: 'citizen', entityId: null });
  validateOrigin(r.origin.id, act('coordinador', 'coordinator'));
  return r.origin;
}

test('El mismo vehículo no puede tener dos viajes abiertos', () => {
  const o1 = newValidatedOrigin(10.6201, -66.8301);
  const o2 = newValidatedOrigin(10.6225, -66.8325);
  const v = freeVehicle();
  registerDeparture(act('retiro', 'removal'), { vehicleId: v.id, originIds: [o1.id], centerId: 'ce_norte', photoId: photo() });
  assert.throws(() => registerDeparture(act('retiro', 'removal'), { vehicleId: v.id, originIds: [o2.id], centerId: 'ce_norte', photoId: photo() }), (e: { code?: string }) => e.code === 'vehicle_open_trip');
});

test('Perímetro: dentro, fuera, sin referencia y sin ubicación', () => {
  const ref = { lat: 10.58703, lng: -67.00575 };
  assert.equal(geofenceCheck({ lat: 10.5871, lng: -67.0058 }, ref), 'inside');
  assert.equal(geofenceCheck({ lat: 10.6, lng: -67.0 }, ref), 'outside');
  assert.equal(geofenceCheck({ lat: 10.6, lng: -67.0 }, null), 'no_reference');
  assert.equal(geofenceCheck(null, ref), 'no_location');
});

test('Trazado: puntos solo durante el viaje, parada no declarada genera alerta y el sello detecta alteraciones', () => {
  const o = newValidatedOrigin(10.6150, -66.8450);
  const v = freeVehicle();
  const trip = registerDeparture(act('retiro', 'removal'), { vehicleId: v.id, originIds: [o.id], centerId: 'ce_norte', photoId: photo() });
  const t0 = Date.parse(trip.departure.serverTime);
  const at = (min: number) => new Date(t0 + min * 60_000).toISOString();
  // Antes de la salida: se ignora (privacidad)
  assert.equal(ingestPoints(trip.id, [{ lat: 10.61, lng: -66.84, at: new Date(t0 - 60_000).toISOString() }], 'pwa').stored, 0);
  // Recorrido con una parada de 8 minutos lejos de origen y centro
  const pts = [
    { lat: 10.6150, lng: -66.8400, at: at(1) },
    { lat: 10.6100, lng: -66.8700, at: at(3) },
    { lat: 10.6100, lng: -66.8700, at: at(6) },
    { lat: 10.61001, lng: -66.87001, at: at(11) },
    { lat: 10.6080, lng: -66.9000, at: at(13) },
  ];
  setClockOffset(20 * 60_000); // el reloj avanza 20 minutos durante el viaje
  assert.equal(ingestPoints(trip.id, pts, 'pwa').stored, 5);
  analyzeTrip(trip.id, true);
  const stops = detectStops(trip.id);
  assert.ok(stops.some((s) => s.durationS >= 480 && !s.insidePerimeter && !s.declared));
  assert.ok(db().list('alerts').some((a) => a.objectId === trip.id && a.kind === 'route_alert' && !a.resolvedAt));
  // Llegada: se sella el hash del trazado
  const center = user('centro');
  confirmArrival(trip.id, actor(center.id, 'center', center.entityId!), { photoId: photo() });
  assert.equal(verifyTrace(trip.id).status, 'intact');
  // Alteración manual de una posición: el sello lo detecta
  const p = db().list('trackPoints').find((x) => x.tripKey === trip.id && x.source === 'pwa')!;
  (p as { lat: number }).lat += 0.01;
  assert.equal(verifyTrace(trip.id).status, 'altered');
  (p as { lat: number }).lat -= 0.01;
  setClockOffset(0);
});

test('Llegada a un centro distinto del declarado: se bloquea y alerta al coordinador y al supervisor', () => {
  const o = newValidatedOrigin(10.6180, -66.8600);
  const v = freeVehicle();
  const trip = registerDeparture(act('retiro', 'removal'), { vehicleId: v.id, originIds: [o.id], centerId: 'ce_norte', photoId: photo() });
  const other = user('centro-sur');
  assert.throws(() => confirmArrival(trip.id, actor(other.id, 'center', other.entityId!), { photoId: photo() }));
  assert.ok(db().list('alerts').some((a) => a.objectId === trip.id && a.kind === 'gate_alert'));
});

test('Tramos CDT→obra (compuerta 7.4), CDT→CDF y CDT→Estado con dos escaneos', () => {
  const store = db();
  const approved = store.list('batches').find((b) => b.qualityResult === 'approved' && !!b.outputs)!;
  const centerUser = store.list('users').find((u) => u.centerId === approved.centerId && u.roles.includes('center'))!;
  const cu = actor(centerUser.id, 'center', centerUser.entityId!);
  // Sin aprobación no sale agregado a una obra
  const unapproved = store.list('batches').find((b) => !!b.outputs && b.qualityResult !== 'approved' && b.centerId === approved.centerId);
  if (unapproved) assert.throws(() => registerMovementDeparture(cu, { leg: 'cdt_work', vehicleId: freeVehicle().id, batchId: unapproved.id, quantity: 1, workId: store.list('works')[0].id, photoId: photo() }), (e: { code?: string }) => e.code === 'qualityApproved');
  // CDT → obra
  const work = store.list('works')[0];
  const mv = registerMovementDeparture(cu, { leg: 'cdt_work', vehicleId: freeVehicle().id, batchId: approved.id, quantity: 0.5, workId: work.id, photoId: photo() });
  assert.equal(mv.state, 'in_transit');
  assert.throws(() => confirmMovementArrival(cu, mv.id, { photoId: photo() })); // el centro no recibe en la obra
  const obras = store.list('users').find((u) => u.roles.includes('destination') && u.entityId === work.entityId)!;
  const arrived = confirmMovementArrival(actor(obras.id, 'destination', obras.entityId!), mv.id, { photoId: photo() });
  assert.equal(arrived.state, 'received');
  assert.ok(arrived.traceHash);
  // CDT → CDF
  if ((approved.outputs!.rejects || 0) > 0) {
    const cdf = store.list('centers').find((c) => c.type === 'CDF')!;
    const m2 = registerMovementDeparture(cu, { leg: 'cdt_cdf', vehicleId: freeVehicle().id, batchId: approved.id, quantity: Math.min(0.5, approved.outputs!.rejects), destCenterId: cdf.id, photoId: photo() });
    assert.equal(m2.destination.kind, 'center');
    // un centro que no es el destino declarado: alerta + bloqueo
    assert.throws(() => confirmMovementArrival(act('centro', 'center'), m2.id, { photoId: photo() }), (e: { code?: string }) => e.code === 'wrong_destination' || e.code === 'notOwnReport');
  }
  // CDT → Estado (metal): lo recibe el coordinador
  if ((approved.outputs!.metal || 0) > 0) {
    const m3 = registerMovementDeparture(cu, { leg: 'cdt_state', vehicleId: freeVehicle().id, batchId: approved.id, quantity: Math.min(0.2, approved.outputs!.metal), photoId: photo() });
    assert.equal(confirmMovementArrival(act('coordinador', 'coordinator'), m3.id, { photoId: photo() }).state, 'received');
  }
  // No se puede enviar más de lo producido
  assert.throws(() => registerMovementDeparture(cu, { leg: 'cdt_work', vehicleId: freeVehicle().id, batchId: approved.id, quantity: 999999, workId: work.id, photoId: photo() }), (e: { code?: string }) => e.code === 'over_quantity');
});

test('QR de puerta: presencia del escolta con control de perímetro', () => {
  const o = newValidatedOrigin(10.6195, -66.8555);
  const v = freeVehicle();
  const trip = registerDeparture(act('retiro', 'removal'), { vehicleId: v.id, originIds: [o.id], centerId: 'ce_norte', photoId: photo() });
  const gate = gateCodeOfCenter(db().get('centers', 'ce_norte')!);
  const r = recordGatePresence(act('retiro', 'removal'), { gateCode: gate, tripKey: trip.id, location: { lat: 10.61, lng: -66.85 } });
  assert.equal(r.tripKey, trip.id);
  assert.ok(['inside', 'outside', 'no_location'].includes(r.geofence)); // Caraballeda ya tiene coordenadas
});

test('Traccar: posiciones del dispositivo por IMEI solo durante el viaje; corte de energía alerta', () => {
  const store = db();
  const v = upsertVehicle({ plate: 'GPS001', typeId: 'vt_small', entityId: 'en_ejec', imei: '867000000000001' });
  // Sin viaje activo: no se guarda en Kindra
  assert.equal(handleTraccarForward({ device: { uniqueId: '867000000000001' }, position: { deviceId: 1, latitude: 10.61, longitude: -66.85, fixTime: new Date().toISOString() } }).position, false);
  const o = newValidatedOrigin(10.6170, -66.8480);
  const trip = registerDeparture(act('retiro', 'removal'), { vehicleId: v.id, originIds: [o.id], centerId: 'ce_norte', photoId: photo() });
  const later = new Date(Date.parse(trip.departure.serverTime) + 60_000).toISOString();
  setClockOffset(2 * 60_000);
  assert.equal(handleTraccarForward({ device: { uniqueId: '867000000000001' }, position: { deviceId: 1, latitude: 10.612, longitude: -66.851, fixTime: later, speed: 20 } }).position, true);
  assert.ok(store.list('trackPoints').some((p) => p.tripKey === trip.id && p.source === 'gps'));
  handleTraccarForward({ device: { uniqueId: '867000000000001' }, event: { type: 'alarm', attributes: { alarm: 'powerCut' } } });
  assert.ok(store.list('alerts').some((a) => a.objectId === trip.id && a.kind === 'device_alert'));
  assert.equal(tripRef(trip.id)!.kind, 'trip');
  setClockOffset(0);
});

test('Escolta: el QR de la puerta del destino cierra la llegada solo dentro del perímetro', () => {
  const store = db();
  const batch = store.list('batches').find((b) => !!b.outputs && (b.outputs.rejects || 0) > 0.3)!;
  const cu = store.list('users').find((u) => u.centerId === batch.centerId && u.roles.includes('center'))!;
  const escort = actor(cu.id, 'center', cu.entityId!);
  const cdf = store.get('centers', 'ce_final')!;
  const m = registerMovementDeparture(escort, { leg: 'cdt_cdf', vehicleId: freeVehicle().id, batchId: batch.id, quantity: 0.1, destCenterId: cdf.id, photoId: photo() });
  const gate = gateCodeOfCenter(cdf);
  // Fuera del perímetro: solo presencia, no cierra
  const far = recordGatePresence(escort, { gateCode: gate, tripKey: m.id, location: { lat: 10.62, lng: -66.9 } });
  assert.equal(far.closes, false);
  // Dentro del perímetro del punto de descarga: cierra
  const near = recordGatePresence(escort, { gateCode: gate, tripKey: m.id, location: { lat: 10.58705, lng: -67.00573 } });
  assert.equal(near.closes, true);
  const closed = confirmMovementArrival(escort, m.id, { location: { lat: 10.58705, lng: -67.00573 }, viaGate: true });
  assert.equal(closed.state, 'received');
  assert.equal(closed.arrivalCheck, 'inside');
});
