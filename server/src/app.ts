import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { env } from './config/env';
import { authenticate, errorHandler } from './middleware/auth';
import { isUploadPath, requireSignedUpload, signUpload, unsignUpload } from './services/uploads';
import { publicRouter } from './routes/public';
import { authRouter } from './routes/auth';
import { citizenRouter } from './routes/citizen';
import { coordRouter } from './routes/coord';
import { removalRouter } from './routes/removal';
import { centerRouter } from './routes/center';
import { evalRouter } from './routes/evaluator';
import { destRouter } from './routes/destination';
import { supervisorRouter } from './routes/supervisor';
import { adminRouter } from './routes/admin';
import { eventsRouter } from './routes/events';
import { entityAdminRouter } from './routes/entityAdmin';
import { trackingRouter } from './routes/tracking';
import { reportsRouter } from './routes/reports';
import { requestsRouter } from './routes/requests';
import { processingRouter } from './routes/processing';
import { profilesRouter } from './routes/profiles';
import { aiRouter } from './routes/ai';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(cors({ origin: true, credentials: false }));
  // v4.0, sección 9: las imágenes solo se abren con un enlace firmado y con vencimiento, que se entrega
  // únicamente dentro de una respuesta que ya pasó por los permisos.
  app.set('json replacer', (_k: string, v: unknown) => (isUploadPath(v) ? signUpload(v) : v));
  app.use(express.json({ limit: '6mb', reviver: (_k: string, v: unknown) => (isUploadPath(v) ? unsignUpload(v) : v) }));
  app.use(authenticate);

  app.get('/api/health', (_req, res) => res.json({ ok: true, at: new Date().toISOString() }));
  app.use('/api/public', publicRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/coord', coordRouter);
  app.use('/api/removal', removalRouter);
  app.use('/api/center', centerRouter);
  app.use('/api/eval', evalRouter);
  app.use('/api/dest', destRouter);
  app.use('/api/supervisor', supervisorRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/entity-admin', entityAdminRouter);
  app.use('/api/tracking', trackingRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/requests', requestsRouter);
  app.use('/api/processing', processingRouter);
  app.use('/api/profiles', profilesRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/events', eventsRouter);
  app.use('/api', citizenRouter);

  fs.mkdirSync(env.uploadDir, { recursive: true });
  app.use('/uploads', requireSignedUpload, express.static(env.uploadDir, { setHeaders: (res) => res.setHeader('Cache-Control', 'private, max-age=43200') }));

  // Producción: sirve la PWA compilada.
  if (fs.existsSync(env.clientDist)) {
    app.use(express.static(env.clientDist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api\/|\/uploads\/).*/, (_req, res) => {
      res.sendFile(path.join(env.clientDist, 'index.html'));
    });
  }

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada.', code: 'not_found' }));
  app.use(errorHandler);
  return app;
}
