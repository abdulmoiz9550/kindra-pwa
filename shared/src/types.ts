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
  | 'admin';

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
}

export interface Center {
  id: string;
  name: string;
  shortCode: string;
  type: 'CDT' | 'CDF';
  sectorId: string;
  entityId: string;
  location?: GeoPoint | null;
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
  kind: 'origin_no_trip' | 'trip_no_arrival' | 'batch_held' | 'dispatch_unconfirmed' | 'observation' | 'dispute' | 'manual_review';
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
