import { getToken } from './auth';
import { clientKey } from './storage';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string = 'error',
    public details?: unknown,
  ) {
    super(message);
  }
  get isNetwork() {
    return this.status === 0;
  }
}

export interface RequestOptions {
  offlineQueuedAt?: string | null;
  signal?: AbortSignal;
  raw?: boolean;
}

async function request<T>(method: string, path: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Device-Time': new Date().toISOString(),
    'X-Client-Key': clientKey(),
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.offlineQueuedAt) headers['X-Offline-Queued-At'] = opts.offlineQueuedAt;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: opts.signal });
  } catch (err) {
    throw new ApiError(0, 'Sin conexión. Revisa tu señal e inténtalo de nuevo.', 'network', err);
  }
  if (opts.raw) return res as unknown as T;
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const d = (data || {}) as { error?: string; code?: string; details?: unknown };
    throw new ApiError(res.status, d.error || `Error ${res.status}`, d.code || 'error', d.details);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>('GET', path, undefined, opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('POST', path, body ?? {}, opts),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('PUT', path, body ?? {}, opts),
  del: <T>(path: string, opts?: RequestOptions) => request<T>('DELETE', path, undefined, opts),
  text: async (path: string): Promise<string> => {
    const res = await fetch(`/api${path}`, { headers: { Authorization: getToken() ? `Bearer ${getToken()}` : '' } });
    if (!res.ok) throw new ApiError(res.status, 'No se pudo obtener el contenido.');
    return res.text();
  },
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Ocurrió un error inesperado.';
}
