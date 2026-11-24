import { get, set } from 'idb-keyval';
import { api, ApiError } from './api';
import { uploadPhoto } from './media';
import { toast } from './toast';

/**
 * Escaneos sin señal (addendum v1.3, 18.1): la acción se guarda en el teléfono con su hora y ubicación y se sube
 * al volver la señal. El servidor la marca como carga diferida (X-Offline-Queued-At) para no tratarla como hora inconsistente.
 */
interface QueuedAction {
  id: string;
  queuedAt: string;
  path: string;
  body: Record<string, unknown>;
  photo?: { dataUrl: string; kind: string; location: { lat: number; lng: number } | null } | null;
  label: string;
}

const KEY = 'kindra.pendingActions';
let flushing = false;

const list = async () => ((await get(KEY)) as QueuedAction[] | undefined) || [];

export async function pendingPaths(): Promise<string[]> {
  return (await list()).map((a) => a.path);
}

export async function pendingActions(): Promise<number> {
  return (await list()).length;
}

/**
 * Envía la acción; si no hay señal la guarda. Si lleva foto, se sube primero y su id va en `photoId`.
 * Devuelve la respuesta del servidor o null si quedó en cola.
 */
export async function sendOrQueue<T>(path: string, body: Record<string, unknown>, label: string, photo?: QueuedAction['photo']): Promise<T | null> {
  try {
    if (!navigator.onLine) throw new ApiError(0, 'offline', 'network');
    const photoId = photo ? (await uploadPhoto(photo.dataUrl, photo.kind, photo.location)).id : undefined;
    return await api.post<T>(path, photoId ? { ...body, photoId } : body);
  } catch (err) {
    if (!(err instanceof ApiError) || !err.isNetwork) throw err;
    const items = await list();
    items.push({ id: `pa_${Date.now()}`, queuedAt: new Date().toISOString(), path, body, photo: photo ?? null, label });
    await set(KEY, items);
    toast.info(`Sin señal: "${label}" quedó guardado en el teléfono y se enviará al volver la conexión.`);
    return null;
  }
}

export async function flushActions(): Promise<number> {
  if (flushing || !navigator.onLine) return 0;
  flushing = true;
  let sent = 0;
  try {
    const items = await list();
    const remaining: QueuedAction[] = [];
    for (const it of items) {
      try {
        const photoId = it.photo ? (await api.post<{ id: string }>('/photos', { dataUrl: it.photo.dataUrl, kind: it.photo.kind, location: it.photo.location }, { offlineQueuedAt: it.queuedAt })).id : undefined;
        await api.post(it.path, photoId ? { ...it.body, photoId } : it.body, { offlineQueuedAt: it.queuedAt });
        sent++;
      } catch (err) {
        if (err instanceof ApiError && err.isNetwork) remaining.push(it);
        else toast.error(`"${it.label}" no se pudo registrar: ${err instanceof Error ? err.message : 'error'}`);
      }
    }
    await set(KEY, remaining);
    if (sent) toast.success(`Se enviaron ${sent} escaneo${sent === 1 ? '' : 's'} guardados sin señal.`);
  } finally {
    flushing = false;
  }
  return sent;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void flushActions());
  setInterval(() => void flushActions(), 60_000);
}
