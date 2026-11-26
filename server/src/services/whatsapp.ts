import crypto from 'node:crypto';

/**
 * Addendum v4.2, sección 10: canal de WhatsApp de AURA por la API oficial de WhatsApp Business (Meta Cloud API).
 * Es un canal más del mismo backend. Las claves viven solo en variables de entorno del servidor, nunca en el
 * frontend ni en los registros. Sin claves, el canal queda «no configurado» y la PWA es el canal alternativo.
 */

export interface WhatsAppEnv {
  token: string;
  phoneNumberId: string;
  verifyToken: string;
  appSecret: string;
  apiVersion: string;
}

export function whatsappEnv(): WhatsAppEnv {
  return {
    token: process.env.WHATSAPP_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
    appSecret: process.env.WHATSAPP_APP_SECRET || '',
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v21.0',
  };
}

export const whatsappConfigured = () => {
  const e = whatsappEnv();
  return !!(e.token && e.phoneNumberId && e.verifyToken && e.appSecret);
};

/** Estado del canal para el portal y la PWA: si la API falla, se indica la PWA como alternativa. */
let lastFailureAt = 0;
let lastSuccessAt = 0;
export function whatsappStatus(): 'not_configured' | 'ok' | 'down' {
  if (!whatsappConfigured()) return 'not_configured';
  return lastFailureAt > lastSuccessAt && Date.now() - lastFailureAt < 30 * 60_000 ? 'down' : 'ok';
}

/** Verificación de la suscripción del webhook (GET de Meta). */
export function verifySubscription(q: Record<string, unknown>): string | null {
  const e = whatsappEnv();
  if (!e.verifyToken) return null;
  return q['hub.mode'] === 'subscribe' && q['hub.verify_token'] === e.verifyToken ? String(q['hub.challenge'] ?? '') : null;
}

/** Firma X-Hub-Signature-256 calculada con el secreto de la app sobre el cuerpo crudo. */
export function validSignature(raw: Buffer | undefined, header: string | undefined): boolean {
  const e = whatsappEnv();
  if (!e.appSecret || !raw || !header?.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', e.appSecret).update(raw).digest('hex');
  const got = header.slice(7);
  return got.length === expected.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

async function graph(path: string, init: RequestInit = {}): Promise<Response> {
  const e = whatsappEnv();
  const res = await fetch(`https://graph.facebook.com/${e.apiVersion}/${path}`, { ...init, headers: { Authorization: `Bearer ${e.token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) } });
  if (res.ok) lastSuccessAt = Date.now();
  else lastFailureAt = Date.now();
  return res;
}

async function send(payload: Record<string, unknown>): Promise<boolean> {
  if (!whatsappConfigured()) return false;
  try {
    const res = await graph(`${whatsappEnv().phoneNumberId}/messages`, { method: 'POST', body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }) });
    if (!res.ok) console.warn('[whatsapp] envío rechazado:', res.status);
    return res.ok;
  } catch (err) {
    lastFailureAt = Date.now();
    console.warn('[whatsapp] sin conexión con la API:', (err as Error).message);
    return false;
  }
}

export const sendText = (to: string, body: string) => send({ to, type: 'text', text: { body, preview_url: true } });
export const sendImage = (to: string, link: string, caption?: string) => send({ to, type: 'image', image: { link, ...(caption ? { caption } : {}) } });

/** Plantilla aprobada por Meta para avisos fuera de la ventana de 24 horas. Solo lleva el nombre de pila. */
export const sendTemplate = (to: string, name: string, firstName: string, lang = 'es') =>
  send({ to, type: 'template', template: { name, language: { code: lang }, components: [{ type: 'body', parameters: [{ type: 'text', text: firstName || 'vecino' }] }] } });

/** Descarga una imagen recibida (id de medio de Meta) como data URL para guardarla con la misma función de la PWA. */
export async function downloadMedia(mediaId: string): Promise<string | null> {
  if (!whatsappConfigured()) return null;
  try {
    const meta = await graph(mediaId);
    if (!meta.ok) return null;
    const info = (await meta.json()) as { url?: string; mime_type?: string };
    if (!info.url || !/^image\/(jpeg|png|webp)$/.test(info.mime_type || '')) return null;
    const file = await fetch(info.url, { headers: { Authorization: `Bearer ${whatsappEnv().token}` } });
    if (!file.ok) return null;
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length > 6 * 1024 * 1024) return null;
    return `data:${info.mime_type};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

export interface IncomingMessage {
  waId: string;
  profileName: string | null;
  type: 'text' | 'image' | 'audio' | 'location' | 'interactive' | 'other';
  text: string | null;
  mediaId: string | null;
  location: { lat: number; lng: number } | null;
  messageId: string;
}

/** Extrae los mensajes del cuerpo del webhook (entry[].changes[].value). */
export function parseWebhook(body: unknown): IncomingMessage[] {
  const out: IncomingMessage[] = [];
  const entries = (body as { entry?: unknown[] })?.entry ?? [];
  for (const entry of entries as { changes?: { value?: Record<string, any> }[] }[]) {
    for (const ch of entry.changes ?? []) {
      const v = ch.value ?? {};
      const names = new Map<string, string>(((v.contacts as any[]) ?? []).map((c) => [String(c.wa_id), String(c.profile?.name ?? '')]));
      for (const m of (v.messages as any[]) ?? []) {
        const waId = String(m.from ?? '');
        if (!waId) continue;
        const type = ['text', 'image', 'audio', 'location', 'interactive'].includes(m.type) ? m.type : m.type === 'voice' ? 'audio' : 'other';
        out.push({
          waId,
          profileName: names.get(waId) || null,
          type,
          text: m.text?.body ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? m.image?.caption ?? null,
          mediaId: m.image?.id ?? null,
          location: m.location ? { lat: Number(m.location.latitude), lng: Number(m.location.longitude) } : null,
          messageId: String(m.id ?? ''),
        });
      }
    }
  }
  return out;
}
