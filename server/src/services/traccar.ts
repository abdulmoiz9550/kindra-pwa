import { db } from '../core/db';
import { appendEvent, SYSTEM_ACTOR } from '../core/events';
import { nowIso } from '../core/ids';
import { getConfig } from './config';
import { notifyRole } from './notifications';
import { ingestPoints, openTripOfVehicle, raiseTrackingAlert } from './tracking';

/**
 * Integración con un servidor Traccar (código abierto) que recibe las posiciones de los dispositivos GPS y de
 * Traccar Client. Kindra no integra marcas de dispositivo: lee de Traccar por reenvío de posiciones/eventos
 * (webhook) y, si se configura, consultando su API. Las posiciones solo se guardan en Kindra durante un viaje activo.
 *
 * Variables: TRACCAR_URL, TRACCAR_TOKEN (o TRACCAR_USER + TRACCAR_PASSWORD), TRACCAR_FORWARD_SECRET.
 */

export const traccarEnv = () => ({
  url: (process.env.TRACCAR_URL || '').replace(/\/$/, ''),
  token: process.env.TRACCAR_TOKEN || '',
  user: process.env.TRACCAR_USER || '',
  password: process.env.TRACCAR_PASSWORD || '',
  secret: process.env.TRACCAR_FORWARD_SECRET || '',
});

const status = { lastPollAt: null as string | null, lastError: null as string | null, lastForwardAt: null as string | null, devicesSeen: 0 };
export const traccarStatus = () => {
  const e = traccarEnv();
  return { configured: !!e.url, forwardSecretSet: !!e.secret, ...status };
};

interface TraccarPosition {
  deviceId: number;
  latitude: number;
  longitude: number;
  fixTime?: string;
  deviceTime?: string;
  speed?: number; // nudos
  accuracy?: number;
  attributes?: Record<string, unknown>;
}

const vehicleByDevice = (uniqueId: string | null | undefined) => (uniqueId ? db().find('vehicles', (v) => !!v.imei && v.imei.trim() === String(uniqueId).trim()) : undefined);

/** Posición de un dispositivo: solo se guarda si su vehículo tiene un viaje activo. */
export function handleTraccarPosition(position: TraccarPosition, uniqueId: string): boolean {
  const vehicle = vehicleByDevice(uniqueId);
  if (!vehicle) return false;
  const trip = openTripOfVehicle(vehicle.id);
  if (!trip) return false;
  const source = vehicle.trackerType === 'traccar_client' ? 'traccar_client' : 'gps';
  const at = position.fixTime || position.deviceTime || nowIso();
  const last = db().filter('trackPoints', (p) => p.tripKey === trip.key && p.source === source).sort((a, b) => (a.at < b.at ? 1 : -1))[0];
  if (last && last.at >= new Date(at).toISOString()) return false;
  ingestPoints(trip.key, [{ lat: position.latitude, lng: position.longitude, at, accuracy: position.accuracy ?? null, speedKmh: typeof position.speed === 'number' ? Math.round(position.speed * 1.852 * 10) / 10 : null }], source);
  return true;
}

const EVENT_LABELS: Record<string, string> = {
  ignitionOn: 'Encendido del motor',
  ignitionOff: 'Apagado del motor',
  deviceOffline: 'Pérdida de señal del dispositivo',
  deviceUnknown: 'Dispositivo sin reportar',
  powerCut: 'Corte de energía del dispositivo',
  tampering: 'Manipulación del dispositivo',
  powerOff: 'Dispositivo apagado',
};

/** Eventos del dispositivo: encendido/apagado, corte de energía o manipulación, pérdida de señal. */
export function handleTraccarEvent(event: { type: string; eventTime?: string; attributes?: Record<string, unknown> }, uniqueId: string): boolean {
  const vehicle = vehicleByDevice(uniqueId);
  if (!vehicle) return false;
  const alarm = event.type === 'alarm' ? String(event.attributes?.alarm || '') : '';
  const kind = alarm || event.type;
  const label = EVENT_LABELS[kind] || kind;
  const trip = openTripOfVehicle(vehicle.id);
  const critical = ['powerCut', 'tampering', 'powerOff'].includes(kind);
  if (trip) {
    appendEvent({ type: 'device_event', objectType: 'trip', objectId: trip.key, actor: SYSTEM_ACTOR, data: { kind, label, eventTime: event.eventTime ?? null, vehicleId: vehicle.id }, deviceTime: event.eventTime ?? null });
    if (critical) raiseTrackingAlert(`al_device_${trip.key}_${kind}`, 'device_alert', trip.key, `${label} en el vehículo ${vehicle.plate} durante el viaje ${trip.code}.`);
  } else if (critical) {
    const text = `${label} en el vehículo ${vehicle.plate} (sin viaje activo).`;
    notifyRole('coordinator', 'device_alert', text, { link: '/panel/seguimiento' });
    notifyRole('supervisor', 'device_alert', text, { link: '/panel/seguimiento' });
  }
  return true;
}

/** Acepta el formato de reenvío JSON de Traccar ({ position, device } o { event, position, device }). */
export function handleTraccarForward(body: Record<string, any>): { position: boolean; event: boolean } {
  status.lastForwardAt = nowIso();
  const uniqueId = body?.device?.uniqueId ?? body?.uniqueId ?? body?.id;
  let position = false;
  let event = false;
  if (body?.event?.type) event = handleTraccarEvent(body.event, uniqueId);
  if (body?.position && typeof body.position.latitude === 'number') position = handleTraccarPosition(body.position, uniqueId);
  else if (typeof body?.latitude === 'number' || typeof body?.lat === 'number') {
    position = handleTraccarPosition({ deviceId: 0, latitude: Number(body.latitude ?? body.lat), longitude: Number(body.longitude ?? body.lon), fixTime: body.fixTime ?? (body.timestamp ? new Date(Number(body.timestamp) * 1000).toISOString() : undefined), speed: body.speed !== undefined ? Number(body.speed) : undefined, accuracy: body.accuracy !== undefined ? Number(body.accuracy) : undefined }, uniqueId);
  }
  return { position, event };
}

function authHeaders(): Record<string, string> {
  const e = traccarEnv();
  if (e.token) return { Authorization: `Bearer ${e.token}` };
  if (e.user) return { Authorization: `Basic ${Buffer.from(`${e.user}:${e.password}`).toString('base64')}` };
  return {};
}

/** Consulta la API de Traccar: últimas posiciones de los dispositivos de vehículos con viaje activo. */
export async function pollTraccar(): Promise<number> {
  const e = traccarEnv();
  if (!e.url) return 0;
  try {
    const active = db().filter('vehicles', (v) => !!v.imei && !!openTripOfVehicle(v.id));
    status.lastPollAt = nowIso();
    if (!active.length) return 0;
    const [devices, positions] = await Promise.all([
      fetch(`${e.url}/api/devices`, { headers: authHeaders() }).then((r) => (r.ok ? (r.json() as Promise<{ id: number; uniqueId: string }[]>) : Promise.reject(new Error(`devices ${r.status}`)))),
      fetch(`${e.url}/api/positions`, { headers: authHeaders() }).then((r) => (r.ok ? (r.json() as Promise<TraccarPosition[]>) : Promise.reject(new Error(`positions ${r.status}`)))),
    ]);
    status.devicesSeen = devices.length;
    const uid = new Map(devices.map((d) => [d.id, d.uniqueId]));
    let n = 0;
    for (const p of positions) if (handleTraccarPosition(p, uid.get(p.deviceId) || '')) n++;
    status.lastError = null;
    return n;
  } catch (err) {
    status.lastError = (err as Error).message;
    return 0;
  }
}

let timer: NodeJS.Timeout | null = null;
export function startTraccarPoller(): void {
  if (!traccarEnv().url || timer) return;
  const every = Math.max(15, getConfig().tracking.intervalSeconds) * 1000;
  timer = setInterval(() => void pollTraccar(), every);
}
