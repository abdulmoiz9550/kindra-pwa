import { decryptField } from '../services/secureField';
import type { Origin } from '@kindra/shared';
import { effectiveOriginState, ORIGIN_STATE_LABELS } from '@kindra/shared';
import { db } from '../core/db';
import { originStatusView, reportStatus } from '../services/origins';
import { allowedActions } from '../core/transitions';
import { recordCompleteness } from '../services/record';
import { isCorrected } from '../services/ops';

/** Vista de origen para paneles institucionales. */
export function originView(o: Origin, role?: string) {
  const store = db();
  const sector = store.get('sectors', o.sectorId);
  const reporter = o.reporterId ? store.get('users', o.reporterId) : undefined;
  const state = effectiveOriginState(o);
  const photos = o.photoIds.map((id) => store.get('photos', id)).filter(Boolean);
  const lastTrip = o.tripIds.length ? store.get('trips', o.tripIds[o.tripIds.length - 1]) : undefined;
  const removalClosure = store.find('closures', (c) => c.originId === o.id && c.type === 'removal');
  const hideReporter = role === 'supervisor' || role === 'monitor';
  // Addendum v4.2, sección 7: la ubicación exacta de un reporte ciudadano es dato restringido.
  const hideLocation = o.type === 'citizen' && !!role && !['coordinator', 'removal', 'driver', 'monitor', 'admin'].includes(role);
  return {
    ...o,
    ...(hideReporter ? { reporterId: null, reporterName: null, linkedReporterKeys: [] } : {}),
    // El teléfono de quien reporta es confidencial: solo la coordinación lo ve para contactar.
    reporterPhone: role === 'coordinator' ? decryptField(o.reporterPhone) : null,
    ...(hideLocation ? { location: null, confirmedLocation: null, street: null } : {}),
    reportStatus: o.type === 'citizen' ? reportStatus(o) : null,
    lotCodes: (o.lotIds ?? []).map((id) => store.get('origins', id)?.code).filter(Boolean),
    sectorName: sector?.name ?? null,
    sectorAuthorized: sector?.authorized ?? true,
    effectiveState: state,
    stateLabel: ORIGIN_STATE_LABELS[state],
    reporterAlias: hideReporter || o.anonymous ? null : reporter?.alias ?? o.reporterName ?? null,
    photos: photos.map((p) => ({ id: p!.id, url: p!.url, moderation: p!.moderation, unreadable: !!p!.unreadable })),
    afterPhotoUrl: o.afterPhotoId ? store.get('photos', o.afterPhotoId)?.url ?? null : null,
    onSitePhotoUrl: o.verifiedOnSitePhotoId ? store.get('photos', o.verifiedOnSitePhotoId)?.url ?? null : null,
    evidencePhotoUrl: o.disputeEvidencePhotoId ? store.get('photos', o.disputeEvidencePhotoId)?.url ?? null : null,
    voiceNoteUrl: o.voiceNoteId ? store.get('photos', o.voiceNoteId)?.url ?? null : null,
    lastCenterName: lastTrip ? store.get('centers', lastTrip.centerId)?.name ?? null : null,
    possibleDuplicateCode: o.possibleDuplicateOfId ? store.get('origins', o.possibleDuplicateOfId)?.code ?? null : null,
    duplicateOfCode: o.duplicateOfId ? store.get('origins', o.duplicateOfId)?.code ?? null : null,
    linkedCodes: o.linkedOriginIds.map((id) => store.get('origins', id)?.code).filter(Boolean),
    removalResponse: removalClosure?.citizenResponse ?? null,
    completeness: recordCompleteness(o),
    corrected: isCorrected('origin', o.id),
    allowedActions: role ? allowedActions('origin', o.state, role) : [],
    status: originStatusView(o),
  };
}

export function citizenOriginView(o: Origin) {
  const v = originView(o);
  return {
    code: v.code,
    sectorName: v.sectorName,
    effectiveState: v.effectiveState,
    stateLabel: v.stateLabel,
    plain: v.status.plain,
    createdAt: v.createdAt,
    priority: v.priority,
    completeness: v.completeness,
    pendingRemovalConfirmation: v.status.pendingRemovalConfirmation,
    pendingSatisfaction: v.status.pendingSatisfaction,
    photoRetakeRequested: !!v.photoRetakeRequested,
    manualReview: !!v.manualReview,
    anonymous: v.anonymous,
    duplicateOfCode: v.duplicateOfCode,
    photoUrl: v.photos[0]?.url ?? null,
    reportStatus: v.reportStatus,
    lotCodes: v.lotCodes,
  };
}
