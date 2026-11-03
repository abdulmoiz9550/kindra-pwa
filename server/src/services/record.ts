import type { Origin, TraceabilityRecord, RecordField, EventView, KEvent, Trip, Batch, Work, Closure, Photo } from '@kindra/shared';
import { EVENT_LABELS, SUBCATEGORY_LABELS, USE_TYPE_LABELS, SIZE_LABELS, SATISFACTION_LABELS, type EventType } from '@kindra/shared';
import { db } from '../core/db';
import { chainIdOf, verifyChains } from '../core/events';
import { env } from '../config/env';
import { photosByIds } from './photos';
import { isPublished } from './publication';

function fmtDate(iso?: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-VE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Caracas' });
}

/** Objetos vinculados a un origen: viajes, lotes y obras. */
export function linkedObjects(o: Origin): { trips: Trip[]; batches: Batch[]; works: Work[]; closures: Closure[] } {
  const store = db();
  const trips = o.tripIds.map((id) => store.get('trips', id)).filter(Boolean) as Trip[];
  const batchIds = new Set<string>(o.batchIds);
  for (const t of trips) if (t.receptionId) {
    const r = store.get('receptions', t.receptionId);
    if (r) batchIds.add(r.batchId);
  }
  const batches = [...batchIds].map((id) => store.get('batches', id)).filter(Boolean) as Batch[];
  const workIds = new Set<string>(o.workIds);
  for (const b of batches) for (const did of b.dispatchIds) {
    const d = store.get('dispatches', did);
    if (d && d.state !== 'pending') workIds.add(d.workId);
  }
  const works = [...workIds].map((id) => store.get('works', id)).filter(Boolean) as Work[];
  const closures = store.filter('closures', (c) => c.originId === o.id);
  return { trips, batches, works, closures };
}

export function chainsOf(o: Origin): string[] {
  const { trips, batches, works } = linkedObjects(o);
  return [chainIdOf('origin', o.id), ...trips.map((t) => chainIdOf('trip', t.id)), ...batches.map((b) => chainIdOf('batch', b.id)), ...works.map((w) => chainIdOf('work', w.id))];
}

export function eventView(e: KEvent, publicVersion: boolean): EventView {
  const store = db();
  const entity = e.entityId ? store.get('entities', e.entityId) : undefined;
  const user = e.actorId ? store.get('users', e.actorId) : undefined;
  const d = e.data as Record<string, any>;
  const photoId: string | undefined = d.photoId || d.evidencePhotoId || d.trip?.departure?.photoId || d.arrival?.photoId || d.afterPhotoId || d.origin?.photoIds?.[0];
  const photo = photoId ? store.get('photos', photoId) : undefined;
  const photoUrl = photo && (!publicVersion || photo.moderation === 'approved') ? photo.url : null;
  let data: Record<string, unknown> = {};
  if (!publicVersion) data = summarizeData(e);
  else data = summarizeData(e, true);
  return {
    id: e.id,
    seq: e.seq,
    type: e.type,
    label: EVENT_LABELS[e.type as EventType] || e.type,
    entityName: entity?.name ?? (e.actorRole === 'system' ? 'Plataforma' : e.actorRole === 'citizen' ? 'Ciudadano' : null),
    userAlias: publicVersion ? null : user?.alias ?? (e.actorRole === 'citizen' ? (d.origin?.anonymous ? 'anónimo' : 'reportante') : e.actorRole === 'system' ? 'sistema' : null),
    serverTime: e.serverTime,
    deviceTime: e.deviceTime,
    inconsistentTime: e.inconsistentTime,
    photoUrl,
    data,
    chainId: e.chainId,
    correctedEventId: e.correctedEventId ?? null,
    hash: e.hash,
  };
}

function summarizeData(e: KEvent, pub = false): Record<string, unknown> {
  const d = e.data as Record<string, any>;
  const out: Record<string, unknown> = {};
  switch (e.type) {
    case 'origin_registered':
      out.tipo = d.origin?.type === 'citizen' ? 'Reporte ciudadano' : 'Origen institucional';
      out.tamaño = d.origin?.size ? SIZE_LABELS[d.origin.size as keyof typeof SIZE_LABELS] : undefined;
      if (!pub) out.ubicación = d.origin?.street || (d.origin?.location ? `${d.origin.location.lat.toFixed(5)}, ${d.origin.location.lng.toFixed(5)}` : undefined);
      break;
    case 'origin_rejected':
      out.motivo = d.reason;
      if (d.note) out.nota = d.note;
      break;
    case 'origin_marked_duplicate':
      out.principal = d.mainCode;
      break;
    case 'priority_set':
      out.prioridad = d.priority;
      break;
    case 'trip_departure':
      out.viaje = d.trip?.code;
      out.volumenEstimadoM3 = d.trip?.estimatedVolumeM3;
      break;
    case 'reception_classified':
      out.clasificación = SUBCATEGORY_LABELS[d.subcategory as keyof typeof SUBCATEGORY_LABELS] || d.subcategory;
      break;
    case 'hazard_decided':
      out.decisión = d.decision?.decision === 'release' ? 'Liberado' : 'Desviado a disposición especial';
      if (!pub) out.justificación = d.decision?.justification;
      break;
    case 'outputs_recorded':
      out.salidas = d.outputs;
      break;
    case 'quality_verified':
      out.resultado = d.verification?.result === 'approved' ? 'Aprobado' : 'Rechazado';
      if (!pub) out.justificación = d.verification?.justification;
      break;
    case 'dispatch_created':
      out.cantidad = `${d.dispatch?.quantity} ${d.dispatch?.unit}`;
      break;
    case 'dispatch_received':
    case 'dispatch_discrepancy':
      out.despachado = d.quantityDispatched;
      out.recibido = d.quantityReceived;
      break;
    case 'use_recorded':
      out.uso = USE_TYPE_LABELS[d.useType as keyof typeof USE_TYPE_LABELS] || d.useType;
      out.localidad = d.locality;
      break;
    case 'satisfaction_answered':
      out.respuesta = SATISFACTION_LABELS[d.answer as keyof typeof SATISFACTION_LABELS] || d.answer;
      break;
    case 'dispute_resolved':
      out.resultado = d.result === 'removed' ? 'Retiro confirmado con evidencia' : 'Devuelto a retiro';
      break;
    case 'correction':
      out.motivo = d.reason;
      out.cambios = d.patch;
      break;
    case 'observation_recorded':
      out.texto = d.observation?.text;
      out.alerta = d.observation?.isAlert ? 'Sí' : 'No';
      break;
    case 'escalation_alert':
      out.alerta = d.alert?.text;
      break;
    default:
      break;
  }
  return out;
}

/** 11. Ficha de trazabilidad: siete campos, completitud, historial, cadenas. */
export function buildRecord(o: Origin, opts: { publicVersion: boolean }): TraceabilityRecord {
  const store = db();
  const sector = store.get('sectors', o.sectorId);
  const { trips, batches, works, closures } = linkedObjects(o);
  const pub = opts.publicVersion;

  const firstTrip = [...trips].sort((a, b) => (a.departure.serverTime < b.departure.serverTime ? -1 : 1))[0];
  const removalEntity = firstTrip ? store.get('entities', firstTrip.departure.entityId) : undefined;
  const centers = [...new Set(trips.map((t) => t.centerId))].map((id) => store.get('centers', id)).filter(Boolean);
  const receptions = trips.map((t) => (t.receptionId ? store.get('receptions', t.receptionId) : undefined)).filter(Boolean);
  const classified = receptions.filter((r) => r!.subcategory);
  const hazardSuspected = receptions.some((r) => r!.subcategory === 'possible_hazardous');
  const hazardDecisions = receptions.map((r) => r!.hazardDecision).filter(Boolean);
  const qualityResults = batches.filter((b) => b.qualityResult).map((b) => ({ code: b.code, result: b.qualityResult }));
  const usedWorks = works.filter((w) => w.useRecordedAt);
  const specialDisposal = hazardDecisions.includes('special_disposal');
  const rejectedBatches = batches.filter((b) => b.qualityResult === 'rejected');
  const removalClosure = closures.find((c) => c.type === 'removal');
  const workClosure = closures.find((c) => c.type === 'work');

  const locationText = pub ? `Sector ${sector?.name || ''}` : o.street ? `${o.street}${o.reference ? ` (${o.reference})` : ''}` : o.location ? `${o.location.lat.toFixed(5)}, ${o.location.lng.toFixed(5)}` : `Sector ${sector?.name || ''}`;

  const fields: RecordField[] = [
    { index: 1, label: 'Ubicación y fecha del origen', value: `${locationText} · ${fmtDate(o.date)}`, complete: true, details: { sector: sector?.name, date: o.date } },
    { index: 2, label: 'Entidad de retiro y fecha', value: firstTrip ? `${removalEntity?.name || 'Entidad de retiro'} · ${fmtDate(firstTrip.departure.serverTime)}` : null, complete: !!firstTrip, details: { entity: removalEntity?.name, date: firstTrip?.departure.serverTime, trips: trips.length } },
    { index: 3, label: 'Centro de destino', value: centers.length ? centers.map((c) => c!.name).join(', ') : null, complete: centers.length > 0 && trips.some((t) => t.state === 'received'), details: { centers: centers.map((c) => c!.name), received: trips.filter((t) => t.state === 'received').length } },
    { index: 4, label: 'Clasificación del material y sospecha de material peligroso', value: classified.length ? `${[...new Set(classified.map((r) => SUBCATEGORY_LABELS[r!.subcategory!]))].join(', ')} · ${hazardSuspected ? `Se sospechó material peligroso${hazardDecisions.length ? ` (decisión: ${hazardDecisions.map((h) => (h === 'release' ? 'liberado' : 'disposición especial')).join(', ')})` : ' (pendiente de decisión)'}` : 'Sin sospecha de material peligroso'}` : null, complete: classified.length > 0, details: { hazardSuspected, hazardDecisions } },
    { index: 5, label: 'Resultado de la verificación de calidad', value: qualityResults.length ? qualityResults.map((q) => `${q.code}: ${q.result === 'approved' ? 'aprobado' : 'rechazado'}`).join(' · ') : null, complete: qualityResults.length > 0, details: { qualityResults } },
    { index: 6, label: 'Uso final o disposición', value: usedWorks.length ? usedWorks.map((w) => `${USE_TYPE_LABELS[w.useType]} en ${w.locality}`).join(' · ') : specialDisposal ? 'Material desviado a disposición especial' : rejectedBatches.length ? 'Lote rechazado: agregado enviado al centro de disposición final' : null, complete: usedWorks.length > 0 || specialDisposal || rejectedBatches.length > 0, details: { works: usedWorks.map((w) => ({ code: w.code, name: w.name, useType: w.useType, locality: w.locality })) } },
    { index: 7, label: 'Confirmación del ciudadano', value: removalClosure ? (removalClosure.citizenResponse === 'confirmed' ? `Retiro confirmado${workClosure?.satisfactionAnswer ? ` · Satisfacción: ${SATISFACTION_LABELS[workClosure.satisfactionAnswer]}` : ''}` : removalClosure.citizenResponse === 'disputed' ? 'El ciudadano disputó el retiro' : 'Sin respuesta todavía') : null, complete: removalClosure?.citizenResponse === 'confirmed', details: { removalResponse: removalClosure?.citizenResponse ?? null, satisfaction: workClosure?.satisfactionAnswer ?? null } },
  ];

  const chains = chainsOf(o);
  const events = chains.flatMap((c) => store.eventsOfChain(c)).sort((a, b) => a.seq - b.seq);
  const history = events
    .filter((e) => !pub || isPublished(e.entityId, 'observations') || e.type !== 'observation_recorded')
    .map((e) => eventView(e, pub));

  const publicOrigin: Origin = pub
    ? { ...o, location: null, street: null, reference: null, reporterId: null, reporterName: null, voiceNoteId: null, linkedReporterKeys: [] }
    : o;

  const photoIds = [...o.photoIds, ...(o.afterPhotoId ? [o.afterPhotoId] : []), ...(o.verifiedOnSitePhotoId ? [o.verifiedOnSitePhotoId] : []), ...(o.disputeEvidencePhotoId ? [o.disputeEvidencePhotoId] : [])];
  const photos: Photo[] = photosByIds(photoIds, pub);

  return {
    origin: publicOrigin,
    sectorName: sector?.name || '',
    fields,
    completeness: fields.filter((f) => f.complete).length,
    history,
    chains,
    trips: pub ? trips.map((t) => ({ ...t, departure: { ...t.departure, userId: '', location: null }, arrival: t.arrival ? { ...t.arrival, userId: '', location: null } : null })) : trips,
    batches,
    works,
    closures,
    photos,
    isPublicVersion: pub,
    publicUrl: `${env.publicBaseUrl}/publico/ficha/${o.code}`,
  };
}

export function recordCompleteness(o: Origin): number {
  return buildRecord(o, { publicVersion: true }).completeness;
}

export function verifyRecord(o: Origin) {
  return verifyChains(chainsOf(o));
}

/** 11.5 exportación CSV con los siete campos y el historial. */
export function recordToCsv(r: TraceabilityRecord): string {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines: string[] = [];
  lines.push('sección,campo,valor');
  lines.push(['ficha', 'código', r.origin.code].map(esc).join(','));
  lines.push(['ficha', 'sector', r.sectorName].map(esc).join(','));
  lines.push(['ficha', 'completitud', `${r.completeness}/7`].map(esc).join(','));
  for (const f of r.fields) lines.push(['campo', `${f.index}. ${f.label}`, f.value ?? ''].map(esc).join(','));
  lines.push('');
  lines.push('historial_seq,tipo,descripción,entidad,usuario,hora_servidor,hora_dispositivo,hora_inconsistente,hash');
  for (const h of r.history) lines.push([h.seq, h.type, h.label, h.entityName ?? '', h.userAlias ?? '', h.serverTime, h.deviceTime, h.inconsistentTime ? 'sí' : 'no', h.hash].map(esc).join(','));
  return lines.join('\n');
}
