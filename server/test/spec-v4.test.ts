import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Role } from '@kindra/shared';
import { initPlatform } from '../src/bootstrap';
import { createApp } from '../src/app';
import { MemoryPersistence } from '../src/persistence/memory';
import { db } from '../src/core/db';
import type { Actor } from '../src/core/events';
import { issueToken } from '../src/services/auth';
import { registerPhoto } from '../src/services/photos';
import { createCitizenReport, validateOrigin, getOriginOrThrow } from '../src/services/origins';
import { valorizationRate } from '../src/services/batches';
import { ensureReportSnapshots, snapshotView, NOV22_SNAPSHOT_ID } from '../src/services/reportSnapshots';
import { restoreInto, verifyEvents } from '../src/services/backup';
import { upsertUser } from '../src/services/admin';

/** Pruebas de aceptación de la especificación v4.0 (23 nov 2026), por HTTP con un usuario por rol. */

let server: Server;
let base = '';
let n = 0;
const user = (alias: string) => db().list('users').find((u) => u.alias === alias)!;
const tok = (alias: string, role: Role, mfa = false) => issueToken(user(alias).id, role, mfa);
const photo = () => registerPhoto({ id: `ph_v4_${++n}`, url: '/uploads/x.svg', kind: 'trip_departure', moderation: 'approved', uploadedAt: new Date().toISOString() }).id;

async function call(method: string, path: string, token?: string | null, body?: unknown) {
  const res = await fetch(`${base}/api${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* CSV */
  }
  return { status: res.status, json, text };
}
const get = (path: string, token?: string | null) => call('GET', path, token);
const post = (path: string, token: string | null, body: unknown = {}) => call('POST', path, token, body);

before(async () => {
  process.env.JOBS_INTERVAL_SECONDS = '0';
  process.env.OSRM_URL = 'off';
  await initPlatform({ persistence: new MemoryPersistence(null), seed: true, quiet: true });
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => {
  server.closeAllConnections();
  server.close();
});

test('12: cada rol entra solo a lo suyo; lo ajeno responde 401/403', async () => {
  const routes: [string, Role[]][] = [
    ['/coord/overview', ['coordinator']],
    ['/removal/overview', ['removal']],
    ['/center/overview', ['center']],
    ['/eval/overview', ['evaluator']],
    ['/dest/overview', ['destination']],
    ['/supervisor/overview', ['supervisor']],
    ['/entity-admin/overview', ['entity_admin']],
    ['/admin/overview', ['admin']],
    ['/admin/security', ['admin']],
    ['/admin/info-requests', ['admin']],
    ['/admin/risks', ['admin']],
    ['/admin/backups', ['admin']],
    ['/reports/snapshots/view', ['admin', 'supervisor', 'entity_admin', 'coordinator', 'center']],
    ['/reports/activity', ['admin', 'supervisor', 'entity_admin', 'coordinator', 'center']],
    ['/requests', ['coordinator', 'entity_admin', 'removal', 'center', 'admin']],
  ];
  const who: [string, Role][] = [['ciudadano', 'citizen'], ['contralora', 'monitor'], ['coordinador', 'coordinator'], ['retiro', 'removal'], ['centro', 'center'], ['evaluador', 'evaluator'], ['supervisor', 'supervisor'], ['obras', 'destination'], ['admin-ejecutor', 'entity_admin'], ['admin', 'admin']];
  for (const [path, allowed] of routes) {
    assert.equal((await get(path)).status, 401, `${path} sin sesión`);
    for (const [alias, role] of who) {
      const r = await get(path, tok(alias, role, role === 'admin'));
      assert.equal(r.status, allowed.includes(role) ? 200 : 403, `${path} como ${role}`);
    }
  }
  // Administrador sin segundo paso: nada
  for (const p of ['/admin/overview', '/reports/snapshots/view', '/requests']) assert.equal((await get(p, tok('admin', 'admin', false))).status, 403, p);
});

test('24: el selector de rol nunca concede un rol que la cuenta no tiene', async () => {
  for (const role of ['admin', 'removal', 'center'] as Role[]) assert.equal((await post('/auth/active-role', tok('ciudadano', 'citizen'), { role })).status, 403);
  // Un token con un rol ajeno cae al rol real de la cuenta
  assert.equal((await get('/admin/overview', issueToken(user('ciudadano').id, 'admin', true))).status, 403);
  // Registro público: siempre ciudadano, aunque pida otro rol
  const r = await post('/auth/register', null, { alias: 'intruso-v4', password: 'secreto1', roles: ['admin'], entityId: 'en_coord' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.user.roles, ['citizen']);
});

test('4 y 12: un CDT físico, un solo registro y pin, dos operadores filtrables sin doble conteo', async () => {
  const t = tok('supervisor', 'supervisor');
  const all = (await get('/reports/snapshots/view', t)).json;
  const ids = all.facilities.map((f: any) => f.facilityId);
  assert.equal(new Set(ids).size, ids.length);
  const car = all.facilities.filter((f: any) => f.name === 'Caraballeda');
  assert.equal(car.length, 1);
  assert.deepEqual(car[0].operators.map((o: any) => o.name).sort(), ['Operador Contratista', 'Operador Público']);
  assert.equal(car[0].totals.tonnesAccumulated.value, 740358.51);
  const miy = (await get('/reports/snapshots/view?operator=en_cnorte', t)).json;
  const mop = (await get('/reports/snapshots/view?operator=en_csur', t)).json;
  const part = (v: any) => v.facilities.find((f: any) => f.name === 'Caraballeda').totals.tonnesAccumulated.value;
  assert.equal(Math.round((part(miy) + part(mop)) * 100) / 100, car[0].totals.tonnesAccumulated.value);
  // Miyamoto no es un centro
  assert.equal(db().find('centers', (c) => /miyamoto/i.test(c.name)), undefined);
  for (const id of ['ce_norte', 'ce_sur', 'ce_playa_grande']) assert.deepEqual([db().get('centers', id)!.entityId, db().get('centers', id)!.operatorEntityIds], ['en_cnorte', ['en_csur']]);
  assert.ok(!JSON.stringify(db().list('entities')).match(/miyamoto|ministerio de obras/i));
  assert.deepEqual(all.unlinked, []);
  assert.equal(db().count('centers'), 4);
  assert.ok(all.facilities.every((f: any) => f.active));
  // Idempotente
  const before = [db().count('centers'), db().count('entities'), db().count('reportSnapshots')];
  ensureReportSnapshots();
  assert.deepEqual([db().count('centers'), db().count('entities'), db().count('reportSnapshots')], before);
});

test('4 y 15: coordenadas exactas reutilizadas; entregadas por el cliente', () => {
  const f = new Map(snapshotView(null).facilities.map((x) => [x.facilityId, x]));
  assert.deepEqual(f.get('ce_final')!.location, { lat: 10.58962, lng: -67.0022 });
  assert.deepEqual(f.get('ce_playa_grande')!.location, { lat: 10.61039, lng: -67.01919 });
  assert.deepEqual(f.get('ce_norte')!.location, { lat: 10.61911, lng: -66.85436 });
  assert.deepEqual(f.get('ce_sur')!.location, { lat: 10.61144, lng: -66.83332 });
  assert.deepEqual(db().get('centers', 'ce_final')!.unloadingPoint, { lat: 10.58703, lng: -67.00575 });
  for (const id of ['ce_norte', 'ce_sur']) assert.equal(db().get('centers', id)!.sectorId, 'sc_este');
});

test('3 y 8: diario y acumulado, m³ y t separados; guion ≠ cero; fecha y hora de la fuente', async () => {
  const snap = db().get('reportSnapshots', NOV22_SNAPSHOT_ID)!;
  assert.deepEqual(snap.sourceDiscrepancies, [{ field: 'm3Today', official: 5606.04, rowSum: 5606.03 }, { field: 'm3Accumulated', official: 1382738.94, rowSum: 1382739.69 }]);
  assert.equal(snap.reportedAt, '2026-11-22T18:00:00-04:00');
  const row = snap.rows.find((r) => r.label === 'Playa Escondida')!;
  assert.equal(row.m3Today, null);
  assert.equal(row.tonnesToday, null);
  const v = snapshotView(null);
  // El total acumulado de m³ impreso queda 0,75 por debajo de la suma de sus filas: se conserva y se muestra.
  assert.equal(v.consistency.m3Accumulated.reported, 1382738.94);
  assert.equal(v.consistency.m3Accumulated.computed, 1382739.69);
  assert.equal(v.consistency.m3Accumulated.difference, -0.75);
  assert.equal(v.consistency.tonnesAccumulated.difference, 0);
  assert.equal(v.consistency.tonnesToday.difference, 0);
  // El total impreso de m³ del día difiere 0,01 de la suma: se muestra, no se corrige.
  assert.equal(v.consistency.m3Today.reported, 5606.04);
  assert.equal(v.consistency.m3Today.difference, 0.01);
  assert.equal(v.consistency.tonnesAccumulated.reported, 1521013.66);
  const onlyDash = snapshotView(null, { operatorId: 'en_csur' });
  assert.equal(onlyDash.totals.m3Today.value, null);
  // Valorización: nunca suma t con m³
  const b = (unit: 't' | 'm3') => ({ outputs: { unit, aggregate: 10, metal: 0, specialDisposal: 0, rejects: 10 } }) as never;
  assert.equal(valorizationRate([b('t'), b('t')]).rate, 0.5);
  assert.equal(valorizationRate([b('t'), b('m3')]).rate, null);
});

test('6: el centro ve solo su sitio y la entidad solo lo suyo, aunque pidan otra cosa', async () => {
  const c = (await get('/reports/snapshots/view?facility=ce_final', tok('centro', 'center'))).json;
  assert.equal(c.scope, 'facility');
  assert.ok(c.facilities.every((f: any) => f.facilityId === 'ce_norte' || f.rows.length === 0));
  const e = (await get('/reports/snapshots/view?operator=en_cnorte', tok('admin-ejecutor', 'entity_admin'))).json;
  assert.ok(e.facilities.every((f: any) => f.rows.length === 0));
});

test('9 y 20: exportación solo con permiso y siempre registrada; celda vacía donde hay guion', async () => {
  assert.equal((await get('/reports/snapshots/export', tok('coordinador', 'coordinator'))).status, 403);
  assert.equal((await get('/reports/snapshots/export', tok('centro', 'center'))).status, 403);
  const before = db().allEvents().filter((e) => e.type === 'data_exported').length;
  const r = await get('/reports/snapshots/export', tok('supervisor', 'supervisor'));
  assert.equal(r.status, 200);
  assert.equal(db().allEvents().filter((e) => e.type === 'data_exported').length, before + 1);
  const line = r.text.split('\n').find((l) => l.includes(',Playa Escondida,'))!;
  assert.match(line, /,,204798\.19,,225278\.01$/);
});

test('5.9, 5.10 y 12: reporte ciudadano con identidad protegida; seguimiento público', async () => {
  const reporter: Actor = { id: user('ciudadano').id, role: 'citizen', entityId: null };
  const { origin } = createCitizenReport({ photoIds: [photo()], location: { lat: 10.611, lng: -66.861 }, street: 'Calle Secreta 9', size: 'small', reporterName: 'Nombre Reservado', source: 'pwa' }, reporter);
  const id = user('ciudadano').id;
  for (const [alias, role] of [['contralora', 'monitor'], ['supervisor', 'supervisor']] as [string, Role][]) {
    const t = (await get(`/origins/${origin.code}`, tok(alias, role))).text;
    assert.ok(!t.includes('Nombre Reservado') && !t.includes(id) && !t.includes('"ciudadano"'), role);
  }
  const sup = (await get('/supervisor/overview', tok('supervisor', 'supervisor'))).text;
  assert.ok(!sup.includes('Nombre Reservado'));
  // Corrección por la coordinación y vista pública sin valores
  validateOrigin(origin.id, { id: user('coordinador').id, role: 'coordinator', entityId: 'en_coord' });
  const ev = db().eventsOfChain(`origin:${origin.id}`).find((e) => e.type === 'origin_validated')!;
  const c = await post(`/events/${ev.id}/correct`, tok('coordinador', 'coordinator'), { reason: 'Dirección equivocada', patch: { street: 'Calle Corregida 10' } });
  assert.equal(c.status, 201);
  const corr = db().eventsOfChain(`origin:${origin.id}`).find((e) => e.type === 'correction')!;
  assert.deepEqual(corr.data.previous, { street: 'Calle Secreta 9' });
  assert.equal(corr.actorId, user('coordinador').id);
  assert.equal(getOriginOrThrow(origin.code).street, 'Calle Corregida 10');
  for (const p of [`/public/ficha/${origin.code}`, `/origins/${origin.code}`, `/public/reportes/${origin.code}/estado`]) {
    const r = await get(p);
    assert.equal(r.status, 200, p);
    for (const s of ['Calle Secreta', 'Calle Corregida', 'Nombre Reservado', id]) assert.ok(!r.text.includes(s), `${p} muestra ${s}`);
  }
  assert.equal((await post(`/events/${ev.id}/correct`, tok('supervisor', 'supervisor'), { reason: 'No debería', patch: { street: 'x' } })).status, 403);
});

test('10: inicios de sesión, accesos denegados y cambios de rol registrados; solo los ve el administrador', async () => {
  assert.equal((await post('/auth/login', null, { identifier: 'coordinador', password: 'mala' })).status, 401);
  assert.equal((await post('/auth/login', null, { identifier: 'coordinador', password: 'demo1234' })).status, 200);
  await get('/admin/users', tok('retiro', 'removal'));
  const u = user('intruso-v4');
  upsertUser({ id: u.id, alias: u.alias, roles: ['citizen', 'removal'], entityId: 'en_ejec' }, { id: user('admin').id, kind: 'kindra' });
  const acts = db().eventsOfChain('system:security').map((e) => e.data.action);
  for (const a of ['sign_in', 'sign_in_failed', 'access_denied', 'role_change']) assert.ok(acts.includes(a), a);
  assert.ok(!JSON.stringify(db().eventsOfChain('system:security')).includes('mala'));
  const leaked = await get('/events?limit=500', tok('retiro', 'removal'));
  assert.ok(!leaked.json.events.some((e: any) => ['security_event', 'data_exported', 'info_request_action'].includes(e.type)));
  assert.equal((await get('/events?chain=system:security', tok('supervisor', 'supervisor'))).json.events.length, 0);
  assert.equal((await get('/admin/security', tok('admin', 'admin', true))).status, 200);
});

test('24: suspensión corta la sesión y la recuperación no revela si la cuenta existe', async () => {
  const a = await post('/auth/recovery', null, { identifier: 'ciudadano' });
  const b = await post('/auth/recovery', null, { identifier: 'no-existe-nadie' });
  assert.deepEqual([a.status, a.text], [b.status, b.text]);
  assert.equal(db().count('recoveryRequests'), 1);
  const t = tok('intruso-v4', 'citizen');
  assert.equal((await get('/auth/me', t)).status, 200);
  db().update('users', user('intruso-v4').id, { active: false });
  assert.equal((await get('/auth/me', t)).status, 401);
});

test('9: la solicitud de información la decide una persona; contacto nunca público; confidencial solo en parte', async () => {
  const s = await post('/public/solicitudes-informacion', null, { subject: 'Toneladas por sector', description: 'Quisiera el detalle por sector del mes.', name: 'Persona X', contact: 'persona-x-contacto' });
  assert.equal(s.status, 201);
  assert.ok(!s.text.includes('persona-x-contacto'));
  assert.ok(!(await get(`/public/solicitudes-informacion/${s.json.code}`)).text.includes('Persona X'));
  const admin = tok('admin', 'admin', true);
  const id = (await get('/admin/info-requests', admin)).json.find((r: any) => r.code === s.json.code).id;
  const act = (body: unknown) => post(`/admin/info-requests/${id}/action`, admin, body);
  assert.equal((await act({ action: 'release', note: 'ok', releasedItems: ['x'] })).status, 409); // sin clasificar
  assert.equal((await act({ action: 'classify', classification: 'confidential' })).status, 200);
  assert.equal((await act({ action: 'release', note: 'ok', releasedItems: ['x'] })).status, 409);
  assert.equal((await act({ action: 'partial_release', note: 'Fundamento', releasedItems: ['Totales por sector'] })).status, 400); // falta qué se tachó
  const done = await act({ action: 'partial_release', note: 'Fundamento', releasedItems: ['Totales por sector'], redactions: 'Direcciones' });
  assert.equal(done.json.status, 'partially_released');
  assert.equal(done.json.approvedBy, user('admin').id);
  const log = db().eventsOfChain(`system:info:${id}`);
  assert.deepEqual(log.at(-1)!.data.releasedItems, ['Totales por sector']);
  assert.ok(!JSON.stringify(log).includes('persona-x-contacto'));
});

test('11: un riesgo no se da por resuelto sin prueba del control; incidentes con historial', async () => {
  const admin = tok('admin', 'admin', true);
  const risk = { description: 'Riesgo de prueba', affected: 'Bitácora', likelihood: 3, impact: 4, mitigation: 'Copias', owner: 'Kindra', reviewDate: '2026-12-01', status: 'resolved', controlTestedAt: null as string | null, controlTestNote: null as string | null };
  assert.equal((await post('/admin/risks', admin, risk)).status, 409);
  const ok = await post('/admin/risks', admin, { ...risk, controlTestedAt: '2026-11-25', controlTestNote: 'Restauración probada' });
  assert.equal(ok.json.score, 12);
  const inc = await post('/admin/incidents', admin, { title: 'Incidente de prueba', description: 'Descripción', severity: 'low' });
  const upd = await post(`/admin/incidents/${inc.json.id}/status`, admin, { status: 'contained', note: 'Contenido' });
  assert.equal(upd.json.history.length, 2);
});

test('17, 21 y 30: solicitud → un solo conductor → recolección → centro confirma → coordinación valida', async () => {
  const coord = tok('coordinador', 'coordinator');
  const citizen: Actor = { id: null, role: 'citizen', entityId: null };
  const mk = () => {
    const { origin } = createCitizenReport({ photoIds: [photo()], location: { lat: 10.612 + ++n / 1000, lng: -66.85 }, size: 'small', source: 'pwa' }, citizen);
    validateOrigin(origin.id, { id: user('coordinador').id, role: 'coordinator', entityId: 'en_coord' });
    return origin;
  };
  // Addendum v4.2, sección 13: cuentas institucionales reales entran con verificación en dos pasos.
  const mfa = (id: string) => db().update('users', id, { twoFactor: { enabled: true } } as never).id;
  const other = upsertUser({ alias: 'retiro-dos', password: 'demo1234', roles: ['driver'], entityId: 'en_ejec', verificationStatus: 'verified' });
  const one = upsertUser({ alias: 'retiro-uno', password: 'demo1234', roles: ['driver'], entityId: 'en_ejec', verificationStatus: 'verified' });
  assert.equal((await get('/requests', issueToken(one.id, 'driver'))).status, 403); // sin verificación en dos pasos
  const d1 = issueToken(mfa(one.id), 'driver', true);
  const d2 = issueToken(mfa(other.id), 'driver', true);
  const o = mk();
  const body = { module: 'debris', originId: o.id, operatorEntityId: 'en_ejec', centerId: 'ce_norte', material: 'Concreto', estimatedQuantity: 6, unit: 'm3', date: '2026-11-25', windowFrom: '08:00', windowTo: '10:00' };
  assert.equal((await post('/requests', coord, { ...body, module: 'liquid', unit: 'l' })).status, 403); // módulo inactivo
  assert.equal((await post('/requests', coord, { ...body, unit: 'l' })).status, 400);
  assert.equal((await post('/requests', d1, body)).status, 403);
  const c = await post('/requests', coord, body);
  assert.equal(c.status, 201);
  assert.equal(c.json.code, o.code); // código canónico
  assert.equal((await post('/requests', coord, body)).status, 409);
  const id = c.json.id;

  // Addendum v4.2: en escombros el conductor no acepta ni rechaza; el operador o la coordinación asignan.
  assert.equal((await post(`/requests/${id}/reject`, d2, { reason: 'schedule_conflict' })).status, 403);
  assert.equal((await post(`/requests/${id}/accept`, d1)).status, 403);
  const d1User = db().find('users', (u) => u.alias === 'retiro-uno')!;
  assert.equal((await post(`/requests/${id}/assign`, d2, { driverId: d1User.id })).status, 403);
  assert.equal((await post(`/requests/${id}/assign`, coord, { driverId: d1User.id })).status, 200);
  const winner = d1;
  const loser = d2;
  assert.ok(!(await get('/requests', loser)).json.some((r: any) => r.id === id));
  assert.equal((await post(`/requests/${id}/status`, loser, { to: 'en_route' })).status, 403);

  await post(`/requests/${id}/status`, winner, { to: 'en_route' });
  await post(`/requests/${id}/status`, winner, { to: 'arrived' });
  const vehicle = db().list('vehicles').find((v) => v.entityId === 'en_ejec' && v.active && !db().find('trips', (t) => t.vehicleId === v.id && t.state === 'in_transit'))!;
  assert.equal((await post(`/requests/${id}/collect`, winner, { quantity: 6, unit: 'm3', photoId: 'no-existe', vehicleId: vehicle.id })).status, 400);
  const trips = db().count('trips');
  const col = await post(`/requests/${id}/collect`, winner, { quantity: 6, unit: 'm3', photoId: photo(), vehicleId: vehicle.id, fillLevel: 'full' });
  assert.equal(col.json.status, 'collected');
  assert.equal(db().count('trips'), trips + 1); // un solo viaje, el mismo que confirma el centro

  // El conductor no confirma ni valida; coordinación tampoco valida antes de la recepción
  const tripId = col.json.tripId;
  assert.equal((await post(`/center/trips/${tripId}/arrive`, winner, { photoId: photo() })).status, 403);
  assert.equal((await post(`/requests/${id}/validate`, winner)).status, 403);
  assert.equal((await post(`/requests/${id}/validate`, coord)).status, 409);

  // Recepción con operador, cantidad y discrepancia
  const ce = tok('centro', 'center');
  assert.equal((await post(`/center/trips/${tripId}/arrive`, ce, { photoId: photo(), operatorEntityId: 'en_tec', receivedQuantity: 5, receivedUnit: 'm3' })).status, 400);
  const dispatched = db().get('trips', tripId)!.estimatedVolumeM3!;
  // Addendum v4.2, sección 6: toda cantidad lleva su método de medición.
  assert.equal((await post(`/center/trips/${tripId}/arrive`, ce, { photoId: photo(), operatorEntityId: 'en_cnorte', receivedQuantity: dispatched - 1, receivedUnit: 'm3' })).status, 400);
  const arr = await post(`/center/trips/${tripId}/arrive`, ce, { photoId: photo(), operatorEntityId: 'en_cnorte', receivedQuantity: dispatched - 1, receivedUnit: 'm3', condition: 'Mezclado', measurementMethod: 'measured_volume' });
  assert.equal(arr.status, 200);
  assert.equal(arr.json.reception.quantityCheck.difference, -1);
  assert.ok(arr.json.reception.quantityCheck.flagged);
  assert.equal(db().get('trips', tripId)!.estimatedVolumeM3, dispatched); // cifra original intacta
  assert.ok(db().get('alerts', `al_qty_${tripId}`));
  assert.equal((await get('/requests', winner)).json.find((r: any) => r.id === id).status, 'received');
  assert.equal((await post(`/requests/${id}/validate`, coord)).json.status, 'completed');
  const imp = (await get('/requests/impact', winner)).json;
  assert.deepEqual([imp.completed, imp.m3, imp.t], [1, dispatched - 1, null]);
  assert.equal((await get('/requests/impact?from=2027-01-01', winner)).json.completed, 0);

  // Actividad registrada: por operador, con detalle
  const a = (await get('/reports/activity?operator=en_cnorte', tok('supervisor', 'supervisor'))).json;
  assert.equal(a.records.filter((r: any) => r.tripId === tripId).length, 1);
  assert.equal(a.totals.m3, dispatched - 1);
  assert.equal(a.totals.tonnes, null);

  // Incidencia y reasignación
  const o2 = mk();
  const c2 = await post('/requests', coord, { ...body, originId: o2.id });
  await post(`/requests/${c2.json.id}/assign`, coord, { driverId: d1User.id });
  assert.equal((await post(`/requests/${c2.json.id}/issue`, d1, { text: 'Vía cerrada' })).json.status, 'issue');
  assert.equal((await post(`/requests/${c2.json.id}/manage`, coord, { action: 'reassign', note: 'Otra unidad' })).json.status, 'new');
});

test('7: lote completo de origen a destino con entrada, método, ensayo y balance; no se cierra antes de tiempo', async () => {
  const ce = tok('centro', 'center');
  const overview = (await get('/center/overview', ce)).json;
  let batch = overview.openBatch;
  assert.ok(batch, 'lote abierto');
  for (const r of batch.receptions.filter((x: any) => !x.subcategory)) await post(`/center/receptions/${r.id}/classify`, ce, { subcategory: 'concrete_brick' });
  const ev = tok('evaluador', 'evaluator');
  batch = (await get(`/center/batches/${batch.id}`, ce)).json;
  if (batch.state === 'held') {
    const checklist = Object.fromEntries((await get('/eval/overview', ev)).json.hazardChecklist.map((c: any) => [c.key, true]));
    await post(`/eval/batches/${batch.id}/hazard-decision`, ev, { receptionIds: batch.receptions.filter((r: any) => r.subcategory === 'possible_hazardous' && !r.hazardDecision).map((r: any) => r.id), checklist, decision: 'release', justification: 'Sin riesgo' });
  }
  const work = overview.works[0];
  // Etapa posterior antes de tiempo: bloqueada
  assert.equal((await post(`/center/batches/${batch.id}/dispatch`, ce, { workId: work.id, quantity: 1 })).status, 409);
  assert.equal((await post(`/center/batches/${batch.id}/close`, ce)).status, 200);
  const out = await post(`/center/batches/${batch.id}/outputs`, ce, { unit: 'm3', aggregate: 8, metal: 1, specialDisposal: 0, rejects: 0.5, input: 10, method: 'Trituración' });
  assert.equal(out.status, 200);
  assert.equal(out.json.materialBalance.difference, -0.5);
  assert.ok(out.json.materialBalance.flagged);
  assert.equal((await post(`/center/batches/${batch.id}/dispatch`, ce, { workId: work.id, quantity: 1 })).status, 409);
  const q = Object.fromEntries((await get('/eval/overview', ev)).json.qualityChecklist.map((c: any) => [c.key, true]));
  const tests = [{ testType: 'Granulometría', method: 'Tamizado', date: '2026-11-25', result: '12', unit: 'mm', laboratory: 'Laboratorio de prueba' }];
  assert.equal((await post(`/eval/batches/${batch.id}/quality`, ce, { checklist: q, result: 'approved', justification: 'No autorizado' })).status, 403);
  const qv = await post(`/eval/batches/${batch.id}/quality`, ev, { checklist: q, result: 'approved', justification: 'Cumple', tests });
  assert.equal(qv.status, 200);
  assert.deepEqual(qv.json.verification.tests, tests);
  const dp = await post(`/center/batches/${batch.id}/dispatch`, ce, { workId: work.id, quantity: 8 });
  assert.equal(dp.status, 201);
  assert.equal(dp.json.dispatch.state, 'pending');
  const rec = await post(`/dest/dispatches/${dp.json.dispatch.id}/receive`, tok('obras', 'destination'), { quantityReceived: 7, photoId: photo() });
  assert.equal(rec.status, 200, rec.text);
  const d = db().get('dispatches', dp.json.dispatch.id)!;
  assert.deepEqual([d.state, d.quantity, d.quantityReceived], ['discrepancy', 8, 7]);
});

test('2 y 12: los módulos futuros están en la configuración pero no se pueden activar ni usar', async () => {
  const admin = tok('admin', 'admin', true);
  const f = (await get('/admin/features', admin)).json;
  for (const key of ['module_other', 'payments']) {
    assert.equal(f.find((x: any) => x.key === key).enabled, false);
    assert.equal((await call('PUT', '/admin/features', admin, { [key]: true })).status, 400, key);
  }
  // El módulo de aceite existe pero no se enciende sin su definición aprobada
  assert.equal(f.find((x: any) => x.key === 'oil_module').enabled, false);
  assert.equal((await call('PUT', '/admin/features', admin, { oil_module: true })).status, 409);
});

test('10 y 12: copia y restauración: todo vuelve, los sellos coinciden y no se escribe sobre datos existentes', async () => {
  await db().flush();
  const state = structuredClone(await db().persistence.load());
  const target = new MemoryPersistence(null);
  const r = await restoreInto(target, state);
  assert.ok(r.ok);
  assert.equal(r.events, db().allEvents().length);
  await assert.rejects(() => restoreInto(target, state), /no está vacío/);
  const bad = structuredClone(state);
  bad.events[5].data = { alterado: true };
  assert.equal(verifyEvents(bad.events).broken.length, 1);
  assert.equal((await restoreInto(new MemoryPersistence(null), bad)).ok, false);
});
