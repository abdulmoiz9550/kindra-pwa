import type { Role, User, Vehicle, KEvent } from '@kindra/shared';
import { ENTITY_ASSIGNABLE_ROLES, KINDRA_ONLY_ROLES, EVENT_LABELS } from '@kindra/shared';
import { db } from '../core/db';
import { appendEvent, type Actor } from '../core/events';
import { nowIso } from '../core/ids';
import { badRequest, forbidden, notFound } from '../core/errors';
import { upsertUser, upsertVehicle, stripUser, type UserInput } from './admin';
import { notifyRole, pickText } from './notifications';

/**
 * Administrador de entidad (addendum, parte 3): designado por escrito por la institución o empresa
 * y activado por Kindra. Gestiona solo usuarios y operaciones de su propia entidad. No toca otras
 * entidades, funciones, reglas ni la identidad de la plataforma. Cada acción queda como evento.
 */

function entityOf(actor: Actor): string {
  if (!actor.entityId) throw forbidden('Tu usuario no está vinculado a una entidad.');
  if (!db().get('entities', actor.entityId)) throw forbidden('Tu entidad no existe.');
  return actor.entityId;
}

function logAction(actor: Actor, action: string, data: Record<string, unknown>): void {
  const entityId = entityOf(actor);
  appendEvent({ type: 'entity_admin_action', objectType: 'system', objectId: `entity:${entityId}`, actor, data: { action, ...data } });
}

export function entityUsers(actor: Actor): Omit<User, 'passwordHash'>[] {
  const entityId = entityOf(actor);
  return db()
    .filter('users', (u) => u.entityId === entityId)
    .map(stripUser)
    .sort((a, b) => a.alias.localeCompare(b.alias));
}

export interface EntityUserInput {
  id?: string;
  alias: string;
  name?: string;
  phone?: string;
  roles: Role[];
  centerId?: string | null;
  password?: string;
  active?: boolean;
}

/**
 * Alta o edición de un usuario de la propia entidad. Solo puede asignar roles operativos;
 * los roles que activa Kindra (administrador, administrador de entidad, evaluador) se conservan tal cual.
 */
export function upsertEntityUser(actor: Actor, input: EntityUserInput): Omit<User, 'passwordHash'> {
  const store = db();
  const entityId = entityOf(actor);
  const existing = input.id ? store.get('users', input.id) : undefined;
  if (input.id && !existing) throw notFound('El usuario no existe.');
  if (existing && existing.entityId !== entityId) throw forbidden('Solo puedes gestionar usuarios de tu propia entidad.');
  if (existing && existing.id === actor.id && input.active === false) throw badRequest('No puedes desactivar tu propio usuario.');
  const requested = input.roles.filter((r) => r !== 'citizen');
  const notAllowed = requested.filter((r) => !ENTITY_ASSIGNABLE_ROLES.includes(r));
  if (notAllowed.length) throw forbidden('Ese rol solo lo activa Kindra. Para evaluadores usa "Proponer evaluador".');
  if (!requested.length) throw badRequest('Asigna al menos un rol operativo.');
  if (requested.includes('center')) {
    const center = input.centerId ? store.get('centers', input.centerId) : undefined;
    if (!center || center.entityId !== entityId) throw badRequest('Elige un centro que pertenezca a tu entidad.');
  }
  // Se conservan los roles que solo Kindra puede activar.
  const kept = (existing?.roles || []).filter((r) => KINDRA_ONLY_ROLES.includes(r));
  const payload: UserInput = {
    id: existing?.id,
    alias: input.alias,
    name: input.name,
    phone: input.phone,
    roles: [...new Set([...kept, ...requested])],
    entityId,
    centerId: requested.includes('center') ? input.centerId ?? null : null,
    sectorId: existing?.sectorId ?? null,
    password: input.password,
    active: input.active,
    spaceId: existing?.spaceId ?? store.get('entities', entityId)?.spaceId ?? null,
  };
  const saved = upsertUser(payload, { id: actor.id!, kind: 'entity_admin', entityId });
  logAction(actor, existing ? 'user_updated' : 'user_created', { target: saved.id, alias: saved.alias, roles: payload.roles });
  return stripUser(saved);
}

/** La entidad propone un evaluador; Kindra lo activa (addendum, parte 3). */
export function proposeEvaluator(actor: Actor, userId: string, note?: string | null): Omit<User, 'passwordHash'> {
  const store = db();
  const entityId = entityOf(actor);
  const u = store.get('users', userId);
  if (!u) throw notFound('El usuario no existe.');
  if (u.entityId !== entityId) throw forbidden('Solo puedes proponer usuarios de tu propia entidad.');
  if (u.roles.includes('evaluator')) throw badRequest('Este usuario ya es evaluador.');
  if ((u.proposedRoles || []).some((p) => p.role === 'evaluator')) throw badRequest('Ya hay una propuesta pendiente para este usuario.');
  const next = store.update('users', u.id, { proposedRoles: [...(u.proposedRoles || []), { role: 'evaluator', proposedBy: actor.id!, entityId, proposedAt: nowIso(), note: note?.trim() || null }] });
  logAction(actor, 'evaluator_proposed', { target: u.id, alias: u.alias });
  const entityName = store.get('entities', entityId)?.name || '';
  notifyRole('admin', 'evaluator_proposed', pickText('notif_kindra_evaluator_proposed', { alias: u.alias, entidad: entityName }), { link: '/admin/usuarios' });
  return stripUser(next);
}

export function entityVehicles(actor: Actor) {
  const store = db();
  const entityId = entityOf(actor);
  return store.filter('vehicles', (v) => v.entityId === entityId).map((v) => ({ ...v, typeName: store.get('vehicleTypes', v.typeId)?.name ?? null }));
}

export function upsertEntityVehicle(actor: Actor, input: { id?: string; plate: string; typeId: string; active?: boolean }): Vehicle {
  const store = db();
  const entityId = entityOf(actor);
  const existing = input.id ? store.get('vehicles', input.id) : undefined;
  if (input.id && !existing) throw notFound('El vehículo no existe.');
  if (existing && existing.entityId !== entityId) throw forbidden('Solo puedes gestionar vehículos de tu propia entidad.');
  const v = upsertVehicle({ ...input, entityId });
  logAction(actor, existing ? 'vehicle_updated' : 'vehicle_created', { target: v.id, plate: v.plate });
  return v;
}

/** Operaciones de la propia entidad: lo que su gente registró en la bitácora. */
export function entityOperations(actor: Actor) {
  const store = db();
  const entityId = entityOf(actor);
  const entity = store.get('entities', entityId)!;
  const mine = store.allEvents().filter((e) => e.entityId === entityId);
  const since = Date.now() - 30 * 86_400_000;
  const recent = mine.filter((e) => new Date(e.serverTime).getTime() >= since);
  const byType: Record<string, number> = {};
  for (const e of recent) byType[e.type] = (byType[e.type] || 0) + 1;
  const users = store.filter('users', (u) => u.entityId === entityId);
  const centers = store.filter('centers', (c) => c.entityId === entityId);
  const vehicles = store.filter('vehicles', (v) => v.entityId === entityId);
  const label = (e: KEvent) => (EVENT_LABELS as Record<string, string>)[e.type] || e.type;
  return {
    entity: { id: entity.id, name: entity.name, type: entity.type, legalType: entity.legalType ?? null, taxId: entity.taxId ?? null },
    counts: {
      users: users.length,
      activeUsers: users.filter((u) => u.active).length,
      pendingVerification: users.filter((u) => u.verificationStatus === 'pending').length,
      pendingProposals: users.filter((u) => (u.proposedRoles || []).length).length,
      vehicles: vehicles.length,
      centers: centers.length,
      events30d: recent.length,
    },
    byType: Object.entries(byType)
      .map(([type, n]) => ({ type, label: (EVENT_LABELS as Record<string, string>)[type] || type, n }))
      .sort((a, b) => b.n - a.n),
    recent: mine
      .slice(-40)
      .reverse()
      .map((e) => ({ id: e.id, type: e.type, label: label(e), serverTime: e.serverTime, objectType: e.objectType, objectId: e.objectId, userAlias: e.actorId ? store.get('users', e.actorId)?.alias ?? null : null })),
    centers: centers.map((c) => ({ id: c.id, name: c.name })),
  };
}
