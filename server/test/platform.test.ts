import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { initPlatform } from '../src/bootstrap';
import { MemoryPersistence } from '../src/persistence/memory';
import { db } from '../src/core/db';
import { verifyChain, chainIdOf, replayAll } from '../src/core/events';
import { registerDeparture, confirmArrival } from '../src/services/trips';
import { recordOutputs, createDispatch, batchComposition, getBatchOrThrow, classifyReception } from '../src/services/batches';
import { validateOrigin, createCitizenReport } from '../src/services/origins';
import { handleMessage, detectIntentByRules } from '../src/services/aura';
import { DEFAULT_AURA_TEXTS } from '../src/config/auraTexts';
import { containsForbiddenExpression } from '../src/services/notifications';
import { registerPhoto } from '../src/services/photos';
import type { Actor } from '../src/core/events';
import type { KEvent } from '@kindra/shared';

const actor = (id: string, role: Actor['role'], entityId: string | null): Actor => ({ id, role, entityId });

before(async () => {
  process.env.JOBS_INTERVAL_SECONDS = '0';
  await initPlatform({ persistence: new MemoryPersistence(null), seed: true, quiet: true });
});

test('3.2 / 21.3: la cadena de un origen está intacta y una alteración manual se detecta nombrando el evento', () => {
  const store = db();
  const origin = store.list('origins').find((o) => o.state === 'closed')!;
  const chainId = chainIdOf('origin', origin.id);
  assert.equal(verifyChain(chainId).status, 'intact');
  // Alteración directa en la base (simula un cambio manual en la fila del evento)
  const events = store.eventsOfChain(chainId);
  const target = events[Math.floor(events.length / 2)] as KEvent & { data: Record<string, unknown> };
  const originalData = target.data;
  (target as { data: Record<string, unknown> }).data = { ...originalData, manipulado: true };
  const result = verifyChain(chainId);
  assert.equal(result.status, 'altered');
  assert.equal(result.brokenAt?.eventId, target.id);
  (target as { data: Record<string, unknown> }).data = originalData;
  assert.equal(verifyChain(chainId).status, 'intact');
});

test('3.1: reproducir la bitácora desde cero devuelve el mismo estado', () => {
  const store = db();
  const before = JSON.stringify(store.list('origins').map((o) => [o.id, o.state, o.tripIds.length]).sort());
  const batchesBefore = JSON.stringify(store.list('batches').map((b) => [b.id, b.state, b.receptionIds.length]).sort());
  replayAll();
  assert.equal(JSON.stringify(store.list('origins').map((o) => [o.id, o.state, o.tripIds.length]).sort()), before);
  assert.equal(JSON.stringify(store.list('batches').map((b) => [b.id, b.state, b.receptionIds.length]).sort()), batchesBefore);
});

test('7.2 / 21.4: no se registra un viaje desde un origen en zona pendiente de autorización', () => {
  const store = db();
  const pending = store.list('origins').find((o) => !o.zoneAuthorized && o.state === 'validated')!;
  const removal = store.list('users').find((u) => u.roles.includes('removal'))!;
  const photo = registerPhoto({ id: 'ph_test_1', url: '/uploads/x.svg', kind: 'trip_departure', moderation: 'approved', uploadedAt: new Date().toISOString() });
  assert.throws(
    () => registerDeparture(actor(removal.id, 'removal', removal.entityId!), { vehicleQr: 'KV-DEMO01', originIds: [pending.id], centerId: 'ce_norte', photoId: photo.id }),
    (err: { code?: string; status?: number }) => err.code === 'zoneAuthorized' && err.status === 409,
  );
});

test('7.3 / 21.4: un lote retenido no se puede procesar', () => {
  const store = db();
  const held = store.list('batches').find((b) => b.state === 'held')!;
  const user = store.list('users').find((u) => u.centerId === held.centerId)!;
  assert.throws(
    () => recordOutputs(held.id, actor(user.id, 'center', user.entityId!), { unit: 't', aggregate: 1, metal: 0, specialDisposal: 0, rejects: 0 }),
    (err: { code?: string }) => err.code === 'batch_held',
  );
});

test('7.4 / 21.4: un lote sin verificación aprobada no se despacha', () => {
  const store = db();
  const uv = store.list('batches').find((b) => b.state === 'under_verification')!;
  const user = store.list('users').find((u) => u.centerId === uv.centerId)!;
  const work = store.list('works')[0];
  assert.throws(
    () => createDispatch(uv.id, actor(user.id, 'center', user.entityId!), { workId: work.id, quantity: 1 }),
    (err: { code?: string }) => err.code === 'qualityApproved',
  );
});

test('4.1 / 21.4: nadie valida ni recibe lo que reportó', () => {
  const store = db();
  const coord = store.list('users').find((u) => u.roles.includes('coordinator'))!;
  const photo = registerPhoto({ id: 'ph_test_2', url: '/uploads/x.svg', kind: 'origin', moderation: 'approved', uploadedAt: new Date().toISOString() });
  const r = createCitizenReport({ photoIds: [photo.id], location: { lat: 10.6035, lng: -66.963 }, size: 'small', source: 'pwa', reporterName: 'Coordinador reportando' }, actor(coord.id, 'citizen', null));
  assert.throws(() => validateOrigin(r.origin.id, actor(coord.id, 'coordinator', coord.entityId!)), (err: { code?: string }) => err.code === 'notOwnReport');
  // recepción: el usuario de centro que reportó un origen no puede confirmar su llegada
  const centerUser = store.list('users').find((u) => u.centerId === 'ce_norte')!;
  const otherCoord = actor(coord.id, 'coordinator', coord.entityId!);
  const r2 = createCitizenReport({ photoIds: [photo.id], location: { lat: 10.6036, lng: -66.9645 }, size: 'small', source: 'pwa' }, actor(centerUser.id, 'citizen', null));
  validateOrigin(r2.origin.id, otherCoord);
  const removal = store.list('users').find((u) => u.roles.includes('removal'))!;
  const trip = registerDeparture(actor(removal.id, 'removal', removal.entityId!), { vehicleQr: 'KV-DEMO02', originIds: [r2.origin.id], centerId: 'ce_norte', photoId: photo.id });
  assert.throws(() => confirmArrival(trip.id, actor(centerUser.id, 'center', centerUser.entityId!), { photoId: photo.id }), (err: { code?: string }) => err.code === 'notOwnReport');
});

test('7.5: balance de masas reparte en partes iguales un viaje con orígenes de varios sectores', () => {
  const store = db();
  const removal = store.list('users').find((u) => u.roles.includes('removal'))!;
  const coord = store.list('users').find((u) => u.roles.includes('coordinator'))!;
  const centerUser = store.list('users').find((u) => u.centerId === 'ce_sur')!;
  const photo = registerPhoto({ id: 'ph_test_3', url: '/uploads/x.svg', kind: 'origin', moderation: 'approved', uploadedAt: new Date().toISOString() });
  const a = createCitizenReport({ photoIds: [photo.id], location: { lat: 10.6005, lng: -66.9680 }, size: 'large', source: 'pwa' }, { id: null, role: 'citizen', entityId: null }).origin; // sector A
  const b = createCitizenReport({ photoIds: [photo.id], location: { lat: 10.6005, lng: -66.9440 }, size: 'large', source: 'pwa' }, { id: null, role: 'citizen', entityId: null }).origin; // sector B
  validateOrigin(a.id, actor(coord.id, 'coordinator', coord.entityId!));
  validateOrigin(b.id, actor(coord.id, 'coordinator', coord.entityId!));
  const trip = registerDeparture(actor(removal.id, 'removal', removal.entityId!), { vehicleQr: 'KV-DEMO05', originIds: [a.id, b.id], centerId: 'ce_sur', photoId: photo.id, fillLevel: 'full' });
  assert.equal(trip.estimatedVolumeM3, 20);
  // el lote abierto del Sur está retenido (previousState open): la recepción entra ahí
  const { reception } = confirmArrival(trip.id, actor(centerUser.id, 'center', centerUser.entityId!), { photoId: photo.id });
  classifyReception(reception.id, actor(centerUser.id, 'center', centerUser.entityId!), { subcategory: 'concrete_brick' });
  const comp = batchComposition(getBatchOrThrow(reception.batchId));
  const shareA = comp.find((c) => c.sectorId === a.sectorId)!;
  const shareB = comp.find((c) => c.sectorId === b.sectorId)!;
  assert.ok(shareA && shareB);
  assert.equal(shareA.weight, shareB.weight);
  assert.ok(Math.abs(comp.reduce((s, c) => s + c.share, 0) - 1) < 1e-9);
});

test('21.5: AURA responde con honestidad ante un código inexistente y reconoce intenciones (Plan B)', async () => {
  const r = await handleMessage({ text: 'LG-QQQQ' }, { id: null, role: 'citizen', entityId: null });
  assert.ok(r.messages[0].text.includes('LG-QQQQ'));
  assert.ok(/no encuentro|no tengo|no aparece/i.test(r.messages[0].text));
  assert.equal(detectIntentByRules('Hay un montón de escombro frente a mi casa'), 'report');
  assert.equal(detectIntentByRules('¿Qué pasó con lo que reporté?'), 'status');
  assert.equal(detectIntentByRules('Ya se lo llevaron'), 'confirm');
  assert.equal(detectIntentByRules('Dijeron que lo retiraron pero sigue ahí'), 'dispute');
  assert.equal(detectIntentByRules('¿A dónde llevan todo eso?'), 'where');
  assert.equal(detectIntentByRules('¿Es peligroso?'), 'safety');
});

test('21.7: ningún texto ciudadano usa expresiones prohibidas ni la palabra blockchain', () => {
  for (const t of DEFAULT_AURA_TEXTS) {
    assert.ok(t.variants.length >= 3, `${t.key} necesita 3 variantes`);
    for (const v of t.variants) {
      assert.equal(containsForbiddenExpression(v), null, `${t.key}: ${v}`);
      assert.ok(!/blockchain/i.test(v));
    }
  }
});

test('21.8: ningún texto menciona aceite, reciclables domésticos, anunciantes ni pagos', () => {
  const all = DEFAULT_AURA_TEXTS.flatMap((t) => t.variants).join(' ').toLowerCase();
  for (const w of ['aceite', 'anunciante', 'publicidad', 'comisión', 'precio']) assert.ok(!all.includes(w), w);
});
