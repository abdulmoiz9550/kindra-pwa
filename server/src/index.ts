import { env } from './config/env';
import { createApp } from './app';
import { initPlatform } from './bootstrap';
import { startScheduler, stopScheduler } from './services/escalation';
import { startTraccarPoller } from './services/traccar';
import { db } from './core/db';
import { createBackup, dailyRemoteBackup } from './services/backup';

async function main() {
  await initPlatform();
  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`[kindra] servidor escuchando en http://localhost:${env.port}  (modo demo: ${env.demoMode ? 'sí' : 'no'})`);
  });
  startScheduler(env.jobsIntervalSeconds);
  startTraccarPoller();
  // Copias automáticas (v4.0, sección 10). Apagadas salvo que el despliegue indique un disco persistente.
  const backupHours = Number(process.env.BACKUP_INTERVAL_HOURS) || 0;
  if (backupHours > 0) setInterval(() => void createBackup().catch((err) => console.error('[backup] error:', (err as Error).message)), backupHours * 3_600_000).unref();

  // En Render el disco se borra: la copia diaria queda en Supabase.
  if (process.env.RENDER) {
    const daily = () => void dailyRemoteBackup().catch((err) => console.error('[backup] error:', (err as Error).message));
    setTimeout(daily, 60_000).unref();
    setInterval(daily, 3_600_000).unref();
  }

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
