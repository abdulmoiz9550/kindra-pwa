import type { Origin } from '@kindra/shared';
import { db } from '../core/db';
import { WHATSAPP_TEMPLATES } from '../config/auraTexts42';
import { decryptField } from './secureField';
import { sendTemplate, whatsappConfigured } from './whatsapp';

/**
 * Addendum v4.2, 10.5: avisos por WhatsApp con plantillas aprobadas por Meta. Solo llevan el nombre de pila de quien
 * recibe; nunca ubicaciones exactas ni otros datos personales. Sin claves configuradas no se envía nada.
 */
export function whatsappNotify(origin: Origin, kind: string): void {
  const template = WHATSAPP_TEMPLATES[kind];
  if (!template || !whatsappConfigured()) return;
  const store = db();
  const profileIds = new Set<string>();
  if (origin.channelProfileId) profileIds.add(origin.channelProfileId);
  // Varios reportes del mismo punto: cada persona recibe su aviso.
  for (const id of origin.linkedOriginIds) {
    const other = store.get('origins', id);
    if (other?.channelProfileId) profileIds.add(other.channelProfileId);
  }
  for (const pid of profileIds) {
    const p = store.get('auraProfiles', pid);
    const to = decryptField(p?.waIdEnc);
    if (!p || !to || p.blocked) continue;
    const name = decryptField(p.preferredNameEnc) || decryptField(p.profileNameEnc) || '';
    void sendTemplate(to, template, name.trim().split(/\s+/)[0] || '');
  }
}
