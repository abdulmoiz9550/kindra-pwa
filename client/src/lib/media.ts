import { api } from './api';

/** 18.1: comprime la foto en el dispositivo antes de subirla (JPEG, lado máximo 1280 px). */
export function compressImage(file: File, maxSide = 1280, quality = 0.74): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('No se pudo procesar la imagen.'));
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('La imagen no se pudo leer.'));
    };
    img.src = url;
  });
}

export interface UploadedPhoto {
  id: string;
  url: string;
  unreadable?: boolean;
}

export async function uploadPhoto(dataUrl: string, kind: string, location?: { lat: number; lng: number } | null, takenAt?: string | null): Promise<UploadedPhoto> {
  return api.post<UploadedPhoto>('/photos', { dataUrl, kind, location: location ?? null, takenAt: takenAt ?? new Date().toISOString() });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    r.readAsDataURL(blob);
  });
}

export function getPosition(timeoutMs = 12000): Promise<{ lat: number; lng: number; accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Este dispositivo no permite obtener la ubicación.'));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => reject(new Error(err.code === 1 ? 'No diste permiso de ubicación. Puedes indicar la calle y una referencia.' : 'No se pudo obtener la ubicación. Puedes indicar la calle y una referencia.')),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 },
    );
  });
}

/** Grabación de nota de voz (18.4) con MediaRecorder. */
export async function recordVoice(maxMs = 30000, onTick?: (ms: number) => void): Promise<{ stop: () => Promise<string> }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  const started = Date.now();
  const tick = window.setInterval(() => onTick?.(Date.now() - started), 250);
  let resolveStop: (v: string) => void = () => undefined;
  const done = new Promise<string>((res) => (resolveStop = res));
  rec.onstop = async () => {
    window.clearInterval(tick);
    stream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
    resolveStop(await blobToDataUrl(blob));
  };
  rec.start();
  const autoStop = window.setTimeout(() => rec.state === 'recording' && rec.stop(), maxMs);
  return {
    stop: () => {
      window.clearTimeout(autoStop);
      if (rec.state === 'recording') rec.stop();
      return done;
    },
  };
}

/** Reconocimiento de voz del navegador (si existe) para dictar en AURA o en el reporte. */
export function speechRecognitionAvailable(): boolean {
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function listenOnce(lang = 'es-VE'): Promise<string> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return reject(new Error('El navegador no permite dictar por voz.'));
    const r = new Ctor();
    r.lang = lang;
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => resolve(e.results[0][0].transcript);
    r.onerror = () => reject(new Error('No se entendió el audio. Inténtalo otra vez.'));
    r.onend = () => undefined;
    r.start();
  });
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: (e: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void;
  onerror: (e: unknown) => void;
  onend: () => void;
  start: () => void;
}
