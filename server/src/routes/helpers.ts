import type { Origin } from '@kindra/shared';
import { effectiveOriginState, ORIGIN_STATE_LABELS } from '@kindra/shared';
import { db } from '../core/db';
import { originStatusView } from '../services/origins';
import { allowedActions } from '../core/transitions';
import { recordCompleteness } from '../services/record';

/** Vista de origen para paneles institucionales. */
export function originView(o: Origin, role?: string) {
  const store = db();
  const sector = store.get('sectors', o.sectorId);
  const reporter = o.reporterId ? store.get('users', o.reporterId) : undefined;
  const state = effectiveOriginState(o);
  const photos = o.photoIds.map((id) => store.get('photos', id)).filter(Boolean);
  const lastTrip = o.tripIds.length ? store.get('trips', o.tripIds[o.tripIds.length - 1]) : undefined;
  const removalClosure = store.find('closures', (c) => c.originId === o.id && c.type === 'removal');
  return {
    ...o,
    sectorName: sector?.name ?? null,
    sectorAuthorized: sector?.authorized ?? true,
    effectiveState: state,
    stateLabel: ORIGIN_STATE_LABELS[state],
    reporterAlias: o.anonymous ? null : reporter?.alias ?? o.reporterName ?? null,
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
  };
}
