import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Códigos de un solo uso basados en tiempo (RFC 6238, compatible con Google Authenticator,
 * Microsoft Authenticator, Authy, 1Password). Sin dependencias externas.
 */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const generateSecret = () => base32Encode(randomBytes(20));

function hotp(secret: string, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = h[h.length - 1] & 0xf;
  const bin = ((h[offset] & 0x7f) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3];
  return String(bin % 10 ** DIGITS).padStart(DIGITS, '0');
}

export function totp(secret: string, atMs = Date.now()): string {
  return hotp(secret, Math.floor(atMs / 1000 / STEP_SECONDS));
}

/** Acepta el código del intervalo actual y de uno antes o después (desfase de reloj del teléfono). */
export function verifyTotp(secret: string, code: string, atMs = Date.now()): boolean {
  const c = String(code || '').replace(/\D/g, '');
  if (c.length !== DIGITS) return false;
  const counter = Math.floor(atMs / 1000 / STEP_SECONDS);
  for (const delta of [-1, 0, 1]) {
    const expected = hotp(secret, counter + delta);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(c))) return true;
  }
  return false;
}

export function otpauthUrl(secret: string, account: string, issuer = 'Kindra'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}
