import { useRef, useState } from 'react';
import { Camera, ImagePlus, Trash2 } from 'lucide-react';
import { compressImage, uploadPhoto, getPosition, type UploadedPhoto } from '../lib/media';
import { errorMessage } from '../lib/api';
import { Button, Alert } from './ui';

export interface CapturedPhoto extends UploadedPhoto {
  preview: string;
  location: { lat: number; lng: number } | null;
}

/**
 * Captura de foto con ubicación (3.6). Comprime antes de subir (18.1).
 * Si `deferUpload` está activo, no sube: devuelve el data URL para la cola offline.
 */
export function PhotoCapture({ kind, label = 'Tomar foto', photos, onChange, max = 3, deferUpload = false, withLocation = true, hint }: { kind: string; label?: string; photos: CapturedPhoto[]; onChange: (p: CapturedPhoto[]) => void; max?: number; deferUpload?: boolean; withLocation?: boolean; hint?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await compressImage(file);
      let location: { lat: number; lng: number } | null = null;
      if (withLocation) {
        try {
          const p = await getPosition(6000);
          location = { lat: p.lat, lng: p.lng };
        } catch {
          location = null;
        }
      }
      if (deferUpload) {
        onChange([...photos, { id: '', url: '', preview: dataUrl, location }]);
      } else {
        const up = await uploadPhoto(dataUrl, kind, location);
        onChange([...photos, { ...up, preview: dataUrl, location }]);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {photos.map((p, i) => (
          <div key={i} className="relative h-24 w-24 overflow-hidden rounded-lg border border-line">
            <img src={p.preview || p.url} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
            {p.unreadable && <span className="absolute inset-x-0 bottom-0 bg-bad text-white text-[10px] text-center">poco visible</span>}
            <button type="button" aria-label={`Quitar foto ${i + 1}`} className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white" onClick={() => onChange(photos.filter((_, j) => j !== i))}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {photos.length < max && (
          <div className="flex flex-col gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => inputRef.current?.click()}>
              <Camera size={18} /> {busy ? 'Procesando…' : label}
            </Button>
            <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} aria-label={label} />
            <label className="btn-ghost btn-sm cursor-pointer">
              <ImagePlus size={16} /> Elegir de la galería
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
          </div>
        )}
      </div>
      {hint && <p className="text-xs text-muted mt-2">{hint}</p>}
      {error && (
        <Alert tone="bad" className="mt-2">
          {error}
        </Alert>
      )}
    </div>
  );
}
