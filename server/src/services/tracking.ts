import type { Alert, Center, GeoPoint, GeofenceStatus, Movement, TrackPoint, TrackSource, Trip, TripRoute, Work, User, Role } from '@kindra/shared';
import { distanceMeters } from '@kindra/shared';
import { db } from '../core/db';
import { appendEvent, canonical, sha256, SYSTEM_ACTOR, type Actor } from '../core/events';
import { newId, nowIso } from '../core/ids';
import { badRequest, conflict, forbidden, notFound } from '../core/errors';
import { getConfig } from './config';
import { notifyRole } from './notifications';

/**
 * Seguimiento de rutas y puntos de control (addendum v1.3).
 * Un "viaje" es un viaje origen→CDT (trips) o un movimiento CDT→CDF/obra/Estado (movements); ambos comparten
 * las mismas reglas: dos escaneos, perímetro, trazado GPS, paradas, alertas y sello del trazado al llegar.
 * Las posiciones nunca son públicas.
 */

export interface TripRef {
  key: string;
  kind: 'trip' | 'movement';
  code: string;
  vehicleId: string;
  state: Trip['state'];
  departureAt: string;
  arrivalAt: string | null;
  departureUserId: string;
  departureEntityId: string;
  from: GeoPoint | null;
  fromLabel: string;
  to: GeoPoint | null;
  toLabel: string;
  destCenterId: string | null;
  destWorkId: string | null;
  originIds: string[];
  perimeters: GeoPoint[];
}

export const centerPoint = (c: Center | undefined | null): GeoPoint | null => (c ? c.unloadingPoint ?? c.location ?? null : null);
export const gateCodeOfCenter = (c: Center) => c.gateCode || `KG-${c.shortCode}`;
export const gateCodeOfWork = (w: Work) => w.gateCode || `KG-${w.code}`;

export function tripRef(key: string): TripRef | null {
  const store = db();
  if (key.startsWith('mv_')) {
    const m = store.get('movements', key) || store.find('movements', (x) => x.code === key);
    return m ? movementRef(m) : null;
  }
  const t = store.get('trips', key) || store.find('trips', (x) => x.code === key);
  return t ? originTripRef(t) : null;
}

function originTripRef(t: Trip): TripRef {
  const store = db();
  const origins = t.originIds.map((id) => store.get('origins', id)).filter(Boolean);
  const center = store.get('centers', t.centerId);
  const from = t.departure.location ?? origins.find((o) => o!.location)?.location ?? null;
  return {
    key: t.id,
    kind: 'trip',
    code: t.code,
    vehicleId: t.vehicleId,
    state: t.state,
    departureAt: t.departure.serverTime,
    arrivalAt: t.arrival?.serverTime ?? null,
    departureUserId: t.departure.userId,
    departureEntityId: t.departure.entityId,
    from,
    fromLabel: origins.map((o) => o!.code).join(', ') || 'Origen',
    to: centerPoint(center),
    toLabel: center?.name ?? 'Centro',
    destCenterId: t.centerId,
    destWorkId: null,
    originIds: t.originIds,
    perimeters: [...origins.map((o) => o!.location).filter((x): x is GeoPoint => !!x), ...(centerPoint(center) ? [centerPoint(center)!] : [])],
  };
}

function movementRef(m: Movement): TripRef {
  const store = db();
  const fromCenter = store.get('centers', m.fromCenterId);
  const destCenter = m.destination.kind === 'center' && m.destination.id ? store.get('centers', m.destination.id) : undefined;
  const work = m.destination.kind === 'work' && m.destination.id ? store.get('works', m.destination.id) : undefined;
  const to = destCenter ? centerPoint(destCenter) : work?.location ?? null;
  return {
    key: m.id,
    kind: 'movement',
    code: m.code,
    vehicleId: m.vehicleId,
    state: m.state,
    departureAt: m.departure.serverTime,
    arrivalAt: m.arrival?.serverTime ?? null,
    departureUserId: m.departure.userId,
    departureEntityId: m.departure.entityId,
    from: centerPoint(fromCenter),
    fromLabel: fromCenter?.name ?? 'Centro',
    to,
    toLabel: m.destination.name,
    destCenterId: destCenter?.id ?? null,
    destWorkId: work?.id ?? null,
    originIds: [],
    perimeters: [centerPoint(fromCenter), to].filter((x): x is GeoPoint => !!x),
  };
}

// ---------------------------------------------------------------- reglas anti-fraude de los escaneos

/** El mismo vehículo no puede tener dos viajes abiertos (addendum v1.3). */
export function openTripOfVehicle(vehicleId: string): TripRef | null {
  const store = db();
  const t = store.find('trips', (x) => x.vehicleId === vehicleId && x.state === 'in_transit');
  if (t) return originTripRef(t);
  const m = store.find('movements', (x) => x.vehicleId === vehicleId && x.state === 'in_transit');
  return m ? movementRef(m) : null;
}

export function assertNoOpenTrip(vehicleId: string): void {
  const open = openTripOfVehicle(vehicleId);
  if (open) throw conflict(`Este vehículo ya tiene un viaje abierto (${open.code}). Debe confirmarse su llegada antes de una nueva salida.`, 'vehicle_open_trip');
}

/** Un escaneo solo cuenta si el teléfono está dentro del perímetro de esa puerta. */
export function geofenceCheck(scan: GeoPoint | null | undefined, reference: GeoPoint | null | undefined): GeofenceStatus {
  if (!reference) return 'no_reference';
  if (!scan) return 'no_location';
  return distanceMeters(scan, reference) <= getConfig().tracking.geofenceM ? 'inside' : 'outside';
}

/** Alerta al coordinador y al supervisor (rutas, dispositivos, puertas). */
export function raiseTrackingAlert(id: string, kind: Alert['kind'], tripKey: string, text: string): void {
  const store = db();
  const existing = store.get('alerts', id);
  if (existing && !existing.resolvedAt) return;
  const alert: Alert = { id, kind, objectType: 'trip', objectId: tripKey, text, createdAt: nowIso(), sectorId: null };
  appendEvent({ type: 'escalation_alert', objectType: 'trip', objectId: tripKey, actor: SYSTEM_ACTOR, data: { alert } });
  notifyRole('coordinator', kind, text, { link: `/panel/viaje/${tripKey}` });
  notifyRole('supervisor', kind, text, { link: `/panel/viaje/${tripKey}` });
}

// ---------------------------------------------------------------- ruta planificada

const routing = () => (process.env.OSRM_URL === 'off' ? null : process.env.OSRM_URL || 'https://router.project-osrm.org');

/** Calcula la ruta planificada A→C (OSRM; si no responde, línea recta) y la guarda. No bloquea el escaneo. */
export function planRoute(key: string): void {
  const ref = tripRef(key);
  const store = db();
  if (!ref || store.get('tripRoutes', key)) return;
  const avg = getConfig().tracking.averageSpeedKmh;
  if (!ref.from || !ref.to) {
    store.put('tripRoutes', { id: key, planned: null, expectedSeconds: null, distanceM: null, source: 'none', createdAt: nowIso() });
    return;
  }
  const straightM = distanceMeters(ref.from, ref.to);
  const straight: TripRoute = { id: key, planned: [[ref.from.lat, ref.from.lng], [ref.to.lat, ref.to.lng]], expectedSeconds: Math.round((straightM * 1.3) / ((avg * 1000) / 3600)), distanceM: Math.round(straightM * 1.3), source: 'straight', createdAt: nowIso() };
  store.put('tripRoutes', straight);
  const base = routing();
  if (!base || typeof fetch !== 'function') return;
  const url = `${base}/route/v1/driving/${ref.from.lng},${ref.from.lat};${ref.to.lng},${ref.to.lat}?overview=full&geometries=geojson`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  fetch(url, { signal: ctrl.signal })
    .then((r) => (r.ok ? (r.json() as Promise<{ routes?: { geometry: { coordinates: [number, number][] }; duration: number; distance: number }[] }>) : null))
    .then((j) => {
      const r0 = j?.routes?.[0];
      if (!r0?.geometry?.coordinates?.length) return;
      store.put('tripRoutes', { id: key, planned: r0.geometry.coordinates.map(([lng, lat]) => [lat, lng]), expectedSeconds: Math.round(r0.duration), distanceM: Math.round(r0.distance), source: 'osrm', createdAt: nowIso() });
    })
    .catch(() => undefined)
    .finally(() => clearTimeout(timer));
}

// ---------------------------------------------------------------- posiciones

export interface IncomingPoint {
  lat: number;
  lng: number;
  at?: string | null;
  accuracy?: number | null;
  speedKmh?: number | null;
  label?: string | null;
}

/**
 * Guarda posiciones de un viaje. Solo durante el viaje (privacidad): se aceptan puntos entre la salida y la llegada,
 * incluidos los subidos tarde por falta de señal, que quedan marcados como carga diferida.
 */
export function ingestPoints(key: string, points: IncomingPoint[], source: TrackSource, opts: { delayed?: boolean } = {}): { stored: number } {
  const ref = tripRef(key);
  if (!ref) throw notFound('El viaje no existe.');
  const store = db();
  const now = nowIso();
  const end = ref.arrivalAt || now;
  let stored = 0;
  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) continue;
    const at = p.at && !Number.isNaN(Date.parse(p.at)) ? new Date(p.at).toISOString() : now;
    if (at < ref.departureAt || at > end) continue;
    const point: TrackPoint = { id: newId('tp'), tripKey: ref.key, vehicleId: ref.vehicleId, source, lat: p.lat, lng: p.lng, at, receivedAt: now, accuracy: p.accuracy ?? null, speedKmh: p.speedKmh ?? null, delayed: !!opts.delayed || Date.parse(now) - Date.parse(at) > 5 * 60_000, label: p.label ?? null };
    store.put('trackPoints', point);
    stored++;
  }
  if (stored && ref.state === 'in_transit') analyzeTrip(ref.key);
  return { stored };
}

export function pointsOf(key: string): TrackPoint[] {
  return db()
    .filter('trackPoints', (p) => p.tripKey === key)
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1));
}

/** Hash del trazado completo; se sella en la cadena del viaje al llegar (3.1, 3.2). */
export function traceHash(key: string): { hash: string; count: number } {
  const pts = pointsOf(key).map((p) => ({ id: p.id, source: p.source, lat: p.lat, lng: p.lng, at: p.at, receivedAt: p.receivedAt, accuracy: p.accuracy ?? null, speedKmh: p.speedKmh ?? null, label: p.label ?? null }));
  return { hash: sha256(canonical(pts)), count: pts.length };
}

export function verifyTrace(key: string): { status: 'intact' | 'altered' | 'not_sealed'; sealedHash: string | null; currentHash: string; count: number } {
  const ref = tripRef(key);
  if (!ref) throw notFound('El viaje no existe.');
  const store = db();
  const sealed = ref.kind === 'trip' ? store.get('trips', ref.key)?.traceHash ?? null : store.get('movements', ref.key)?.traceHash ?? null;
  const cur = traceHash(key);
  return { status: !sealed ? 'not_sealed' : sealed === cur.hash ? 'intact' : 'altered', sealedHash: sealed, currentHash: cur.hash, count: cur.count };
}

// ---------------------------------------------------------------- análisis del trazado

export interface DetectedStop {
  start: string;
  end: string;
  lat: number;
  lng: number;
  durationS: number;
  insidePerimeter: boolean;
  declared: boolean;
}

const STOP_RADIUS_M = 60;

export function detectStops(key: string): DetectedStop[] {
  const ref = tripRef(key);
  if (!ref) return [];
  const pts = pointsOf(key).filter((p) => p.source !== 'checkpoint');
  const declared = db().filter('declaredStops', (s) => s.tripKey === key);
  const radius = getConfig().tracking.geofenceM;
  const stops: DetectedStop[] = [];
  let i = 0;
  while (i < pts.length) {
    let j = i;
    while (j + 1 < pts.length && distanceMeters(pts[i], pts[j + 1]) <= STOP_RADIUS_M) j++;
    const dur = (Date.parse(pts[j].at) - Date.parse(pts[i].at)) / 1000;
    if (j > i && dur >= 60) {
      const c = { lat: pts[i].lat, lng: pts[i].lng };
      stops.push({
        start: pts[i].at,
        end: pts[j].at,
        lat: c.lat,
        lng: c.lng,
        durationS: Math.round(dur),
        insidePerimeter: ref.perimeters.some((p) => distanceMeters(p, c) <= radius),
        declared: declared.some((s) => (!s.location || distanceMeters(s.location, c) <= 300) && s.at >= new Date(Date.parse(pts[i].at) - 10 * 60_000).toISOString() && s.at <= new Date(Date.parse(pts[j].at) + 60_000).toISOString()),
      });
      i = j + 1;
    } else i++;
  }
  return stops;
}

function distanceToPolyline(p: GeoPoint, line: [number, number][]): number {
  if (line.length === 1) return distanceMeters(p, { lat: line[0][0], lng: line[0][1] });
  const k = Math.cos((p.lat * Math.PI) / 180) * 111_320;
  const x = p.lng * k;
  const y = p.lat * 110_540;
  let best = Infinity;
  for (let s = 0; s < line.length - 1; s++) {
    const ax = line[s][1] * k, ay = line[s][0] * 110_540, bx = line[s + 1][1] * k, by = line[s + 1][0] * 110_540;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const tt = len2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
    const d = Math.hypot(x - (ax + tt * dx), y - (ay + tt * dy));
    if (d < best) best = d;
  }
  return best;
}

const lastAnalysis = new Map<string, number>();

/** Alertas automáticas: parada no declarada, desvío de ruta y duración excesiva (umbrales configurables). */
export function analyzeTrip(key: string, force = false): void {
  const now = Date.now();
  if (!force && now - (lastAnalysis.get(key) || 0) < 15_000) return;
  lastAnalysis.set(key, now);
  const ref = tripRef(key);
  if (!ref) return;
  const cfg = getConfig().tracking;
  for (const s of detectStops(key)) {
    if (s.insidePerimeter || s.declared || s.durationS < cfg.stopAlertMinutes * 60) continue;
    raiseTrackingAlert(`al_stop_${key}_${s.start}`, 'route_alert', key, `Parada no declarada de ${Math.round(s.durationS / 60)} minutos fuera de perímetro en el viaje ${ref.code}.`);
  }
  const route = db().get('tripRoutes', key);
  if (route?.planned && route.planned.length >= 2) {
    const off = pointsOf(key).find((p) => p.source !== 'checkpoint' && (p.accuracy == null || p.accuracy <= 100) && distanceToPolyline(p, route.planned!) > cfg.deviationM);
    if (off) raiseTrackingAlert(`al_dev_${key}`, 'route_alert', key, `El viaje ${ref.code} se desvió más de ${cfg.deviationM} m de la ruta planificada.`);
  }
  checkOvertime(ref);
}

export function checkOvertime(ref: TripRef): void {
  const route = db().get('tripRoutes', ref.key);
  if (!route?.expectedSeconds) return;
  const end = ref.arrivalAt ? Date.parse(ref.arrivalAt) : Date.now();
  const elapsed = (end - Date.parse(ref.departureAt)) / 1000;
  const factor = getConfig().tracking.durationFactor;
  if (elapsed > route.expectedSeconds * factor) raiseTrackingAlert(`al_slow_${ref.key}`, 'route_alert', ref.key, `El viaje ${ref.code} lleva más de ${factor} veces el tiempo esperado.`);
}

/** Lo ejecuta el planificador: revisa la duración de los viajes abiertos. */
export function checkOpenTripsOvertime(): void {
  const store = db();
  for (const t of store.filter('trips', (x) => x.state === 'in_transit')) checkOvertime(originTripRef(t));
  for (const m of store.filter('movements', (x) => x.state === 'in_transit')) checkOvertime(movementRef(m));
}

// ---------------------------------------------------------------- vistas

/** Llegada estimada: salida + tiempo esperado, o última posición + distancia restante a velocidad media. */
export function etaOf(ref: TripRef): string | null {
  if (ref.state !== 'in_transit') return null;
  const avg = (getConfig().tracking.averageSpeedKmh * 1000) / 3600;
  const pts = pointsOf(ref.key);
  const last = pts[pts.length - 1];
  if (last && ref.to) return new Date(Math.max(Date.now(), Date.parse(last.at)) + (distanceMeters(last, ref.to) * 1.3 * 1000) / avg).toISOString();
  const route = db().get('tripRoutes', ref.key);
  if (route?.expectedSeconds) return new Date(Date.parse(ref.departureAt) + route.expectedSeconds * 1000).toISOString();
  return null;
}

/** Tramos del trazado: los huecos se muestran como huecos, nunca se rellenan con puntos inventados. */
export function traceSegments(key: string): [number, number, string][][] {
  const gapS = Math.max(180, getConfig().tracking.intervalSeconds * 3);
  const segs: [number, number, string][][] = [];
  let cur: [number, number, string][] = [];
  let prev: TrackPoint | null = null;
  for (const p of pointsOf(key)) {
    if (prev && (Date.parse(p.at) - Date.parse(prev.at)) / 1000 > gapS) {
      if (cur.length) segs.push(cur);
      cur = [];
    }
    cur.push([p.lat, p.lng, p.at]);
    prev = p;
  }
  if (cur.length) segs.push(cur);
  return segs;
}

export function traceComplete(ref: TripRef): boolean {
  if (ref.state !== 'received' || !ref.arrivalAt) return false;
  const pts = pointsOf(ref.key);
  if (pts.length < 2) return false;
  const gapS = Math.max(180, getConfig().tracking.intervalSeconds * 3);
  if ((Date.parse(pts[0].at) - Date.parse(ref.departureAt)) / 1000 > gapS) return false;
  if ((Date.parse(ref.arrivalAt) - Date.parse(pts[pts.length - 1].at)) / 1000 > gapS) return false;
  for (let i = 1; i < pts.length; i++) if ((Date.parse(pts[i].at) - Date.parse(pts[i - 1].at)) / 1000 > gapS) return false;
  return true;
}

/** Quién puede ver el seguimiento: admin principal, coordinador, supervisor, centro de destino y el escolta del viaje. */
export function canViewTrip(user: User, role: Role, ref: TripRef): boolean {
  if (role === 'admin' || role === 'coordinator' || role === 'supervisor') return true;
  if (ref.departureUserId === user.id) return true;
  if (role === 'center' && !!user.centerId && (user.centerId === ref.destCenterId || (ref.kind === 'movement' && db().get('movements', ref.key)?.fromCenterId === user.centerId))) return true;
  if (role === 'destination' && ref.destWorkId && db().get('works', ref.destWorkId)?.entityId === user.entityId) return true;
  return false;
}

export function assertCanView(user: User, role: Role, ref: TripRef): void {
  if (!canViewTrip(user, role, ref)) throw forbidden('El seguimiento de este viaje solo lo ven roles autorizados.');
}

/** El escolta (quien registró la salida) o su entidad envían posiciones y declaran paradas. */
export function assertEscort(actor: Actor, ref: TripRef): void {
  if (!actor.id) throw forbidden();
  if (ref.departureUserId !== actor.id && ref.departureEntityId !== actor.entityId) throw forbidden('Solo el escolta del viaje o su entidad pueden registrar el recorrido.');
}

export function tripTrackView(ref: TripRef) {
  const store = db();
  const route = store.get('tripRoutes', ref.key) || null;
  const vehicle = store.get('vehicles', ref.vehicleId);
  const pts = pointsOf(ref.key);
  const last = pts[pts.length - 1] || null;
  const doc = ref.kind === 'trip' ? store.get('trips', ref.key) : store.get('movements', ref.key);
  return {
    key: ref.key,
    kind: ref.kind,
    code: ref.code,
    state: ref.state,
    vehiclePlate: vehicle?.plate ?? null,
    trackerType: vehicle?.trackerType ?? null,
    hasDevice: !!vehicle?.imei,
    from: ref.from,
    fromLabel: ref.fromLabel,
    to: ref.to,
    toLabel: ref.toLabel,
    departureAt: ref.departureAt,
    arrivalAt: ref.arrivalAt,
    eta: etaOf(ref),
    planned: route,
    segments: traceSegments(ref.key),
    pointCount: pts.length,
    sources: [...new Set(pts.map((p) => p.source))],
    lastPosition: last ? { lat: last.lat, lng: last.lng, at: last.at, source: last.source } : null,
    stops: detectStops(ref.key),
    declaredStops: store.filter('declaredStops', (s) => s.tripKey === ref.key).map((s) => ({ ...s, photoUrl: s.photoId ? store.get('photos', s.photoId)?.url ?? null : null })),
    alerts: store.filter('alerts', (a) => a.objectType === 'trip' && a.objectId === ref.key).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)),
    checkpoints: store
      .eventsOfChain(`trip:${ref.key}`)
      .filter((e) => ['trip_departure', 'trip_arrival', 'movement_departure', 'movement_arrival', 'gate_presence', 'stop_declared', 'device_event'].includes(e.type))
      .map((e) => ({ type: e.type, at: e.serverTime, data: e.data })),
    departureCheck: doc?.departureCheck ?? null,
    arrivalCheck: doc?.arrivalCheck ?? null,
    traceSealed: !!doc?.traceHash,
    complete: traceComplete(ref),
  };
}

/** Viajes abiertos con su última posición y llegada estimada (mapa interno, nunca público). */
export function activeTrips(filter?: (ref: TripRef) => boolean) {
  const store = db();
  const refs = [...store.filter('trips', (t) => t.state === 'in_transit').map(originTripRef), ...store.filter('movements', (m) => m.state === 'in_transit').map(movementRef)];
  return refs
    .filter((r) => !filter || filter(r))
    .map((r) => {
      const pts = pointsOf(r.key);
      const last = pts[pts.length - 1] || null;
      return {
        key: r.key,
        kind: r.kind,
        code: r.code,
        vehiclePlate: store.get('vehicles', r.vehicleId)?.plate ?? null,
        fromLabel: r.fromLabel,
        toLabel: r.toLabel,
        destCenterId: r.destCenterId,
        departureAt: r.departureAt,
        eta: etaOf(r),
        lastPosition: last ? { lat: last.lat, lng: last.lng, at: last.at, source: last.source } : null,
        openAlerts: store.filter('alerts', (a) => a.objectType === 'trip' && a.objectId === r.key && !a.resolvedAt).length,
      };
    })
    .sort((a, b) => (a.departureAt < b.departureAt ? -1 : 1));
}

/** Indicadores para el panel del supervisor: tiempo medio por ruta, paradas por viaje, % con trazado completo. */
export function trackingIndicators() {
  const store = db();
  const done = [...store.filter('trips', (t) => t.state === 'received').map(originTripRef), ...store.filter('movements', (m) => m.state === 'received').map(movementRef)].filter((r) => r.arrivalAt);
  const byRoute = new Map<string, { total: number; n: number }>();
  let stops = 0;
  let complete = 0;
  let withTrace = 0;
  for (const r of done) {
    const label = r.kind === 'trip' ? `Origen → ${r.toLabel}` : `${r.fromLabel} → ${r.toLabel}`;
    const cur = byRoute.get(label) || { total: 0, n: 0 };
    cur.total += (Date.parse(r.arrivalAt!) - Date.parse(r.departureAt)) / 60_000;
    cur.n++;
    byRoute.set(label, cur);
    if (pointsOf(r.key).length) {
      withTrace++;
      stops += detectStops(r.key).length;
    }
    if (traceComplete(r)) complete++;
  }
  return {
    trips: done.length,
    averageMinutesByRoute: [...byRoute.entries()].map(([route, v]) => ({ route, trips: v.n, averageMinutes: Math.round(v.total / v.n) })).sort((a, b) => b.trips - a.trips),
    stopsPerTrip: withTrace ? Math.round((stops / withTrace) * 10) / 10 : null,
    completeTracePercent: done.length ? Math.round((complete / done.length) * 100) : null,
    tripsWithTrace: withTrace,
  };
}

// ---------------------------------------------------------------- puertas (QR fijo)

export function findGate(code: string): { kind: 'center' | 'work'; id: string; name: string; point: GeoPoint | null } | null {
  const store = db();
  const c = code.trim().toUpperCase();
  const center = store.find('centers', (x) => gateCodeOfCenter(x).toUpperCase() === c);
  if (center) return { kind: 'center', id: center.id, name: center.name, point: centerPoint(center) };
  const work = store.find('works', (x) => gateCodeOfWork(x).toUpperCase() === c);
  if (work) return { kind: 'work', id: work.id, name: work.name, point: work.location ?? null };
  return null;
}

/** Escaneo del QR de la puerta con el teléfono del escolta: registra presencia cuando no hay personal. */
export function recordGatePresence(actor: Actor, input: { gateCode: string; tripKey?: string | null; location?: GeoPoint | null; deviceTime?: string | null; offlineQueuedAt?: string | null }) {
  const gate = findGate(input.gateCode);
  if (!gate) throw notFound('Ese QR de puerta no existe.');
  const store = db();
  let ref = input.tripKey ? tripRef(input.tripKey) : null;
  if (!ref && actor.id) {
    const mine = activeTrips().find((t) => tripRef(t.key)?.departureUserId === actor.id);
    ref = mine ? tripRef(mine.key) : null;
  }
  if (!ref) throw badRequest('No tienes un viaje activo para registrar en esta puerta.');
  const check = geofenceCheck(input.location, gate.point);
  appendEvent({ type: 'gate_presence', objectType: 'trip', objectId: ref.key, actor, data: { gateKind: gate.kind, gateId: gate.id, gateName: gate.name, location: input.location ?? null, geofence: check, counts: check === 'inside' || check === 'no_reference' }, deviceTime: input.deviceTime, offlineQueuedAt: input.offlineQueuedAt });
  if (input.location) ingestPoints(ref.key, [{ ...input.location, at: input.deviceTime ?? null, label: `Puerta: ${gate.name}` }], 'checkpoint', { delayed: !!input.offlineQueuedAt });
  const expected = gate.kind === 'center' ? ref.destCenterId === gate.id : ref.destWorkId === gate.id;
  const fromGate = ref.kind === 'movement' && gate.kind === 'center' && store.get('movements', ref.key)?.fromCenterId === gate.id;
  if (!expected && !fromGate) raiseTrackingAlert(`al_wronggate_${ref.key}_${gate.id}`, 'gate_alert', ref.key, `El viaje ${ref.code} registró presencia en ${gate.name}, distinto del destino declarado (${ref.toLabel}).`);
  if (check === 'outside') raiseTrackingAlert(`al_gatefence_${ref.key}_${gate.id}`, 'gate_alert', ref.key, `Escaneo de puerta fuera de perímetro en ${gate.name} (viaje ${ref.code}): no cuenta como presencia.`);
  // El escolta cierra la llegada escaneando el QR de la puerta del destino, solo si está dentro del perímetro.
  const isEscort = ref.departureUserId === actor.id || ref.departureEntityId === actor.entityId;
  const closes = expected && check === 'inside' && isEscort && (ref.state === 'in_transit' || ref.state === 'no_arrival');
  return { tripKey: ref.key, kind: ref.kind, gate: gate.name, geofence: check, counts: check === 'inside' || check === 'no_reference', closes };
}
