/**
 * Recuperación de la verificación en dos pasos si el administrador pierde su teléfono.
 * Se ejecuta en el servidor (no existe ningún botón en la PWA para esto).
 * Uso: npm run reset-2fa -w server -- <alias>
 * Tras ejecutarlo, al entrar a la administración la PWA pide configurar un código nuevo.
 */
process.env.JOBS_INTERVAL_SECONDS = '0';
import { initPlatform } from '../bootstrap';
import { db } from '../core/db';
import { appendEvent, SYSTEM_ACTOR } from '../core/events';
import { resetTwoFactor } from '../services/twoFactor';

async function main() {
  const alias = (process.argv[2] || '').trim().toLowerCase();
  if (!alias) throw new Error('Indica el alias: npm run reset-2fa -w server -- <alias>');
  const store = await initPlatform({ seed: false, quiet: true });
  const user = db().find('users', (u) => u.alias.toLowerCase() === alias);
  if (!user) throw new Error(`No existe un usuario con el alias "${alias}".`);
  resetTwoFactor(user.id);
  appendEvent({ type: 'admin_action', objectType: 'system', objectId: 'admin', actor: SYSTEM_ACTOR, data: { action: 'mfa_reset_offline', target: user.id } });
  await store.flush();
  console.log(`[2fa] verificación en dos pasos reiniciada para ${user.alias}. Debe configurarla de nuevo al entrar.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[2fa] error:', (err as Error).message);
  process.exit(1);
});
