import { get, set } from 'idb-keyval';
import { api } from './api';

/** Tipos de las vistas de seguimiento (addendum v1.3). */
export interface GeoPt {
  lat: number;
  lng: number;
}

export interface ActiveTrip {
  key: string;
  kind: 'trip' | 'movement';
  code: string;
  vehiclePlate: string | null;
  fromLabel: string;
  toLabel: string;
  destCenterId: string | null;
  departureAt: string;
  eta: string | null;
  lastPosition: { lat: number; lng: number; at: string; source: string } | null;
  openAlerts: number;
}

export interface TrackView {
  key: string;
  kind: 'trip' | 'movement';
  code: string;
  state: 'in_transit' | 'received' | 'no_arrival';
  vehiclePlate: string | null;
  trackerType: 'gps' | 'traccar_client' | null;
  hasDevice: boolean;
  from: GeoPt | null;
  fromLabel: string;
  to: GeoPt | null;
  toLabel: string;
  departureAt: string;
  arrivalAt: string | null;
  eta: string | null;
  planned: { planned: [number, number][] | null; expectedSeconds: number | null; distanceM: number | null; source: string } | null;
  segments: [number, number, string][][];
  pointCount: number;
  sources: string[];
  lastPosition: { lat: number; lng: number; at: string; source: string } | null;
  stops: { start: string; end: string; lat: number; lng: number; durationS: number; insidePerimeter: boolean; declared: boolean }[];
  declaredStops: { id: string; reason: string; note: string | null; at: string; location: GeoPt | null; photoUrl: string | null }[];
  alerts: { id: string; kind: string; text: string; createdAt: string; resolvedAt?: string | null }[];
  checkpoints: { type: string; at: string; data: Record<string, unknown> }[];
  departureCheck: string | null;
  arrivalCheck: string | null;
  traceSealed: boolean;
  complete: boolean;
}

export const SOURCE_LABELS: Record<string, string> = { gps: 'GPS del camión', traccar_client: 'Teléfono con Traccar Client', pwa: 'Teléfono del escolta', checkpoint: 'Punto de control' };

// ---------------------------------------------------------------- envío de posiciones del escolta con buffer sin señal

interface Buffered {
  lat: number;
  lng: number;
  at: string;
  accuracy: number | null;
  speedKmh: number | null;
}

const bufKey = (tripKey: string) => `kindra.track.${tripKey}`;

export async function bufferPoint(tripKey: string, p: Buffered): Promise<void> {
  const list = ((await get(bufKey(tripKey))) as Buffered[] | undefined) || [];
  list.push(p);
  await set(bufKey(tripKey), list.slice(-2000));
}

export async function pendingPoints(tripKey: string): Promise<number> {
  return (((await get(bufKey(tripKey))) as Buffered[] | undefined) || []).length;
}

/** Sube lo guardado; si no hay señal queda en el teléfono y se reintenta. Devuelve el estado del viaje. */
export async function flushPoints(tripKey: string): Promise<string | null> {
  const list = ((await get(bufKey(tripKey))) as Buffered[] | undefined) || [];
  if (!list.length || !navigator.onLine) return null;
  const oldest = list[0].at;
  const delayed = Date.now() - Date.parse(oldest) > 5 * 60_000;
  const r = await api.post<{ stored: number; state: string }>(`/tracking/trips/${tripKey}/points`, { points: list.slice(0, 500), delayed });
  await set(bufKey(tripKey), list.slice(500));
  return r.state;
}

/** Mantiene la pantalla encendida durante el viaje (si el navegador lo permite). */
export async function keepAwake(): Promise<{ release: () => void } | null> {
  try {
    const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    if (!wl) return null;
    const lock = await wl.request('screen');
    return { release: () => void lock.release().catch(() => undefined) };
  } catch {
    return null;
  }
}

export const navLinks = (to: GeoPt) => ({
  google: `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}&travelmode=driving`,
  waze: `https://waze.com/ul?ll=${to.lat},${to.lng}&navigate=yes`,
});
