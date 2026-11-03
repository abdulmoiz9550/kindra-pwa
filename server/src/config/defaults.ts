import type { AppConfig } from '@kindra/shared';
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
    rejectionPenalty: 10,
    suspensionAfterRejections: 3,
    suspensionDays: 7,
  },
  levels: [
    { key: 'informado', name: 'Vecino informado', threshold: 0 },
    { key: 'participante', name: 'Vecino participante', threshold: 50 },
    { key: 'vigilante', name: 'Vecino vigilante', threshold: 150 },
    { key: 'contralor', name: 'Contralor comunitario', threshold: 300 },
  ],
  complaintChannelUrl: '',
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
};
