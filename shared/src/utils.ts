import type { GeoPoint, Origin, OriginEffectiveState, LevelConfig, LevelInfo } from './types';
import { ORIGIN_STAGE_ORDER } from './constants';

/** Estado efectivo de un origen (6.1): "pendiente de autorización" mientras la zona no esté liberada. */
export function effectiveOriginState(origin: Pick<Origin, 'state' | 'zoneAuthorized'>): OriginEffectiveState {
  if (!origin.zoneAuthorized && ['registered', 'validated'].includes(origin.state)) return 'pending_authorization';
  return origin.state;
}

export function stageOf(state: string): number {
  return ORIGIN_STAGE_ORDER[state] ?? 0;
}

/** Distancia en metros entre dos puntos (haversine). */
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Punto en polígono (ray casting). polygon = [[lat,lng], ...] */
export function pointInPolygon(p: GeoPoint, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    const intersect = yi > p.lat !== yj > p.lat && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function polygonCentroid(polygon: [number, number][]): GeoPoint {
  const n = polygon.length || 1;
  const lat = polygon.reduce((s, p) => s + p[0], 0) / n;
  const lng = polygon.reduce((s, p) => s + p[1], 0) / n;
  return { lat, lng };
}

export function levelFor(points: number, levels: LevelConfig[]): LevelInfo {
  const sorted = [...levels].sort((a, b) => a.threshold - b.threshold);
  let current = sorted[0];
  for (const l of sorted) if (points >= l.threshold) current = l;
  const idx = sorted.findIndex((l) => l.key === current.key);
  const next = sorted[idx + 1] ? { name: sorted[idx + 1].name, threshold: sorted[idx + 1].threshold } : null;
  return { key: current.key, name: current.name, threshold: current.threshold, next };
}

export function formatNumber(n: number | null | undefined, decimals = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('es-VE', { maximumFractionDigits: decimals }).format(n);
}

export function pct(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${Math.round(n * 100)} %`;
}

export function isoDay(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) out[k] = obj[k];
  return out;
}

/** Sustituye marcadores [nombre] [código] [sector]... en un texto de AURA. */
export function fillTemplate(text: string, vars: Record<string, string | number | null | undefined>): string {
  return text.replace(/\[([a-záéíóúñ_ ]+)\]/gi, (m, key: string) => {
    const k = key.trim().toLowerCase();
    const v = vars[k];
    return v === null || v === undefined ? m : String(v);
  });
}
