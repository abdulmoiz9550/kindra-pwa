import type { RequestHandler } from 'express';

/**
 * Addendum v4.2, sección 11: cada envío guardado sin señal lleva un identificador único (X-Idempotency-Key).
 * Si el teléfono lo reintenta, el servidor devuelve la misma respuesta y no crea el registro otra vez.
 */
const TTL_MS = 7 * 24 * 3_600_000;
const done = new Map<string, { status: number; body: unknown; at: number }>();
const inFlight = new Set<string>();

export const idempotency: RequestHandler = (req, res, next) => {
  const raw = req.header('x-idempotency-key');
  if (req.method !== 'POST' || !raw || raw.length > 120) return next();
  const key = `${req.auth?.user.id ?? req.ip}:${req.path}:${raw}`;
  const hit = done.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    res.setHeader('X-Idempotent-Replay', 'true');
    res.status(hit.status).json(hit.body);
    return;
  }
  if (inFlight.has(key)) {
    res.status(409).json({ error: 'Este envío ya se está procesando.', code: 'in_flight' });
    return;
  }
  inFlight.add(key);
  const json = res.json.bind(res);
  res.json = (body: unknown) => {
    inFlight.delete(key);
    if (res.statusCode < 500) done.set(key, { status: res.statusCode, body, at: Date.now() });
    if (done.size > 20_000) for (const [k, v] of done) if (Date.now() - v.at > TTL_MS) done.delete(k);
    return json(body);
  };
  res.on('close', () => inFlight.delete(key));
  next();
};
