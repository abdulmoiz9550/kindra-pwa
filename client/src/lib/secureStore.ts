import { get, set, del } from 'idb-keyval';

/**
 * Addendum v4.2, sección 11: lo que se guarda sin señal queda cifrado en el teléfono (AES-GCM, clave no exportable
 * creada en este dispositivo) y se borra al sincronizar. Solo se guardan los registros propios.
 */
const KEY_NAME = 'kindra.localKey';
let keyPromise: Promise<CryptoKey | null> | null = null;

function cryptoKey(): Promise<CryptoKey | null> {
  if (!keyPromise) {
    keyPromise = (async () => {
      if (!globalThis.crypto?.subtle) return null;
      const existing = (await get(KEY_NAME)) as CryptoKey | undefined;
      if (existing) return existing;
      const k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      await set(KEY_NAME, k);
      return k;
    })().catch(() => null);
  }
  return keyPromise;
}

interface Sealed {
  v: 1;
  iv: Uint8Array<ArrayBuffer>;
  data: ArrayBuffer;
}

export async function getSecure<T>(key: string): Promise<T | undefined> {
  const raw = (await get(key)) as Sealed | T | undefined;
  if (!raw) return undefined;
  if (!(raw as Sealed).v || !(raw as Sealed).iv) return raw as T; // dato anterior sin cifrar: se re-cifra al guardar
  const k = await cryptoKey();
  if (!k) return undefined;
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: (raw as Sealed).iv }, k, (raw as Sealed).data);
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  } catch {
    return undefined;
  }
}

export async function setSecure<T>(key: string, value: T): Promise<void> {
  const k = await cryptoKey();
  if (!k) {
    await set(key, value);
    return;
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(JSON.stringify(value)));
  await set(key, { v: 1, iv, data } satisfies Sealed);
}

export const delSecure = (key: string) => del(key);
