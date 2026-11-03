import type { TransitionRule } from '@kindra/shared';

/**
 * Tabla de transiciones (3.3 / sección 6). Es la fuente que valida el servidor;
 * se copia a config.transitions y puede editarse desde el panel de administración.
 *
 * Condiciones nombradas (se evalúan en core/transitions.ts):
 *  - zoneAuthorized      la zona del origen está liberada (7.2)
 *  - notOwnReport        el actor no es quien reportó el origen (4.1)
 *  - isReporter          el actor es el reportante (con cuenta) del origen
 *  - notAnonymous        el origen tiene reportante identificado
 *  - allHazardDecided    no quedan recepciones sospechosas sin decisión (7.3)
 *  - qualityApproved     la verificación de calidad del lote está aprobada (7.4)
 *  - sameCenter          el actor pertenece al centro del objeto
 *  - hasEvidence         la resolución incluye evidencia (foto)
 *  - notHeld             el lote no está retenido
 */
export const DEFAULT_TRANSITIONS: TransitionRule[] = [
  // ---------------- ORIGEN ----------------
  { object: 'origin', action: 'origin_validated', from: ['registered'], to: 'validated', roles: ['coordinator'], conditions: ['notOwnReport'], description: 'El coordinador confirma que el reporte es real (7.1).' },
  { object: 'origin', action: 'origin_rejected', from: ['registered'], to: 'rejected', roles: ['coordinator'], conditions: ['notOwnReport'], description: 'Descartado con motivo. Estado final.' },
  { object: 'origin', action: 'origin_marked_duplicate', from: ['registered', 'validated'], to: 'duplicate', roles: ['coordinator'], conditions: ['notOwnReport'], description: 'Vinculado a un origen existente.' },
  { object: 'origin', action: 'trip_departure', from: ['validated', 'under_removal', 'removed', 'disputed', 'in_batch'], to: 'under_removal', roles: ['removal', 'system'], conditions: ['zoneAuthorized', 'notOwnReport'], description: 'Primera salida de camión (7.2).' },
  { object: 'origin', action: 'origin_removed', from: ['validated', 'under_removal', 'in_batch'], to: 'removed', roles: ['coordinator'], conditions: ['notOwnReport'], description: 'Retiro completo. Dispara el primer cierre.' },
  { object: 'origin', action: 'removal_disputed', from: ['removed', 'in_batch', 'in_work'], to: 'disputed', roles: ['citizen', 'monitor'], conditions: ['isReporter', 'notAnonymous'], description: 'El ciudadano dice que no fue retirado.' },
  { object: 'origin', action: 'dispute_resolved', from: ['disputed'], to: 'removed', roles: ['coordinator'], conditions: ['hasEvidence'], description: 'Se confirma el retiro con evidencia o se devuelve a "en retiro".' },
  { object: 'origin', action: 'origin_in_batch', from: ['under_removal', 'removed', 'validated'], to: 'in_batch', roles: ['system'], conditions: [], description: 'Un viaje llegó al centro y entró en un lote.' },
  { object: 'origin', action: 'origin_in_work', from: ['removed', 'in_batch', 'under_removal'], to: 'in_work', roles: ['system'], conditions: [], description: 'Material de su sector se usó en una obra. Dispara el cierre final.' },
  { object: 'origin', action: 'final_closure_sent', from: ['in_work'], to: 'closed', roles: ['system'], conditions: [], description: 'Cierre final enviado.' },
  // ---------------- VIAJE ----------------
  { object: 'trip', action: 'trip_arrival', from: ['in_transit', 'no_arrival'], to: 'received', roles: ['center'], conditions: ['sameCenter', 'notOwnReport'], description: 'El centro confirma la llegada.' },
  { object: 'trip', action: 'trip_no_arrival', from: ['in_transit'], to: 'no_arrival', roles: ['system'], conditions: [], description: 'Venció el plazo sin confirmación (6.2).' },
  // ---------------- LOTE ----------------
  { object: 'batch', action: 'batch_closed', from: ['open'], to: 'closed', roles: ['center', 'system'], conditions: ['sameCenter'], description: 'Terminó el periodo o el centro lo cerró.' },
  { object: 'batch', action: 'batch_held', from: ['open', 'closed'], to: 'held', roles: ['system'], conditions: [], description: 'Hay una recepción sospechosa sin decisión.' },
  { object: 'batch', action: 'batch_released', from: ['held'], to: 'previous', roles: ['system'], conditions: ['allHazardDecided'], description: 'El evaluador decidió sobre todas las sospechosas.' },
  { object: 'batch', action: 'outputs_recorded', from: ['closed'], to: 'processed', roles: ['center'], conditions: ['sameCenter', 'notHeld', 'allHazardDecided'], description: 'El centro registra las salidas (7.3).' },
  { object: 'batch', action: 'batch_processed', from: ['processed'], to: 'under_verification', roles: ['system'], conditions: [], description: 'Pasa a esperar verificación de calidad.' },
  { object: 'batch', action: 'quality_verified', from: ['under_verification'], to: 'approved|rejected', roles: ['evaluator'], conditions: [], description: 'Resultado de la verificación de calidad.' },
  { object: 'batch', action: 'dispatch_created', from: ['approved', 'partially_dispatched'], to: 'partially_dispatched|fully_dispatched', roles: ['center'], conditions: ['sameCenter', 'qualityApproved'], description: 'Despacho a obra (7.4).' },
];
