import { useEffect, useRef, useState } from 'react';
import { ScanLine, Keyboard } from 'lucide-react';
import { Button, Field, Input, Alert } from '../ui';

interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
}

const hasDetector = () => typeof window !== 'undefined' && 'BarcodeDetector' in window;

/**
 * Escáner de QR (16.6 / 16.7): usa BarcodeDetector + cámara cuando el navegador lo permite;
 * si no, entrada manual del texto del QR. Devuelve el valor leído.
 */
export function QrScanner({ onResult, label = 'Escanear QR', hint }: { onResult: (value: string) => void; label?: string; hint?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState(!hasDetector());
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!scanning) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const Ctor = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => BarcodeDetectorLike }).BarcodeDetector;
    const detector = new Ctor({ formats: ['qr_code'] });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const tick = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length && codes[0].rawValue) {
              stopped = true;
              setScanning(false);
              onResult(codes[0].rawValue.trim());
              return;
            }
          } catch {
            /* seguir intentando */
          }
          raf = window.setTimeout(tick, 250);
        };
        tick();
      } catch {
        setError('No se pudo abrir la cámara. Escribe el código del QR a mano.');
        setScanning(false);
        setManual(true);
      }
    })();
    return () => {
      stopped = true;
      window.clearTimeout(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [scanning, onResult]);

  return (
    <div className="space-y-2">
      {hint && <p className="text-sm text-muted">{hint}</p>}
      {scanning ? (
        <div>
          <video ref={videoRef} className="w-full max-h-64 rounded-lg bg-black" muted playsInline aria-label="Vista de la cámara para leer el QR" />
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setScanning(false)}>
            Detener cámara
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {hasDetector() && (
            <Button variant="secondary" onClick={() => { setError(null); setScanning(true); }}>
              <ScanLine size={18} /> {label}
            </Button>
          )}
          <Button variant="ghost" onClick={() => setManual((m) => !m)}>
            <Keyboard size={18} /> Escribir el código
          </Button>
        </div>
      )}
      {manual && (
        <form
          className="flex gap-2 items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) onResult(text.trim());
          }}
        >
          <div className="flex-1">
            <Field label="Texto del QR (ej. KV-DEMO01)">
              <Input value={text} onChange={(e) => setText(e.target.value.toUpperCase())} placeholder="KV-…" />
            </Field>
          </div>
          <Button type="submit" className="mb-4">Usar</Button>
        </form>
      )}
      {error && <Alert tone="warn">{error}</Alert>}
    </div>
  );
}
