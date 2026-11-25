import { DEFAULT_HELP } from './helpTexts';
import type { AppConfig } from '@kindra/shared';
import { DEFAULT_FEATURES } from '@kindra/shared';
import { DEFAULT_TRANSITIONS } from './transitions';

export const DEFAULT_CONFIG: AppConfig = {
  branding: {
    entityName: 'Ente Coordinador',
    logoUrl: null,
    tagline: 'Trazabilidad del retiro de escombros en La Guaira: lo que se reporta se sigue hasta convertirse en otra obra pública.',
    provisional: true,
  },
  demoMode: true,
  simulatedDataLabel: 'Datos simulados para demostración',
  batchPeriodDays: 7,
  thresholds: {
    duplicateDistanceM: 30,
    duplicateWindowDays: 7,
    timeSkewMinutes: 30,
    tripArrivalDeadlineHours: 6,
    dailyReportLimit: 5,
  },
  escalation: {
    originNoTripDays: 5,
    tripNoArrivalHours: 6,
    batchHeldDays: 3,
    dispatchUnconfirmedDays: 3,
  },
  points: {
    finalClosure: 20,
    onSiteVerification: 15,
    reportValidated: 10,
    removalConfirmed: 10,
    lessonCompleted: 5,
    referralValidated: 10,
    rejectionPenalty: 10,
    suspensionAfterRejections: 3,
    suspensionDays: 7,
  },
  // Niveles comunes de Kindra para todos los módulos (addendum v1.3, reemplaza 9.3). Umbrales provisionales.
  levels: [
    { key: 'activo', name: 'Recolector Activo', threshold: 0 },
    { key: 'destacado', name: 'Recolector Destacado', threshold: 100 },
    { key: 'embajador', name: 'Embajador Kindra', threshold: 300 },
  ],
  complaintChannelUrl: '',
  help: DEFAULT_HELP,
  hazardChecklist: [
    { key: 'fiber_cement', label: 'Aspecto de fibrocemento o lámina corrugada', provisional: true },
    { key: 'chemical_containers', label: 'Presencia de envases químicos', provisional: true },
    { key: 'abnormal_smell_color', label: 'Olor o color anormal', provisional: true },
    { key: 'other', label: 'Otro', provisional: true },
  ],
  qualityChecklist: [
    { key: 'grading', label: 'Granulometría conforme', provisional: true },
    { key: 'no_contaminants', label: 'Sin contaminantes visibles', provisional: true },
    { key: 'no_organic', label: 'Sin material orgánico', provisional: true },
    { key: 'other', label: 'Otro', provisional: true },
  ],
  transitions: DEFAULT_TRANSITIONS,
  provisionalFlags: {
    sectors: true,
    vehicleCapacities: true,
    hazardChecklist: true,
    qualityChecklist: true,
    lessons: true,
    auraTexts: true,
    thresholds: true,
    points: true,
    branding: true,
  },
  features: { ...DEFAULT_FEATURES },
  tracking: {
    intervalSeconds: 30,
    geofenceM: 150,
    stopAlertMinutes: 5,
    deviationM: 500,
    durationFactor: 1.5,
    averageSpeedKmh: 25,
  },
};
