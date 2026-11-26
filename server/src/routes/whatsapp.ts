import express, { Router } from 'express';
import { env } from '../config/env';
import { auraReply } from '../services/auraV42';
import { savePhoto } from '../services/photos';
import { persistUpload } from '../services/photoStore';
import { signUpload } from '../services/uploads';
import { downloadMedia, parseWebhook, sendImage, sendText, validSignature, verifySubscription, whatsappConfigured } from '../services/whatsapp';

/**
 * Addendum v4.2, sección 10: webhook de la API oficial de WhatsApp Business (Meta Cloud API).
 * GET verifica la suscripción; POST recibe mensajes firmados con el secreto de la app.
 */
export const whatsappRouter = Router();

whatsappRouter.get('/webhook', (req, res) => {
  const challenge = verifySubscription(req.query as Record<string, unknown>);
  if (challenge === null) {
    res.status(403).send('forbidden');
    return;
  }
  res.type('text/plain').send(challenge);
});

const seen = new Map<string, number>();

whatsappRouter.post('/webhook', express.raw({ type: '*/*', limit: '2mb' }), (req, res) => {
  if (!whatsappConfigured()) {
    res.status(503).json({ error: 'El canal de WhatsApp no está configurado en este servidor.' });
    return;
  }
  const raw = Buffer.isBuffer(req.body) ? req.body : undefined;
  if (!validSignature(raw, req.header('x-hub-signature-256') || undefined)) {
    res.status(401).json({ error: 'Firma inválida.' });
    return;
  }
  // Meta espera respuesta rápida; los mensajes se atienden después.
  res.sendStatus(200);
  let body: unknown;
  try {
    body = JSON.parse(raw!.toString('utf8'));
  } catch {
    return;
  }
  void (async () => {
    for (const m of parseWebhook(body)) {
      // Cada mensaje se atiende una sola vez aunque Meta lo reenvíe.
      if (m.messageId && seen.has(m.messageId)) continue;
      seen.set(m.messageId, Date.now());
      if (seen.size > 5000) for (const [k, t] of seen) if (Date.now() - t > 86_400_000) seen.delete(k);
      try {
        let photoId: string | null = null;
        if (m.type === 'image' && m.mediaId) {
          const dataUrl = await downloadMedia(m.mediaId);
          if (dataUrl) {
            // La ubicación y demás metadatos se quitan al guardar (savePhoto).
            const photo = savePhoto({ dataUrl, kind: 'origin', uploadedBy: null, location: null, takenAt: null });
            await persistUpload(photo.url);
            photoId = photo.id;
          }
        }
        const r = await auraReply(
          { text: m.type === 'text' || m.type === 'interactive' || m.type === 'image' ? m.text : null, photoId, location: m.location },
          { id: null, role: 'citizen', entityId: null },
          { kind: 'whatsapp', waId: m.waId, profileName: m.profileName, voice: m.type === 'audio' },
        );
        for (const msg of r.messages) {
          if (msg.photoUrl) await sendImage(m.waId, `${env.publicBaseUrl}${signUpload(msg.photoUrl)}`);
          await sendText(m.waId, msg.link && !/^https?:/.test(msg.link) ? `${msg.text}\n${env.publicBaseUrl}${msg.link}` : msg.text);
        }
      } catch (err) {
        console.error('[whatsapp] no se pudo atender un mensaje:', (err as Error).message);
        await sendText(m.waId, `Tuve un problema para atenderte. Puedes reportar directamente en la PWA de Kindra: ${env.publicBaseUrl}/avisar`);
      }
    }
  })();
});
