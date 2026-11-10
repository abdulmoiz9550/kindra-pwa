import fs from 'node:fs';
import path from 'node:path';
import type { User, Entity, Sector, Center, VehicleType, Vehicle, Photo, Role, GeoPoint, MonitorRequest } from '@kindra/shared';
import { db, PROJECTION_COLLECTIONS } from '../core/db';
import { env } from '../config/env';
import { newId, nowIso, setClockOffset } from '../core/ids';
import { hashPassword } from '../services/auth';
import { ensureDefaults, updateConfig } from '../services/config';
import { registerPhoto } from '../services/photos';
import { appendEvent, SYSTEM_ACTOR, type Actor } from '../core/events';
import { createCitizenReport, createInstitutionalOrigin, validateOrigin, rejectOrigin, markDuplicate, markRemoved, respondRemovalClosure, resolveDispute, answerSatisfaction, setPriority, setOriginZone } from '../services/origins';
import { registerDeparture, confirmArrival } from '../services/trips';
import { classifyReception, closeBatch, recordOutputs, verifyQuality, createDispatch, enterDailySummary, recordJobs, getBatchOrThrow } from '../services/batches';
import { registerWork, receiveDispatch, recordUse } from '../services/works';
import { addObservation } from '../services/observations';
import { completeLesson } from '../services/lessons';
import { verifyOnSite, recordBeforeAfter } from '../services/monitor';
import { runEscalations } from '../services/escalation';
import { ensureCertificate, computePoints } from '../services/points';
import { DEFAULT_SPACE_ID } from '@kindra/shared';
import { ensureDefaultSpace } from '../services/spaces';
import { newCardCode, newReferralCode } from '../services/referrals';
import { seedTwoFactor } from '../services/twoFactor';

/**
 * Secreto conocido de la verificación en dos pasos del administrador principal de demostración.
 * Solo existe en los datos de prueba; en modo demostración la pantalla muestra además el código vigente.
 */
export const DEMO_ADMIN_TOTP_SECRET = 'KINDRADEMOJESUS2FA234567';

export const DEMO_PASSWORD = 'demo1234';
const DAY = 86_400_000;
const HOUR = 3_600_000;

export interface SeedSummary {
  origins: number;
  trips: number;
  batches: number;
  works: number;
  events: number;
  users: number;
}

/** 19.5 Reinicio: borra todo y vuelve a cargar la semilla. */
export async function resetDemo(): Promise<SeedSummary> {
  const store = db();
  await store.resetAll();
  ensureDefaults();
  return seedDemo();
}

// ---------------------------------------------------------------- utilidades

function clockAt(base: number, daysAgo: number, hours = 0): void {
  setClockOffset(-(daysAgo * DAY) + hours * HOUR - (Date.now() - base));
}

const SVG_COLORS = ['#8a7f72', '#6e6a62', '#9c8c7a', '#7a6f66', '#8f8a80', '#a39485'];
function seedPhoto(kind: Photo['kind'], label: string, idx: number, moderation: Photo['moderation'] = 'approved', unreadable = false, uploadedBy: string | null = null, location: GeoPoint | null = null): Photo {
  const id = `ph_seed_${kind}_${idx}_${newId('x').slice(-4)}`;
  const color = SVG_COLORS[idx % SVG_COLORS.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480"><rect width="640" height="480" fill="${unreadable ? '#111' : color}"/><g fill="${unreadable ? '#222' : '#d9d2c5'}"><polygon points="60,420 180,300 260,360 340,280 430,350 520,290 600,420"/><rect x="90" y="380" width="80" height="40" rx="4"/><rect x="300" y="390" width="120" height="30" rx="4"/></g><text x="320" y="60" font-family="sans-serif" font-size="26" fill="#f6f5f2" text-anchor="middle">Foto simulada · ${label}</text><text x="320" y="455" font-family="sans-serif" font-size="18" fill="#f6f5f2" text-anchor="middle">Datos simulados para demostración</text></svg>`;
  fs.mkdirSync(env.uploadDir, { recursive: true });
  fs.writeFileSync(path.join(env.uploadDir, `${id}.svg`), svg);
  return registerPhoto({ id, url: `/uploads/${id}.svg`, uploadedBy, kind, moderation, location, takenAt: nowIso(), uploadedAt: nowIso(), unreadable });
}

function jitter(p: GeoPoint, dLat: number, dLng: number): GeoPoint {
  return { lat: p.lat + dLat, lng: p.lng + dLng };
}

// ---------------------------------------------------------------- semilla

export async function seedDemo(): Promise<SeedSummary> {
  const store = db();
  const base = Date.now();
  ensureDefaults();
  updateConfig({ demoMode: env.demoMode, branding: { entityName: 'Ente Coordinador', logoUrl: null, tagline: 'Trazabilidad del retiro de escombros en La Guaira: lo que se reporta se sigue hasta convertirse en otra obra pública.', provisional: true } });

  ensureDefaultSpace();

  // ---- Entidades (19.1): personas jurídicas del convenio ----
  const ent = (id: string, name: string, type: Entity['type'], description: string, legalType: Entity['legalType'] = 'public_institution'): Entity =>
    store.put('entities', { id, name, type, description, logoUrl: null, active: true, legalType, taxId: null, spaceId: DEFAULT_SPACE_ID, publicationPolicy: { officialFigures: { mode: 'public' }, discrepancies: { mode: 'public' }, photos: { mode: 'public' }, observations: { mode: 'public' } } });
  const eCoord = ent('en_coord', 'Ente Coordinador', 'coordinating', 'Coordina el registro, la validación y la priorización del retiro de escombros.');
  const eEjec = ent('en_ejec', 'Ente Ejecutor', 'removal', 'Ejecuta el retiro de escombros con camiones y los lleva a los centros de disposición.', 'company');
  // Operadores de los centros: nombres genéricos (datos de referencia del piloto v0.1; no se usan nombres reales).
  const eNorte = ent('en_cnorte', 'Operador Contratista', 'center', 'Opera centros de disposición temporal: recibe, clasifica y tritura el escombro.', 'company');
  const eSur = ent('en_csur', 'Operador Público', 'center', 'Operador público que también registra material en centros de disposición.');
  const eFinal = ent('en_cfinal', 'Operador por confirmar', 'center', 'Operador de centro pendiente de confirmación.');
  const eTec = ent('en_tec', 'Centro Técnico', 'technical', 'Decide sobre material peligroso y verifica la calidad del agregado.');
  const eSup = ent('en_sup', 'Supervisor Ambiental', 'supervisor', 'Supervisa toda la cadena y registra observaciones y alertas.');
  const eObras = ent('en_obras', 'Ente de Obras', 'destination', 'Usa el agregado reciclado en obras públicas y registra su uso.');

  // ---- Sectores provisionales (19.2) alrededor del litoral de La Guaira ----
  const sec = (id: string, name: string, poly: [number, number][]): Sector => store.put('sectors', { id, name, parish: 'Parroquia piloto (provisional)', polygon: poly, authorized: true, provisional: true, spaceId: DEFAULT_SPACE_ID });
  // Datos de referencia del piloto v0.3: dos zonas provisionales hasta recibir los límites reales.
  const zEste = sec('sc_este', 'Zona Este, Caraballeda (provisional)', [[10.6300, -66.8750], [10.6300, -66.8200], [10.5950, -66.8200], [10.5950, -66.8750]]);
  const zOeste = sec('sc_oeste', 'Zona Oeste, Catia La Mar (provisional)', [[10.6250, -67.0350], [10.6250, -66.9900], [10.5750, -66.9900], [10.5750, -67.0350]]);
  const sA = zEste;
  const sB = zEste;
  const sC = zOeste;
  const sD = zOeste;
  const cA: GeoPoint = { lat: 10.61, lng: -66.86 };
  const cB: GeoPoint = { lat: 10.61, lng: -66.84 };
  const cC: GeoPoint = { lat: 10.60, lng: -67.015 };
  const cD: GeoPoint = { lat: 10.60, lng: -67.0 };

  // ---- Centros ----
  const cen = (id: string, name: string, shortCode: string, type: Center['type'], sectorId: string, entityId: string, location: GeoPoint | null): Center => store.put('centers', { id, name, shortCode, type, sectorId, entityId, location, operatorEntityIds: [] });
  // Centros operativos según el último reporte oficial (30 de octubre de 2026). Coordenadas pendientes = sin ubicación.
  const cNorte = cen('ce_norte', 'Caraballeda', 'CARAB', 'CDT', sA.id, eNorte.id, null);
  // Zona de Playa Escondida por confirmar: se deja en la zona oeste de forma provisional.
  const cSur = cen('ce_sur', 'Playa Escondida', 'PESC', 'CDT', sC.id, eNorte.id, null);
  // Santa Eduvigis: ubicación = Parque Tecnológico Ambiental; punto de descarga = terraza donde se confirman las llegadas.
  const cFinal = cen('ce_final', 'Santa Eduvigis (Parque Tecnológico Ambiental)', 'SEDUV', 'CDF', sD.id, eFinal.id, { lat: 10.58962, lng: -67.0022 });
  store.update('centers', cFinal.id, { unloadingPoint: { lat: 10.58703, lng: -67.00575 } });
  const cGrande = cen('ce_playa_grande', 'Playa Grande, Calle 6', 'PGC6', 'CDT', sC.id, eFinal.id, { lat: 10.61039, lng: -67.01919 });
  // Un sitio puede recibir viajes registrados por más de una entidad operadora.
  store.update('centers', cNorte.id, { operatorEntityIds: [eSur.id] });

  // ---- Vehículos (capacidades provisionales, sección 25) ----
  const vt = (id: string, name: string, cap: number): VehicleType => store.put('vehicleTypes', { id, name, capacityM3: cap, provisional: true });
  const vtSmall = vt('vt_small', 'Volteo pequeño', 6);
  const vtLarge = vt('vt_large', 'Volteo grande', 12);
  const vtSemi = vt('vt_semi', 'Gandola', 20);
  const veh = (id: string, plate: string, typeId: string, qr: string): Vehicle => store.put('vehicles', { id, plate, typeId, entityId: eEjec.id, qrCode: qr, active: true });
  const v1 = veh('vh_1', 'A12BC3D', vtSmall.id, 'KV-DEMO01');
  const v2 = veh('vh_2', 'A45DE6F', vtSmall.id, 'KV-DEMO02');
  const v3 = veh('vh_3', 'B78GH9J', vtLarge.id, 'KV-DEMO03');
  const v4 = veh('vh_4', 'B23KL4M', vtLarge.id, 'KV-DEMO04');
  const v5 = veh('vh_5', 'C56NP7Q', vtSemi.id, 'KV-DEMO05');

  // ---- Usuarios de prueba, uno por rol (19.3) ----
  const hash = hashPassword(DEMO_PASSWORD);
  const usr = (id: string, alias: string, name: string, roles: Role[], extra: Partial<User> = {}): User =>
    store.put('users', { id, alias, name, phone: extra.phone, roles, entityId: extra.entityId ?? null, centerId: extra.centerId ?? null, sectorId: extra.sectorId ?? null, passwordHash: hash, verificationStatus: roles.some((r) => r !== 'citizen') ? 'verified' : 'not_required', selfiePhotoId: null, active: true, createdAt: nowIso(), isDemo: true, spaceId: DEFAULT_SPACE_ID, cardCode: newCardCode(), referralCode: newReferralCode(), referredBy: null, proposedRoles: [], ...extra });
  const uCiud = usr('us_ciudadano', 'ciudadano', 'Carlos Demo', ['citizen'], { sectorId: sA.id, phone: '04140000001' });
  // María llegó invitada por Carlos: Carlos suma puntos solo cuando el primer reporte de María se valida.
  const uVecina = usr('us_vecina', 'vecina', 'María Demo', ['citizen'], { sectorId: sB.id, phone: '04140000002', verificationStatus: 'verified', referredBy: 'us_ciudadano' });
  const uContra = usr('us_contralor', 'contralora', 'Ana Demo', ['citizen', 'monitor'], { sectorId: sA.id, phone: '04140000003', verificationStatus: 'verified' });
  const uCoord = usr('us_coordinador', 'coordinador', 'Luis Coordinación', ['coordinator'], { entityId: eCoord.id });
  const uRetiro = usr('us_retiro', 'retiro', 'Pedro Retiro', ['removal'], { entityId: eEjec.id });
  const uCNorte = usr('us_centro_norte', 'centro', 'Rosa Caraballeda', ['center'], { entityId: eNorte.id, centerId: cNorte.id });
  const uCSur = usr('us_centro_sur', 'centro-sur', 'Jorge Playa Escondida', ['center'], { entityId: eNorte.id, centerId: cSur.id });
  const uEval = usr('us_evaluador', 'evaluador', 'Ing. Elena Técnica', ['evaluator'], { entityId: eTec.id });
  const uSup = usr('us_supervisor', 'supervisor', 'Sofía Supervisión', ['supervisor'], { entityId: eSup.id });
  const uObras = usr('us_obras', 'obras', 'Miguel Obras', ['destination'], { entityId: eObras.id });
  // Administrador principal de Kindra: uno solo, con verificación en dos pasos (addendum, parte 3).
  usr('us_admin', 'admin', 'Jesús (Kindra)', ['admin'], { entityId: eCoord.id });
  seedTwoFactor('us_admin', DEMO_ADMIN_TOTP_SECRET);
  // Administrador de entidad: designado por escrito por el Ente Ejecutor y activado por Kindra.
  usr('us_admin_ejecutor', 'admin-ejecutor', 'Laura Administración Ejecutor', ['entity_admin'], {
    entityId: eEjec.id,
    appointment: { documentRef: 'Oficio de designación EE-2026-014 (provisional)', documentPhotoId: null, appointedAt: nowIso(), activatedBy: 'us_admin', activatedAt: nowIso() },
  });
  store.put('preregistrationCodes', { code: 'PR-DEMO01', alias: 'vecino-sin-telefono', used: false, userId: null, createdAt: nowIso() } as never);

  const actor = (u: User, role: Role): Actor => ({ id: u.id, role, entityId: u.entityId ?? null });
  const aCoord = actor(uCoord, 'coordinator');
  const aRetiro = actor(uRetiro, 'removal');
  const aNorte = actor(uCNorte, 'center');
  const aSur = actor(uCSur, 'center');
  const aEval = actor(uEval, 'evaluator');
  const aSup = actor(uSup, 'supervisor');
  const aObras = actor(uObras, 'destination');
  const aCiud = actor(uCiud, 'citizen');
  const aVecina = actor(uVecina, 'citizen');
  const aContra = actor(uContra, 'citizen');
  const anon: Actor = { id: null, role: 'citizen', entityId: null };

  let photoIdx = 0;
  const ph = (kind: Photo['kind'], label: string, moderation: Photo['moderation'] = 'approved', unreadable = false, by: string | null = null, loc: GeoPoint | null = null) => seedPhoto(kind, label, photoIdx++, moderation, unreadable, by, loc).id;

  const report = (a: Actor, loc: GeoPoint, size: 'small' | 'medium' | 'large', urgency: 'blocks_access' | 'risk' | 'can_wait', opts: { street?: string; name?: string; anonymous?: boolean; unreadable?: boolean; moderation?: Photo['moderation'] } = {}) => {
    const photoId = ph('origin', 'escombro', opts.moderation ?? 'approved', !!opts.unreadable, a.id, loc);
    return createCitizenReport({ photoIds: [photoId], location: loc, street: opts.street ?? null, size, urgency, reporterName: opts.name ?? null, anonymous: opts.anonymous, source: 'pwa', deviceTime: nowIso() }, a).origin;
  };

  // ================================================================ DÍA -21 … -18: reportes y validaciones
  clockAt(base, 21);
  const o1 = report(aCiud, jitter(cA, 0.0008, 0.0010), 'large', 'blocks_access', { street: 'Calle 3, frente a la bodega' });
  const o2 = report(aContra, jitter(cA, -0.0012, 0.0004), 'medium', 'risk', { street: 'Esquina de la escuela' });
  const o3 = report(aVecina, jitter(cB, 0.0006, -0.0009), 'large', 'risk', { street: 'Subida del tanque' });
  const o4 = report(aContra, jitter(cC, 0.0010, 0.0012), 'medium', 'can_wait');
  const o5 = report(aCiud, jitter(cA, 0.0020, -0.0015), 'small', 'can_wait');
  const o6 = report(aContra, jitter(cC, -0.0011, -0.0008), 'large', 'blocks_access', { street: 'Callejón del río' });
  const oInst1 = createInstitutionalOrigin({ location: jitter(cA, -0.0020, -0.0020), size: 'large', structureType: 'multifamily', cause: 'collapse', buildingReference: 'Edificio de 4 pisos, bloque 2', priority: 'high', sectorId: sA.id, photoIds: [ph('origin', 'edificio colapsado')] }, aCoord);
  const oInst2 = createInstitutionalOrigin({ location: jitter(cC, 0.0018, -0.0018), size: 'large', structureType: 'commercial', cause: 'demolition', buildingReference: 'Local comercial demolido', priority: 'medium', sectorId: sC.id }, aCoord);

  clockAt(base, 20, 2);
  for (const o of [o1, o2, o3, o4, o5, o6]) validateOrigin(o.id, aCoord, o.urgency === 'blocks_access' ? 'high' : o.urgency === 'risk' ? 'medium' : 'low');

  // ================================================================ DÍA -19 … -16: viajes a Norte y Sur, lotes 001
  clockAt(base, 19, 1);
  const t1 = registerDeparture(aRetiro, { vehicleId: v3.id, originIds: [o1.id, o5.id], centerId: cNorte.id, photoId: ph('trip_departure', 'salida camión'), fillLevel: 'full' });
  const t2 = registerDeparture(aRetiro, { vehicleId: v1.id, originIds: [o2.id], centerId: cNorte.id, photoId: ph('trip_departure', 'salida camión'), fillLevel: 'half' });
  const t3 = registerDeparture(aRetiro, { vehicleId: v5.id, originIds: [oInst1.id], centerId: cNorte.id, photoId: ph('trip_departure', 'salida gandola'), fillLevel: 'full' });
  clockAt(base, 19, 3);
  const r1 = confirmArrival(t1.id, aNorte, { photoId: ph('trip_arrival', 'llegada centro') }).reception;
  const r2 = confirmArrival(t2.id, aNorte, { photoId: ph('trip_arrival', 'llegada centro') }).reception;
  const r3 = confirmArrival(t3.id, aNorte, { photoId: ph('trip_arrival', 'llegada centro') }).reception;
  classifyReception(r1.id, aNorte, { subcategory: 'concrete_brick' });
  classifyReception(r2.id, aNorte, { subcategory: 'mixed' });
  classifyReception(r3.id, aNorte, { subcategory: 'concrete_brick' });

  clockAt(base, 18, 2);
  const t4 = registerDeparture(aRetiro, { vehicleId: v4.id, originIds: [o4.id, o6.id], centerId: cSur.id, photoId: ph('trip_departure', 'salida camión'), fillLevel: 'full' });
  const t5 = registerDeparture(aRetiro, { vehicleId: v2.id, originIds: [oInst2.id], centerId: cSur.id, photoId: ph('trip_departure', 'salida camión'), fillLevel: 'full', deviceTime: new Date(Date.now() - 18 * DAY + 2 * HOUR - 3 * HOUR).toISOString() }); // hora de dispositivo inconsistente (3.4)
  clockAt(base, 18, 4);
  const r4 = confirmArrival(t4.id, aSur, { photoId: ph('trip_arrival', 'llegada centro') }).reception;
  const r5 = confirmArrival(t5.id, aSur, { photoId: ph('trip_arrival', 'llegada centro') }).reception;
  classifyReception(r4.id, aSur, { subcategory: 'concrete_brick' });
  classifyReception(r5.id, aSur, { subcategory: 'concrete_brick' });

  // retiro completo + primer cierre
  clockAt(base, 17, 1);
  for (const o of [o1, o2, o5, o4, o6, oInst1, oInst2]) markRemoved(o.id, aCoord, null);
  recordBeforeAfter(o1.code, aRetiro, { afterPhotoId: ph('after', 'después del retiro') });
  recordBeforeAfter(o4.code, aRetiro, { afterPhotoId: ph('after', 'después del retiro') });
  clockAt(base, 17, 3);
  respondRemovalClosure(o1.code, 'confirmed', { userId: uCiud.id });
  respondRemovalClosure(o2.code, 'confirmed', { userId: uContra.id });
  respondRemovalClosure(o5.code, 'confirmed', { userId: uCiud.id });
  respondRemovalClosure(o4.code, 'confirmed', { userId: uContra.id });
  respondRemovalClosure(o6.code, 'confirmed', { userId: uContra.id });

  // lotes 001: cierre, salidas, verificación, despacho, uso
  clockAt(base, 14, 1);
  const bNorte1 = getBatchOrThrow(r1.batchId);
  const bSur1 = getBatchOrThrow(r4.batchId);
  closeBatch(bNorte1.id, aNorte);
  closeBatch(bSur1.id, aSur);
  recordOutputs(bNorte1.id, aNorte, { unit: 't', aggregate: 38.5, metal: 2.1, specialDisposal: 0, rejects: 4.4 });
  recordOutputs(bSur1.id, aSur, { unit: 't', aggregate: 27.0, metal: 1.4, specialDisposal: 0, rejects: 3.6 });
  clockAt(base, 13, 2);
  verifyQuality(bNorte1.id, aEval, { checklist: { grading: true, no_contaminants: true, no_organic: true, other: false }, result: 'approved', justification: 'Granulometría dentro del rango y sin contaminantes visibles en las muestras tomadas.', documentId: ph('document', 'informe de calidad') });
  verifyQuality(bSur1.id, aEval, { checklist: { grading: true, no_contaminants: true, no_organic: true, other: false }, result: 'approved', justification: 'Muestras conformes; se recomienda uso en base de vía y aceras.' });
  clockAt(base, 12, 1);
  const w1 = registerWork(aObras, { name: 'Base de vía, tramo provisional 1', useType: 'road_base', locality: 'Localidad provisional 1', sectorId: sB.id });
  const w2 = registerWork(aObras, { name: 'Aceras del sector provisional C', useType: 'sidewalks', locality: 'Localidad provisional 2', sectorId: sC.id });
  const w3 = registerWork(aObras, { name: 'Bloques para vivienda provisional', useType: 'blocks', locality: 'Localidad provisional 3', sectorId: sA.id });
  const d1 = createDispatch(bNorte1.id, aNorte, { workId: w1.id, quantity: 38.5 }).dispatch;
  const d2 = createDispatch(bSur1.id, aSur, { workId: w2.id, quantity: 15 }).dispatch;
  const d3 = createDispatch(bSur1.id, aSur, { workId: w2.id, quantity: 12 }).dispatch;
  clockAt(base, 11, 2);
  receiveDispatch(d1.id, aObras, { quantityReceived: 38.5 });
  receiveDispatch(d2.id, aObras, { quantityReceived: 15 });
  receiveDispatch(d3.id, aObras, { quantityReceived: 11.2, note: 'Pesaje en obra dio menos; se registra la discrepancia.' });
  clockAt(base, 10, 1);
  recordUse(w1.id, aObras, { dateOfUse: nowIso() });
  recordUse(w2.id, aObras, { dateOfUse: nowIso() });
  clockAt(base, 9, 3);
  answerSatisfaction(o1.code, 'yes', { userId: uCiud.id });
  answerSatisfaction(o2.code, 'somewhat', { userId: uContra.id }, 'Tardó más de lo esperado, pero llegó.');
  answerSatisfaction(o5.code, 'yes', { userId: uCiud.id });
  answerSatisfaction(o4.code, 'no', { userId: uContra.id }, 'Nadie me avisó cuando pasó el camión.');
  answerSatisfaction(o6.code, 'yes', { userId: uContra.id });

  // ================================================================ DÍA -12 … -8: lote SUR-002 (en verificación)
  clockAt(base, 12, 3);
  const o7 = report(aContra, jitter(cC, 0.0025, 0.0005), 'large', 'risk', { street: 'Bajada de la capilla' });
  const o8 = report(aVecina, jitter(cC, -0.0022, 0.0015), 'medium', 'can_wait');
  const o9 = report(anon, jitter(cC, 0.0003, -0.0025), 'medium', 'blocks_access', { name: 'Anónimo', anonymous: true });
  clockAt(base, 11, 5);
  for (const o of [o7, o8, o9]) validateOrigin(o.id, aCoord, 'medium');
  clockAt(base, 10, 4);
  const t6 = registerDeparture(aRetiro, { vehicleId: v3.id, originIds: [o7.id, o8.id], centerId: cSur.id, photoId: ph('trip_departure', 'salida camión'), fillLevel: 'full' });
  const t7 = registerDeparture(aRetiro, { vehicleId: v1.id, originIds: [o9.id], centerId: cSur.id, photoId: ph('trip_departure', 'salida camión'), fillLevel: 'half' });
  clockAt(base, 10, 6);
  const r6 = confirmArrival(t6.id, aSur, { photoId: ph('trip_arrival', 'llegada centro') }).reception;
  const r7 = confirmArrival(t7.id, aSur, { photoId: ph('trip_arrival', 'llegada centro') }).reception;
  classifyReception(r6.id, aSur, { subcategory: 'concrete_brick' });
  classifyReception(r7.id, aSur, { subcategory: 'wood' });
  clockAt(base, 9, 1);
  for (const o of [o7, o8, o9]) markRemoved(o.id, aCoord, null);
  respondRemovalClosure(o7.code, 'confirmed', { userId: uContra.id });
  respondRemovalClosure(o9.code, 'confirmed', { byCode: true });
  clockAt(base, 8, 2);
  const bSur2 = getBatchOrThrow(r6.batchId);
  closeBatch(bSur2.id, aSur);
  recordOutputs(bSur2.id, aSur, { unit: 't', aggregate: 19.8, metal: 0.9, specialDisposal: 0, rejects: 2.3 });

  // ================================================================ DÍA -7 … -5: lote SUR-003 retenido; origen validado sin camión; disputa
  clockAt(base, 7, 2);
  const o10 = report(aCiud, jitter(cC, -0.0030, -0.0005), 'large', 'risk', { street: 'Detrás del mercado' });
  const o11 = report(aVecina, jitter(cB, 0.0022, 0.0018), 'large', 'blocks_access', { street: 'Calle principal, casa azul' });
  const o12 = report(aContra, jitter(cB, -0.0018, -0.0012), 'medium', 'risk');
  clockAt(base, 7, 4);
  validateOrigin(o10.id, aCoord, 'medium');
  validateOrigin(o11.id, aCoord, 'high'); // validado sin camión: escalamiento 7.13
  validateOrigin(o12.id, aCoord, 'medium');
  clockAt(base, 6, 1);
  const t8 = registerDeparture(aRetiro, { vehicleId: v4.id, originIds: [o10.id], centerId: cSur.id, photoId: ph('trip_departure', 'salida camión'), fillLevel: 'full' });
  clockAt(base, 6, 3);
  const r8 = confirmArrival(t8.id, aSur, { photoId: ph('trip_arrival', 'llegada centro') }).reception;
  classifyReception(r8.id, aSur, { subcategory: 'possible_hazardous', note: 'Láminas con aspecto de fibrocemento entre el escombro.' }); // lote retenido
  // disputa: o12 marcado retirado, el ciudadano dice que sigue ahí
  clockAt(base, 5, 2);
  const t9 = registerDeparture(aRetiro, { vehicleId: v2.id, originIds: [o12.id], centerId: cNorte.id, photoId: ph('trip_departure', 'salida camión'), fillLevel: 'half' });
  clockAt(base, 5, 4);
  const r9 = confirmArrival(t9.id, aNorte, { photoId: ph('trip_arrival', 'llegada centro') }).reception;
  classifyReception(r9.id, aNorte, { subcategory: 'concrete_brick' });
  clockAt(base, 4, 6);
  markRemoved(o12.id, aCoord, null);
  respondRemovalClosure(o12.code, 'disputed', { userId: uContra.id }, 'Quedó la mitad del escombro en la acera.');

  // ================================================================ DÍA -4 … -2: más reportes, duplicado, rechazo, zona pendiente, verificación en sitio
  clockAt(base, 4, 1);
  const o13 = report(aCiud, jitter(cA, 0.0030, 0.0025), 'medium', 'risk', { street: 'Al lado de la cancha' });
  const o14 = report(aVecina, jitter(cA, 0.0030, 0.00252), 'medium', 'risk', { street: 'Frente a la cancha' }); // duplicado de o13
  const o15 = report(anon, jitter(cB, -0.0030, 0.0030), 'small', 'can_wait', { anonymous: true });
  const o16 = report(aVecina, jitter(cD, 0.0010, 0.0010), 'large', 'blocks_access', { street: 'Zona del derrumbe' }); // pendiente de autorización
  const o17 = report(aCiud, jitter(cD, -0.0010, -0.0010), 'large', 'risk'); // pendiente de autorización
  // Con dos zonas autorizadas, la autorización pendiente se marca por punto (6.1).
  setOriginZone(o16.id, aCoord, false);
  setOriginZone(o17.id, aCoord, false);
  clockAt(base, 3, 2);
  validateOrigin(o13.id, aCoord, 'high');
  validateOrigin(o16.id, aCoord, 'high'); // validado pero en zona pendiente: bloquea el viaje (7.2)
  markDuplicate(o14.id, o13.id, aCoord);
  rejectOrigin(o15.id, aCoord, 'not_earthquake_debris', 'Es basura doméstica, no escombro.');
  verifyOnSite(o13.code, uContra, aContra, ph('on_site', 'verificación en sitio', 'approved', false, uContra.id));
  clockAt(base, 3, 5);
  const oInst3 = createInstitutionalOrigin({ location: jitter(cB, 0.0005, 0.0005), size: 'large', structureType: 'institutional', cause: 'collapse', buildingReference: 'Antigua sede administrativa', priority: 'high', sectorId: sB.id, photoIds: [ph('origin', 'sede colapsada')] }, aCoord);
  const oInst4 = createInstitutionalOrigin({ location: jitter(cA, -0.0028, 0.0028), size: 'medium', structureType: 'roadway', cause: 'collapse', buildingReference: 'Muro de contención', priority: 'low', sectorId: sA.id }, aCoord);

  // ================================================================ DÍA -2 … hoy: lote NORTE-002 abierto, viajes en tránsito, reportes nuevos
  clockAt(base, 2, 1);
  const t10 = registerDeparture(aRetiro, { vehicleId: v3.id, originIds: [o13.id], centerId: cNorte.id, photoId: ph('trip_departure', 'salida camión'), fillLevel: 'full' });
  const t11 = registerDeparture(aRetiro, { vehicleId: v5.id, originIds: [oInst3.id], centerId: cNorte.id, photoId: ph('trip_departure', 'salida gandola'), fillLevel: 'full' });
  clockAt(base, 2, 3);
  const r10 = confirmArrival(t10.id, aNorte, { photoId: ph('trip_arrival', 'llegada centro') }).reception;
  confirmArrival(t11.id, aNorte, { photoId: ph('trip_arrival', 'llegada centro') }); // queda sin clasificar: en la demo se marca como posible material peligroso
  classifyReception(r10.id, aNorte, { subcategory: 'concrete_brick' });
  clockAt(base, 1, 4);
  const o18 = report(aCiud, jitter(cB, 0.0012, -0.0022), 'medium', 'can_wait', { street: 'Calle del liceo' });
  const o19 = report(aContra, jitter(cA, -0.0005, 0.0030), 'small', 'risk');
  const o20 = report(aVecina, jitter(cB, 0.0028, -0.0005), 'large', 'blocks_access', { street: 'Entrada del callejón 2' });
  const o21 = report(anon, jitter(cC, 0.0028, 0.0028), 'medium', 'risk', { anonymous: true, unreadable: true }); // foto ilegible: pide repetir
  const o22 = report(aVecina, jitter(cA, 0.0015, -0.0030), 'medium', 'can_wait', { moderation: 'pending' });
  clockAt(base, 1, 6);
  validateOrigin(o18.id, aCoord, 'low');
  validateOrigin(o20.id, aCoord, 'high');
  setPriority(oInst4.id, aCoord, 'medium');
  // viajes en tránsito: uno reciente y uno con más de 6 horas (sin llegada → discrepancia)
  clockAt(base, 0, -9);
  const t12 = registerDeparture(aRetiro, { vehicleId: v2.id, originIds: [o18.id], centerId: cSur.id, photoId: ph('trip_departure', 'salida camión'), fillLevel: 'half' });
  clockAt(base, 0, -1);
  registerDeparture(aRetiro, { vehicleId: v4.id, originIds: [o20.id, oInst4.id], centerId: cNorte.id, photoId: ph('trip_departure', 'salida camión'), fillLevel: 'full' });
  clockAt(base, 0, -2);
  const o23 = report(aCiud, jitter(cB, -0.0008, 0.0026), 'small', 'can_wait', { street: 'Al final de la escalera' });
  const o24 = report(anon, jitter(cA, 0.0026, 0.0008), 'medium', 'risk', { anonymous: true });
  void o23;
  void o24;
  void t12;

  // ---- resúmenes diarios, empleos, observaciones ----
  for (const d of [19, 18, 10, 6, 5, 2]) {
    clockAt(base, d, 18);
    const day = nowIso().slice(0, 10);
    const tripsN = store.filter('trips', (t) => t.centerId === cNorte.id && t.state === 'received' && !!t.arrival && t.arrival.serverTime.slice(0, 10) === day).length;
    const tripsS = store.filter('trips', (t) => t.centerId === cSur.id && t.state === 'received' && !!t.arrival && t.arrival.serverTime.slice(0, 10) === day).length;
    if (tripsN) enterDailySummary(aNorte, { centerId: cNorte.id, date: day, tripsReceived: tripsN, officialTonnes: Math.round(tripsN * 9.5 * 10) / 10 });
    if (tripsS) enterDailySummary(aSur, { centerId: cSur.id, date: day, tripsReceived: tripsS, officialTonnes: Math.round(tripsS * 8.8 * 10) / 10 });
  }
  // ---- historial de partida: cifras oficiales al 30 de octubre de 2026 (datos simulados basados en cifras oficiales) ----
  // Toneladas oficiales = m³ × 1,1 (no se pesan). Se guarda el acumulado previo y el día del reporte.
  const REF: { center: Center; m3Today: number; m3Cum: number; tToday: number; tCum: number }[] = [
    { center: cFinal, m3Today: 575.05, m3Cum: 109856.64, tToday: 632.56, tCum: 120842.3 },
    { center: cNorte, m3Today: 4473.49, m3Cum: 175010.52, tToday: 4920.84, tCum: 192511.57 },
    { center: cSur, m3Today: 3045.58, m3Cum: 146491.36, tToday: 3350.14, tCum: 161140.5 },
    { center: cGrande, m3Today: 1203.0, m3Cum: 27421.09, tToday: 1323.3, tCum: 30163.2 },
  ];
  const round2 = (n: number) => Math.round(n * 100) / 100;
  for (const ref of REF) {
    const refActor: Actor = { id: null, role: 'system', entityId: ref.center.entityId };
    const put = (id: string, date: string, m3: number, t: number, note: string) =>
      appendEvent({
        type: 'daily_summary_entered',
        objectType: 'center',
        objectId: ref.center.id,
        actor: refActor,
        serverTimeOverride: `${date === 'baseline' ? '2026-10-29' : date}T20:00:00.000Z`,
        data: { summary: { id, entityId: ref.center.entityId, centerId: ref.center.id, date: date === 'baseline' ? '2026-10-29' : date, tripsReceived: 0, officialTonnes: t, officialM3: m3, baseline: true, note, createdAt: `${date === 'baseline' ? '2026-10-29' : date}T20:00:00.000Z` } },
      });
    put(`ds_${ref.center.id}_baseline`, 'baseline', round2(ref.m3Cum - ref.m3Today), round2(ref.tCum - ref.tToday), 'Acumulado hasta el 29 de octubre de 2026 (simulado a partir de cifras oficiales)');
    put(`ds_${ref.center.id}_2026-10-30`, '2026-10-30', ref.m3Today, ref.tToday, 'Reporte oficial del 30 de octubre de 2026 (simulado a partir de cifras oficiales)');
  }

  clockAt(base, 15, 10);
  recordJobs(aNorte, { centerId: cNorte.id, positions: 14, type: 'direct', date: nowIso().slice(0, 10) });
  recordJobs(aNorte, { centerId: cNorte.id, positions: 6, type: 'indirect', date: nowIso().slice(0, 10) });
  recordJobs(aSur, { centerId: cSur.id, positions: 11, type: 'direct', date: nowIso().slice(0, 10) });
  clockAt(base, 6, 7);
  addObservation(aSup, { objectType: 'batch', objectId: getBatchOrThrow(r8.batchId).id, text: 'Se observaron láminas apiladas sin cubrir en el patio de Playa Escondida; se recomienda cubrirlas hasta la decisión del evaluador.', isAlert: true });
  clockAt(base, 3, 7);
  addObservation(aSup, { objectType: 'origin', objectId: o13.id, text: 'Visita de campo: el punto coincide con la foto del reporte.', isAlert: false });
  addObservation(aSup, { objectType: 'work', objectId: w1.id, text: 'El material en obra presenta buena compactación.', isAlert: false });

  // ---- lecciones y solicitud de contralor ----
  clockAt(base, 8, 9);
  completeLesson('lec_1', aCiud, 1);
  completeLesson('lec_2', aCiud, 1);
  for (const [id, ans] of [['lec_1', 1], ['lec_2', 1], ['lec_3', 0], ['lec_4', 1], ['lec_5', 1]] as [string, number][]) completeLesson(id, aContra, ans);
  completeLesson('lec_4', aVecina, 1);
  const mr: MonitorRequest = { id: newId('mr'), userId: uVecina.id, status: 'pending', createdAt: nowIso() };
  appendEvent({ type: 'monitor_requested', objectType: 'user', objectId: uVecina.id, actor: aVecina, data: { request: mr } });
  void w3;
  void r9;
  void o16;
  void o17;
  void o19;
  void o21;
  void o22;

  // ---- reloj real, escalamientos y certificados ----
  setClockOffset(0);
  runEscalations();
  for (const u of [uCiud, uContra, uVecina]) ensureCertificate(u, computePoints(u.id));
  appendEvent({ type: 'escalation_alert', objectType: 'system', objectId: 'seed', actor: SYSTEM_ACTOR, data: { alert: { id: 'al_seed_info', kind: 'observation', objectType: 'origin', objectId: o11.id, text: 'Datos simulados cargados para demostración.', createdAt: nowIso(), resolvedAt: nowIso(), sectorId: null } }, silent: true });
  await store.flush();

  return {
    origins: store.count('origins'),
    trips: store.count('trips'),
    batches: store.count('batches'),
    works: store.count('works'),
    events: store.allEvents().length,
    users: store.count('users'),
  };
}

export { PROJECTION_COLLECTIONS };
