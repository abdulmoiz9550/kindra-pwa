import { useRef, useState } from 'react';
import { Mic, Square, Trash2 } from 'lucide-react';
import { recordVoice } from '../lib/media';
import { Button } from './ui';

/** 18.4: nota de voz opcional en el reporte. Devuelve un data URL de audio. */
export function VoiceNoteRecorder({ value, onChange }: { value: string | null; onChange: (dataUrl: string | null) => void }) {
  const [recording, setRecording] = useState(false);
  const [ms, setMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<{ stop: () => Promise<string> } | null>(null);
  const supported = typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices;

  const start = async () => {
    setError(null);
    try {
      rec.current = await recordVoice(30000, setMs);
      setRecording(true);
    } catch {
      setError('No se pudo acceder al micrófono. Puedes seguir sin nota de voz.');
    }
  };
  const stop = async () => {
    if (!rec.current) return;
    const dataUrl = await rec.current.stop();
    rec.current = null;
    setRecording(false);
    onChange(dataUrl);
  };

  if (!supported) return <p className="text-xs text-muted">Este navegador no permite grabar notas de voz.</p>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {value ? (
        <>
          <audio controls src={value} className="max-w-full" aria-label="Nota de voz grabada" />
          <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
            <Trash2 size={16} /> Quitar
          </Button>
        </>
      ) : recording ? (
        <Button variant="danger" onClick={stop}>
          <Square size={16} /> Detener ({Math.round(ms / 1000)} s)
        </Button>
      ) : (
        <Button variant="secondary" onClick={start}>
          <Mic size={18} /> Grabar nota de voz (opcional)
        </Button>
      )}
      {error && <span className="text-xs text-bad">{error}</span>}
    </div>
  );
}
