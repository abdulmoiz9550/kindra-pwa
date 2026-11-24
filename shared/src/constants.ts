import type { Role, OriginEffectiveState, TripState, BatchState, OriginSize, OriginUrgency, Subcategory, WorkUseType, RejectionReason, StructureType, DebrisCause, EntityType, OriginPriority, SatisfactionAnswer, DispatchState } from './types';

export const ROLES: Role[] = ['citizen', 'monitor', 'coordinator', 'removal', 'center', 'evaluator', 'supervisor', 'destination', 'entity_admin', 'admin', 'driver', 'processing', 'householder', 'community', 'business', 'coastal'];

export const INSTITUTIONAL_ROLES: Role[] = ['coordinator', 'removal', 'driver', 'center', 'processing', 'evaluator', 'supervisor', 'destination', 'entity_admin', 'admin'];

/** Perfiles de participación: no son institucionales y los asigna la administración. */
export const PROFILE_ROLES: Role[] = ['householder', 'community', 'business', 'coastal'];

/**
 * Roles que un administrador de entidad puede asignar a los usuarios de su entidad.
 * No incluye evaluador (lo propone la entidad y lo activa Kindra), ni administrador.
 */
export const ENTITY_ASSIGNABLE_ROLES: Role[] = ['coordinator', 'removal', 'driver', 'center', 'processing', 'supervisor', 'destination'];

/** Roles que solo el administrador principal de Kindra puede activar. */
export const KINDRA_ONLY_ROLES: Role[] = ['admin', 'entity_admin', 'evaluator'];

export const ROLE_LABELS: Record<Role, string> = {
  citizen: 'Ciudadano',
  monitor: 'Contralor comunitario',
  coordinator: 'Ente coordinador',
  removal: 'Ente de retiro',
  center: 'Centro de disposición',
  evaluator: 'Evaluador técnico',
  supervisor: 'Supervisor ambiental',
  destination: 'Destino final (obras)',
  entity_admin: 'Administrador de entidad',
  admin: 'Administrador principal Kindra',
  driver: 'Conductor',
  processing: 'Procesamiento',
  householder: 'Hogar',
  community: 'Comunidad',
  business: 'Comercio',
  coastal: 'Grupo costero',
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
  entity_admin: '/panel/entidad',
  admin: '/admin',
  driver: '/conductor',
  processing: '/panel/procesamiento',
  householder: '/hogar',
  community: '/comunidad',
  business: '/comercio',
  coastal: '/costero',
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
  // administración (addendum, parte 3: toda acción del administrador queda como evento)
  'admin_action',
  'entity_admin_action',
  'sector_announcement',
  // puntos de control QR y seguimiento de rutas (addendum v1.3)
  'movement_departure',
  'movement_arrival',
  'movement_no_arrival',
  'gate_presence',
  'stop_declared',
  'device_event',
  // especificación v4.0: seguridad, exportaciones, solicitudes de información, reportes operativos
  'security_event',
  'data_exported',
  'info_request_action',
  'report_snapshot_imported',
  'governance_action',
  'pickup_request_action',
  'group_action',
  'business_action',
  'ai_suggestion',
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
  admin_action: 'Acción del administrador principal',
  entity_admin_action: 'Acción del administrador de entidad',
  sector_announcement: 'Aviso comunitario al sector',
  movement_departure: 'Salida de material desde el centro',
  movement_arrival: 'Llegada de material confirmada en destino',
  movement_no_arrival: 'Movimiento sin llegada (plazo vencido)',
  gate_presence: 'Presencia registrada en la puerta',
  stop_declared: 'Parada declarada por el escolta',
  device_event: 'Evento del dispositivo de rastreo',
  security_event: 'Evento de seguridad (inicio de sesión)',
  data_exported: 'Exportación de datos',
  info_request_action: 'Solicitud de información',
  report_snapshot_imported: 'Reporte operativo importado',
  governance_action: 'Gobierno de datos: riesgos e incidentes',
  pickup_request_action: 'Solicitud de recolección',
  group_action: 'Actividad de comunidad o grupo',
  business_action: 'Punto de acopio de comercio',
  ai_suggestion: 'Sugerencia de IA',
};

/** Roles con permiso de exportación (sección 9 y 20). Cada exportación queda registrada. */
export const EXPORT_ROLES: Role[] = ['admin', 'supervisor', 'entity_admin'];

/** Roles que consultan los reportes operativos por CDT (diario y acumulado, por operador). */
export const REPORT_ROLES: Role[] = ['admin', 'supervisor', 'entity_admin', 'coordinator', 'center'];

export const INFO_CLASSIFICATION_LABELS: Record<'public' | 'restricted' | 'confidential' | 'critical', string> = {
  public: 'Pública',
  restricted: 'Restringida',
  confidential: 'Confidencial',
  critical: 'Crítica',
};

export const INFO_CLASSIFICATION_HELP: Record<'public' | 'restricted' | 'confidential' | 'critical', string> = {
  public: 'Avance agregado por sector, totales aprobados, estado público de seguimiento y resultados validados para publicar.',
  restricted: 'Registros detallados de lotes, documentos operativos, asignaciones de personal y detalle por centro para usuarios autorizados.',
  confidential: 'Identidad y contacto de quien reporta, direcciones privadas, imágenes identificables y datos personales sensibles.',
  critical: 'Contraseñas, claves de API, credenciales de base de datos, ajustes de seguridad, copias de seguridad y GPS preciso de la flota.',
};

export const INFO_REQUEST_STATUS_LABELS: Record<'submitted' | 'under_review' | 'released' | 'partially_released' | 'denied' | 'closed', string> = {
  submitted: 'Recibida',
  under_review: 'En revisión',
  released: 'Entregada',
  partially_released: 'Entregada en parte (con datos tachados)',
  denied: 'No entregada',
  closed: 'Cerrada',
};

export const MOVEMENT_LEG_LABELS: Record<'cdt_cdf' | 'cdt_work' | 'cdt_state', string> = {
  cdt_cdf: 'Centro temporal → disposición final (material no aprovechable)',
  cdt_work: 'Centro temporal → obra (agregado aprobado)',
  cdt_state: 'Centro temporal → Estado (metal separado)',
};

export const MOVEMENT_OUTPUT_LABELS: Record<'aggregate' | 'rejects' | 'metal', string> = {
  aggregate: 'Agregado',
  rejects: 'Rechazo',
  metal: 'Metal',
};

export const STOP_REASON_LABELS: Record<'traffic' | 'fuel' | 'breakdown' | 'checkpoint' | 'other', string> = {
  traffic: 'Tráfico',
  fuel: 'Combustible',
  breakdown: 'Avería',
  checkpoint: 'Punto de control',
  other: 'Otro',
};

export const GEOFENCE_LABELS: Record<'inside' | 'outside' | 'no_reference' | 'no_location', string> = {
  inside: 'Dentro del perímetro',
  outside: 'Fuera del perímetro',
  no_reference: 'Sin coordenadas de referencia',
  no_location: 'Sin ubicación del teléfono',
};

export const LEGAL_TYPE_LABELS: Record<'public_institution' | 'company', string> = {
  public_institution: 'Institución pública',
  company: 'Empresa',
};

// ---------------------------------------------------------------------------
// Funciones activables (addendum: partes 1, 2 y 4)
// ---------------------------------------------------------------------------

export type FeatureGroup = 'module' | 'debris' | 'later_phase' | 'hidden';

export interface FeatureDefinition {
  key: string;
  label: string;
  description: string;
  group: FeatureGroup;
  /** Valor por defecto en este módulo. */
  defaultOn: boolean;
  /**
   * false = la función no está construida en esta instalación (vive en otro módulo o en una fase posterior).
   * Su interruptor queda bloqueado en apagado.
   */
  available: boolean;
  /** Interruptor fijo en esta fase (no se puede cambiar). */
  locked?: boolean;
}

export const FEATURES: FeatureDefinition[] = [
  // Módulos de residuos (addendum v1.3): cada módulo vive en la misma PWA detrás de su propio interruptor.
  { key: 'module_debris', label: 'Módulo 1: escombros', description: 'Activo en la fase 1.', group: 'module', defaultOn: true, available: true, locked: true },
  { key: 'oil_module', label: 'Módulo 2: aceite de cocina usado', description: 'Apagado. Para encenderlo, el administrador principal completa primero su definición (flujo, datos, unidades, validación, roles y riesgos) con la referencia de aprobación.', group: 'module', defaultOn: false, available: true },
  { key: 'module_other', label: 'Módulos 3, 4 y siguientes (otros residuos)', description: 'Se construyen en la misma PWA y quedan ocultos hasta su activación.', group: 'module', defaultOn: false, available: false },
  // Funciones del módulo de escombros que el administrador principal puede apagar
  { key: 'kindra_card', label: 'Tarjeta Kindra y QR personal', description: 'Tarjeta con QR personal e intransferible. Los puntos de escombros van al mismo saldo.', group: 'debris', defaultOn: true, available: true },
  { key: 'achievements', label: 'Logros (dos capas)', description: 'Logros personales y logros comunitarios del sector.', group: 'debris', defaultOn: true, available: true },
  { key: 'referrals', label: 'Referidos', description: 'Solo suman puntos cuando el primer reporte de la persona invitada se valida, nunca al registrarse.', group: 'debris', defaultOn: true, available: true },
  { key: 'community_announcements', label: 'Avisos comunitarios por sector', description: 'Avisa a los vecinos de un sector cuando hay puntos asignados para retiro.', group: 'debris', defaultOn: true, available: true },
  { key: 'preregistration', label: 'Códigos de pre-registro', description: 'Ingreso con código para personas sin teléfono. Oculto en esta fase.', group: 'debris', defaultOn: false, available: true },
  // Fase posterior
  { key: 'ai_photo_detection', label: 'Sugerencias de IA sobre fotos', description: 'Apagada por defecto. Al encenderla, la foto elegida se envía al servicio de IA de Anthropic. El resultado es solo una sugerencia hasta que una persona autorizada la confirma.', group: 'later_phase', defaultOn: false, available: true },
  // Ocultas en el módulo de escombros (addendum, parte 4)
  { key: 'hero_subscription', label: 'Suscripción Kindra Hero', description: 'Nivel de pago. Este módulo es un servicio de interés público.', group: 'hidden', defaultOn: false, available: false },
  { key: 'kindra_gift', label: 'Kindra Gift', description: 'Monetización, no aplica a escombros.', group: 'hidden', defaultOn: false, available: false },
  { key: 'ad_spaces', label: 'Espacios de publicidad', description: 'No es apropiado en un módulo público posterior a un desastre.', group: 'hidden', defaultOn: false, available: false },
  { key: 'semanas_locas', label: 'Semanas Locas', description: 'Premia volumen, lo que incentivaría reportes falsos.', group: 'hidden', defaultOn: false, available: false },
  { key: 'payments', label: 'Pagos y precios', description: 'Sin incentivo económico en este módulo.', group: 'hidden', defaultOn: false, available: false },
  { key: 'driver_tracking_map', label: 'Mapa público de vehículos en tiempo real', description: 'Las posiciones de los vehículos nunca son públicas. El seguimiento interno para roles autorizados está en "Seguimiento".', group: 'hidden', defaultOn: false, available: false },
];

export const DEFAULT_FEATURES: Record<string, boolean> = Object.fromEntries(FEATURES.map((f) => [f.key, f.defaultOn && f.available]));

/** Una función está activa solo si existe, está construida y el interruptor está encendido. */
export function featureOn(features: Record<string, boolean> | undefined | null, key: string): boolean {
  const def = FEATURES.find((f) => f.key === key);
  if (!def || !def.available) return false;
  const v = features?.[key];
  return v === undefined ? def.defaultOn : !!v;
}

export const DEFAULT_SPACE_ID = 'sp_principal';

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

// ---------------------------------------------------------------- solicitudes de recolección (v4.0, 17)

export const PICKUP_STATUS_LABELS: Record<'submitted' | 'new' | 'assigned' | 'en_route' | 'arrived' | 'collected' | 'received' | 'completed' | 'issue' | 'cancelled', string> = {
  submitted: 'Pendiente de programar',
  new: 'Programada, por asignar',
  assigned: 'Asignada',
  en_route: 'En camino al punto',
  arrived: 'Recolección en curso',
  collected: 'Recolectada, en tránsito',
  received: 'Recibida en el centro',
  completed: 'Validada y cerrada',
  issue: 'Con incidencia',
  cancelled: 'Cancelada',
};

export const PICKUP_REJECT_LABELS: Record<'vehicle_unavailable' | 'schedule_conflict' | 'unsafe_access' | 'outside_area' | 'other', string> = {
  vehicle_unavailable: 'Vehículo no disponible',
  schedule_conflict: 'Choque de horario',
  unsafe_access: 'Acceso inseguro',
  outside_area: 'Fuera del área asignada',
  other: 'Otro motivo',
};

// ---------------------------------------------------------------- etiquetas de estado comunes (v4.0, secciones 6 y 8)

export type StandardStatus = 'draft' | 'submitted' | 'under_review' | 'validated' | 'rejected' | 'completed';

export const STANDARD_STATUS_LABELS: Record<StandardStatus, string> = {
  draft: 'Borrador',
  submitted: 'Enviado',
  under_review: 'En revisión',
  validated: 'Validado',
  rejected: 'Rechazado / por corregir',
  completed: 'Completado / cerrado',
};

export const STANDARD_STATUS: {
  origin: Record<OriginEffectiveState, StandardStatus>;
  batch: Record<BatchState, StandardStatus>;
  trip: Record<TripState, StandardStatus>;
  dispatch: Record<DispatchState, StandardStatus>;
  pickup: Record<keyof typeof PICKUP_STATUS_LABELS, StandardStatus>;
} = {
  origin: { pending_authorization: 'under_review', registered: 'submitted', validated: 'validated', rejected: 'rejected', duplicate: 'completed', under_removal: 'validated', removed: 'validated', disputed: 'under_review', in_batch: 'validated', in_work: 'validated', closed: 'completed' },
  batch: { open: 'draft', closed: 'submitted', held: 'under_review', processed: 'submitted', under_verification: 'under_review', approved: 'validated', rejected: 'rejected', partially_dispatched: 'validated', fully_dispatched: 'completed' },
  trip: { in_transit: 'submitted', received: 'validated', no_arrival: 'under_review' },
  dispatch: { pending: 'submitted', received: 'completed', discrepancy: 'under_review' },
  pickup: { submitted: 'submitted', new: 'submitted', assigned: 'submitted', en_route: 'submitted', arrived: 'submitted', collected: 'submitted', received: 'under_review', completed: 'completed', issue: 'under_review', cancelled: 'completed' },
};

/** Etiqueta común seguida del detalle propio del módulo, sin repetir palabras. */
export function statusText(kind: keyof typeof STANDARD_STATUS, state: string, detail: string): string {
  const std = (STANDARD_STATUS[kind] as Record<string, StandardStatus>)[state];
  if (!std) return detail;
  const label = STANDARD_STATUS_LABELS[std];
  const first = label.split(' ')[0].toLowerCase();
  return detail.toLowerCase().includes(label.toLowerCase()) || detail.toLowerCase().startsWith(first) ? detail : `${label} · ${detail}`;
}

export const WASTE_CATEGORY_LABELS: Record<'plastic' | 'glass' | 'metal' | 'organic' | 'mixed' | 'other', string> = { plastic: 'Plástico', glass: 'Vidrio', metal: 'Metal', organic: 'Orgánico', mixed: 'Mixto', other: 'Otro' };

export const WASTE_REPORT_STATUS_LABELS: Record<'submitted' | 'under_review' | 'validated' | 'rejected', string> = { submitted: 'Enviado', under_review: 'En revisión', validated: 'Validado', rejected: 'Rechazado / por corregir' };

export const ACTIVITY_STATUS_LABELS: Record<'draft' | 'published' | 'completed' | 'cancelled', string> = { draft: 'Borrador', published: 'Publicada', completed: 'Realizada', cancelled: 'Cancelada' };

/** Tipos de aviso que cada persona puede silenciar. Los operativos y de seguridad no se silencian. */
export const MUTABLE_NOTIFICATIONS: { kind: string; label: string }[] = [
  { kind: 'sector_announcement', label: 'Avisos comunitarios del sector' },
  { kind: 'level_reached', label: 'Cambios de nivel' },
  { kind: 'pickup_new', label: 'Solicitudes disponibles' },
];
