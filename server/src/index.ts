import { env } from './config/env';
import { createApp } from './app';
import { initPlatform } from './bootstrap';
import { startScheduler, stopScheduler } from './services/escalation';
import { db } from './core/db';

async function main() {
  await initPlatform();
  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`[kindra] servidor escuchando en http://localhost:${env.port}  (modo demo: ${env.demoMode ? 'sí' : 'no'})`);
  });
  startScheduler(env.jobsIntervalSeconds);

  const shutdown = async () => {
    stopScheduler();
    server.close();
    try {
      await db().flush();
      await db().persistence.close();
    } catch {
      /* ignorar */
    }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[kindra] error fatal al iniciar:', err);
  process.exit(1);
});
