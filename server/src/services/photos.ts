import { stripImageMetadata } from './stripMetadata';
import fs from 'node:fs';
import path from 'node:path';
import type { Photo, GeoPoint } from '@kindra/shared';
import { db } from '../core/db';
import { env } from '../config/env';
import { newId, nowIso } from '../core/ids';
import { badRequest } from '../core/errors';

const MAX_BYTES = 4 * 1024 * 1024;

export interface PhotoInput {
  dataUrl: string;
  kind: Photo['kind'];
  uploadedBy?: string | null;
  location?: GeoPoint | null;
  takenAt?: string | null;
}

/** Guarda una foto (ya comprimida en el cliente, 18.1). Queda pendiente de moderación (7.14). */
export function savePhoto(input: PhotoInput): Photo {
  const m = /^data:(image\/(jpeg|jpg|png|webp)|application\/pdf|audio\/(webm|ogg|mp4|mpeg|wav))(?:;codecs=[^;]+)?;base64,(.+)$/i.exec(input.dataUrl || '');
  if (!m) throw badRequest('El archivo debe enviarse como data URL en formato JPEG, PNG, WebP, PDF o audio.');
  const raw = Buffer.from(m[4], 'base64');
  if (raw.length > MAX_BYTES) throw badRequest('El archivo es demasiado grande. Comprime la foto antes de enviarla.');
  const mime = m[1].toLowerCase();
  const ext = mime === 'application/pdf' ? 'pdf' : mime.startsWith('audio/') ? (m[3] === 'mpeg' ? 'mp3' : m[3]) : m[2] === 'png' ? 'png' : m[2] === 'webp' ? 'webp' : 'jpg';
  // Addendum v4.2: la ubicación y demás metadatos se quitan del archivo al recibirlo.
  let buf: Buffer;
  try {
    buf = stripImageMetadata(raw, ext);
  } catch {
    throw badRequest('La imagen no se pudo leer. Toma la foto de nuevo.');
  }
  // La posición del teléfono solo se guarda en fotos operativas; la de un ciudadano va en su reporte, no en la foto.
  const uploader = input.uploadedBy ? db().get('users', input.uploadedBy) : undefined;
  const staff = !!uploader?.roles.some((r) => !['citizen', 'monitor', 'householder', 'business', 'community', 'coastal'].includes(r));
  if (!staff && ['origin', 'selfie'].includes(String(input.kind))) input = { ...input, location: null };
  const id = newId('ph');
  fs.mkdirSync(env.uploadDir, { recursive: true });
  fs.writeFileSync(path.join(env.uploadDir, `${id}.${ext}`), buf);
  const photo: Photo = {
    id,
    url: `/uploads/${id}.${ext}`,
    uploadedBy: input.uploadedBy ?? null,
    kind: input.kind,
    moderation: 'pending',
    location: input.location ?? null,
    takenAt: input.takenAt ?? null,
    uploadedAt: nowIso(),
    // Heurística mínima del "sistema" (7.12): una imagen minúscula no puede mostrar nada útil.
    unreadable: !mime.startsWith('audio/') && ext !== 'pdf' && buf.length < 1500,
  };
  db().put('photos', photo);
  return photo;
}

/** Registra una foto que ya existe en disco (semilla). */
export function registerPhoto(photo: Photo): Photo {
  db().put('photos', photo);
  return photo;
}

export function moderatePhoto(id: string, decision: 'approved' | 'rejected'): Photo {
  const p = db().get('photos', id);
  if (!p) throw badRequest('La foto no existe.');
  // Fotos donde pueden aparecer personas o placas: se aprueban solo tras la revisión de difuminado.
  if (decision === 'approved' && !p.blurReviewed && ['origin', 'after', 'before', 'on_site', 'trip_departure', 'trip_arrival', 'evidence'].includes(p.kind)) throw badRequest('Antes de publicar, revisa caras y placas: difumínalas o confirma que no hay ninguna.', 'blur_review_required');
  return db().update('photos', id, { moderation: decision });
}

export function markUnreadable(id: string): Photo {
  const p = db().get('photos', id);
  if (!p) throw badRequest('La foto no existe.');
  return db().update('photos', id, { unreadable: true });
}

export function photoUrl(id?: string | null, onlyModerated = false): string | null {
  if (!id) return null;
  const p = db().get('photos', id);
  if (!p) return null;
  if (onlyModerated && p.moderation !== 'approved') return null;
  return p.url;
}

export function photosByIds(ids: string[], onlyModerated = false): Photo[] {
  const out: Photo[] = [];
  for (const id of ids) {
    const p = db().get('photos', id);
    // En público se usa la versión difuminada (addendum v4.2, sección 13).
    if (p && (!onlyModerated || p.moderation === 'approved')) out.push(onlyModerated && p.publicUrl ? { ...p, url: p.publicUrl } : p);
  }
  return out;
}

/**
 * Addendum v4.2, sección 13: antes de publicar, una persona revisa caras y placas. Si hay, sube la versión difuminada
 * (el original queda restringido como evidencia); si no hay, lo deja constancia. Recién entonces se aprueba.
 */
export function publishReviewedPhoto(id: string, input: { dataUrl?: string | null; noPeople?: boolean }, reviewerId: string): Photo {
  const store = db();
  const p = store.get('photos', id);
  if (!p) throw badRequest('La foto no existe.');
  if (!input.dataUrl && !input.noPeople) throw badRequest('Difumina las caras y placas o confirma que no hay ninguna.');
  let publicUrl: string | null = null;
  if (input.dataUrl) publicUrl = savePhoto({ dataUrl: input.dataUrl, kind: 'evidence' as Photo['kind'], uploadedBy: reviewerId, location: null }).url;
  return store.update('photos', id, { publicUrl, blurReviewed: true, moderation: 'approved' });
}
