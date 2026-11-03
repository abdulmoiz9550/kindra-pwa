import { customAlphabet, nanoid } from 'nanoid';
import { CODE_ALPHABET } from '@kindra/shared';

const shortCode = customAlphabet(CODE_ALPHABET, 4);

export const newId = (prefix: string) => `${prefix}_${nanoid(12)}`;

/** Código corto legible por teléfono, p. ej. LG-4821 (5.4). */
export function newOriginCode(exists: (code: string) => boolean): string {
  for (let i = 0; i < 50; i++) {
    const code = `LG-${shortCode()}`;
    if (!exists(code)) return code;
  }
  return `LG-${shortCode()}${shortCode()}`;
}

export function newTripCode(seq: number): string {
  return `V-${String(seq).padStart(4, '0')}`;
}

export function newBatchCode(centerShort: string, seq: number): string {
  return `L-${centerShort}-${String(seq).padStart(3, '0')}`;
}

export function newWorkCode(seq: number): string {
  return `OB-${String(seq).padStart(3, '0')}`;
}

export function newDispatchCode(seq: number): string {
  return `D-${String(seq).padStart(4, '0')}`;
}

export function newCertificateCode(): string {
  return `CERT-${shortCode()}-${shortCode()}`;
}

/** Reloj de la plataforma. La semilla de demostración lo desplaza al pasado para simular historial. */
let clockOffsetMs = 0;
export const nowIso = () => new Date(Date.now() + clockOffsetMs).toISOString();
export function setClockOffset(ms: number): void {
  clockOffsetMs = ms;
}
export function getClockOffset(): number {
  return clockOffsetMs;
}
