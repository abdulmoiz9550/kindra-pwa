import type { Origin, OriginEffectiveState, Trip, Batch, Reception, Dispatch, Work, HazardDecision, QualityVerification, Alert, Observation, EventView, OriginPriority } from '@kindra/shared';

export interface OriginView extends Origin {
  sectorName: string | null;
  sectorAuthorized: boolean;
  effectiveState: OriginEffectiveState;
  stateLabel: string;
  reporterAlias: string | null;
  photos: { id: string; url: string; moderation: string; unreadable: boolean }[];
  afterPhotoUrl: string | null;
  onSitePhotoUrl: string | null;
  evidencePhotoUrl: string | null;
  voiceNoteUrl: string | null;
  lastCenterName: string | null;
  possibleDuplicateCode: string | null;
  duplicateOfCode: string | null;
  linkedCodes: string[];
  removalResponse: string | null;
  completeness: number;
  allowedActions: string[];
  status: { plain: string; label: string; center: string; priority: OriginPriority | null; pendingRemovalConfirmation: boolean; pendingSatisfaction: boolean };
}

export interface TripView extends Trip {
  vehiclePlate: string | null;
  vehicleType: string | null;
  centerName: string | null;
  originCodes: string[];
  sectorNames: string[];
  departurePhotoUrl: string | null;
  arrivalPhotoUrl: string | null;
  departureEntityName: string | null;
}

export interface SectorShare {
  sectorId: string;
  sectorName: string;
  weight: number;
  share: number;
  trips: number;
}

export interface ReceptionView extends Reception {
  tripCode: string | null;
  originCodes: string[];
  sectorNames: string[];
  photoUrl: string | null;
}

export interface BatchView extends Batch {
  centerName: string | null;
  composition: SectorShare[];
  receptions: ReceptionView[];
  hazardDecisions: HazardDecision[];
  qualityVerification: QualityVerification | null;
  dispatches: (Dispatch & { workCode: string | null; workName: string | null })[];
  dispatchedQuantity: number;
  pendingHazard: number;
  unclassified: number;
}

export interface WorkView extends Work {
  entityName: string | null;
  sectorName: string | null;
  dispatches: (Dispatch & { batchCode: string | null; centerName: string | null })[];
  composition: SectorShare[];
  totalReceived: number;
  unit: string | null;
}

export interface AlertView extends Alert {
  objectCode: string | null;
  sectorName?: string | null;
}

export interface ObservationView extends Observation {
  entityName: string | null;
  objectCode: string | null;
}

export interface CoordOverview {
  inbox: { sectorId: string; sectorName: string; authorized: boolean; items: OriginView[] }[];
  origins: OriginView[];
  alerts: AlertView[];
  disputes: OriginView[];
  monitorRequests: { id: string; userId: string; alias: string | null; verificationStatus: string | null; status: string; createdAt: string }[];
  manualReview: OriginView[];
  sectors: { id: string; name: string; authorized: boolean; pendingOrigins: number }[];
  stats: { registered: number; validated: number; underRemoval: number; removed: number; disputed: number; pendingZone: number };
}

export interface RemovalOverview {
  origins: OriginView[];
  pendingZone: OriginView[];
  vehicles: { id: string; plate: string; typeId: string; typeName: string | null; capacityM3: number | null; qrCode: string; entityId: string; active: boolean }[];
  centers: { id: string; name: string; type: string }[];
  trips: TripView[];
}

export interface CenterOverview {
  center: { id: string; name: string; type: string; shortCode: string; entityName: string | null };
  inTransit: TripView[];
  noArrival: TripView[];
  received: TripView[];
  openBatch: BatchView | null;
  batches: BatchView[];
  unclassified: (Reception & { tripCode: string | null; batchCode: string | null })[];
  dispatches: (Dispatch & { batchCode: string | null; workCode: string | null; workName: string | null })[];
  works: { id: string; code: string; name: string; locality: string; useType: string; entityName: string | null }[];
  dailySummaries: { id: string; date: string; tripsReceived: number; officialTonnes: number | null }[];
  jobs: { id: string; positions: number; type: 'direct' | 'indirect'; date: string }[];
  today: { date: string; departed: number; confirmed: number };
}

export interface ChecklistItem {
  key: string;
  label: string;
  provisional: boolean;
}

export interface EvalOverview {
  centers: { centerId: string; centerName: string; held: BatchView[]; underVerification: BatchView[] }[];
  batches: BatchView[];
  decided: BatchView[];
  hazardChecklist: ChecklistItem[];
  qualityChecklist: ChecklistItem[];
}

export interface DestOverview {
  works: WorkView[];
  pendingDispatches: (Dispatch & { batchCode: string | null; centerName: string | null; workCode: string | null; workName: string | null })[];
  sectors: { id: string; name: string }[];
}

export interface SupervisorOverview {
  origins: OriginView[];
  trips: TripView[];
  batches: BatchView[];
  works: WorkView[];
  discrepancies: { centerId: string; centerName: string; day: string; departed: number; confirmed: number; difference: number }[];
  inconsistentTimes: EventView[];
  observations: ObservationView[];
  alerts: AlertView[];
  sectors: { id: string; name: string }[];
}
