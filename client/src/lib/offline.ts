import { get, set, del } from 'idb-keyval';
import { api, ApiError } from './api';
import { saveCode } from './storage';
import { toast } from './toast';

/**
 * 18.1 (versión básica): si no hay señal al enviar un reporte, se guarda aquí y se reintenta
 * cuando vuelve la conexión. El servidor recibe X-Offline-Queued-At para no marcar la hora como inconsistente.
 */
export interface PendingReport {
  id: string;
  queuedAt: string;
  photos: { dataUrl: string; kind: string; location: { lat: number; lng: number } | null; takenAt: string | null }[];
  voiceNote?: string | null;
  body: Record<string, unknown>;
}

const KEY = 'kindra.pendingReports';
let flushing = false;
const listeners = new Set<() => void>();

export async function pendingReports(): Promise<PendingReport[]> {
  return ((await get(KEY)) as PendingReport[] | undefined) || [];
}

export async function enqueueReport(r: Omit<PendingReport, 'id' | 'queuedAt'>): Promise<PendingReport> {
  const list = await pendingReports();
  const item: PendingReport = { ...r, id: `pr_${Date.now()}`, queuedAt: new Date().toISOString() };
  list.push(item);
  await set(KEY, list);
  notifyListeners();
  return item;
}

export function onPendingChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notifyListeners() {
  for (const l of listeners) l();
}

export async function flushPending(): Promise<number> {
  if (flushing || !navigator.onLine) return 0;
  flushing = true;
  let sent = 0;
  try {
    const list = await pendingReports();
    const remaining: PendingReport[] = [];
    for (const item of list) {
      try {
        const photoIds: string[] = [];
        for (const p of item.photos) {
          const ph = await api.post<{ id: string }>('/photos', p, { offlineQueuedAt: item.queuedAt });
          photoIds.push(ph.id);
        }
        let voiceNoteId: string | null = null;
        if (item.voiceNote) {
          const v = await api.post<{ id: string }>('/photos', { dataUrl: item.voiceNote, kind: 'voice' }, { offlineQueuedAt: item.queuedAt });
          voiceNoteId = v.id;
        }
        const r = await api.post<{ code: string; sector: { name: string } }>('/origins', { ...item.body, photoIds, voiceNoteId }, { offlineQueuedAt: item.queuedAt });
        saveCode(r.code, r.sector?.name);
        toast.success(`Volvió la conexión: tu reporte quedó registrado con el código ${r.code}.`);
        sent++;
      } catch (err) {
        if (err instanceof ApiError && err.isNetwork) remaining.push(item);
        else {
          toast.error(`Un reporte guardado sin conexión no pudo enviarse: ${(err as Error).message}`);
        }
      }
    }
    if (remaining.length) await set(KEY, remaining);
    else await del(KEY);
    notifyListeners();
  } finally {
    flushing = false;
  }
  return sent;
}

export function startOfflineSync(): void {
  window.addEventListener('online', () => {
    flushPending();
  });
  if (navigator.onLine) flushPending();
}
