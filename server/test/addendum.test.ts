import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { initPlatform } from '../src/bootstrap';
import { MemoryPersistence } from '../src/persistence/memory';
import { db } from '../src/core/db';
import type { Actor } from '../src/core/events';
import { assertTransition, FIXED_GATES } from '../src/core/transitions';
import { getConfig, updateConfig } from '../src/services/config';
import { updateTransitions, upsertUser } from '../src/services/admin';
import { registerCitizen, loginWithPreregCode } from '../src/services/auth';
import { createCitizenReport, validateOrigin } from '../src/services/origins';
import { registerPhoto } from '../src/services/photos';
import { computePoints } from '../src/services/points';
import { setFeatures, isFeatureOn } from '../src/services/features';
import { upsertEntityUser, proposeEvaluator } from '../src/services/entityAdmin';
import { activateProposedRole } from '../src/services/admin';
import { achievementsFor, publicCard } from '../src/services/card';
import { ensureUserCodes } from '../src/services/referrals';
import { totp, verifyTotp, base32Encode } from '../src/services/totp';
import { DEMO_ADMIN_TOTP_SECRET } from '../src/seed/demo';
import { createApp } from '../src/app';
import { DEFAULT_SPACE_ID } from '@kindra/shared';

const actor = (id: string, role: Actor['role'], entityId: string | null): Actor => ({ id, role, entityId });
type Session = { token: string; user: { mfa?: boolean } };
let photoN = 0;
const photo = () => registerPhoto({ id: `ph_add_${++photoN}`, url: '/uploads/x.svg', kind: 'origin', moderation: 'approved', uploadedAt: new Date().toISOString() });
const coordActor = () => {
  const c = db().list('users').find((u) => u.alias === 'coordinador')!;
  return actor(c.id, 'coordinator', c.entityId!);
};

let server: Server;
let baseUrl = '';

before(async () => {
  process.env.JOBS_INTERVAL_SECONDS = '0';
  await initPlatform({ persistence: new MemoryPersistence(null), seed: true, quiet: true });
  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server?.close();
});

// ---------------------------------------------------------------- compuertas fijas

test('Compuertas fijas: guardar la tabla de estados sin ellas las restaura', () => {
  const original = structuredClone(getConfig().transitions);
  const stripped = original
    .filter((r) => r.action !== 'trip_departure')
    .map((r) => (r.action === 'dispatch_created' || r.action === 'outputs_recorded' ? { ...r, conditions: [] } : r));
  const saved = updateTransitions(stripped).transitions;
  for (const g of FIXED_GATES) {
    const rules = saved.filter((r) => r.object === g.object && r.action === g.action);
    assert.ok(rules.length > 0, `falta la regla ${g.action}`);
    for (const r of rules) for (const c of g.conditions) assert.ok(r.conditions.includes(c), `${g.action} perdió ${c}`);
  }
  updateConfig({ transitions: original });
});

test('Compuertas fijas: se exigen aunque alguien las borre directamente de la configuración guardada (7.4)', () => {
  const store = db();
  const original = structuredClone(getConfig().transitions);
  const uv = store.list('batches').find((b) => b.state === 'under_verification')!;
  const centerUser = store.list('users').find((u) => u.centerId === uv.centerId)!;
  updateConfig({ transitions: original.map((r) => (r.action === 'dispatch_created' ? { ...r, from: [...r.from, 'under_verification'], conditions: [] } : r)) });
  assert.throws(
    () => assertTransition('batch', 'dispatch_created', 'under_verification', { actor: actor(centerUser.id, 'center', centerUser.entityId!), batch: uv }),
    (err: { code?: string }) => err.code === 'qualityApproved',
  );
  updateConfig({ transitions: original });
});

// ---------------------------------------------------------------- referidos y puntos

test('Referidos: nada al registrarse; puntos solo con el primer reporte validado de la persona invitada', () => {
  const store = db();
  const inviter = ensureUserCodes(store.list('users').find((u) => u.alias === 'contralora')!);
  const before = computePoints(inviter.id).points;
  const { user: invited } = registerCitizen({ alias: 'invitada-test', password: 'secreto1', referralCode: inviter.referralCode! });
  assert.equal(store.get('users', invited.id)!.referredBy, inviter.id);
  assert.equal(computePoints(inviter.id).points, before, 'el registro no debe dar puntos');

  const r1 = createCitizenReport({ photoIds: [photo().id], location: { lat: 10.598, lng: -66.873 }, size: 'small', source: 'pwa' }, actor(invited.id, 'citizen', null));
  validateOrigin(r1.origin.id, coordActor());
  const p = getConfig().points.referralValidated;
  assert.equal(computePoints(inviter.id).points, before + p);
  assert.equal(computePoints(inviter.id).validatedReferrals, 1);

  const r2 = createCitizenReport({ photoIds: [photo().id], location: { lat: 10.598, lng: -66.871 }, size: 'small', source: 'pwa' }, actor(invited.id, 'citizen', null));
  validateOrigin(r2.origin.id, coordActor());
  assert.equal(computePoints(inviter.id).points, before + p, 'solo cuenta el primer reporte validado');
});

test('Referidos: un código inexistente se rechaza con un mensaje claro', () => {
  assert.throws(() => registerCitizen({ alias: 'otro-test', password: 'secreto1', referralCode: 'INV-ZZZZZZ' }), (err: { message?: string }) => /invitación/.test(err.message || ''));
});

test('Semilla: Carlos suma puntos porque María, a quien invitó, tuvo su primer reporte validado', () => {
  const carlos = db().list('users').find((u) => u.alias === 'ciudadano')!;
  assert.ok(computePoints(carlos.id).history.some((h) => h.reason.includes('persona que invitaste')));
});

// ---------------------------------------------------------------- logros y tarjeta

test('Logros en dos capas: personales y comunitarios del sector de residencia', () => {
  const carlos = db().list('users').find((u) => u.alias === 'ciudadano')!;
  const a = achievementsFor(carlos);
  assert.ok(a.personal.find((x) => x.key === 'first_validated')?.earned);
  assert.ok(a.personal.find((x) => x.key === 'referral')?.earned);
  assert.ok(a.community.length >= 3);
  assert.ok(a.community.every((x) => x.layer === 'community'));
});

test('Tarjeta Kindra: el QR público no expone teléfono ni nombre real', () => {
  const carlos = ensureUserCodes(db().list('users').find((u) => u.alias === 'ciudadano')!);
  const view = publicCard(carlos.cardCode!) as Record<string, unknown>;
  assert.equal(view.alias, 'ciudadano');
  assert.ok(!('phone' in view) && !('name' in view));
});

// ---------------------------------------------------------------- niveles de administración

test('Solo puede haber un administrador principal', () => {
  assert.throws(
    () => upsertUser({ alias: 'segundo-admin', roles: ['admin'], entityId: 'en_coord', password: 'secreto1' }),
    (err: { code?: string }) => err.code === 'single_main_admin',
  );
});

test('El administrador de entidad exige designación por escrito', () => {
  assert.throws(
    () => upsertUser({ alias: 'admin-sin-oficio', roles: ['entity_admin'], entityId: 'en_ejec', password: 'secreto1' }),
    (err: { message?: string }) => /designación/.test(err.message || ''),
  );
});

test('Administrador de entidad: solo su entidad, sin roles de Kindra; el evaluador lo propone y lo activa Kindra', () => {
  const store = db();
  const ea = store.list('users').find((u) => u.alias === 'admin-ejecutor')!;
  const a = actor(ea.id, 'entity_admin', ea.entityId!);
  // No puede asignar evaluador ni administrador
  assert.throws(() => upsertEntityUser(a, { alias: 'quiere-evaluar', roles: ['evaluator'], password: 'secreto1' }), (err: { message?: string }) => /Kindra/.test(err.message || ''));
  assert.throws(() => upsertEntityUser(a, { alias: 'quiere-admin', roles: ['admin'], password: 'secreto1' }));
  // No puede tocar usuarios de otra entidad
  const other = store.list('users').find((u) => u.alias === 'coordinador')!;
  assert.throws(() => upsertEntityUser(a, { id: other.id, alias: other.alias, roles: ['removal'] }), (err: { message?: string }) => /propia entidad/.test(err.message || ''));
  // Alta propia + propuesta de evaluador + activación por Kindra
  const created = upsertEntityUser(a, { alias: 'chofer-nuevo', roles: ['removal'], password: 'secreto1' });
  assert.equal(created.entityId, ea.entityId);
  proposeEvaluator(a, created.id, 'Ingeniera civil');
  assert.ok(!store.get('users', created.id)!.roles.includes('evaluator'), 'la propuesta no activa el rol');
  const activated = activateProposedRole(created.id, 'evaluator');
  assert.ok(activated.roles.includes('evaluator'));
  // Cada acción del administrador de entidad queda en la bitácora
  assert.ok(store.allEvents().filter((e) => e.type === 'entity_admin_action' && e.actorId === ea.id).length >= 2);
});

// ---------------------------------------------------------------- funciones activables

test('Funciones ocultas no se pueden encender; el pre-registro está oculto en esta fase', () => {
  assert.throws(() => setFeatures({ hero_subscription: true }), (err: { code?: string; details?: unknown }) => err.details === 'feature_unavailable');
  assert.equal(isFeatureOn('preregistration'), false);
  assert.throws(() => loginWithPreregCode('PR-DEMO01'), (err: { code?: string }) => err.code === 'feature_off');
  setFeatures({ preregistration: true });
  assert.ok(loginWithPreregCode('PR-DEMO01').token);
  setFeatures({ preregistration: false });
});

// ---------------------------------------------------------------- avisos comunitarios

test('Aviso comunitario: los vecinos del sector reciben un aviso al asignarse un punto para retiro (uno por día)', () => {
  const store = db();
  const sector = store.get('sectors', 'sc_oeste')!;
  const { user: resident } = registerCitizen({ alias: 'vecino-sector-c', password: 'secreto1', sectorId: sector.id });
  const reporter = registerCitizen({ alias: 'reporta-sector-c', password: 'secreto1' }).user;
  const count = () => store.filter('notifications', (n) => n.recipientKey === `user:${resident.id}` && n.kind === 'sector_assigned').length;
  // Puede haber un aviso del día ya enviado por la semilla: se borra para probar desde cero.
  for (const n of store.filter('notifications', (x) => x.recipientKey === `sector:${sector.id}`)) store.remove('notifications', n.id);
  const r = createCitizenReport({ photoIds: [photo().id], location: { lat: 10.577, lng: -67.033 }, size: 'medium', source: 'pwa' }, actor(reporter.id, 'citizen', null));
  validateOrigin(r.origin.id, coordActor());
  assert.equal(count(), 1);
  const r2 = createCitizenReport({ photoIds: [photo().id], location: { lat: 10.577, lng: -67.031 }, size: 'medium', source: 'pwa' }, actor(reporter.id, 'citizen', null));
  validateOrigin(r2.origin.id, coordActor());
  assert.equal(count(), 1, 'no se repite el mismo día');
});

// ---------------------------------------------------------------- espacios

test('Espacios: los registros nuevos quedan vinculados al espacio de su sector', () => {
  const store = db();
  assert.ok(store.get('spaces', DEFAULT_SPACE_ID));
  const reporter = registerCitizen({ alias: 'reporta-espacio', password: 'secreto1' }).user;
  const r = createCitizenReport({ photoIds: [photo().id], location: { lat: 10.624, lng: -66.993 }, size: 'small', source: 'pwa' }, actor(reporter.id, 'citizen', null));
  assert.equal(r.origin.spaceId, DEFAULT_SPACE_ID);
});

// ---------------------------------------------------------------- verificación en dos pasos

test('TOTP: vector de prueba RFC 6238 y tolerancia de un intervalo', () => {
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  assert.equal(totp(secret, 59_000), '287082');
  assert.ok(verifyTotp(secret, '287082', 59_000 + 30_000));
  assert.ok(!verifyTotp(secret, '000000', 59_000));
});

test('HTTP: la administración principal exige el segundo paso y registra cada acción como evento', async () => {
  const post = (path: string, body: unknown, token?: string) =>
    fetch(`${baseUrl}/api${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const get = (path: string, token: string) => fetch(`${baseUrl}/api${path}`, { headers: { authorization: `Bearer ${token}` } });

  const login = (await (await post('/auth/login', { identifier: 'admin', password: 'demo1234' })).json()) as Session;
  const blocked = await get('/admin/overview', login.token);
  assert.equal(blocked.status, 403);
  assert.equal(((await blocked.json()) as { code: string }).code, 'mfa_required');

  const bad = await post('/auth/2fa/verify', { code: '000000' }, login.token);
  assert.equal(bad.status, 400);

  const ok = (await (await post('/auth/2fa/verify', { code: totp(DEMO_ADMIN_TOTP_SECRET) }, login.token)).json()) as Session;
  assert.equal(ok.user.mfa, true);
  assert.equal((await get('/admin/overview', ok.token)).status, 200);

  const before = db().allEvents().filter((e) => e.type === 'admin_action').length;
  const created = await post('/admin/spaces', { name: 'Convenio de prueba', description: 'Espacio creado en una prueba' }, ok.token);
  assert.equal(created.status, 200);
  await new Promise((r) => setTimeout(r, 20));
  const after = db().allEvents().filter((e) => e.type === 'admin_action');
  assert.equal(after.length, before + 1);
  assert.equal((after[after.length - 1].data as { path?: string }).path, '/spaces');

  // Un administrador de entidad no entra en la administración principal
  const ea = (await (await post('/auth/login', { identifier: 'admin-ejecutor', password: 'demo1234' })).json()) as Session;
  assert.equal((await get('/admin/overview', ea.token)).status, 403);
  assert.equal((await get('/entity-admin/overview', ea.token)).status, 200);
});
