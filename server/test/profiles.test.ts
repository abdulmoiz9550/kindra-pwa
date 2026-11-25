import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Role } from '@kindra/shared';
import { STANDARD_STATUS, STANDARD_STATUS_LABELS, ORIGIN_STATE_LABELS, BATCH_STATE_LABELS, TRIP_STATE_LABELS, DISPATCH_STATE_LABELS, PICKUP_STATUS_LABELS, ROLES, ROLE_LABELS, ROLE_HOME, statusText } from '@kindra/shared';
import { env } from '../src/config/env';
import { initPlatform } from '../src/bootstrap';
import { createApp } from '../src/app';
import { MemoryPersistence } from '../src/persistence/memory';
import { db } from '../src/core/db';
import { issueToken } from '../src/services/auth';
import { registerPhoto } from '../src/services/photos';
import { signUpload } from '../src/services/uploads';
import { suggestFromPhoto, decideSuggestion } from '../src/services/ai';
import { updateConfig } from '../src/services/config';
import { upsertUser } from '../src/services/admin';

/** v4.0: perfiles de la PWA, roles separados, imágenes privadas, bloqueo, IA, estados comunes y puntos. */

let server: Server;
let base = '';
let n = 0;
const user = (alias: string) => db().list('users').find((u) => u.alias === alias)!;
const tok = (alias: string, role: Role, mfa = false) => issueToken(user(alias).id, role, mfa);
const photo = () => registerPhoto({ id: `ph_pf_${++n}`, url: '/uploads/x.svg', kind: 'document', moderation: 'approved', uploadedAt: new Date().toISOString() }).id;
const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });

async function call(method: string, p: string, token?: string | null, body?: unknown) {
  const res = await fetch(`${base}/api${p}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* no JSON */
  }
  return { status: res.status, json, text };
}
const get = (p: string, t?: string | null) => call('GET', p, t);
const post = (p: string, t: string | null, b: unknown = {}) => call('POST', p, t, b);
const put = (p: string, t: string | null, b: unknown = {}) => call('PUT', p, t, b);

before(async () => {
  process.env.JOBS_INTERVAL_SECONDS = '0';
  process.env.OSRM_URL = 'off';
  await initPlatform({ persistence: new MemoryPersistence(null), seed: true, quiet: true });
  // Ocultos en el Módulo 1: aquí se encienden solo para probarlos.
  updateConfig({ features: { ...(db().get('config', 'main')!.features || {}), community_groups: true } });
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => {
  server.closeAllConnections();
  server.close();
});

test('cada perfil entra solo a lo suyo', async () => {
  const who: [string, Role][] = [['ciudadano', 'citizen'], ['hogar', 'householder'], ['comercio', 'business'], ['comunidad', 'community'], ['costero', 'coastal'], ['conductor', 'driver'], ['procesamiento', 'processing'], ['centro', 'center'], ['coordinador', 'coordinator']];
  const routes: [string, Role[]][] = [
    ['/profiles/group', ['community', 'coastal']],
    ['/profiles/business', ['business']],
    ['/profiles/review', ['coordinator']],
    ['/processing/overview', ['processing']],
    ['/requests', ['householder', 'business', 'driver', 'center', 'coordinator']],
    ['/requests/impact', ['householder', 'business', 'driver']],
    ['/reports/activity', ['center', 'coordinator']],
    ['/admin/groups', []],
    ['/coord/overview', ['coordinator']],
    ['/removal/overview', []],
  ];
  for (const [p, allowed] of routes) for (const [alias, role] of who) assert.equal((await get(p, tok(alias, role))).status, allowed.includes(role) ? 200 : 403, `${p} como ${role}`);
  for (const r of ROLES) assert.ok(ROLE_LABELS[r] && ROLE_HOME[r], r);
});

test('procesamiento separado de recepción; los centros sin ese personal siguen igual', async () => {
  const p = tok('procesamiento', 'processing');
  const sur = tok('centro-sur', 'center');
  const q = (await get('/processing/overview', p)).json;
  assert.ok(q.queue.every((b: any) => b.centerId === 'ce_sur'));
  const norte = db().list('batches').find((b) => b.centerId === 'ce_norte')!;
  assert.equal((await post(`/processing/batches/${norte.id}/close`, p)).status, 403); // otro centro
  // Un lote nuevo y abierto en Playa Escondida
  const open = { ...db().list('batches').find((b) => b.centerId === 'ce_sur')!, id: 'lt_prueba', code: 'L-PESC-900', state: 'open' as const, receptionIds: [], dispatchIds: [], hazardDecisionIds: [], outputs: null, qualityResult: null, qualityVerificationId: null, previousState: null };
  db().put('batches', open);
  assert.equal((await post('/center/batches/lt_prueba/close', sur)).status, 403);
  assert.equal((await post('/processing/batches/lt_prueba/close', p)).status, 200);
  const out = { unit: 't', aggregate: 8, metal: 1, specialDisposal: 0, rejects: 0.5, input: 10, method: 'Trituración' };
  assert.equal((await post('/processing/batches/lt_prueba/outputs', p, { ...out, method: undefined })).status, 400);
  const r = await post('/processing/batches/lt_prueba/outputs', p, out);
  assert.equal(r.status, 200);
  assert.equal(r.json.materialBalance.difference, -0.5);
  // No evalúa, no recibe, no despacha
  assert.equal((await post('/eval/batches/lt_prueba/quality', p, {})).status, 403);
  assert.equal((await post('/center/batches/lt_prueba/dispatch', p, {})).status, 403);
  // Caraballeda no tiene personal de procesamiento: el centro conserva la función
  assert.equal(db().list('batches').some((b) => b.centerId === 'ce_norte'), true);
  assert.equal((await get('/center/overview', tok('centro', 'center'))).json.batches.every((b: any) => b.separateProcessing === false), true);
});

test('25.2 y 25.4: membresía, jornada, reporte, validación independiente y conteo', async () => {
  const lead = tok('costero', 'coastal');
  const citizen = tok('ciudadano', 'citizen');
  const admin = tok('admin', 'admin', true);
  const coord = tok('coordinador', 'coordinator');
  assert.equal((await get('/profiles/group', citizen)).status, 403);
  // Pedir entrar no concede permisos
  assert.equal((await post('/profiles/groups/gr_demo_cos/join', citizen)).status, 201);
  assert.ok(!user('ciudadano').roles.includes('coastal'));
  assert.equal((await post('/auth/active-role', citizen, { role: 'coastal' })).status, 403);
  const m = (await get('/profiles/group', lead)).json.members.find((x: any) => x.alias === 'ciudadano');
  assert.equal((await post(`/profiles/group/members/${m.id}/approve`, tok('comunidad', 'community'))).status, 404); // otro grupo
  assert.equal((await post(`/profiles/group/members/${m.id}/approve`, lead)).status, 200);
  assert.ok(user('ciudadano').roles.includes('coastal'));
  const member = tok('ciudadano', 'coastal');
  const view = (await get('/profiles/group', member)).json;
  assert.equal(view.leader, false);
  assert.equal(view.group.contact, null);
  const act = { title: 'Jornada de prueba', date: day, time: '08:00', place: 'Playa', meetingPoint: 'Entrada', instructions: null, capacity: 1, publish: true };
  assert.equal((await post('/profiles/group/activities', member, act)).status, 403);
  const a = (await post('/profiles/group/activities', lead, act)).json;
  assert.equal((await post(`/profiles/group/activities/${a.id}/join`, member, { join: true })).status, 200);
  assert.equal((await post(`/profiles/group/activities/${a.id}/join`, lead, { join: true })).status, 409); // cupos
  assert.equal((await post(`/profiles/group/activities/${a.id}/complete`, lead, { attendance: [{ userId: user('ciudadano').id, attended: true, hours: 3 }] })).status, 200);
  const rep = { kind: 'collection', activityId: a.id, category: 'plastic', quantity: 12, unit: 'kg', place: 'Playa', location: null, date: day, description: 'Recolección', photoIds: [] as string[] };
  assert.equal((await post('/profiles/group/reports', member, rep)).status, 400); // sin evidencia
  const r = (await post('/profiles/group/reports', member, { ...rep, photoIds: [photo()] })).json;
  let imp = (await get('/profiles/group/impact', lead)).json.totals;
  assert.deepEqual([imp.reported.kg, imp.validated.kg, imp.reported.hours, imp.validated.hours, imp.validated.activities], [12, null, 3, null, 0]);
  assert.equal((await post(`/profiles/review/reports/${r.id}`, lead, { action: 'validate' })).status, 403);
  assert.equal((await post(`/profiles/review/reports/${r.id}`, coord, { action: 'validate', quantity: 10 })).status, 400); // cambio sin explicación
  assert.equal((await post(`/profiles/review/reports/${r.id}`, coord, { action: 'validate', quantity: 10, note: 'Pesado en el sitio' })).status, 200);
  assert.equal((await post(`/profiles/review/activities/${a.id}/validate`, coord)).status, 200);
  imp = (await get('/profiles/group/impact', lead)).json.totals;
  assert.deepEqual([imp.reported.kg, imp.validated.kg, imp.validated.hours, imp.validated.activities, imp.validated.t], [12, 10, 3, 1, null]);
  assert.equal(db().get('wasteReports', r.id)!.quantity, 12); // lo declarado no se sobrescribe
  assert.equal((await get('/profiles/group/impact?from=2030-01-01', lead)).json.totals.validated.kg, null);
  assert.ok((await get('/admin/groups', admin)).json.find((g: any) => g.id === 'gr_demo_cos').impact.validated.kg === 10);
  // La comunidad no ve nada del grupo costero
  assert.ok(!(await get('/profiles/group', tok('comunidad', 'community'))).text.includes(r.code));
});

test('25.1, 25.3 y 30: el módulo de aceite exige definición; luego solicitud completa sin cruzar datos entre comercios', async () => {
  const home = tok('hogar', 'householder');
  const biz = tok('comercio', 'business');
  const coord = tok('coordinador', 'coordinator');
  const admin = tok('admin', 'admin', true);
  const req = { module: 'oil', material: 'Aceite usado', estimatedQuantity: 5, unit: 'l', address: 'Calle de prueba 1', location: null, sectorId: 'sc_este', date: day, windowFrom: '08:00', windowTo: '10:00', instructions: null, photoIds: [] };
  assert.equal((await post('/requests/service', home, req)).status, 403);
  assert.deepEqual((await get('/requests/context', home)).json.modules.map((m: any) => m.key), ['debris']);
  assert.equal((await put('/admin/features', admin, { oil_module: true })).status, 409);
  const def = { workflow: 'Definido', dataFields: 'Definidos', units: 'litros', validationRules: 'Definidas', roles: 'Definidos', risks: '', approvalReference: 'DOC-1' };
  await put('/admin/module-definitions/oil_module', admin, def);
  assert.equal((await put('/admin/features', admin, { oil_module: true })).status, 409); // faltan riesgos
  await put('/admin/module-definitions/oil_module', admin, { ...def, risks: 'Definidos' });
  assert.equal((await put('/admin/features', admin, { oil_module: true })).status, 200);

  // La interfaz se entera del módulo solo cuando está encendido
  assert.equal((await get('/public/config')).json.features.oil_module, true);

  assert.equal((await post('/requests/service', home, { ...req, unit: 'kg' })).status, 400);
  const h = (await post('/requests/service', home, req)).json;
  const b = (await post('/requests/service', biz, { ...req, estimatedQuantity: 40 })).json;
  assert.equal(h.status, 'submitted');
  assert.ok(!(await get('/requests', home)).text.includes(b.id));
  assert.ok(!(await get('/requests', biz)).text.includes(h.id));
  // Otro comercio no ve nada de este
  db().put('businesses', { ...db().get('businesses', 'bz_demo')!, id: 'bz_dos', name: 'Otro comercio' });
  const other = upsertUser({ alias: 'comercio-dos', password: 'demo1234', roles: ['business'], businessId: 'bz_dos' });
  assert.deepEqual((await get('/requests', issueToken(other.id, 'business'))).json, []);
  assert.ok(!(await get('/requests', tok('conductor', 'driver'))).text.includes(b.id)); // sin programar, nadie la toma
  const sch = { operatorEntityId: 'en_ejec', centerId: 'ce_norte', date: day, windowFrom: '08:00', windowTo: '10:00', handlingNotes: null };
  assert.equal((await post(`/requests/${b.id}/schedule`, tok('conductor', 'driver'), sch)).status, 403);
  assert.equal((await post(`/requests/${b.id}/schedule`, coord, sch)).json.status, 'new');
  const d = tok('conductor', 'driver');
  for (const [p, body] of [['accept', {}], ['status', { to: 'en_route' }], ['status', { to: 'arrived' }]] as const) assert.equal((await post(`/requests/${b.id}/${p}`, d, body)).status, 200);
  assert.equal((await post(`/requests/${b.id}/cancel`, biz, { note: 'Ya no' })).status, 409);
  const v = db().list('vehicles').find((x) => x.entityId === 'en_ejec')!;
  const trips = db().count('trips');
  assert.equal((await post(`/requests/${b.id}/collect`, d, { quantity: 40, unit: 'l', photoId: photo(), vehicleId: v.id })).json.status, 'collected');
  assert.equal(db().count('trips'), trips); // el aceite no genera viajes de escombros
  assert.equal((await post(`/requests/${b.id}/receive`, d, { quantity: 40, unit: 'l', condition: null })).status, 403);
  assert.equal((await post(`/requests/${b.id}/receive`, tok('centro-sur', 'center'), { quantity: 38, unit: 'l', condition: null })).status, 403);
  const rec = (await post(`/requests/${b.id}/receive`, tok('centro', 'center'), { quantity: 38, unit: 'l', condition: 'Bien' })).json;
  assert.deepEqual([rec.received.check.difference, rec.collected.quantity], [-2, 40]);
  assert.equal((await post(`/requests/${b.id}/validate`, coord)).json.status, 'completed');
  const imp = (await get('/requests/impact', biz)).json;
  assert.deepEqual([imp.completed, imp.l, imp.m3, imp.t], [1, 38, null, null]);
  assert.equal((await get('/requests/impact', home)).json.completed, 0);
  // Cancelar lo propio con motivo
  assert.equal((await post(`/requests/${h.id}/cancel`, biz, { note: 'No es mía' })).status, 403);
  assert.equal((await post(`/requests/${h.id}/cancel`, home, { note: 'Cambio de planes' })).json.status, 'cancelled');
  // Apagar el módulo lo vuelve a ocultar
  await put('/admin/features', admin, { oil_module: false });
  assert.equal('oil_module' in (await get('/public/config')).json.features, false);
  assert.equal((await post('/requests/service', home, req)).status, 403);
  // El comercio edita su punto pero no el de otros
  const own = db().get('businesses', 'bz_demo')!;
  assert.equal((await put('/profiles/business', biz, { name: own.name, category: own.category, address: own.address, sectorId: null, contact: null, openingHours: '8 a 12', collectionPoint: own.collectionPoint, id: 'bz_dos' })).json.id, 'bz_demo');
  assert.equal(db().get('businesses', 'bz_dos')!.openingHours, 'Por definir');
});

test('imágenes privadas: sin firma, vencida o alterada no abre; firmada sí; nunca se guarda la firma', async () => {
  fs.mkdirSync(env.uploadDir, { recursive: true });
  const file = path.join(env.uploadDir, 'prueba-firma.svg');
  fs.writeFileSync(file, '<svg xmlns="http://www.w3.org/2000/svg"/>');
  try {
    const open = (u: string) => fetch(`${base}${u}`).then((r) => r.status);
    assert.equal(await open('/uploads/prueba-firma.svg'), 403);
    const signed = signUpload('/uploads/prueba-firma.svg');
    assert.equal(await open(signed), 200);
    assert.equal(await open(signed.replace('prueba-firma', 'otra')), 403);
    assert.equal(await open(signed.replace(/s=./, 's=~')), 403);
    assert.equal(await open(signed.replace(/e=[^&]+/, `e=${(Date.now() - 1000).toString(36)}`)), 403);
    assert.equal(await open('/uploads/..%2Fdb.json'), 403);
    const pub = (await get('/public/dashboard')).text;
    for (const u of pub.match(/\/uploads\/[^"]+/g) || []) assert.match(u, /\?e=.+&s=/);
    // Al devolver un enlace firmado, se guarda limpio
    const admin = tok('admin', 'admin', true);
    const e = (await get('/admin/entities', admin)).json[0];
    const saved = await post('/admin/entities', admin, { id: e.id, name: e.name, type: e.type, description: e.description, logoUrl: signed });
    assert.equal(saved.status, 200);
    assert.equal(db().get('entities', e.id)!.logoUrl, '/uploads/prueba-firma.svg');
  } finally {
    fs.unlinkSync(file);
  }
});

test('bloqueo tras 5 intentos, igual para cuentas que no existen; la administración lo levanta', async () => {
  const bad = (identifier: string) => post('/auth/login', null, { identifier, password: 'mala' });
  for (const id of ['obras', 'no-existe-x']) {
    for (let k = 0; k < 5; k++) assert.equal((await bad(id)).status, 401);
    const locked = await bad(id);
    assert.equal(locked.status, 429);
  }
  assert.equal((await post('/auth/login', null, { identifier: 'obras', password: 'demo1234' })).status, 429);
  const u = user('obras');
  upsertUser({ id: u.id, alias: u.alias, roles: u.roles, entityId: u.entityId, password: 'nueva-clave-1' }, { id: user('admin').id, kind: 'kindra' });
  assert.equal((await post('/auth/login', null, { identifier: 'obras', password: 'nueva-clave-1' })).status, 200);
});

test('cuenta: contraseña propia, nombre verificado protegido y avisos silenciables', async () => {
  const t = tok('conductor', 'driver');
  assert.equal((await post('/profiles/password', t, { current: 'mala', next: 'otra-clave-9' })).status, 400);
  assert.equal((await post('/profiles/password', t, { current: 'demo1234', next: 'otra-clave-9' })).status, 200);
  assert.equal((await post('/auth/login', null, { identifier: 'conductor', password: 'otra-clave-9' })).status, 200);
  assert.equal((await put('/profiles/account', t, { name: 'Otro nombre' })).status, 403);
  const pref = { mutedKinds: ['pickup_new'], available: false, address: null };
  assert.equal((await put('/profiles/account', t, { preferences: { ...pref, mutedKinds: ['pickup_changed'] } })).status, 400);
  assert.equal((await put('/profiles/account', t, { preferences: pref })).status, 200);
  const list = (await get('/me/notifications', t)).json;
  assert.ok(!list.some((x: any) => x.kind === 'pickup_new'));
});

test('IA: apagada por defecto; encendida solo sugiere y una persona decide', async () => {
  const ce = tok('centro', 'center');
  const actor = { id: user('centro').id, role: 'center' as const, entityId: user('centro').entityId ?? null };
  fs.mkdirSync(env.uploadDir, { recursive: true });
  const file = path.join(env.uploadDir, 'prueba-ia.png');
  fs.writeFileSync(file, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
  try {
    registerPhoto({ id: 'ph_ia', url: '/uploads/prueba-ia.png', kind: 'reception', moderation: 'pending', uploadedAt: new Date().toISOString(), uploadedBy: actor.id });
    updateConfig({ features: { ...(db().get('config', 'main')!.features || {}), ai_photo_detection: false } });
    assert.equal((await post('/ai/photo', ce, { photoId: 'ph_ia' })).status, 403); // apagada
    updateConfig({ features: { ...(db().get('config', 'main')!.features || {}), ai_photo_detection: true } });
    assert.equal((await post('/ai/photo', tok('centro-sur', 'center'), { photoId: 'ph_ia' })).status, 403); // foto ajena
    assert.equal((await post('/ai/photo', tok('ciudadano', 'citizen'), { photoId: 'ph_ia' })).status, 403);
    const answer = { showsDebris: true, subcategory: 'wood', confidence: 'medium', visibleText: '', note: 'Tablas' };
    let seen = '';
    const ok = await suggestFromPhoto(actor, 'ph_ia', async (img) => {
      seen = img.mediaType;
      return { text: JSON.stringify(answer), model: 'prueba' };
    });
    assert.equal(seen, 'image/png');
    assert.equal(ok.status, 'suggested');
    assert.equal(db().list('receptions').some((r) => r.photoId === 'ph_ia'), false); // no tocó ningún registro
    assert.equal(decideSuggestion(actor, ok.id, 'mixed').status, 'changed');
    assert.throws(() => decideSuggestion(actor, ok.id, 'wood'), /ya tiene una decisión/);
    await assert.rejects(() => suggestFromPhoto(actor, 'ph_ia', async () => ({ text: '{"subcategory":"inventada"}', model: 'x' })), /no se pudo leer/);
  } finally {
    fs.unlinkSync(file);
  }
});

test('estados comunes: todos los estados tienen etiqueta común y no se repiten palabras', () => {
  const sets: [keyof typeof STANDARD_STATUS, Record<string, string>][] = [['origin', ORIGIN_STATE_LABELS], ['batch', BATCH_STATE_LABELS], ['trip', TRIP_STATE_LABELS], ['dispatch', DISPATCH_STATE_LABELS], ['pickup', PICKUP_STATUS_LABELS]];
  for (const [k, labels] of sets) for (const s of Object.keys(labels)) assert.ok((STANDARD_STATUS[k] as Record<string, string>)[s], `${k}/${s}`);
  assert.equal(statusText('origin', 'under_removal', 'En retiro'), `${STANDARD_STATUS_LABELS.validated} · En retiro`);
  assert.equal(statusText('origin', 'validated', 'Validado, en lista de retiro'), 'Validado, en lista de retiro');
});

test('puntos: reglas y movimientos visibles; pendiente hasta registrar la aprobación', async () => {
  const admin = tok('admin', 'admin', true);
  assert.equal((await get('/public/config')).json.incentives.status, 'pending');
  assert.ok(Array.isArray((await get('/me/profile', tok('contralora', 'citizen'))).json.points.history));
  assert.equal((await put('/admin/incentives', admin, { status: 'approved', reference: '' })).status, 400);
  assert.equal((await put('/admin/incentives', admin, { status: 'approved', reference: 'ACTA-9' })).json.status, 'approved');
  assert.equal((await get('/public/config')).json.incentives.reference, 'ACTA-9');
  assert.equal((await put('/admin/incentives', admin, { status: 'pending', reference: null })).json.status, 'pending');
});

test('Módulo 1: comunidades y grupos costeros ocultos por defecto y sin interruptor', async () => {
  const on = db().get('config', 'main')!.features;
  updateConfig({ features: { ...on, community_groups: false } });
  assert.equal((await get('/profiles/group', tok('costero', 'coastal'))).status, 403);
  assert.equal((await get('/profiles/groups', tok('ciudadano', 'citizen'))).status, 403);
  assert.equal((await post('/auth/demo-switch', null, { role: 'community' })).status, 403);
  assert.ok(!(await get('/public/config')).json.demoRoles.some((r: any) => r.role === 'community' || r.role === 'coastal'));
  assert.equal((await put('/admin/features', tok('admin', 'admin', true), { community_groups: true })).status, 400);
});
