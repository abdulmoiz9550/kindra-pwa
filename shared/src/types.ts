// ---------------------------------------------------------------------------
// Tipos compartidos entre servidor y cliente (sección 5 de la especificación)
// ---------------------------------------------------------------------------

export type Role =
  | 'citizen'
  | 'monitor'
  | 'coordinator'
  | 'removal'
  | 'center'
  | 'evaluator'
  | 'supervisor'
  | 'destination'
  | 'entity_admin'
  | 'admin'
  // v4.0: permisos internos separados y perfiles de la PWA
  | 'driver'
  | 'processing'
  | 'householder'
  | 'community'
  | 'business'
  | 'coastal';

export type EntityType = 'coordinating' | 'removal' | 'center' | 'technical' | 'supervisor' | 'destination';

export type PublicationMode = 'public' | 'delayed' | 'internal';
export interface PublicationRule {
  mode: PublicationMode;
  delayDays?: number;
}
export interface PublicationPolicy {
  officialFigures: PublicationRule;
  discrepancies: PublicationRule;
  photos: PublicationRule;
  observations: PublicationRule;
}

/** Persona jurídica que participa en un convenio (addendum, parte 1: registro de persona natural y jurídica). */
export type LegalType = 'public_institution' | 'company';

export interface Entity {
  id: string;
  name: string;
  type: EntityType;
  description: string;
  logoUrl?: string | null;
  publicationPolicy: PublicationPolicy;
  active: boolean;
  /** Tipo de persona jurídica (institución pública o empresa). */
  legalType?: LegalType | null;
  /** RIF u otro identificador fiscal. */
  taxId?: string | null;
  /** Espacio (convenio) al que pertenece (27.1). */
  spaceId?: string | null;
}

/** Espacio por convenio (27.1): agrupa entidades, usuarios y registros para sumar convenios sin rehacer nada. */
export interface Space {
  id: string;
  name: string;
  description: string;
  agreementRef?: string | null;
  active: boolean;
  createdAt: string;
}

/** Designación por escrito de un administrador de entidad, activada por Kindra (addendum, parte 3). */
export interface Appointment {
  documentRef: string;
  documentPhotoId?: string | null;
  appointedAt: string;
  activatedBy: string;
  activatedAt: string;
}

/** Propuesta de rol hecha por una entidad que Kindra debe activar (evaluadores). */
export interface RoleProposal {
  role: Role;
  proposedBy: string;
  entityId: string;
  proposedAt: string;
  note?: string | null;
}

export interface TwoFactorState {
  enabled: boolean;
  enabledAt?: string | null;
}

export type VerificationStatus = 'not_required' | 'pending' | 'verified' | 'rejected';

export interface User {
  id: string;
  name?: string;
  phone?: string;
  alias: string;
  roles: Role[];
  entityId?: string | null;
  centerId?: string | null;
  sectorId?: string | null;
  passwordHash?: string;
  verificationStatus: VerificationStatus;
  selfiePhotoId?: string | null;
  preregCode?: string | null;
  active: boolean;
  createdAt: string;
  isDemo?: boolean;
  /** Espacio (convenio) al que pertenece (27.1). */
  spaceId?: string | null;
  /** Código de la tarjeta Kindra: QR personal e intransferible. */
  cardCode?: string | null;
  /** Código para invitar a otras personas (referidos). */
  referralCode?: string | null;
  /** Usuario que lo invitó. Solo da puntos cuando su primer reporte se valida. */
  referredBy?: string | null;
  /** Designación por escrito (administrador de entidad). */
  appointment?: Appointment | null;
  /** Roles propuestos por la entidad pendientes de activación por Kindra. */
  proposedRoles?: RoleProposal[];
  /** Verificación en dos pasos (obligatoria para el administrador principal). */
  twoFactor?: TwoFactorState | null;
  /** Correo para ingresar (confidencial). */
  email?: string | null;
  /** Módulos a los que accede. Sin valor = los activos. */
  modules?: string[] | null;
  vehicleId?: string | null;
  operationalArea?: string | null;
  profilePhotoId?: string | null;
  /** Comercio al que pertenece la cuenta (perfil comercio). */
  businessId?: string | null;
  /** Preferencias personales (v4.0, 17.5). */
  preferences?: UserPreferences | null;
}

export interface UserPreferences {
  /** Tipos de aviso que la persona no quiere ver. */
  mutedKinds: string[];
  /** Conductor disponible para nuevas solicitudes. */
  available: boolean;
  /** Dirección guardada (confidencial). */
  address: string | null;
}

/** Usuario tal como lo ve el cliente (sin hash). */
export interface PublicUser extends Omit<User, 'passwordHash'> {
  /** La sesión actual completó la verificación en dos pasos. */
  mfa?: boolean;
  activeRole: Role;
  points: number;
  level: LevelInfo;
  consecutiveRejections: number;
  suspendedUntil?: string | null;
  entityName?: string | null;
  vehiclePlate?: string | null;
  profilePhotoUrl?: string | null;
}

export interface LevelInfo {
  key: string;
  name: string;
  threshold: number;
  next?: { name: string; threshold: number } | null;
}

export interface Sector {
  id: string;
  name: string;
  parish: string;
  polygon: [number, number][]; // [lat, lng]
  authorized: boolean;
  provisional?: boolean;
  spaceId?: string | null;
}

export type OriginType = 'institutional' | 'citizen';
export type OriginSize = 'small' | 'medium' | 'large';
export type OriginUrgency = 'blocks_access' | 'risk' | 'can_wait';
export type OriginPriority = 'high' | 'medium' | 'low';
export type OriginState =
  | 'registered'
  | 'validated'
  | 'rejected'
  | 'duplicate'
  | 'under_removal'
  | 'removed'
  | 'disputed'
  | 'in_batch'
  | 'in_work'
  | 'closed';
export type OriginEffectiveState = OriginState | 'pending_authorization';
export type RejectionReason = 'false' | 'outside_area' | 'not_earthquake_debris' | 'duplicate_intentional' | 'other';
export type Subcategory = 'concrete_brick' | 'wood' | 'metal' | 'mixed' | 'possible_hazardous';
export type StructureType = 'house' | 'multifamily' | 'commercial' | 'institutional' | 'roadway' | 'other';
export type DebrisCause = 'collapse' | 'demolition';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface Origin {
  id: string;
  code: string;
  type: OriginType;
  sectorId: string;
  location: GeoPoint | null;
  street?: string | null;
  reference?: string | null;
  date: string;
  photoIds: string[];
  subcategory?: Subcategory | null;
  /** Material, cantidad estimada y unidad al registrar el lote de origen (v4.0, sección 7). */
  material?: string | null;
  quantity?: number | null;
  unit?: OutputUnit | null;
  size: OriginSize;
  urgency?: OriginUrgency | null;
  voiceNoteId?: string | null;
  zoneAuthorized: boolean;
  reporterId?: string | null;
  reporterName?: string | null;
  anonymous: boolean;
  priority?: OriginPriority | null;
  state: OriginState;
  preDisputeState?: OriginState | null;
  linkedOriginIds: string[];
  linkedReporterKeys: string[];
  duplicateOfId?: string | null;
  structureType?: StructureType | null;
  cause?: DebrisCause | null;
  buildingReference?: string | null;
  rejectionReason?: RejectionReason | null;
  rejectionNote?: string | null;
  entityId?: string | null;
  createdAt: string;
  validatedAt?: string | null;
  firstTripAt?: string | null;
  removedAt?: string | null;
  inBatchAt?: string | null;
  inWorkAt?: string | null;
  closedAt?: string | null;
  verifiedOnSiteAt?: string | null;
  verifiedOnSitePhotoId?: string | null;
  afterPhotoId?: string | null;
  photoRetakeRequested?: boolean;
  photoRetakeCount?: number;
  manualReview?: boolean;
  possibleDuplicateOfId?: string | null;
  disputeEvidencePhotoId?: string | null;
  tripIds: string[];
  batchIds: string[];
  workIds: string[];
  source: 'pwa' | 'aura' | 'institutional' | 'seed';
  /** Espacio (convenio) del registro (27.1). Si falta, se toma el del sector. */
  spaceId?: string | null;
}

export interface VehicleType {
  id: string;
  name: string;
  /** Opcional: los viajes se registran en ambos extremos sin capacidad obligatoria (addendum, parte 2). */
  capacityM3: number | null;
  provisional: boolean;
}

export interface Vehicle {
  id: string;
  plate: string;
  typeId: string;
  entityId: string;
  qrCode: string;
  active: boolean;
  /** Identificador del dispositivo de rastreo (IMEI o identificador de Traccar Client). */
  imei?: string | null;
  /** Fuente de posición registrada para este vehículo. */
  trackerType?: 'gps' | 'traccar_client' | null;
}

export type TripState = 'in_transit' | 'received' | 'no_arrival';
export type FillLevel = 'full' | 'half';

export interface TripLeg {
  userId: string;
  entityId: string;
  deviceTime: string;
  serverTime: string;
  photoId?: string | null;
  location?: GeoPoint | null;
}

export interface Trip {
  id: string;
  code: string;
  vehicleId: string;
  originIds: string[];
  centerId: string;
  departure: TripLeg & { fillLevel?: FillLevel | null };
  arrival?: TripLeg | null;
  estimatedVolumeM3: number | null;
  state: TripState;
  noArrivalAt?: string | null;
  discrepancyResolvedAt?: string | null;
  receptionId?: string | null;
  /** Control de perímetro del escaneo de salida y de llegada (addendum v1.3). */
  departureCheck?: GeofenceStatus | null;
  arrivalCheck?: GeofenceStatus | null;
  /** Hash del recorrido completo sellado al llegar (integridad del trazado). */
  traceHash?: string | null;
  traceCount?: number | null;
}

/** Resultado del control de perímetro de un escaneo. */
export type GeofenceStatus = 'inside' | 'outside' | 'no_reference' | 'no_location';

/** Tramos del ciclo distintos de origen→CDT (addendum v1.3: puntos de control QR en cada tramo). */
export type MovementLeg = 'cdt_cdf' | 'cdt_work' | 'cdt_state';
export type MovementOutput = 'aggregate' | 'rejects' | 'metal';

export interface Movement {
  id: string;
  code: string;
  leg: MovementLeg;
  vehicleId: string;
  fromCenterId: string;
  batchId: string;
  outputType: MovementOutput;
  quantity: number;
  unit: OutputUnit;
  destination: { kind: 'center' | 'work' | 'state'; id: string | null; name: string };
  departure: TripLeg;
  arrival?: TripLeg | null;
  state: TripState;
  departureCheck?: GeofenceStatus | null;
  arrivalCheck?: GeofenceStatus | null;
  traceHash?: string | null;
  traceCount?: number | null;
  noArrivalAt?: string | null;
}

export type TrackSource = 'gps' | 'traccar_client' | 'pwa' | 'checkpoint';

/** Posición cruda de un viaje activo. Solo se anexa; nunca se edita. */
export interface TrackPoint {
  id: string;
  tripKey: string;
  vehicleId: string;
  source: TrackSource;
  lat: number;
  lng: number;
  at: string;
  receivedAt: string;
  accuracy?: number | null;
  speedKmh?: number | null;
  delayed?: boolean;
  label?: string | null;
}

export type StopReason = 'traffic' | 'fuel' | 'breakdown' | 'checkpoint' | 'other';

export interface DeclaredStop {
  id: string;
  tripKey: string;
  reason: StopReason;
  note?: string | null;
  photoId?: string | null;
  location?: GeoPoint | null;
  at: string;
  userId: string;
}

export interface TripRoute {
  id: string; // tripKey
  planned: [number, number][] | null;
  expectedSeconds: number | null;
  distanceM: number | null;
  source: 'osrm' | 'straight' | 'none';
  createdAt: string;
}

export interface Center {
  id: string;
  name: string;
  shortCode: string;
  type: 'CDT' | 'CDF';
  sectorId: string;
  entityId: string;
  location?: GeoPoint | null;
  /** Otras entidades operadoras que registran viajes hacia este centro (un sitio puede tener varios operadores). */
  operatorEntityIds?: string[];
  /** Punto de descarga donde los camiones dejan el material y se confirman las llegadas (si difiere de la ubicación del centro). */
  unloadingPoint?: GeoPoint | null;
  /** Código del QR fijo impreso en la puerta del centro. */
  gateCode?: string | null;
}

export interface Reception {
  id: string;
  tripId: string;
  centerId: string;
  batchId: string;
  receivedAt: string;
  subcategory?: Subcategory | null;
  photoId?: string | null;
  note?: string | null;
  classifiedAt?: string | null;
  classifiedBy?: string | null;
  hazardDecision?: 'release' | 'special_disposal' | null;
  hazardDecisionId?: string | null;
  /** v4.0, sección 7: operador responsable, cantidad recibida con su unidad, condición y discrepancia. */
  operatorEntityId?: string | null;
  receivedQuantity?: number | null;
  receivedUnit?: OutputUnit | null;
  condition?: string | null;
  discrepancyNote?: string | null;
  receivedBy?: string | null;
  quantityCheck?: QuantityCheck | null;
}

export type BatchState =
  | 'open'
  | 'closed'
  | 'held'
  | 'processed'
  | 'under_verification'
  | 'approved'
  | 'rejected'
  | 'partially_dispatched'
  | 'fully_dispatched';
export type OutputUnit = 't' | 'm3';

export interface BatchOutputs {
  unit: OutputUnit;
  aggregate: number;
  metal: number;
  specialDisposal: number;
  rejects: number;
  /** v4.0, sección 7: entrada procesada (misma unidad) y método de separación o trituración. */
  input?: number | null;
  method?: string | null;
  evidencePhotoId?: string | null;
}

export interface Batch {
  id: string;
  code: string;
  centerId: string;
  periodStart: string;
  periodEnd: string;
  state: BatchState;
  previousState?: BatchState | null;
  receptionIds: string[];
  outputs?: BatchOutputs | null;
  qualityVerificationId?: string | null;
  qualityResult?: 'approved' | 'rejected' | null;
  hazardDecisionIds: string[];
  dispatchIds: string[];
  openedAt: string;
  closedAt?: string | null;
  heldAt?: string | null;
  processedAt?: string | null;
  verifiedAt?: string | null;
}

export interface HazardDecision {
  id: string;
  batchId: string;
  receptionIds: string[];
  checklist: Record<string, boolean>;
  decision: 'release' | 'special_disposal';
  justification: string;
  evaluatorId: string;
  entityId: string;
  createdAt: string;
}

export interface QualityVerification {
  id: string;
  batchId: string;
  checklist: Record<string, boolean>;
  result: 'approved' | 'rejected';
  justification: string;
  evaluatorId: string;
  entityId: string;
  documentId?: string | null;
  createdAt: string;
  /** Ensayos registrados por el evaluador (v4.0). */
  tests?: QualityTest[];
}

export type WorkUseType = 'road_base' | 'sidewalks' | 'curbs' | 'blocks' | 'fill' | 'other';

export interface Work {
  id: string;
  code: string;
  name: string;
  useType: WorkUseType;
  locality: string;
  sectorId?: string | null;
  dateOfUse?: string | null;
  qrCode: string;
  entityId: string;
  useRecordedAt?: string | null;
  dispatchIds: string[];
  createdAt: string;
  /** Código del QR fijo impreso en la entrada de la obra. */
  gateCode?: string | null;
  location?: GeoPoint | null;
}

export type DispatchState = 'pending' | 'received' | 'discrepancy';

export interface Dispatch {
  id: string;
  code: string;
  batchId: string;
  workId: string;
  quantity: number;
  unit: OutputUnit;
  quantityReceived?: number | null;
  state: DispatchState;
  createdAt: string;
  receivedAt?: string | null;
  note?: string | null;
}

export type ClosureType = 'removal' | 'work';
export type SatisfactionAnswer = 'yes' | 'somewhat' | 'no';

export interface Closure {
  id: string;
  originId: string;
  type: ClosureType;
  sentAt: string;
  citizenResponse: 'confirmed' | 'disputed' | 'no_response';
  respondedAt?: string | null;
  satisfactionAnswer?: SatisfactionAnswer | null;
  comment?: string | null;
  workId?: string | null;
  batchId?: string | null;
}

export interface DailySummary {
  id: string;
  entityId: string;
  centerId: string;
  date: string;
  tripsReceived: number;
  officialTonnes?: number | null;
  /** Volumen oficial reportado (m³). Las toneladas oficiales no se pesan: equivalen a m³ × 1,1. */
  officialM3?: number | null;
  /** Historial de partida cargado desde el reporte oficial (datos simulados basados en cifras oficiales). */
  baseline?: boolean;
  note?: string | null;
  createdAt: string;
}

export interface JobsRecord {
  id: string;
  entityId: string;
  centerId?: string | null;
  positions: number;
  type: 'direct' | 'indirect';
  date: string;
  createdAt: string;
}

export type ObservedObjectType = 'origin' | 'trip' | 'batch' | 'work';

export interface Observation {
  id: string;
  authorId: string;
  entityId: string;
  objectType: ObservedObjectType;
  objectId: string;
  text: string;
  isAlert: boolean;
  createdAt: string;
}

export interface Lesson {
  id: string;
  order: number;
  title: string;
  content: string;
  imageUrl?: string | null;
  question: string;
  options: string[];
  correctIndex: number;
  validationStatus: 'pending' | 'validated';
  provisional: boolean;
}

export interface LessonCompletion {
  id: string;
  userId: string;
  lessonId: string;
  correct: boolean;
  completedAt: string;
}

export interface MonitorRequest {
  id: string;
  userId: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  decidedAt?: string | null;
  decidedBy?: string | null;
}

export interface Alert {
  id: string;
  kind: 'origin_no_trip' | 'trip_no_arrival' | 'batch_held' | 'dispatch_unconfirmed' | 'observation' | 'dispute' | 'manual_review' | 'route_alert' | 'device_alert' | 'gate_alert';
  objectType: ObservedObjectType;
  objectId: string;
  text: string;
  createdAt: string;
  resolvedAt?: string | null;
  sectorId?: string | null;
}

export interface Photo {
  id: string;
  url: string;
  uploadedBy?: string | null;
  kind: 'origin' | 'trip_departure' | 'trip_arrival' | 'reception' | 'before' | 'after' | 'selfie' | 'on_site' | 'evidence' | 'document' | 'voice' | 'other';
  moderation: 'pending' | 'approved' | 'rejected';
  location?: GeoPoint | null;
  takenAt?: string | null;
  uploadedAt: string;
  unreadable?: boolean;
}

export interface Notification {
  id: string;
  recipientKey: string; // user:<id> | origin:<code> | role:<role>:<entityId?>
  kind: string;
  text: string;
  link?: string | null;
  createdAt: string;
  readAt?: string | null;
  originCode?: string | null;
  sectorName?: string | null;
}

export interface AuraTextEntry {
  key: string;
  label: string;
  variants: string[];
}

export interface PreregistrationCode {
  code: string;
  alias: string;
  used: boolean;
  userId?: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Eventos (5.19 / 5.20)
// ---------------------------------------------------------------------------

export type ChainObjectType = 'origin' | 'trip' | 'batch' | 'work' | 'user' | 'center' | 'system';

export interface KEvent {
  id: string;
  seq: number;
  type: string;
  objectType: ChainObjectType;
  objectId: string;
  chainId: string;
  actorId: string | null;
  actorRole: Role | 'system' | null;
  entityId: string | null;
  deviceTime: string;
  serverTime: string;
  data: Record<string, unknown>;
  correctedEventId?: string | null;
  prevHash: string;
  contentHash: string;
  hash: string;
  inconsistentTime: boolean;
  offlineQueuedAt?: string | null;
}

export interface ChainVerification {
  chainId: string;
  status: 'intact' | 'altered';
  checked: number;
  brokenAt?: { eventId: string; seq: number; type: string; reason: string } | null;
}

// ---------------------------------------------------------------------------
// Configuración (sección 17)
// ---------------------------------------------------------------------------

export interface TransitionRule {
  object: 'origin' | 'trip' | 'batch';
  action: string;
  from: string[];
  to: string;
  roles: (Role | 'system')[];
  conditions: string[];
  description?: string;
}

export interface PointsConfig {
  finalClosure: number;
  onSiteVerification: number;
  reportValidated: number;
  removalConfirmed: number;
  lessonCompleted: number;
  /** Referido: solo cuando el primer reporte de la persona invitada se valida. Nunca al registrarse. */
  referralValidated: number;
  rejectionPenalty: number;
  suspensionAfterRejections: number;
  suspensionDays: number;
}

export interface LevelConfig {
  key: string;
  name: string;
  threshold: number;
}

export interface AppConfig {
  branding: { entityName: string; logoUrl: string | null; tagline: string; provisional: boolean };
  demoMode: boolean;
  simulatedDataLabel: string;
  batchPeriodDays: number;
  thresholds: {
    duplicateDistanceM: number;
    duplicateWindowDays: number;
    timeSkewMinutes: number;
    tripArrivalDeadlineHours: number;
    dailyReportLimit: number;
  };
  escalation: {
    originNoTripDays: number;
    tripNoArrivalHours: number;
    batchHeldDays: number;
    dispatchUnconfirmedDays: number;
  };
  points: PointsConfig;
  levels: LevelConfig[];
  complaintChannelUrl: string;
  hazardChecklist: { key: string; label: string; provisional: boolean }[];
  qualityChecklist: { key: string; label: string; provisional: boolean }[];
  transitions: TransitionRule[];
  provisionalFlags: Record<string, boolean>;
  /** Funciones activables por el administrador principal (addendum, partes 1 y 4). */
  features: Record<string, boolean>;
  /** Contenido de Ayuda. Vacío = pendiente de publicación. */
  help?: { about: string; privacy: string; contact: string; updatedAt: string | null };
  /** Plazos de conservación aprobados por nivel de clasificación. Sin valor = pendiente. */
  retention?: Partial<Record<InfoClassification, { period: string; legalBasis: string; approvalReference: string; updatedAt: string } | null>>;
  /** Aprobación formal del esquema de puntos y niveles (v4.0, sección 29). */
  incentives?: { status: 'pending' | 'approved'; reference: string | null; approvedAt: string | null; approvedBy: string | null };
  /** Seguimiento de rutas y puntos de control (addendum v1.3). Umbrales configurables. */
  tracking: TrackingConfig;
}

export interface TrackingConfig {
  /** Cada cuántos segundos envía posición el teléfono del escolta (30 a 60). */
  intervalSeconds: number;
  /** Perímetro alrededor de cada origen y centro (m). */
  geofenceM: number;
  /** Parada no declarada fuera de perímetro que genera alerta (minutos). */
  stopAlertMinutes: number;
  /** Desvío de la ruta planificada que genera alerta (m). */
  deviationM: number;
  /** Viaje que dura más de este factor por el tiempo esperado genera alerta. */
  durationFactor: number;
  /** Velocidad media para estimar tiempos cuando no hay ruta calculada (km/h). */
  averageSpeedKmh: number;
}

// ---------------------------------------------------------------------------
// Tarjeta Kindra, logros y referidos (addendum, partes 1 y 2)
// ---------------------------------------------------------------------------

export type AchievementLayer = 'personal' | 'community';

export interface Achievement {
  key: string;
  layer: AchievementLayer;
  name: string;
  description: string;
  earned: boolean;
  earnedAt?: string | null;
  progress?: { current: number; target: number } | null;
}

export interface KindraCard {
  cardCode: string;
  alias: string;
  levelName: string;
  points: number;
  memberSince: string;
  verified: boolean;
  roles: Role[];
  entityName: string | null;
  spaceName: string | null;
  verifyUrl: string;
  qrSvg: string;
}

export interface ReferralSummary {
  referralCode: string;
  shareUrl: string;
  invited: number;
  validated: number;
  pointsEarned: number;
}

// ---------------------------------------------------------------------------
// Vistas calculadas (ficha, tablero)
// ---------------------------------------------------------------------------

export interface RecordField {
  index: number;
  label: string;
  value: string | null;
  complete: boolean;
  details?: Record<string, unknown>;
}

export interface TraceabilityRecord {
  origin: Origin;
  sectorName: string;
  fields: RecordField[];
  completeness: number;
  history: EventView[];
  chains: string[];
  trips: Trip[];
  batches: Batch[];
  works: Work[];
  closures: Closure[];
  photos: Photo[];
  isPublicVersion: boolean;
  publicUrl: string;
}

export interface EventView {
  id: string;
  seq: number;
  type: string;
  label: string;
  entityName: string | null;
  userAlias: string | null;
  serverTime: string;
  deviceTime: string;
  inconsistentTime: boolean;
  photoUrl?: string | null;
  data: Record<string, unknown>;
  chainId: string;
  correctedEventId?: string | null;
  hash: string;
}

export interface SourcedFigure<T = number> {
  value: T;
  source: string;
  asOf: string | null;
  explanation: string;
  label?: string;
}

// ---------------------------------------------------------------------------
// Especificación v4.0 (23 nov 2026): reportes operativos, solicitudes de información, clasificación
// ---------------------------------------------------------------------------

/** Indicador de cabecera de un reporte operativo (cifra reportada en una fecha, no un dato en vivo). */
export interface ReportIndicator {
  key: string;
  label: string;
  value: number | null;
  unit: string | null;
  /** Desglose tal como lo trae el reporte (p. ej. frentes por operador). */
  breakdown?: { label: string; value: number }[];
}

/**
 * Fila del reporte operativo por CDT. Una fila = un centro físico + un operador.
 * null = el reporte muestra un guion ("—"): no hay cifra; nunca se convierte en cero.
 */
export interface ReportSnapshotRow {
  id: string;
  /** Etiqueta tal como aparece en el reporte. */
  label: string;
  /** Centro físico canónico (un solo registro por sitio). null = sitio por confirmar. */
  facilityId: string | null;
  /** Motivo por el que la fila no está vinculada a un centro físico. */
  facilityPending?: string | null;
  /** Operador u organización responsable. null = el reporte no indica operador. */
  operatorEntityId: string | null;
  m3Today: number | null;
  m3Accumulated: number | null;
  tonnesToday: number | null;
  tonnesAccumulated: number | null;
}

export interface ReportSnapshotTotals {
  m3Today: number | null;
  m3Accumulated: number | null;
  tonnesToday: number | null;
  tonnesAccumulated: number | null;
}

/** Instantánea de un reporte operativo importado. Conserva la fecha y hora de la fuente. */
export interface ReportSnapshot {
  id: string;
  title: string;
  source: string;
  /** Fecha y hora del reporte en la fuente (ISO con zona horaria). */
  reportedAt: string;
  importedAt: string;
  importedBy: string | null;
  note: string;
  indicators: ReportIndicator[];
  rows: ReportSnapshotRow[];
  /** Totales tal como aparecen impresos en el reporte. */
  reportedTotals: ReportSnapshotTotals;
  /** Suma de las filas, guardada junto al total oficial. */
  rowSums?: ReportSnapshotTotals;
  /** Diferencias entre el total oficial y la suma de filas: discrepancia de la fuente, sin corregir. */
  sourceDiscrepancies?: { field: keyof ReportSnapshotTotals; official: number | null; rowSum: number | null }[];
  /** Versión de los datos entregados por el cliente. */
  revision?: number;
}

/** Niveles de clasificación de la información (sección 9). */
export type InfoClassification = 'public' | 'restricted' | 'confidential' | 'critical';

export type InfoRequestStatus = 'submitted' | 'under_review' | 'released' | 'partially_released' | 'denied' | 'closed';

/** Solicitud de información: se registra, se clasifica y la decide una persona autorizada (nunca el sistema). */
export interface InfoRequest {
  id: string;
  code: string;
  subject: string;
  description: string;
  /** Confidencial: solo la ven el administrador principal y la persona revisora asignada. */
  requesterName: string | null;
  requesterContact: string | null;
  requesterUserId: string | null;
  status: InfoRequestStatus;
  classification: InfoClassification | null;
  reviewerId: string | null;
  /** Qué se entregó exactamente (lista de campos o documentos) y qué se tachó. */
  releasedItems: string[];
  redactions: string | null;
  decisionNote: string | null;
  approvedBy: string | null;
  createdAt: string;
  updatedAt: string;
  history: { at: string; by: string | null; action: string; note: string | null }[];
}

/** Cantidad recibida en el centro frente a la despachada. La cifra original nunca se sobrescribe. */
export interface QuantityCheck {
  dispatched: number | null;
  received: number;
  unit: OutputUnit;
  /** recibido − despachado; null si no son comparables (distinta unidad o sin dato de salida). */
  difference: number | null;
  flagged: boolean;
}

/** Ensayo técnico dentro de la verificación de calidad (v4.0, sección 7). */
export interface QualityTest {
  testType: string;
  method: string;
  date: string;
  result: string;
  unit: string;
  laboratory: string | null;
}

export type PickupUnit = 'l' | 'kg' | 't' | 'm3';
export type PickupStatus = 'submitted' | 'new' | 'assigned' | 'en_route' | 'arrived' | 'collected' | 'received' | 'completed' | 'issue' | 'cancelled';

/**
 * Solicitud de recolección (v4.0, 17.2 y 17.6). No duplica la operación: usa el código del origen (LG-…)
 * y, al recolectar, queda vinculada al mismo viaje que confirma el centro.
 */
export interface PickupRequest {
  id: string;
  /** Código canónico del origen. */
  code: string;
  originId: string | null;
  module: 'debris' | 'oil';
  status: PickupStatus;
  /** Entidad de retiro cuyos conductores pueden tomar la solicitud. */
  operatorEntityId: string | null;
  /** Quien solicita (hogar o comercio); null si la creó la coordinación desde un origen. */
  requesterUserId: string | null;
  businessId: string | null;
  address: string | null;
  location: GeoPoint | null;
  sectorId: string | null;
  photoIds: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  material: string;
  estimatedQuantity: number;
  unit: PickupUnit;
  /** Día y ventana horaria solicitados. */
  date: string;
  windowFrom: string;
  windowTo: string;
  centerId: string | null;
  instructions: string | null;
  handlingNotes: string | null;
  driverId: string | null;
  acceptedAt: string | null;
  tripId: string | null;
  collected: { quantity: number; unit: PickupUnit; photoId: string; note: string | null; at: string } | null;
  /** Recepción directa en el centro (módulos sin viaje de escombros). En escombros la determina el viaje. */
  received: { quantity: number; unit: PickupUnit; condition: string | null; by: string; at: string; check: { dispatched: number | null; difference: number | null; flagged: boolean } } | null;
  validatedBy: string | null;
  validatedAt: string | null;
  rejections: { driverId: string; reason: PickupRejectReason; note: string | null; at: string }[];
  issue: { by: string; text: string; at: string } | null;
  history: { at: string; by: string | null; action: string; note: string | null }[];
}

export type PickupRejectReason = 'vehicle_unavailable' | 'schedule_conflict' | 'unsafe_access' | 'outside_area' | 'other';

export interface RiskEntry {
  id: string;
  description: string;
  affected: string;
  likelihood: number;
  impact: number;
  score: number;
  mitigation: string;
  owner: string;
  reviewDate: string;
  status: 'open' | 'in_progress' | 'resolved';
  /** Un control no se da por resuelto hasta haberse probado. */
  controlTestedAt: string | null;
  controlTestNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SecurityIncident {
  id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'contained' | 'investigating' | 'escalated' | 'closed';
  createdAt: string;
  updatedAt: string;
  history: { at: string; by: string | null; status: string; note: string }[];
}

/** Solicitud de recuperación de acceso: la atiende el administrador; la respuesta pública nunca revela si la cuenta existe. */
export interface RecoveryRequest {
  id: string;
  userId: string;
  createdAt: string;
  status: 'pending' | 'done';
  resolvedAt: string | null;
}

// ---------------------------------------------------------------------------
// Perfiles de la PWA (v4.0, sección 25)
// ---------------------------------------------------------------------------

export type GroupKind = 'community' | 'coastal';

export interface Group {
  id: string;
  kind: GroupKind;
  name: string;
  region: string;
  sectorId: string | null;
  description: string;
  contact: string | null;
  active: boolean;
  isDemo?: boolean;
  createdAt: string;
}

export interface Membership {
  id: string;
  groupId: string;
  userId: string;
  role: 'leader' | 'member';
  status: 'invited' | 'requested' | 'active' | 'left';
  createdAt: string;
  updatedAt: string;
}

export interface GroupActivity {
  id: string;
  groupId: string;
  title: string;
  date: string;
  time: string;
  place: string;
  meetingPoint: string;
  instructions: string | null;
  capacity: number | null;
  status: 'draft' | 'published' | 'completed' | 'cancelled';
  /** Asistencia y horas declaradas por quien lidera; cuentan solo cuando la coordinación valida la actividad. */
  participants: { userId: string; attended: boolean | null; hours: number | null }[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  validatedBy: string | null;
  validatedAt: string | null;
}

export type WasteReportStatus = 'submitted' | 'under_review' | 'validated' | 'rejected';

export interface WasteReport {
  id: string;
  code: string;
  groupId: string;
  activityId: string | null;
  kind: 'observation' | 'collection';
  category: 'plastic' | 'glass' | 'metal' | 'organic' | 'mixed' | 'other';
  quantity: number | null;
  unit: 'kg' | 't' | 'm3' | null;
  place: string;
  location: GeoPoint | null;
  date: string;
  description: string;
  photoIds: string[];
  status: WasteReportStatus;
  reportedBy: string;
  createdAt: string;
  updatedAt: string;
  /** Cantidad confirmada por la coordinación. La reportada nunca se sobrescribe. */
  validatedQuantity: number | null;
  validatedBy: string | null;
  validatedAt: string | null;
  reviewNote: string | null;
}

export interface Business {
  id: string;
  name: string;
  category: string;
  address: string;
  sectorId: string | null;
  contact: string | null;
  openingHours: string;
  collectionPoint: { acceptedMaterials: string[]; storageInstructions: string; status: 'active' | 'paused'; location: GeoPoint | null };
  active: boolean;
  isDemo?: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Definición que debe estar completa y aprobada antes de activar un módulo futuro (v4.0, sección 2). */
export interface ModuleDefinition {
  id: string;
  workflow: string;
  dataFields: string;
  units: string;
  validationRules: string;
  roles: string;
  risks: string;
  approvalReference: string;
  updatedBy: string | null;
  updatedAt: string;
}

/** Sugerencia de IA sobre una foto: no vale hasta que una persona autorizada la confirma. */
export interface AiSuggestion {
  id: string;
  photoId: string;
  requestedBy: string;
  createdAt: string;
  model: string;
  suggestion: { showsDebris: boolean; subcategory: Subcategory | null; confidence: 'low' | 'medium' | 'high'; visibleText: string; note: string };
  status: 'suggested' | 'accepted' | 'changed' | 'discarded';
  decidedBy: string | null;
  decidedAt: string | null;
  finalSubcategory: Subcategory | null;
}

// ---------------------------------------------------------------------------
// v4.0: correcciones pedidas, noticias, revisiones
// ---------------------------------------------------------------------------

export interface CorrectionRequest {
  id: string;
  batchId: string;
  note: string;
  requestedBy: string;
  createdAt: string;
  status: 'open' | 'resolved';
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

export interface NewsItem {
  id: string;
  kind: 'news' | 'campaign';
  title: string;
  body: string;
  /** Vacío = para todas las personas. */
  audience: Role[];
  published: boolean;
  publishedAt: string;
  updatedAt: string;
}

export interface ReportAssignment {
  id: string;
  userId: string | null;
  escalatedAt: string | null;
  note: string | null;
  updatedAt: string;
}

export interface ReviewLog {
  id: string;
  key: string;
  note: string;
  userId: string | null;
  doneAt: string;
}
