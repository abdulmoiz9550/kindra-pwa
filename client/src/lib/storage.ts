/** Clave anónima del dispositivo: permite el límite diario y la cola offline sin cuenta. */
export function clientKey(): string {
  let k = localStorage.getItem('kindra.clientKey');
  if (!k) {
    k = `ck_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    localStorage.setItem('kindra.clientKey', k);
  }
  return k;
}

export interface SavedCode {
  code: string;
  savedAt: string;
  sectorName?: string | null;
}

const CODES_KEY = 'kindra.codes';

/** Códigos de reporte guardados en este teléfono (reportantes sin cuenta). */
export function savedCodes(): SavedCode[] {
  try {
    return JSON.parse(localStorage.getItem(CODES_KEY) || '[]') as SavedCode[];
  } catch {
    return [];
  }
}

export function saveCode(code: string, sectorName?: string | null): void {
  const list = savedCodes().filter((c) => c.code !== code);
  list.unshift({ code, savedAt: new Date().toISOString(), sectorName: sectorName ?? null });
  localStorage.setItem(CODES_KEY, JSON.stringify(list.slice(0, 50)));
  window.dispatchEvent(new Event('kindra:codes'));
}

export function forgetCode(code: string): void {
  localStorage.setItem(CODES_KEY, JSON.stringify(savedCodes().filter((c) => c.code !== code)));
  window.dispatchEvent(new Event('kindra:codes'));
}

export function readJson<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}
