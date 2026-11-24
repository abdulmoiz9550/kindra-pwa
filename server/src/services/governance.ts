import { customAlphabet } from 'nanoid';
import type { InfoClassification, InfoRequest, InfoRequestStatus, RiskEntry, Role, SecurityIncident } from '@kindra/shared';
import { CODE_ALPHABET, EXPORT_ROLES } from '@kindra/shared';
import { db } from '../core/db';
import { appendEvent, type Actor } from '../core/events';
import { newId, nowIso } from '../core/ids';
import { badRequest, conflict, forbidden, notFound } from '../core/errors';

/**
 * Especificación v4.0, secciones 9 y 10: registro de inicios de sesión, exportaciones controladas
 * y solicitudes de información. La plataforma registra y enruta; la decisión de entregar la toma
 * siempre una persona autorizada (nunca el sistema).
 */

const SECURITY_TYPES = new Set(['security_event', 'data_exported', 'info_request_action', 'governance_action']);
/** Eventos de seguridad y gobierno de datos: solo los ve el administrador principal. */
export const isSecurityTrail = (e: { type: string }) => SECURITY_TYPES.has(e.type);

// ---------------------------------------------------------------- inicios de sesión

/** Registra un inicio de sesión correcto o fallido. Nunca guarda la contraseña ni el identificador escrito. */
export function logSignIn(ok: boolean, userId: string | null, method: 'password' | 'mfa' | 'demo_switch' | 'prereg', ip: string | null): void {
  const user = userId ? db().get('users', userId) : undefined;
  appendEvent({
    type: 'security_event',
    objectType: 'system',
    objectId: 'security',
    actor: { id: userId, role: user?.roles[0] ?? null, entityId: user?.entityId ?? null },
    data: { action: ok ? 'sign_in' : 'sign_in_failed', method, knownAccount: !!user, ip },
    silent: true,
  });
}

// ---------------------------------------------------------------- exportaciones

/** Solo los roles con permiso de exportación descargan datos en bloque. El administrador principal además exige sesión en dos pasos. */
export function assertCanExport(role: Role, mfa: boolean): void {
  if (!EXPORT_ROLES.includes(role)) throw forbidden('Tu rol no tiene permiso de exportación.');
  if (role === 'admin' && !mfa) throw forbidden('Confirma la verificación en dos pasos para exportar.');
}

/** Cada exportación queda como evento sellado: qué, cuántas filas y con qué filtros. */
export function logExport(actor: Actor, what: string, rows: number, filters: Record<string, unknown>): void {
  appendEvent({ type: 'data_exported', objectType: 'system', objectId: 'exports', actor, data: { what, rows, filters }, silent: true });
}

// ---------------------------------------------------------------- solicitudes de información

const shortCode = customAlphabet(CODE_ALPHABET, 5);

function logInfo(actor: Actor, req: InfoRequest, action: string, note: string | null, extra: Record<string, unknown> = {}): void {
  // El contacto de quien solicita nunca entra en la bitácora.
  appendEvent({ type: 'info_request_action', objectType: 'system', objectId: `info:${req.id}`, actor, data: { action, code: req.code, status: req.status, classification: req.classification, note, ...extra }, silent: true });
}

export function submitInfoRequest(actor: Actor, input: { subject: string; description: string; name?: string | null; contact?: string | null }): InfoRequest {
  const subject = input.subject.trim();
  const description = input.description.trim();
  if (subject.length < 4) throw badRequest('Escribe un asunto de al menos 4 caracteres.');
  if (description.length < 10) throw badRequest('Describe la información que buscas (al menos 10 caracteres).');
  const store = db();
  let code = `SI-${shortCode()}`;
  while (store.find('infoRequests', (r) => r.code === code)) code = `SI-${shortCode()}`;
  const now = nowIso();
  const req: InfoRequest = {
    id: newId('si'),
    code,
    subject,
    description,
    requesterName: input.name?.trim() || null,
    requesterContact: input.contact?.trim() || null,
    requesterUserId: actor.id,
    status: 'submitted',
    classification: null,
    reviewerId: null,
    releasedItems: [],
    redactions: null,
    decisionNote: null,
    approvedBy: null,
    createdAt: now,
    updatedAt: now,
    history: [{ at: now, by: actor.id, action: 'submitted', note: null }],
  };
  store.put('infoRequests', req);
  logInfo(actor, req, 'submitted', null);
  return req;
}

/** Estado público de una solicitud por su código: sin nombre ni contacto. */
export function publicInfoRequest(code: string) {
  const r = db().find('infoRequests', (x) => x.code === code.trim().toUpperCase());
  if (!r) throw notFound('No encontramos una solicitud con ese código.');
  return { code: r.code, subject: r.subject, status: r.status, createdAt: r.createdAt, updatedAt: r.updatedAt, decisionNote: ['released', 'partially_released', 'denied', 'closed'].includes(r.status) ? r.decisionNote : null };
}

export function listInfoRequests() {
  const store = db();
  return store
    .list('infoRequests')
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((r) => ({ ...r, reviewerAlias: r.reviewerId ? store.get('users', r.reviewerId)?.alias ?? null : null, approvedByAlias: r.approvedBy ? store.get('users', r.approvedBy)?.alias ?? null : null }));
}

export type InfoAction = 'classify' | 'assign' | 'start_review' | 'release' | 'partial_release' | 'deny' | 'close';

const FINAL: InfoRequestStatus[] = ['released', 'partially_released', 'denied', 'closed'];

export function actOnInfoRequest(actor: Actor, id: string, input: { action: InfoAction; classification?: InfoClassification | null; reviewerId?: string | null; note?: string | null; releasedItems?: string[]; redactions?: string | null }): InfoRequest {
  const store = db();
  const cur = store.get('infoRequests', id);
  if (!cur) throw notFound('Solicitud no encontrada.');
  if (cur.status === 'closed') throw conflict('La solicitud está cerrada.');
  const note = input.note?.trim() || null;
  const patch: Partial<InfoRequest> = {};
  const extra: Record<string, unknown> = {};
  switch (input.action) {
    case 'classify':
      if (!input.classification) throw badRequest('Elige una clasificación.');
      patch.classification = input.classification;
      break;
    case 'assign': {
      const reviewer = input.reviewerId ? store.get('users', input.reviewerId) : undefined;
      if (!reviewer || !reviewer.active || !reviewer.roles.some((r) => r === 'admin' || r === 'supervisor' || r === 'entity_admin')) throw badRequest('La persona revisora debe ser administrador, administrador de entidad o supervisor.');
      patch.reviewerId = reviewer.id;
      extra.reviewerAlias = reviewer.alias;
      break;
    }
    case 'start_review':
      if (FINAL.includes(cur.status)) throw conflict('La solicitud ya tiene una decisión.');
      patch.status = 'under_review';
      break;
    case 'release':
    case 'partial_release':
    case 'deny': {
      if (FINAL.includes(cur.status)) throw conflict('La solicitud ya tiene una decisión registrada.');
      if (!cur.classification) throw conflict('Clasifica la información antes de decidir.');
      if (!note) throw badRequest('Escribe el fundamento de la decisión.');
      if (input.action !== 'deny') {
        const items = (input.releasedItems || []).map((s) => s.trim()).filter(Boolean);
        if (!items.length) throw badRequest('Indica exactamente qué se entrega.');
        if ((cur.classification === 'confidential' || cur.classification === 'critical') && input.action === 'release') throw conflict('Información confidencial o crítica: solo se puede entregar en parte, con los datos tachados.');
        if (input.action === 'partial_release' && !input.redactions?.trim()) throw badRequest('Indica qué se tachó o se retuvo.');
        patch.releasedItems = items;
        patch.redactions = input.redactions?.trim() || null;
        extra.releasedItems = items;
        extra.redactions = patch.redactions;
      }
      patch.status = input.action === 'release' ? 'released' : input.action === 'partial_release' ? 'partially_released' : 'denied';
      patch.decisionNote = note;
      patch.approvedBy = actor.id;
      break;
    }
    case 'close':
      if (!FINAL.includes(cur.status)) throw conflict('Registra una decisión antes de cerrar.');
      patch.status = 'closed';
      break;
    default:
      throw badRequest('Acción no válida.');
  }
  const now = nowIso();
  const next = store.update('infoRequests', id, { ...patch, updatedAt: now, history: [...cur.history, { at: now, by: actor.id, action: input.action, note }] });
  logInfo(actor, next, input.action, note, extra);
  return next;
}

// ---------------------------------------------------------------- registro de seguridad

/** Inicios de sesión, exportaciones, solicitudes de información y reportes importados (para Auditoría y seguridad). */
export function securityLog(limit = 300) {
  const store = db();
  const events = store.allEvents().filter((e) => isSecurityTrail(e) || e.type === 'report_snapshot_imported');
  const failed24h = events.filter((e) => e.type === 'security_event' && e.data.action === 'sign_in_failed' && Date.now() - new Date(e.serverTime).getTime() < 86_400_000).length;
  return {
    failedSignIns24h: failed24h,
    events: events
      .slice(-limit)
      .reverse()
      .map((e) => ({ id: e.id, seq: e.seq, type: e.type, serverTime: e.serverTime, userAlias: e.actorId ? store.get('users', e.actorId)?.alias ?? null : null, actorRole: e.actorRole, data: e.data, hash: e.hash })),
  };
}

export function logAccountChange(editorId: string | null, userId: string, action: string, before: string | null, after: string | null): void {
  const editor = editorId ? db().get('users', editorId) : undefined;
  appendEvent({ type: 'security_event', objectType: 'system', objectId: 'security', actor: { id: editorId, role: editor?.roles[0] ?? 'system', entityId: editor?.entityId ?? null }, data: { action, target: userId, before, after }, silent: true });
}

const deniedRecently = new Map<string, number>();
/** Acceso denegado a una persona con sesión. Como mucho una entrada por persona y ruta cada minuto. */
export function logDenied(userId: string, role: Role, method: string, path: string): void {
  const key = `${userId} ${method} ${path}`;
  const now = Date.now();
  if (now - (deniedRecently.get(key) ?? 0) < 60_000) return;
  if (deniedRecently.size > 2000) deniedRecently.clear();
  deniedRecently.set(key, now);
  try {
    appendEvent({ type: 'security_event', objectType: 'system', objectId: 'security', actor: { id: userId, role, entityId: db().get('users', userId)?.entityId ?? null }, data: { action: 'access_denied', method, path }, silent: true });
  } catch (err) {
    console.error('[seguridad] no se pudo registrar el acceso denegado:', (err as Error).message);
  }
}

// ---------------------------------------------------------------- recuperación de acceso

export function requestRecovery(userId: string | null): void {
  const store = db();
  if (!userId || store.find('recoveryRequests', (r) => r.userId === userId && r.status === 'pending')) return;
  store.put('recoveryRequests', { id: newId('rr'), userId, createdAt: nowIso(), status: 'pending', resolvedAt: null });
  logAccountChange(null, userId, 'recovery_requested', null, null);
}

export function listRecovery() {
  const store = db();
  return store
    .list('recoveryRequests')
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((r) => ({ ...r, alias: store.get('users', r.userId)?.alias ?? null, name: store.get('users', r.userId)?.name ?? null }));
}

/** El administrador verificó la identidad y asignó una clave nueva desde Usuarios. */
export function resolveRecovery(actor: Actor, id: string): void {
  const r = db().get('recoveryRequests', id);
  if (!r) throw notFound('La solicitud no existe.');
  db().update('recoveryRequests', id, { status: 'done', resolvedAt: nowIso() });
  logAccountChange(actor.id, r.userId, 'recovery_resolved', null, null);
}

// ---------------------------------------------------------------- registro de riesgos e incidentes

function logGovernance(actor: Actor, action: string, target: string, before: unknown, after: unknown): void {
  appendEvent({ type: 'governance_action', objectType: 'system', objectId: 'governance', actor, data: { action, target, before: before ?? null, after }, silent: true });
}

export type RiskInput = Omit<RiskEntry, 'id' | 'score' | 'createdAt' | 'updatedAt'> & { id?: string };

export function upsertRisk(actor: Actor, input: RiskInput): RiskEntry {
  const store = db();
  const existing = input.id ? store.get('risks', input.id) : undefined;
  if (input.id && !existing) throw notFound('El riesgo no existe.');
  if (input.status === 'resolved' && (!input.controlTestedAt || !input.controlTestNote?.trim())) throw conflict('Un control no se da por resuelto hasta haberse probado: indica la fecha y el resultado de la prueba.', 'control_not_tested');
  const now = nowIso();
  const { id: _id, ...fields } = input;
  const risk: RiskEntry = { ...fields, id: existing?.id || newId('rk'), score: input.likelihood * input.impact, createdAt: existing?.createdAt || now, updatedAt: now };
  logGovernance(actor, existing ? 'risk_updated' : 'risk_created', risk.id, existing, risk);
  return store.put('risks', risk);
}

export function createIncident(actor: Actor, input: { title: string; description: string; severity: SecurityIncident['severity'] }): SecurityIncident {
  const now = nowIso();
  const inc: SecurityIncident = { id: newId('in'), ...input, status: 'open', createdAt: now, updatedAt: now, history: [{ at: now, by: actor.id, status: 'open', note: 'Registrado' }] };
  logGovernance(actor, 'incident_created', inc.id, null, { title: inc.title, severity: inc.severity });
  return db().put('incidents', inc);
}

export function updateIncident(actor: Actor, id: string, status: SecurityIncident['status'], note: string): SecurityIncident {
  const inc = db().get('incidents', id);
  if (!inc) throw notFound('El incidente no existe.');
  if (inc.status === 'closed') throw conflict('El incidente está cerrado.');
  const now = nowIso();
  logGovernance(actor, 'incident_status', id, inc.status, status);
  return db().update('incidents', id, { status, updatedAt: now, history: [...inc.history, { at: now, by: actor.id, status, note }] });
}
