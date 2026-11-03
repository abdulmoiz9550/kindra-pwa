import type { Origin, Trip, Batch, TransitionRule } from '@kindra/shared';
import { db } from './db';
import { getConfig } from '../services/config';
import { conflict, forbidden } from './errors';
import type { Actor } from './events';

export interface TransitionContext {
  actor: Actor;
  origin?: Origin;
  trip?: Trip;
  batch?: Batch;
  /** Para dispute_resolved: resultado elegido por el coordinador. */
  evidence?: boolean;
  /** Para reglas con destino "a|b": el servicio indica cuál aplica. */
  resolvedTo?: string;
}

const CONDITION_MESSAGES: Record<string, string> = {
  zoneAuthorized: 'La zona de este origen todavía no ha sido autorizada por los equipos de rescate. No se puede registrar un viaje (regla 7.2).',
  notOwnReport: 'Nadie puede validar, retirar o recibir algo que reportó él mismo (regla 4.1).',
  isReporter: 'Solo quien hizo el reporte puede responder a este cierre.',
  notAnonymous: 'Los reportes anónimos no pueden abrir una disputa.',
  allHazardDecided: 'El lote tiene recepciones con posible material peligroso sin decisión del evaluador (regla 7.3).',
  qualityApproved: 'El lote no tiene una verificación de calidad aprobada; no se puede despachar a una obra (regla 7.4).',
  sameCenter: 'Solo el personal asignado a este centro puede operar sobre él.',
  hasEvidence: 'Para confirmar el retiro de un origen disputado hace falta evidencia (foto).',
  notHeld: 'El lote está retenido: no se puede procesar hasta que el evaluador decida (regla 7.3).',
};

function evalCondition(name: string, ctx: TransitionContext): boolean {
  const { actor, origin, trip, batch } = ctx;
  switch (name) {
    case 'zoneAuthorized':
      return !!origin?.zoneAuthorized;
    case 'notOwnReport': {
      if (!actor.id) return true;
      if (origin) return origin.reporterId !== actor.id;
      if (trip) {
        const store = db();
        return !trip.originIds.some((id) => store.get('origins', id)?.reporterId === actor.id);
      }
      return true;
    }
    case 'isReporter':
      return !!origin && !!actor.id && origin.reporterId === actor.id;
    case 'notAnonymous':
      return !!origin && !origin.anonymous && !!origin.reporterId;
    case 'allHazardDecided': {
      if (!batch) return true;
      const store = db();
      return batch.receptionIds.every((rid) => {
        const r = store.get('receptions', rid);
        return !r || r.subcategory !== 'possible_hazardous' || !!r.hazardDecision;
      });
    }
    case 'qualityApproved':
      return batch?.qualityResult === 'approved';
    case 'sameCenter': {
      if (actor.role === 'system') return true;
      if (!actor.id) return false;
      const user = db().get('users', actor.id);
      const centerId = trip?.centerId || batch?.centerId;
      return !!user && !!centerId && user.centerId === centerId;
    }
    case 'hasEvidence':
      return ctx.evidence !== false;
    case 'notHeld':
      return batch?.state !== 'held';
    default:
      return true;
  }
}

/**
 * Valida una transición contra la tabla configurable (3.3) y devuelve el estado destino.
 * Lanza 403 si el rol no puede, 409 si el estado de partida o una condición no lo permite.
 */
export function assertTransition(object: TransitionRule['object'], action: string, currentState: string, ctx: TransitionContext): string {
  const rules = getConfig().transitions.filter((r) => r.object === object && r.action === action);
  if (!rules.length) throw conflict(`No hay una transición configurada para ${object}/${action}.`, 'no_rule');
  const applicable = rules.filter((r) => r.from.includes(currentState));
  if (!applicable.length) {
    throw conflict(`Esta acción no está permitida desde el estado actual ("${currentState}").`, 'bad_state', { object, action, currentState });
  }
  const role = ctx.actor.role || 'system';
  const byRole = applicable.filter((r) => r.roles.includes(role as never));
  if (!byRole.length) throw forbidden(`El rol "${role}" no puede ejecutar "${action}" sobre ${object}.`);
  const rule = byRole[0];
  for (const c of rule.conditions) {
    if (!evalCondition(c, ctx)) throw conflict(CONDITION_MESSAGES[c] || `Condición no cumplida: ${c}`, c);
  }
  if (rule.to === 'previous') return ctx.batch?.previousState || ctx.resolvedTo || currentState;
  if (rule.to.includes('|')) {
    const opts = rule.to.split('|');
    if (ctx.resolvedTo && opts.includes(ctx.resolvedTo)) return ctx.resolvedTo;
    return opts[0];
  }
  return rule.to;
}

/** Acciones permitidas para un rol desde un estado (la interfaz solo muestra estos botones). */
export function allowedActions(object: TransitionRule['object'], currentState: string, role: string): string[] {
  return getConfig()
    .transitions.filter((r) => r.object === object && r.from.includes(currentState) && r.roles.includes(role as never))
    .map((r) => r.action);
}
