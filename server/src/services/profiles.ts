import { customAlphabet } from 'nanoid';
import { z } from 'zod';
import type { Business, Group, GroupActivity, GroupKind, Membership, User, WasteReport } from '@kindra/shared';
import { CODE_ALPHABET } from '@kindra/shared';
import { db } from '../core/db';
import { appendEvent, type Actor } from '../core/events';
import { newId, nowIso } from '../core/ids';
import { badRequest, conflict, forbidden, notFound } from '../core/errors';
import { logAccountChange } from './governance';
import { notify, notifyRole } from './notifications';

/**
 * Perfiles de comunidad, grupo costero y comercio (v4.0, sección 25).
 * Forma de contar, igual para todos y visible en pantalla:
 *  - residuos: suma de reportes de recolección validados por la coordinación, por unidad;
 *  - jornadas: actividades realizadas y validadas por la coordinación;
 *  - horas: suma de las horas por asistente de esas jornadas validadas.
 * Lo declarado y lo validado se muestran siempre por separado.
 */

const shortCode = customAlphabet(CODE_ALPHABET, 5);
const isAdmin = (a: Actor) => a.role === 'admin';

function logGroup(actor: Actor, groupId: string, action: string, data: Record<string, unknown> = {}): void {
  appendEvent({ type: 'group_action', objectType: 'system', objectId: `group:${groupId}`, actor, data: { action, ...data }, silent: true });
}

const kindOf = (actor: Actor): GroupKind => {
  if (actor.role !== 'community' && actor.role !== 'coastal') throw forbidden('Este espacio es de comunidades y grupos costeros.');
  return actor.role;
};

/** Grupo activo de la persona para el perfil con el que entró. */
export function myMembership(actor: Actor): { group: Group; membership: Membership } {
  const kind = kindOf(actor);
  const store = db();
  for (const m of store.filter('memberships', (x) => x.userId === actor.id && x.status === 'active')) {
    const group = store.get('groups', m.groupId);
    if (group && group.kind === kind && group.active) return { group, membership: m };
  }
  throw notFound('Tu cuenta no pertenece todavía a un grupo activo.');
}

function leaderOf(actor: Actor): Group {
  const { group, membership } = myMembership(actor);
  if (membership.role !== 'leader') throw forbidden('Solo quien lidera el grupo puede hacerlo.');
  return group;
}

// ---------------------------------------------------------------- grupos (administración)

export function adminGroups() {
  const store = db();
  return store.list('groups').map((g) => ({
    ...g,
    members: store.filter('memberships', (m) => m.groupId === g.id && m.status === 'active').length,
    leaders: store.filter('memberships', (m) => m.groupId === g.id && m.status === 'active' && m.role === 'leader').map((m) => store.get('users', m.userId)?.alias).filter(Boolean),
    impact: groupImpact(g.id, null, null).totals,
  }));
}

function grantProfile(actor: Actor, user: User, kind: GroupKind): void {
  if (user.roles.includes(kind)) return;
  const roles = [...user.roles, kind];
  db().update('users', user.id, { roles });
  logAccountChange(actor.id, user.id, 'role_change', [...user.roles].sort().join(','), [...roles].sort().join(','));
}

export function upsertGroup(actor: Actor, input: { id?: string; kind: GroupKind; name: string; region: string; sectorId: string | null; description: string; contact: string | null; active: boolean; leaderAlias?: string | null }): Group {
  const store = db();
  const existing = input.id ? store.get('groups', input.id) : undefined;
  if (input.id && !existing) throw notFound('El grupo no existe.');
  if (existing && existing.kind !== input.kind) throw badRequest('El tipo de grupo no se puede cambiar.');
  if (input.sectorId && !store.get('sectors', input.sectorId)) throw badRequest('El sector no existe.');
  const leader = input.leaderAlias?.trim() ? store.find('users', (u) => u.active && u.alias.toLowerCase() === input.leaderAlias!.trim().toLowerCase()) : undefined;
  if (input.leaderAlias?.trim() && !leader) throw badRequest('No hay una cuenta activa con ese alias.');
  const g: Group = { id: existing?.id || newId('gr'), kind: input.kind, name: input.name.trim(), region: input.region.trim(), sectorId: input.sectorId, description: input.description.trim(), contact: input.contact?.trim() || null, active: input.active, isDemo: existing?.isDemo, createdAt: existing?.createdAt || nowIso() };
  store.put('groups', g);
  if (leader) {
    putMembership(g.id, leader.id, 'leader', 'active');
    grantProfile(actor, leader, g.kind);
  }
  logGroup(actor, g.id, existing ? 'group_updated' : 'group_created', { name: g.name });
  return g;
}

function putMembership(groupId: string, userId: string, role: Membership['role'], status: Membership['status']): Membership {
  const store = db();
  const existing = store.find('memberships', (m) => m.groupId === groupId && m.userId === userId);
  const now = nowIso();
  return store.put('memberships', { id: existing?.id || newId('mb'), groupId, userId, role, status, createdAt: existing?.createdAt || now, updatedAt: now });
}

// ---------------------------------------------------------------- miembros

export function listGroupsToJoin(actor: Actor) {
  const store = db();
  return store.filter('groups', (g) => g.active).map((g) => ({ id: g.id, kind: g.kind, name: g.name, region: g.region, status: store.find('memberships', (m) => m.groupId === g.id && m.userId === actor.id)?.status ?? null }));
}

/** Cualquier persona con cuenta pide entrar; quien lidera aprueba. Pedirlo no concede ningún permiso. */
export function requestMembership(actor: Actor, groupId: string): Membership {
  if (!actor.id) throw forbidden();
  const g = db().get('groups', groupId);
  if (!g?.active) throw notFound('El grupo no existe.');
  const cur = db().find('memberships', (m) => m.groupId === groupId && m.userId === actor.id);
  if (cur?.status === 'active') throw conflict('Ya perteneces a este grupo.');
  if (cur?.status === 'requested') throw conflict('Tu solicitud ya está pendiente.');
  const invited = cur?.status === 'invited';
  const m = putMembership(groupId, actor.id, cur?.role ?? 'member', invited ? 'active' : 'requested');
  if (invited) grantProfile(actor, db().get('users', actor.id)!, g.kind);
  logGroup(actor, groupId, invited ? 'invitation_accepted' : 'membership_requested');
  return m;
}

export function inviteMember(actor: Actor, alias: string): Membership {
  const g = leaderOf(actor);
  const u = db().find('users', (x) => x.active && x.alias.toLowerCase() === alias.trim().toLowerCase());
  // No se revela si la cuenta existe más allá de lo necesario para invitar por alias conocido.
  if (!u) throw badRequest('No se pudo invitar a ese alias. Revísalo con la persona.');
  const cur = db().find('memberships', (m) => m.groupId === g.id && m.userId === u.id);
  if (cur?.status === 'active') throw conflict('Esa persona ya pertenece al grupo.');
  const m = putMembership(g.id, u.id, 'member', 'invited');
  notify({ recipientKeys: [`user:${u.id}`], kind: 'group_invitation', text: `Te invitaron a un grupo: ${g.name}.`, link: '/grupos' });
  logGroup(actor, g.id, 'member_invited');
  return m;
}

export function decideMembership(actor: Actor, membershipId: string, decision: 'approve' | 'remove'): Membership {
  const g = leaderOf(actor);
  const m = db().get('memberships', membershipId);
  if (!m || m.groupId !== g.id) throw notFound('La solicitud no existe.');
  if (m.userId === actor.id) throw conflict('No puedes decidir sobre tu propia membresía.');
  if (decision === 'approve') {
    if (m.status !== 'requested') throw conflict('No hay una solicitud pendiente.');
    grantProfile(actor, db().get('users', m.userId)!, g.kind);
  } else if (m.role === 'leader') throw conflict('Solo la administración retira a quien lidera.');
  const next = db().update('memberships', m.id, { status: decision === 'approve' ? 'active' : 'left', updatedAt: nowIso() });
  if (decision === 'approve') notify({ recipientKeys: [`user:${m.userId}`], kind: 'group_joined', text: `Ya formas parte de ${g.name}.`, link: '/grupos' });
  logGroup(actor, g.id, decision === 'approve' ? 'member_approved' : 'member_removed');
  return next;
}

// ---------------------------------------------------------------- panel del grupo

export function groupImpact(groupId: string, from: string | null, to: string | null) {
  const store = db();
  const within = (d: string) => (!from || d >= from) && (!to || d <= to);
  const reports = store.filter('wasteReports', (r) => r.groupId === groupId && r.kind === 'collection' && within(r.date));
  const acts = store.filter('groupActivities', (a) => a.groupId === groupId && a.status === 'completed' && within(a.date));
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const qty = (rs: WasteReport[], unit: WasteReport['unit'], pick: (r: WasteReport) => number | null) => {
    const v = rs.filter((r) => r.unit === unit).map(pick).filter((x): x is number => x !== null);
    return v.length ? r2(v.reduce((a, b) => a + b, 0)) : null;
  };
  const hours = (as: GroupActivity[]) => {
    const v = as.flatMap((a) => a.participants.filter((p) => p.attended && p.hours !== null).map((p) => p.hours!));
    return v.length ? r2(v.reduce((a, b) => a + b, 0)) : null;
  };
  const validatedReports = reports.filter((r) => r.status === 'validated');
  const open = reports.filter((r) => r.status !== 'rejected');
  const validatedActs = acts.filter((a) => a.validatedAt);
  const months = new Map<string, { month: string; kg: number | null; t: number | null; m3: number | null; activities: number; hours: number | null }>();
  const at = (d: string) => {
    const k = d.slice(0, 7);
    if (!months.has(k)) months.set(k, { month: k, kg: null, t: null, m3: null, activities: 0, hours: null });
    return months.get(k)!;
  };
  for (const r of validatedReports) if (r.unit && r.validatedQuantity !== null) at(r.date)[r.unit] = r2((at(r.date)[r.unit] ?? 0) + r.validatedQuantity);
  for (const a of validatedActs) {
    at(a.date).activities++;
    const h = hours([a]);
    if (h !== null) at(a.date).hours = r2((at(a.date).hours ?? 0) + h);
  }
  return {
    from,
    to,
    totals: {
      validated: { kg: qty(validatedReports, 'kg', (r) => r.validatedQuantity), t: qty(validatedReports, 't', (r) => r.validatedQuantity), m3: qty(validatedReports, 'm3', (r) => r.validatedQuantity), activities: validatedActs.length, hours: hours(validatedActs) },
      reported: { kg: qty(open, 'kg', (r) => r.quantity), t: qty(open, 't', (r) => r.quantity), m3: qty(open, 'm3', (r) => r.quantity), activities: acts.length, hours: hours(acts) },
    },
    months: [...months.values()].sort((a, b) => (a.month < b.month ? -1 : 1)),
    method: 'Cuentan los reportes de recolección y las jornadas que validó la coordinación. Las horas son la suma de lo que registró quien lidera por cada asistente en esas jornadas.',
  };
}

const aliasOf = (id: string) => db().get('users', id)?.alias ?? null;
const activityView = (a: GroupActivity, full: boolean, me: string | null) => ({ ...a, count: a.participants.length, joined: a.participants.some((p) => p.userId === me), participants: full ? a.participants.map((p) => ({ ...p, alias: aliasOf(p.userId) })) : a.participants.filter((p) => p.userId === me).map((p) => ({ ...p, alias: aliasOf(p.userId) })) });

export function groupHome(actor: Actor) {
  const store = db();
  const { group, membership } = myMembership(actor);
  const leader = membership.role === 'leader';
  const members = store.filter('memberships', (m) => m.groupId === group.id && m.status !== 'left' && (leader || m.status === 'active')).map((m) => ({ id: m.id, alias: aliasOf(m.userId), role: m.role, status: m.status }));
  const activities = store.filter('groupActivities', (a) => a.groupId === group.id && (leader || a.status !== 'draft')).sort((a, b) => (a.date < b.date ? 1 : -1)).map((a) => activityView(a, leader, actor.id));
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
  return {
    group: { ...group, contact: leader ? group.contact : null, sectorName: group.sectorId ? store.get('sectors', group.sectorId)?.name ?? null : null },
    leader,
    members,
    activities,
    upcoming: [...activities].reverse().find((a) => a.status === 'published' && a.date >= today) ?? null,
    reports: store.filter('wasteReports', (r) => r.groupId === group.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map((r) => ({ ...r, reporterAlias: aliasOf(r.reportedBy), photoUrls: r.photoIds.map((id) => store.get('photos', id)?.url).filter(Boolean) })),
    impact: groupImpact(group.id, null, null),
  };
}

export function updateGroupProfile(actor: Actor, input: { region: string; description: string; contact: string | null }): Group {
  const g = leaderOf(actor);
  logGroup(actor, g.id, 'profile_updated');
  return db().update('groups', g.id, { region: input.region.trim(), description: input.description.trim(), contact: input.contact?.trim() || null });
}

// ---------------------------------------------------------------- actividades

export interface ActivityInput {
  title: string;
  date: string;
  time: string;
  place: string;
  meetingPoint: string;
  instructions: string | null;
  capacity: number | null;
}

export function createActivity(actor: Actor, input: ActivityInput, publish: boolean): GroupActivity {
  const g = leaderOf(actor);
  const now = nowIso();
  const a: GroupActivity = { id: newId('ga'), groupId: g.id, ...input, status: publish ? 'published' : 'draft', participants: [], createdBy: actor.id!, createdAt: now, updatedAt: now, completedAt: null, validatedBy: null, validatedAt: null };
  logGroup(actor, g.id, 'activity_created', { activityId: a.id, status: a.status });
  return db().put('groupActivities', a);
}

function ownActivity(g: Group, id: string): GroupActivity {
  const a = db().get('groupActivities', id);
  if (!a || a.groupId !== g.id) throw notFound('La actividad no existe.');
  return a;
}

export function setActivityStatus(actor: Actor, id: string, to: 'published' | 'cancelled'): GroupActivity {
  const g = leaderOf(actor);
  const a = ownActivity(g, id);
  if (a.status === 'completed' || a.status === 'cancelled' || (to === 'published' && a.status !== 'draft')) throw conflict('La actividad no admite ese cambio.');
  logGroup(actor, g.id, 'activity_status', { activityId: id, from: a.status, to });
  return db().update('groupActivities', id, { status: to, updatedAt: nowIso() });
}

export function joinActivity(actor: Actor, id: string, join: boolean): GroupActivity {
  const { group } = myMembership(actor);
  const a = ownActivity(group, id);
  if (a.status !== 'published') throw conflict('La actividad no está abierta.');
  const others = a.participants.filter((p) => p.userId !== actor.id);
  if (join && a.capacity !== null && others.length >= a.capacity) throw conflict('No quedan cupos.', 'full');
  return db().update('groupActivities', id, { participants: join ? [...others, { userId: actor.id!, attended: null, hours: null }] : others, updatedAt: nowIso() });
}

/** Cierre de la jornada: asistencia y horas. Queda declarada hasta que la coordinación la valide. */
export function completeActivity(actor: Actor, id: string, attendance: { userId: string; attended: boolean; hours: number | null }[]): GroupActivity {
  const g = leaderOf(actor);
  const a = ownActivity(g, id);
  if (a.status !== 'published') throw conflict('Solo se cierra una actividad publicada.');
  if (a.date > new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' })) throw conflict('La actividad todavía no ocurre.');
  const map = new Map(attendance.map((x) => [x.userId, x]));
  for (const x of attendance) if (!a.participants.some((p) => p.userId === x.userId)) throw badRequest('La lista incluye a alguien que no estaba inscrito.');
  logGroup(actor, g.id, 'activity_completed', { activityId: id, attended: attendance.filter((x) => x.attended).length });
  notifyRole('coordinator', 'group_review', 'Hay una jornada de grupo por validar.', { link: '/panel/grupos' });
  return db().update('groupActivities', id, { status: 'completed', completedAt: nowIso(), updatedAt: nowIso(), participants: a.participants.map((p) => ({ userId: p.userId, attended: map.get(p.userId)?.attended ?? false, hours: map.get(p.userId)?.attended ? map.get(p.userId)!.hours : null })) });
}

// ---------------------------------------------------------------- reportes de residuos

export interface WasteInput {
  kind: WasteReport['kind'];
  activityId: string | null;
  category: WasteReport['category'];
  quantity: number | null;
  unit: WasteReport['unit'];
  place: string;
  location: { lat: number; lng: number } | null;
  date: string;
  description: string;
  photoIds: string[];
}

export function submitWaste(actor: Actor, input: WasteInput): WasteReport {
  const { group } = myMembership(actor);
  const store = db();
  if (input.kind === 'collection') {
    if (input.quantity === null || !(input.quantity > 0) || !input.unit) throw badRequest('Indica la cantidad recolectada y su unidad.');
    if (!input.photoIds.length) throw badRequest('Agrega al menos una foto de la recolección.');
  } else if ((input.quantity === null) !== (input.unit === null)) throw badRequest('Indica cantidad y unidad juntas, o ninguna.');
  if (input.activityId) ownActivity(group, input.activityId);
  if (input.photoIds.some((id) => !store.get('photos', id))) throw badRequest('Una de las fotos no existe.');
  if (input.date > new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' })) throw badRequest('La fecha no puede ser futura.');
  const now = nowIso();
  const r: WasteReport = { id: newId('wr'), code: `RG-${shortCode()}`, groupId: group.id, ...input, place: input.place.trim(), description: input.description.trim(), status: 'submitted', reportedBy: actor.id!, createdAt: now, updatedAt: now, validatedQuantity: null, validatedBy: null, validatedAt: null, reviewNote: null };
  store.put('wasteReports', r);
  logGroup(actor, group.id, 'waste_submitted', { code: r.code, quantity: r.quantity, unit: r.unit });
  notifyRole('coordinator', 'group_review', 'Hay un reporte de grupo por revisar.', { link: '/panel/grupos' });
  return r;
}

// ---------------------------------------------------------------- validación por la coordinación

export function reviewQueue() {
  const store = db();
  const g = (id: string) => store.get('groups', id);
  return {
    reports: store.filter('wasteReports', (r) => r.status === 'submitted' || r.status === 'under_review').map((r) => ({ ...r, groupName: g(r.groupId)?.name ?? null, groupKind: g(r.groupId)?.kind ?? null, photoUrls: r.photoIds.map((id) => store.get('photos', id)?.url).filter(Boolean) })),
    activities: store.filter('groupActivities', (a) => a.status === 'completed' && !a.validatedAt).map((a) => ({ ...activityView(a, true, null), groupName: g(a.groupId)?.name ?? null })),
  };
}

export function reviewWaste(actor: Actor, id: string, input: { action: 'start' | 'validate' | 'reject'; quantity?: number | null; note?: string | null }): WasteReport {
  if (actor.role !== 'coordinator') throw forbidden('La revisión es de la coordinación.');
  const r = db().get('wasteReports', id);
  if (!r) throw notFound('El reporte no existe.');
  if (r.status === 'validated' || r.status === 'rejected') throw conflict('El reporte ya tiene una decisión.');
  if (r.reportedBy === actor.id) throw forbidden('Nadie valida lo que reportó.');
  const note = input.note?.trim() || null;
  const now = nowIso();
  let patch: Partial<WasteReport>;
  if (input.action === 'start') patch = { status: 'under_review' };
  else if (input.action === 'reject') {
    if (!note) throw badRequest('Indica el motivo.');
    patch = { status: 'rejected', reviewNote: note, validatedBy: actor.id, validatedAt: now };
  } else {
    const q = r.kind === 'collection' ? input.quantity ?? r.quantity : null;
    if (r.kind === 'collection' && (q === null || q < 0)) throw badRequest('Indica la cantidad validada.');
    if (q !== null && q !== r.quantity && !note) throw badRequest('Si la cantidad validada cambia, explica por qué.');
    patch = { status: 'validated', validatedQuantity: q, reviewNote: note, validatedBy: actor.id, validatedAt: now };
  }
  logGroup(actor, r.groupId, `waste_${input.action}`, { code: r.code, reported: r.quantity, validated: patch.validatedQuantity ?? null, note });
  return db().update('wasteReports', id, { ...patch, updatedAt: now });
}

export function validateActivity(actor: Actor, id: string): GroupActivity {
  if (actor.role !== 'coordinator') throw forbidden('La revisión es de la coordinación.');
  const a = db().get('groupActivities', id);
  if (!a || a.status !== 'completed') throw notFound('La actividad no está por validar.');
  if (a.validatedAt) throw conflict('La actividad ya está validada.');
  if (a.createdBy === actor.id) throw forbidden('Nadie valida lo que registró.');
  logGroup(actor, a.groupId, 'activity_validated', { activityId: id });
  return db().update('groupActivities', id, { validatedBy: actor.id, validatedAt: nowIso(), updatedAt: nowIso() });
}

// ---------------------------------------------------------------- comercios

export const businessBody = z.object({
  name: z.string().min(2).max(120),
  category: z.string().min(2).max(80),
  address: z.string().min(4).max(200),
  sectorId: z.string().nullable(),
  contact: z.string().max(120).nullable(),
  openingHours: z.string().min(2).max(200),
  collectionPoint: z.object({ acceptedMaterials: z.array(z.string().min(2).max(60)).max(20), storageInstructions: z.string().max(600), status: z.enum(['active', 'paused']), location: z.object({ lat: z.number(), lng: z.number() }).nullable() }),
});
export type BusinessInput = z.infer<typeof businessBody> & { id?: string; active?: boolean };

export function upsertBusiness(actor: Actor, input: BusinessInput): Business {
  const store = db();
  const existing = input.id ? store.get('businesses', input.id) : undefined;
  if (input.id && !existing) throw notFound('El comercio no existe.');
  const { id: _id, active, ...fields } = input;
  const now = nowIso();
  const b: Business = { ...fields, id: existing?.id || newId('bz'), active: isAdmin(actor) ? active ?? existing?.active ?? true : existing!.active, isDemo: existing?.isDemo, createdAt: existing?.createdAt || now, updatedAt: now };
  appendEvent({ type: 'business_action', objectType: 'system', objectId: `business:${b.id}`, actor, data: { action: existing ? 'updated' : 'created', before: existing ? { openingHours: existing.openingHours, status: existing.collectionPoint.status } : null, after: { openingHours: b.openingHours, status: b.collectionPoint.status } }, silent: true });
  return store.put('businesses', b);
}

/** Comercio de la cuenta. Cada comercio ve solo lo suyo. */
export function myBusiness(user: User): Business {
  const b = user.businessId ? db().get('businesses', user.businessId) : undefined;
  if (!b || !b.active) throw notFound('Tu cuenta no tiene un comercio activo asignado.');
  return b;
}
