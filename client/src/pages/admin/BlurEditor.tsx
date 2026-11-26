import { useEffect, useRef, useState } from 'react';
import { Button, Modal } from '../../components/ui';

interface Box { x: number; y: number; w: number; h: number }

/**
 * Addendum v4.2, sección 13: revisión humana antes de publicar una foto. Se marcan con el dedo o el ratón las caras y
 * placas y se difuminan (pixelado fuerte). El original queda restringido; al público solo llega esta versión.
 */
export function BlurEditor({ src, onClose, onPublish }: { src: string; onClose: () => void; onPublish: (r: { dataUrl: string | null; noPeople: boolean }) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const img = useRef<HTMLImageElement | null>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => {
      img.current = i;
      setReady(true);
    };
    i.onerror = () => setError('No se pudo cargar la foto.');
    i.src = src;
  }, [src]);

  useEffect(() => {
    const c = canvas.current;
    const i = img.current;
    if (!c || !i || !ready) return;
    const scale = Math.min(1, 1600 / Math.max(i.width, i.height));
    c.width = Math.round(i.width * scale);
    c.height = Math.round(i.height * scale);
    const ctx = c.getContext('2d')!;
    ctx.drawImage(i, 0, 0, c.width, c.height);
    for (const b of boxes) pixelate(ctx, b);
  }, [ready, boxes]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * e.currentTarget.width, y: ((e.clientY - r.top) / r.height) * e.currentTarget.height };
  };

  return (
    <Modal open onClose={onClose} title="Revisar caras y placas antes de publicar" wide>
      {error ? <p className="text-sm text-bad">{error}</p> : (
        <>
          <p className="text-sm mb-2">Arrastra sobre cada cara o placa para difuminarla. Si no hay ninguna, confírmalo.</p>
          <canvas
            ref={canvas}
            className="w-full h-auto rounded border border-line touch-none cursor-crosshair"
            onPointerDown={(e) => setDrag(point(e))}
            onPointerUp={(e) => {
              if (!drag) return;
              const p = point(e);
              const b = { x: Math.min(drag.x, p.x), y: Math.min(drag.y, p.y), w: Math.abs(p.x - drag.x), h: Math.abs(p.y - drag.y) };
              if (b.w > 6 && b.h > 6) setBoxes([...boxes, b]);
              setDrag(null);
            }}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button disabled={!boxes.length} onClick={() => onPublish({ dataUrl: canvas.current!.toDataURL('image/jpeg', 0.85), noPeople: false })}>Publicar versión difuminada</Button>
            <Button variant="secondary" disabled={!!boxes.length} onClick={() => onPublish({ dataUrl: null, noPeople: true })}>No hay caras ni placas: publicar</Button>
            {boxes.length > 0 && <Button variant="ghost" onClick={() => setBoxes(boxes.slice(0, -1))}>Deshacer</Button>}
          </div>
        </>
      )}
    </Modal>
  );
}

function pixelate(ctx: CanvasRenderingContext2D, b: Box) {
  const size = Math.max(12, Math.round(Math.min(b.w, b.h) / 6));
  const data = ctx.getImageData(b.x, b.y, b.w, b.h);
  for (let y = 0; y < data.height; y += size) {
    for (let x = 0; x < data.width; x += size) {
      const i = (y * data.width + x) * 4;
      ctx.fillStyle = `rgb(${data.data[i]},${data.data[i + 1]},${data.data[i + 2]})`;
      ctx.fillRect(b.x + x, b.y + y, size, size);
    }
  }
}
