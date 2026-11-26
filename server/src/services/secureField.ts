import crypto from 'node:crypto';
import { env } from '../config/env';

/**
 * Addendum v4.2, 10.6 y 13: el teléfono y el nombre de quien habla con AURA se guardan cifrados (AES-256-GCM).
 * La clave sale de AURA_DATA_KEY (o, si falta, del secreto del servidor). Nunca se escribe en registros.
 */
const key = () => crypto.createHash('sha256').update(process.env.AURA_DATA_KEY || `kindra-aura:${env.jwtSecret}`).digest();

export function encryptField(plain: string | null | undefined): string | null {
  if (plain == null || plain === '') return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return `enc:${Buffer.concat([iv, c.getAuthTag(), data]).toString('base64')}`;
}

export function decryptField(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith('enc:')) return value;
  try {
    const buf = Buffer.from(value.slice(4), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', key(), buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** Seudónimo estable para registros internos: nunca el número ni el nombre. */
export function pseudonym(seed: string): string {
  return `p_${crypto.createHmac('sha256', key()).update(seed).digest('hex').slice(0, 16)}`;
}
