import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { initPlatform } from '../src/bootstrap';
import { MemoryPersistence } from '../src/persistence/memory';
import { db } from '../src/core/db';
import type { Actor } from '../src/core/events';
import { auraReply, usableName } from '../src/services/auraV42';
import { createCitizenReport, linkReportToLot, markDuplicate, publicLotStage, reportStatus, validateOrigin, createInstitutionalOrigin } from '../src/services/origins';
import { registerPhoto, savePhoto } from '../src/services/photos';
import { computePoints } from '../src/services/points';
import { publicLookup, openData, sectorProgressAll, publicFacilities } from '../src/services/portal';
import { stripImageMetadata } from '../src/services/stripMetadata';
import { suggestFromPhoto } from '../src/services/ai';
import { setFeatures } from '../src/services/features';
import { decryptField } from '../src/services/secureField';
import { listCourses, submitCourseQuiz } from '../src/services/lessons';

const anon: Actor = { id: null, role: 'citizen', entityId: null };
let n = 0;
const photo = () => registerPhoto({ id: `ph_v42_${++n}`, url: '/uploads/x.svg', kind: 'origin', moderation: 'approved', uploadedAt: new Date().toISOString() }).id;
const coord = (): Actor => {
  const c = db().list('users').find((u) => u.alias === 'coordinador')!;
  return { id: c.id, role: 'coordinator', entityId: c.entityId! };
};
const wa = (waId: string, profileName: string | null, text: string | null, extra: Record<string, unknown> = {}) => auraReply({ text, ...extra }, anon, { kind: 'whatsapp', waId, profileName, voice: !!extra.voice });
const texts = (r: { messages: { text: string }[] }) => r.messages.map((m) => m.text).join(' | ');

before(async () => {
  process.env.JOBS_INTERVAL_SECONDS = '0';
  await initPlatform({ persistence: new MemoryPersistence(null), seed: true, quiet: true });
});

test('v4.2 · 18 y 13: AURA saluda por el nombre de WhatsApp, pide consentimiento y no guarda nada antes del sí', async () => {
  const r1 = await wa('584140000101', 'María Pérez', 'hola');
  assert.match(texts(r1), /¡(Hola|Qué tal), María!/);
  assert.doesNotMatch(texts(r1), /Cómo te llamas/);
  assert.match(texts(r1), /(Te parece bien|Estás de acuerdo)/);
  assert.equal(db().count('auraProfiles'), 0, 'sin consentimiento no hay perfil');
  const no = await wa('584140000102', 'Pedro', 'hola');
  assert.ok(no.messages.length);
  await wa('584140000102', 'Pedro', 'no');
  assert.ok(!db().list('auraProfiles').some((p) => decryptField(p.waIdEnc) === '584140000102'), 'si dice que no, no se guarda ni el nombre');
  const yes = await wa('584140000101', 'María Pérez', 'sí');
  assert.match(texts(yes), /(escombro|reporte)/);
  const p = db().list('auraProfiles')[0];
  assert.ok(p.consent?.version, 'consentimiento registrado con versión');
  assert.notEqual(p.waIdEnc, '584140000101', 'el número se guarda cifrado');
  assert.equal(decryptField(p.waIdEnc), '584140000101');
});

test('v4.2 · 16: reporte en texto libre sin repetir datos ya dados, con código R- y sin menú', async () => {
  const sector = db().list('sectors').find((s) => s.parish === 'Caraballeda' && s.polygon.length)!;
  const base = sector.name.replace(/\(.*?\)/g, '').split(',')[0].trim();
  const r1 = await wa('584140000101', 'María Pérez', `Hay un montón de escombro frente a la bodega en ${base}, Caraballeda`);
  assert.doesNotMatch(texts(r1), /parroquia/i, 'la parroquia ya se dio');
  assert.doesNotMatch(texts(r1), /1\. Reportar escombro/, 'no muestra el menú');
  assert.match(texts(r1), /foto/i);
  const r2 = await wa('584140000101', 'María Pérez', null, { photoId: photo() });
  assert.match(texts(r2), /referencia/i);
  const r3 = await wa('584140000101', 'María Pérez', 'frente a la bodega');
  assert.match(texts(r3), /R-CB-\d{6}/);
  assert.match(texts(r3), /María/);
  const code = /R-CB-\d{6}/.exec(texts(r3))![0];
  const o = db().find('origins', (x) => x.code === code)!;
  assert.equal(o.sectorId, sector.id);
  assert.equal(o.source, 'whatsapp');
  // Consulta por código y estado público.
  const st = await wa('584140000101', 'María Pérez', `¿cómo va ${code}?`);
  assert.match(texts(st), /Recibido \/ Por Verificar/);
});

test('v4.2 · 16 y 17: menú solo tras «menú» o dos intentos fallidos; dice la verdad si le preguntan si es persona', async () => {
  const f1 = await wa('584140000101', 'María Pérez', 'zxqv blorp');
  assert.doesNotMatch(texts(f1), /1\. Reportar escombro/);
  const f2 = await wa('584140000101', 'María Pérez', 'qwerty plunk');
  assert.match(texts(f2), /1\. Reportar escombro/);
  const m = await wa('584140000101', 'María Pérez', 'menú');
  assert.match(texts(m), /6\. Privacidad/);
  const h = await wa('584140000101', 'María Pérez', '¿eres una persona?');
  assert.match(texts(h), /asistente de Kindra/);
  assert.match(texts(h), /(equipo|persona)/);
});

test('v4.2 · 22: nota de voz → pide texto y ofrece una persona; «hablar con una persona» crea la conversación con historial', async () => {
  const v = await wa('584140000101', 'María Pérez', null, { voice: true });
  assert.match(texts(v), /audios/);
  assert.match(texts(v), /persona/);
  const before = db().count('supportTickets');
  await wa('584140000101', 'María Pérez', 'quiero hablar con una persona');
  assert.equal(db().count('supportTickets'), before + 1);
  assert.ok(db().list('supportTickets').at(-1)!.history.length > 0);
});

test('v4.2 · 19: nombre de perfil inutilizable → pregunta una vez cómo llamarle y lo usa; «dime» cambia el nombre', async () => {
  assert.equal(usableName('🙂'), false);
  assert.equal(usableName('.'), false);
  assert.equal(usableName('J.P.'), false);
  assert.equal(usableName('Inversiones El Sol C.A.'), false);
  assert.equal(usableName('Rosa'), true);
  await wa('584140000103', '🙂🙂', 'hola');
  const a = await wa('584140000103', '🙂🙂', 'sí');
  assert.match(texts(a), /Cómo te gusta que te llame/);
  const b = await wa('584140000103', '🙂🙂', 'Carmen');
  assert.match(texts(b), /Carmen/);
  const c = await wa('584140000103', '🙂🙂', 'dime Mary');
  assert.match(texts(c), /Mary/);
});

test('v4.2 · 20: recuerda a la persona y sugiere su sector; tras borrar sus datos ya no recuerda nada', async () => {
  const r = await wa('584140000101', 'María Pérez', 'quiero reportar escombro');
  assert.match(texts(r), /otra vez/, 'sugiere la parroquia o el sector habitual');
  await wa('584140000101', 'María Pérez', 'cancelar todo');
  const priv = await wa('584140000101', 'María Pérez', 'privacidad');
  assert.match(texts(priv), /borrar/);
  const del = await wa('584140000101', 'María Pérez', 'sí, borrar');
  assert.match(texts(del), /borré/);
  assert.ok(!db().list('auraProfiles').some((p) => decryptField(p.waIdEnc) === '584140000101'));
  const again = await wa('584140000101', 'María Pérez', 'hola');
  assert.match(texts(again), /(Te parece bien|Estás de acuerdo)/, 'vuelve a pedir consentimiento: no recuerda nada');
});

test('v4.2 · 7, 15 y 23: Raíces al validar; reversión por duplicado; nadie valida su propio reporte; disputa al Contralor', () => {
  const store = db();
  const citizen = store.list('users').find((u) => u.alias === 'vecina')!;
  const sector = store.list('sectors').find((s) => s.parish === 'Caraballeda')!;
  const before = computePoints(citizen.id).points;
  const { origin } = createCitizenReport({ photoIds: [photo()], sectorId: sector.id, size: 'small', source: 'pwa' }, { id: citizen.id, role: 'citizen', entityId: null });
  assert.match(origin.code, /^R-CB-\d{6}$/);
  assert.equal(computePoints(citizen.id).points, before, 'enviar no suma');
  validateOrigin(origin.id, coord());
  assert.equal(computePoints(citizen.id).points, before + 10);
  const main = createCitizenReport({ photoIds: [photo()], sectorId: sector.id, size: 'small', source: 'pwa' }, anon).origin;
  markDuplicate(origin.id, main.id, coord());
  const p = computePoints(citizen.id);
  assert.equal(p.points, before, 'revertido');
  assert.ok(p.ledger.some((e) => e.points < 0 && /duplicado/.test(e.reason || '')));
  // Un coordinador que reporta no valida lo suyo.
  const co = coord();
  const own = createCitizenReport({ photoIds: [photo()], sectorId: sector.id, size: 'small', source: 'pwa' }, { id: co.id, role: 'coordinator', entityId: co.entityId });
  assert.equal(own.origin.reporterRole, 'coordinator');
  assert.throws(() => validateOrigin(own.origin.id, co), (e: { code?: string }) => e.code === 'notOwnReport');
});

test('v4.2 · 27: tope diario de Raíces por reportes validados', () => {
  const store = db();
  const u = store.list('users').find((x) => x.alias === 'ciudadano')!;
  const sector = store.list('sectors').find((s) => s.parish === 'Catia La Mar')!;
  const before = computePoints(u.id);
  const today = before.ledger.filter((e) => e.action === 'reportValidated' && e.status !== 'capped' && new Date(e.at).toDateString() === new Date().toDateString()).length;
  for (let i = 0; i < 5; i++) {
    try {
      const { origin } = createCitizenReport({ photoIds: [photo()], sectorId: sector.id, size: 'small', source: 'pwa', clientKey: `cap${i}` }, { id: u.id, role: 'citizen', entityId: null });
      validateOrigin(origin.id, coord());
    } catch {
      /* límite diario de reportes */
    }
  }
  const after = computePoints(u.id);
  const applied = after.ledger.filter((e) => e.action === 'reportValidated' && e.status === 'applied' && new Date(e.at).toDateString() === new Date().toDateString()).length;
  assert.ok(applied <= 3, `máximo 3 al día (había ${today})`);
});

test('v4.2 · 3, 6 y 4 estados: asignar reporte a un lote; sin ensayo validado no llega al estado 3', () => {
  const store = db();
  const sector = store.list('sectors').find((s) => s.parish === 'Caraballeda')!;
  const lot = createInstitutionalOrigin({ sectorId: sector.id, size: 'large', structureType: 'house', cause: 'collapse' }, coord());
  assert.match(lot.code, /^LG-CB-\d{6}$/);
  const r = createCitizenReport({ photoIds: [photo()], sectorId: sector.id, size: 'small', source: 'pwa' }, anon).origin;
  assert.throws(() => linkReportToLot(r.id, lot.code, coord()), /Valida primero/);
  validateOrigin(r.id, coord());
  linkReportToLot(r.id, lot.code, coord());
  assert.equal(reportStatus(store.get('origins', r.id)!).key, 'assigned_to_lot');
  assert.equal(publicLotStage(lot), 0);
  // Lotes procesados sin ensayo aprobado no están en estado 3.
  for (const o of store.list('origins')) {
    const b = o.batchIds.map((id) => store.get('batches', id)).filter(Boolean);
    if (b.length && b.every((x) => !x!.qualityVerificationId)) assert.ok(publicLotStage(o) < 3);
  }
  const look = publicLookup(r.code);
  assert.deepEqual(look.lotCodes, [lot.code]);
  assert.ok(!('reporterName' in look));
});

test('v4.2 · 8, 9 y datos abiertos: CDT y CDF con coordenadas exactas, un marcador por sitio; sin datos personales', () => {
  const f = publicFacilities();
  const names = f.map((x) => x.name);
  assert.equal(new Set(names).size, names.length, 'un marcador por sitio');
  const cdf = f.find((x) => x.type === 'CDF')!;
  assert.deepEqual(cdf.location, { lat: 10.58962, lng: -67.0022 });
  assert.ok(!names.some((x) => /Caribe|Tanaguarena/.test(x)));
  const d = openData();
  assert.ok(d.dictionary.length > 5 && d.cutoff && d.license);
  const json = JSON.stringify(d);
  assert.doesNotMatch(json, /reporterName|phone|lat|lng/);
  const p = sectorProgressAll();
  assert.ok(p.sectors.every((s) => ['red', 'yellow', 'green', 'grey'].includes(s.light)));
});

test('v4.2 · 12 y 31: la foto se guarda sin metadatos; las fotos de ciudadanos no van a Gemini', async () => {
  // JPEG mínimo con un segmento APP1 (EXIF) que debe desaparecer.
  const exif = Buffer.concat([Buffer.from([0xff, 0xe1, 0x00, 0x0e]), Buffer.from('Exif\0\0GPS123', 'latin1')]);
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]), exif, Buffer.from([0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9])]);
  const clean = stripImageMetadata(jpg, 'jpg');
  assert.ok(!clean.includes(Buffer.from('Exif')));
  assert.ok(clean.includes(Buffer.from([0xff, 0xda])));
  const saved = savePhoto({ dataUrl: `data:image/jpeg;base64,${jpg.toString('base64')}`, kind: 'origin', uploadedBy: null, location: { lat: 10.6, lng: -66.8 } });
  assert.equal(saved.location, null, 'la ubicación de la foto del ciudadano no se guarda');
  setFeatures({ ai_photo_detection: true });
  const pid = photo();
  createCitizenReport({ photoIds: [pid], sectorId: db().list('sectors')[0].id, size: 'small', source: 'pwa' }, anon);
  let called = false;
  await assert.rejects(() => suggestFromPhoto({ id: 'x', role: 'center', entityId: null }, pid, async () => { called = true; return { text: '{}', model: 'x' }; }), (e: { code?: string }) => e.code === 'ai_citizen_photo');
  assert.equal(called, false);
});

test('v4.2 · Training: cursos con estados y cuestionario final que exige las lecciones', () => {
  const u = db().list('users').find((x) => x.alias === 'vecina')!;
  const courses = listCourses(u.id, 'citizen');
  assert.ok(courses.find((c) => c.id === 'que_pasa'));
  assert.ok(!courses.find((c) => c.id === 'operacion_trazable'), 'el curso operativo no es para ciudadanos');
  const c = courses.find((x) => x.id === 'reportar_bien')!;
  assert.equal(c.state, 'available');
  assert.throws(() => submitCourseQuiz(c.id, { id: u.id, role: 'citizen', entityId: null }, c.quiz.map(() => 0)), /lecciones/);
});

test('v4.2 · 14: un reporte oficial con diferencia mayor al 5 % abre una discrepancia; las anteriores no se pisan', async () => {
  const { importSnapshot, reconciliationView } = await import('../src/services/reconciliation');
  const store = db();
  const before = store.count('reportSnapshots');
  const center = store.get('centers', 'ce_norte')!;
  const r = importSnapshot(coord(), { title: 'Prueba conciliación', source: 'Plan de Despeje Digno y Seguro / Totalidad de Vestigios', reportedAt: new Date().toISOString(), note: '', rows: [{ label: 'Caraballeda · prueba', facilityId: center.id, operatorEntityId: null, m3Today: 10, m3Accumulated: 999999, tonnesToday: 11, tonnesAccumulated: 1099998.9 }] });
  assert.equal(store.count('reportSnapshots'), before + 1);
  assert.ok(r.discrepancies.length >= 1);
  assert.ok(r.discrepancies.every((d) => d.status === 'open'));
  const v = reconciliationView(r.snapshot.id);
  assert.match(v.rows[0].official.tonnesMethod, /factor/);
});
