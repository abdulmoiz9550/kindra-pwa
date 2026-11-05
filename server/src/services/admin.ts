import type { Entity, User, Sector, Center, VehicleType, Vehicle, Lesson, AuraTextEntry, Role, PreregistrationCode, TransitionRule, AppConfig } from '@kindra/shared';
import { INSTITUTIONAL_ROLES, CODE_ALPHABET, DEFAULT_SPACE_ID } from '@kindra/shared';
import { customAlphabet } from 'nanoid';
import { db, type CollectionName } from '../core/db';
import { newId, nowIso } from '../core/ids';
import { badRequest, conflict, notFound } from '../core/errors';
import { hashPassword } from './auth';
import { containsForbiddenExpression } from './notifications';
import { updateConfig } from './config';
import { withFixedGates } from '../core/transitions';
import { DEFAULT_TRANSITIONS } from '../config/transitions';
import { assertSpace } from './spaces';
import { newCardCode, newReferralCode } from './referrals';

const DEFAULT_POLICY = { officialFigures: { mode: 'public' }, discrepancies: { mode: 'public' }, photos: { mode: 'public' }, observations: { mode: 'public' } } as Entity['publicationPolicy'];

// ---------------------------------------------------------------- entidades

export function upsertEntity(input: Partial<Entity> & { name: string; type: Entity['type']; description: string }): Entity {
  const store = db();
  const existing = input.id ? store.get('entities', input.id) : undefined;
  const entity: Entity = {
    id: existing?.id || newId('en'),
    name: input.name.trim(),
    type: input.type,
    description: input.description.trim(),
    logoUrl: input.logoUrl ?? existing?.logoUrl ?? null,
    publicationPolicy: input.publicationPolicy || existing?.publicationPolicy || structuredClone(DEFAULT_POLICY),
    active: input.active ?? existing?.active ?? true,
    legalType: input.legalType !== undefined ? input.legalType : existing?.legalType ?? 'public_institution',
    taxId: input.taxId !== undefined ? input.taxId?.trim() || null : existing?.taxId ?? null,
    spaceId: assertSpace(input.spaceId !== undefined ? input.spaceId : existing?.spaceId),
  };
  if (!entity.name || !entity.description) throw badRequest('Nombre y descripción pública son obligatorios.');
  return store.put('entities', entity);
}

// ---------------------------------------------------------------- usuarios

export interface UserInput {
  id?: string;
  alias: string;
  name?: string;
  phone?: string;
  roles: Role[];
  entityId?: string | null;
  centerId?: string | null;
  sectorId?: string | null;
  password?: string;
  active?: boolean;
  verificationStatus?: User['verificationStatus'];
  spaceId?: string | null;
  /** Referencia del documento de designación (obligatoria para administrador de entidad). */
  appointmentDocumentRef?: string | null;
  appointmentPhotoId?: string | null;
}

/** Quién está creando o editando: el administrador principal (Kindra) o un administrador de entidad. */
export interface UserEditor {
  id: string;
  kind: 'kindra' | 'entity_admin';
  entityId?: string | null;
}

export function upsertUser(input: UserInput, editor?: UserEditor): User {
  const store = db();
  const existing = input.id ? store.get('users', input.id) : undefined;
  if (input.id && !existing) throw notFound('El usuario no existe.');
  // Administrador principal: solo uno (addendum, parte 3: "solo Jesús").
  if (input.roles.includes('admin')) {
    const other = store.find('users', (u) => u.active && u.roles.includes('admin') && u.id !== existing?.id);
    if (other) throw conflict(`Ya existe un administrador principal (${other.alias}). Solo puede haber uno.`, 'single_main_admin');
  }
  // Administrador de entidad: designado por escrito por la institución y activado por Kindra.
  const becomesEntityAdmin = input.roles.includes('entity_admin') && !existing?.roles.includes('entity_admin');
  if (becomesEntityAdmin && !input.appointmentDocumentRef?.trim()) throw badRequest('Indica la referencia del documento de designación por escrito de la institución.', 'appointment_required');
  const alias = input.alias.trim();
  if (alias.length < 3) throw badRequest('El alias debe tener al menos 3 caracteres.');
  const clash = store.find('users', (u) => u.alias.toLowerCase() === alias.toLowerCase() && u.id !== existing?.id);
  if (clash) throw conflict('Ese alias ya está en uso.');
  const institutional = input.roles.some((r) => INSTITUTIONAL_ROLES.includes(r));
  if (institutional && !input.entityId) throw badRequest('Un usuario institucional debe pertenecer a una entidad.');
  if (input.roles.includes('center') && !input.centerId) throw badRequest('Un usuario de centro debe tener un centro asignado.');
  if (input.roles.includes('evaluator') && !existing?.roles.includes('evaluator')) {
    // 4: el evaluador nunca se autoasigna; lo activa el administrador tras la designación de la entidad.
  }
  if (!existing && !input.password) throw badRequest('Indica una contraseña inicial.');
  const user: User = {
    id: existing?.id || newId('us'),
    alias,
    name: input.name?.trim() || existing?.name,
    phone: input.phone?.trim() || existing?.phone,
    roles: input.roles.length ? input.roles : ['citizen'],
    entityId: input.entityId ?? null,
    centerId: input.centerId ?? null,
    sectorId: input.sectorId ?? existing?.sectorId ?? null,
    passwordHash: input.password ? hashPassword(input.password) : existing?.passwordHash,
    verificationStatus: input.verificationStatus ?? existing?.verificationStatus ?? (institutional ? 'pending' : 'not_required'),
    selfiePhotoId: existing?.selfiePhotoId ?? null,
    preregCode: existing?.preregCode ?? null,
    active: input.active ?? existing?.active ?? true,
    createdAt: existing?.createdAt || nowIso(),
    isDemo: existing?.isDemo,
    spaceId: assertSpace(input.spaceId !== undefined ? input.spaceId : existing?.spaceId ?? (input.entityId ? store.get('entities', input.entityId)?.spaceId : null) ?? DEFAULT_SPACE_ID),
    cardCode: existing?.cardCode || newCardCode(),
    referralCode: existing?.referralCode || newReferralCode(),
    referredBy: existing?.referredBy ?? null,
    proposedRoles: (existing?.proposedRoles || []).filter((p) => !input.roles.includes(p.role)),
    twoFactor: existing?.twoFactor ?? null,
    appointment: becomesEntityAdmin
      ? { documentRef: input.appointmentDocumentRef!.trim(), documentPhotoId: input.appointmentPhotoId ?? null, appointedAt: nowIso(), activatedBy: editor?.id || 'kindra', activatedAt: nowIso() }
      : input.roles.includes('entity_admin')
        ? existing?.appointment ?? null
        : null,
  };
  return store.put('users', user);
}

/** Usuario sin datos sensibles (hash de contraseña). Los secretos de dos pasos viven en otra colección. */
export function stripUser(u: User): Omit<User, 'passwordHash'> {
  const { passwordHash: _p, ...rest } = u;
  return rest;
}

// ---------------------------------------------------------------- propuestas de rol (evaluadores)

/** Kindra activa un rol propuesto por la entidad (evaluadores: addendum, parte 3). */
export function activateProposedRole(userId: string, role: Role): User {
  const store = db();
  const u = store.get('users', userId);
  if (!u) throw notFound('El usuario no existe.');
  const proposal = (u.proposedRoles || []).find((p) => p.role === role);
  if (!proposal) throw notFound('No hay una propuesta pendiente de ese rol para este usuario.');
  return store.update('users', userId, {
    roles: [...new Set([...u.roles, role])],
    proposedRoles: (u.proposedRoles || []).filter((p) => p.role !== role),
    verificationStatus: u.verificationStatus === 'not_required' ? 'pending' : u.verificationStatus,
  });
}

export function rejectProposedRole(userId: string, role: Role): User {
  const store = db();
  const u = store.get('users', userId);
  if (!u) throw notFound('El usuario no existe.');
  if (!(u.proposedRoles || []).some((p) => p.role === role)) throw notFound('No hay una propuesta pendiente de ese rol.');
  return store.update('users', userId, { proposedRoles: (u.proposedRoles || []).filter((p) => p.role !== role) });
}

export function setVerification(userId: string, status: User['verificationStatus']): User {
  const u = db().get('users', userId);
  if (!u) throw notFound('El usuario no existe.');
  return db().update('users', userId, { verificationStatus: status });
}

export function listUsersPublic(): Omit<User, 'passwordHash'>[] {
  return db().list('users').map(stripUser);
}

// ---------------------------------------------------------------- sectores, centros, vehículos

export function upsertSector(input: Partial<Sector> & { name: string; polygon: [number, number][]; parish?: string }): Sector {
  const store = db();
  const existing = input.id ? store.get('sectors', input.id) : undefined;
  if (!input.name?.trim()) throw badRequest('El nombre del sector es obligatorio.');
  if (!Array.isArray(input.polygon) || input.polygon.length < 3) throw badRequest('El polígono necesita al menos tres puntos.');
  return store.put('sectors', { id: existing?.id || newId('sc'), name: input.name.trim(), parish: input.parish?.trim() || existing?.parish || '', polygon: input.polygon, authorized: input.authorized ?? existing?.authorized ?? true, provisional: input.provisional ?? existing?.provisional ?? false, spaceId: assertSpace(input.spaceId !== undefined ? input.spaceId : existing?.spaceId) });
}

export function upsertCenter(input: Partial<Center> & { name: string; type: Center['type']; sectorId: string; entityId: string }): Center {
  const store = db();
  const existing = input.id ? store.get('centers', input.id) : undefined;
  if (!store.get('sectors', input.sectorId)) throw badRequest('El sector no existe.');
  if (!store.get('entities', input.entityId)) throw badRequest('La entidad responsable no existe.');
  const shortCode = (input.shortCode || existing?.shortCode || input.name.replace(/[^A-Za-z]/g, '').slice(0, 5)).toUpperCase();
  return store.put('centers', { id: existing?.id || newId('ce'), name: input.name.trim(), shortCode, type: input.type, sectorId: input.sectorId, entityId: input.entityId, location: input.location ?? existing?.location ?? null });
}

export function upsertVehicleType(input: Partial<VehicleType> & { name: string; capacityM3?: number | null }): VehicleType {
  const store = db();
  const existing = input.id ? store.get('vehicleTypes', input.id) : undefined;
  // Addendum, parte 2: la capacidad del camión no es obligatoria. Si se indica, solo sirve para un volumen estimado.
  const cap = input.capacityM3 === undefined ? existing?.capacityM3 ?? null : input.capacityM3;
  if (cap !== null && !(cap > 0)) throw badRequest('Si indicas la capacidad nominal, debe ser mayor que cero.');
  return store.put('vehicleTypes', { id: existing?.id || newId('vt'), name: input.name.trim(), capacityM3: cap, provisional: input.provisional ?? existing?.provisional ?? false });
}

const qrSuffix = customAlphabet(CODE_ALPHABET, 6);

export function upsertVehicle(input: Partial<Vehicle> & { plate: string; typeId: string; entityId: string }): Vehicle {
  const store = db();
  const existing = input.id ? store.get('vehicles', input.id) : undefined;
  if (!store.get('vehicleTypes', input.typeId)) throw badRequest('El tipo de vehículo no existe.');
  if (!store.get('entities', input.entityId)) throw badRequest('La entidad o contratista no existe.');
  const plate = input.plate.trim().toUpperCase();
  const clash = store.find('vehicles', (v) => v.plate === plate && v.id !== existing?.id);
  if (clash) throw conflict('Ya existe un vehículo con esa placa.');
  return store.put('vehicles', { id: existing?.id || newId('vh'), plate, typeId: input.typeId, entityId: input.entityId, qrCode: existing?.qrCode || `KV-${qrSuffix()}`, active: input.active ?? existing?.active ?? true });
}

// ---------------------------------------------------------------- textos y lecciones

export function updateAuraText(key: string, variants: string[], label?: string): AuraTextEntry {
  const store = db();
  const existing = store.get('auraTexts', key);
  const clean = variants.map((v) => v.trim()).filter(Boolean);
  if (clean.length < 3) throw badRequest('Cada mensaje necesita al menos tres variantes (8.3).');
  for (const v of clean) {
    const bad = containsForbiddenExpression(v);
    if (bad) throw badRequest(`El texto contiene una expresión prohibida: "${bad}" (8.3).`);
    if (/blockchain/i.test(v)) throw badRequest('La palabra "blockchain" no puede usarse en ningún texto (3.2).');
  }
  return store.put('auraTexts', { ...(existing || { key, label: label || key }), key, label: label || existing?.label || key, variants: clean, id: key } as AuraTextEntry & { id: string });
}

export function upsertLesson(input: Partial<Lesson> & { id?: string; title: string; content: string; question: string; options: string[]; correctIndex: number }): Lesson {
  const store = db();
  const existing = input.id ? store.get('lessons', input.id) : undefined;
  if (input.options.length < 2) throw badRequest('La lección necesita al menos dos opciones de respuesta.');
  if (input.correctIndex < 0 || input.correctIndex >= input.options.length) throw badRequest('La respuesta correcta debe ser una de las opciones.');
  for (const t of [input.title, input.content, input.question]) {
    const bad = containsForbiddenExpression(t);
    if (bad) throw badRequest(`El texto contiene una expresión prohibida: "${bad}".`);
  }
  return store.put('lessons', {
    id: existing?.id || newId('lec'),
    order: input.order ?? existing?.order ?? store.count('lessons') + 1,
    title: input.title.trim(),
    content: input.content.trim(),
    imageUrl: input.imageUrl ?? existing?.imageUrl ?? null,
    question: input.question.trim(),
    options: input.options.map((o) => o.trim()),
    correctIndex: input.correctIndex,
    validationStatus: input.validationStatus ?? existing?.validationStatus ?? 'pending',
    provisional: input.provisional ?? existing?.provisional ?? true,
  });
}

// ---------------------------------------------------------------- pre-registro (18.4)

const preregGen = customAlphabet(CODE_ALPHABET, 6);
export function createPreregCode(alias: string): PreregistrationCode {
  if (!alias?.trim()) throw badRequest('Indica el alias de la persona.');
  const code: PreregistrationCode = { code: `PR-${preregGen()}`, alias: alias.trim(), used: false, userId: null, createdAt: nowIso() };
  db().put('preregistrationCodes', code as PreregistrationCode & { id?: string });
  return code;
}

// ---------------------------------------------------------------- transiciones y configuración

export function updateTransitions(rules: TransitionRule[]): AppConfig {
  for (const r of rules) {
    if (!['origin', 'trip', 'batch'].includes(r.object) || !r.action || !Array.isArray(r.from) || !r.to || !Array.isArray(r.roles)) throw badRequest('Regla de transición inválida.');
  }
  // Compuertas fijas (addendum, parte 3): se restauran siempre; no se pueden quitar de la tabla.
  return updateConfig({ transitions: withFixedGates(rules, DEFAULT_TRANSITIONS) });
}

export function deleteDocument(col: CollectionName, id: string): void {
  const allowed: CollectionName[] = ['vehicles', 'vehicleTypes', 'preregistrationCodes', 'lessons'];
  if (!allowed.includes(col)) throw badRequest('Esta colección no admite borrado; desactiva el registro en su lugar.');
  if (!db().get(col, id)) throw notFound();
  db().remove(col, id);
}
