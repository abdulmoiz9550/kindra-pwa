import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * 12.6 / 21.6: escucha el flujo de eventos del servidor y refresca las consultas
 * sin recargar la página. Un solo EventSource por pestaña.
 */
export function useLiveUpdates(): { connected: boolean; lastEventAt: string | null } {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);
  useEffect(() => {
    let es: EventSource | null = null;
    let timer: number | null = null;
    let retry = 0;
    const invalidate = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'public' || q.queryKey[1] !== 'config' });
      }, 350);
    };
    const connect = () => {
      es = new EventSource('/api/public/stream');
      es.addEventListener('hello', () => {
        setConnected(true);
        retry = 0;
      });
      es.addEventListener('kindra', (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data) as { at: string };
          setLastEventAt(data.at);
        } catch {
          /* ignorar */
        }
        invalidate();
      });
      es.onerror = () => {
        setConnected(false);
        es?.close();
        retry = Math.min(retry + 1, 6);
        window.setTimeout(connect, 1000 * 2 ** retry);
      };
    };
    connect();
    return () => {
      es?.close();
      if (timer) window.clearTimeout(timer);
    };
  }, [qc]);
  return { connected, lastEventAt };
}
