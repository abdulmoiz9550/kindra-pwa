import type { Response } from 'express';

export interface StreamMessage {
  type: string;
  objectType: string;
  objectId: string;
  chainId: string;
  at: string;
  seq: number;
}

const clients = new Set<Response>();

/** Registra un cliente SSE (12.6: el tablero se actualiza sin recargar). */
export function addClient(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write(`event: hello\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
  clients.add(res);
  const ping = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      /* ignorar */
    }
  }, 25_000);
  res.on('close', () => {
    clearInterval(ping);
    clients.delete(res);
  });
}

export function broadcast(msg: StreamMessage): void {
  const payload = `event: kindra\ndata: ${JSON.stringify(msg)}\n\n`;
  for (const c of clients) {
    try {
      c.write(payload);
    } catch {
      clients.delete(c);
    }
  }
}

export function clientCount(): number {
  return clients.size;
}
