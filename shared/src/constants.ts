import type { Role, OriginEffectiveState, TripState, BatchState, OriginSize, OriginUrgency, Subcategory, WorkUseType, RejectionReason, StructureType, DebrisCause, EntityType, OriginPriority, SatisfactionAnswer, DispatchState } from './types';

export const ROLES: Role[] = ['citizen', 'monitor', 'coordinator', 'removal', 'center', 'evaluator', 'supervisor', 'destination', 'admin'];

export const INSTITUTIONAL_ROLES: Role[] = ['coordinator', 'removal', 'center', 'evaluator', 'supervisor', 'destination', 'admin'];

export const ROLE_LABELS: Record<Role, string> = {
  citizen: 'Ciudadano',
  monitor: 'Contralor comunitario',
  coordinator: 'Ente coordinador',
  removal: 'Ente de retiro',
  center: 'Centro de disposición',
  evaluator: 'Evaluador técnico',
  supervisor: 'Supervisor ambiental',
  destination: 'Destino final (obras)',
  admin: 'Administrador',
};

export const ROLE_HOME: Record<Role, string> = {
  citizen: '/mis-reportes',
  monitor: '/mis-reportes',
  coordinator: '/panel/coordinador',
  removal: '/panel/retiro',
  center: '/panel/centro',
  evaluator: '/panel/evaluador',
  supervisor: '/panel/supervisor',
  destination: '/panel/destino',
  admin: '/admin',
};

export const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  coordinating: 'Coordinador',
  removal: 'Retiro',
  center: 'Centro de disposición',
  technical: 'Técnico',
  supervisor: 'Supervisor',
  destination: 'Destino final',
};

export const ORIGIN_STAGE_ORDER: Record<string, number> = {
  registered: 1,
  validated: 2,
  under_removal: 3,
  removed: 4,
  in_batch: 5,
  in_work: 6,
  closed: 7,
};

export const ORIGIN_STATE_LABELS: Record<OriginEffectiveState, string> = {
  pending_authorization: 'Pendiente de autorización de zona',
  registered: 'Registrado, en revisión',
  validated: 'Validado, en lista de retiro',
  rejected: 'Rechazado',
  duplicate: 'Sumado a otro reporte',
  under_removal: 'En retiro',
  removed: 'Retirado',
  disputed: 'En revisión por disputa',
  in_batch: 'En procesamiento en el centro',
  in_work: 'Material usado en una obra',
  closed: 'Cerrado',
};

/** Texto en lenguaje claro para el ciudadano (16.3) */
export const ORIGIN_STATE_PLAIN: Record<OriginEffectiveState, string> = {
  pending_authorization: 'La zona todavía no ha sido liberada por los equipos de rescate. Tu reporte queda guardado.',
  registered: 'Tu reporte fue recibido y lo está revisando el equipo de coordinación.',
  validated: 'Tu reporte fue revisado y está en la lista de retiro.',
  rejected: 'El reporte no pudo registrarse. Puedes pedir que lo revisen de nuevo.',
  duplicate: 'Alguien ya había reportado este punto. Tu aviso se sumó a ese reporte.',
  under_removal: 'Ya salió al menos un camión desde ese punto hacia un centro.',
  removed: 'El escombro fue retirado y llevado a un centro.',
  disputed: 'Dijiste que no fue retirado. El equipo lo está revisando.',
  in_batch: 'El material está en un centro, en proceso de clasificación y trituración.',
  in_work: 'Material de tu sector ya se usó en una obra pública.',
  closed: 'El recorrido completo terminó. Gracias por reportar.',
};

export const TRIP_STATE_LABELS: Record<TripState, string> = {
  in_transit: 'En tránsito',
  received: 'Recibido',
  no_arrival: 'Sin llegada',
};

export const BATCH_STATE_LABELS: Record<BatchState, string> = {
  open: 'Abierto',
  closed: 'Cerrado',
  held: 'Retenido',
  processed: 'Procesado',
  under_verification: 'En verificación',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  partially_dispatched: 'Parcialmente despachado',
  fully_dispatched: 'Totalmente despachado',
};

export const DISPATCH_STATE_LABELS: Record<DispatchState, string> = {
  pending: 'Pendiente de confirmar',
  received: 'Recibido',
  discrepancy: 'Con discrepancia',
};

export const SIZE_LABELS: Record<OriginSize, string> = {
  small: 'Pequeño: cabe en una carretilla',
  medium: 'Mediano: llenaría una camioneta',
  large: 'Grande: más que eso',
};

export const URGENCY_LABELS: Record<OriginUrgency, string> = {
  blocks_access: 'Tapa la entrada de una casa',
  risk: 'Es un riesgo para quien pasa',
  can_wait: 'Puede esperar',
};

export const PRIORITY_LABELS: Record<OriginPriority, string> = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
};

export const SUBCATEGORY_LABELS: Record<Subcategory, string> = {
  concrete_brick: 'Concreto y ladrillo',
  wood: 'Madera',
  metal: 'Metal',
  mixed: 'Mixto',
  possible_hazardous: 'Posible material peligroso',
};

export const USE_TYPE_LABELS: Record<WorkUseType, string> = {
  road_base: 'Base de vía',
  sidewalks: 'Aceras',
  curbs: 'Brocales',
  blocks: 'Bloques',
  fill: 'Relleno',
  other: 'Otro',
};

export const REJECTION_REASON_LABELS: Record<RejectionReason, string> = {
  false: 'Reporte falso',
  outside_area: 'Fuera del área atendida',
  not_earthquake_debris: 'No es escombro del terremoto',
  duplicate_intentional: 'Duplicado intencional',
  other: 'Otro motivo',
};

/** Motivo en lenguaje simple para el mensaje de AURA (8.5 "Rejection") */
export const REJECTION_REASON_PLAIN: Record<RejectionReason, string> = {
  false: 'al revisarlo no se encontró escombro en ese punto',
  outside_area: 'el punto queda fuera del área que se está atendiendo',
  not_earthquake_debris: 'lo que hay ahí no es escombro del terremoto',
  duplicate_intentional: 'ya había sido reportado varias veces',
  other: 'el equipo de coordinación no pudo confirmarlo',
};

export const STRUCTURE_TYPE_LABELS: Record<StructureType, string> = {
  house: 'Casa',
  multifamily: 'Edificio multifamiliar',
  commercial: 'Comercial',
  institutional: 'Institucional',
  roadway: 'Vialidad',
  other: 'Otro',
};

export const CAUSE_LABELS: Record<DebrisCause, string> = {
  collapse: 'Colapso',
  demolition: 'Demolición',
};

export const SATISFACTION_LABELS: Record<SatisfactionAnswer, string> = {
  yes: 'Sí',
  somewhat: 'Más o menos',
  no: 'No',
};

export const EVENT_TYPES = [
  'origin_registered',
  'origin_validated',
  'origin_rejected',
  'origin_marked_duplicate',
  'zone_authorized',
  'zone_unauthorized',
  'priority_set',
  'trip_departure',
  'trip_arrival',
  'trip_no_arrival',
  'origin_removed',
  'removal_closure_sent',
  'removal_confirmed',
  'removal_disputed',
  'dispute_resolved',
  'reception_classified',
  'batch_opened',
  'batch_closed',
  'batch_held',
  'batch_released',
  'hazard_decided',
  'batch_processed',
  'outputs_recorded',
  'quality_verified',
  'dispatch_created',
  'dispatch_received',
  'dispatch_discrepancy',
  'work_registered',
  'use_recorded',
  'final_closure_sent',
  'satisfaction_answered',
  'observation_recorded',
  'before_after_photo',
  'daily_summary_entered',
  'jobs_recorded',
  'correction',
  // auxiliares
  'origin_in_batch',
  'origin_in_work',
  'origin_verified_on_site',
  'lesson_completed',
  'monitor_requested',
  'monitor_request_decided',
  'photo_retake_requested',
  'escalation_alert',
  'trip_arrival_late',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_LABELS: Record<EventType, string> = {
  origin_registered: 'Origen registrado',
  origin_validated: 'Reporte validado',
  origin_rejected: 'Reporte rechazado',
  origin_marked_duplicate: 'Marcado como duplicado',
  zone_authorized: 'Zona autorizada',
  zone_unauthorized: 'Zona marcada como no autorizada',
  priority_set: 'Prioridad asignada',
  trip_departure: 'Salida de viaje',
  trip_arrival: 'Llegada confirmada en el centro',
  trip_no_arrival: 'Viaje sin llegada (plazo vencido)',
  origin_removed: 'Origen marcado como retirado',
  removal_closure_sent: 'Primer cierre enviado al ciudadano',
  removal_confirmed: 'Retiro confirmado por el ciudadano',
  removal_disputed: 'Retiro disputado por el ciudadano',
  dispute_resolved: 'Disputa resuelta',
  reception_classified: 'Recepción clasificada',
  batch_opened: 'Lote abierto',
  batch_closed: 'Lote cerrado',
  batch_held: 'Lote retenido',
  batch_released: 'Lote liberado',
  hazard_decided: 'Decisión sobre material peligroso',
  batch_processed: 'Lote procesado',
  outputs_recorded: 'Salidas del lote registradas',
  quality_verified: 'Verificación de calidad',
  dispatch_created: 'Despacho creado',
  dispatch_received: 'Despacho recibido',
  dispatch_discrepancy: 'Discrepancia de cantidad en despacho',
  work_registered: 'Obra registrada',
  use_recorded: 'Uso registrado en obra',
  final_closure_sent: 'Cierre final enviado al ciudadano',
  satisfaction_answered: 'Pregunta de satisfacción respondida',
  observation_recorded: 'Observación registrada',
  before_after_photo: 'Fotos de antes y después',
  daily_summary_entered: 'Resumen diario registrado',
  jobs_recorded: 'Empleos registrados',
  correction: 'Corrección',
  origin_in_batch: 'Material incluido en un lote',
  origin_in_work: 'Material del sector usado en obra',
  origin_verified_on_site: 'Verificado en sitio por contralor comunitario',
  lesson_completed: 'Lección completada',
  monitor_requested: 'Solicitud de rol de contralor',
  monitor_request_decided: 'Solicitud de contralor decidida',
  photo_retake_requested: 'Se pidió repetir la foto',
  escalation_alert: 'Alerta de escalamiento',
  trip_arrival_late: 'Llegada tardía (discrepancia resuelta)',
};

export const KINDRA_TAGLINE = 'con tecnología Kindra';

/** Alfabeto para códigos legibles por teléfono: sin O, I, L, 0, 1 (5.4) */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const FORBIDDEN_EXPRESSIONS = [
  '¡Excelente!',
  '¡Genial!',
  '¡Perfecto!',
  'Estimado usuario',
  'Su solicitud ha sido procesada',
  'Gracias por contactarnos',
  '¿En qué más puedo ayudarle?',
  'Lamentamos los inconvenientes',
];

export const PUBLIC_ROUTES = {
  dashboard: '/tablero',
  batch: (code: string) => `/publico/lote/${code}`,
  work: (code: string) => `/publico/obra/${code}`,
  record: (code: string) => `/publico/ficha/${code}`,
  certificate: (code: string) => `/publico/certificado/${code}`,
};
