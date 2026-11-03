import QRCode from 'qrcode';
import type { Batch, Work } from '@kindra/shared';
import { USE_TYPE_LABELS, KINDRA_TAGLINE } from '@kindra/shared';
import { db, type Certificate } from '../core/db';
import { chainIdOf } from '../core/events';
import { env } from '../config/env';
import { batchComposition, dispatchedQuantity, getBatchOrThrow } from './batches';
import { workComposition, getWorkOrThrow } from './works';
import { getConfig } from './config';
import { isPublished } from './publication';
import { notFound } from '../core/errors';

export const MASS_BALANCE_TEXT = 'El material de esta obra proviene de lotes que reunieron escombro de varios sectores; estos son los sectores y su participación.';

/** 13.1 Página pública de lote. */
export function batchPage(code: string) {
  const store = db();
  const b: Batch = getBatchOrThrow(code);
  const center = store.get('centers', b.centerId);
  const centerEntity = center && store.get('entities', center.entityId);
  const figuresPublic = isPublished(center?.entityId, 'officialFigures', b.processedAt);
  const qv = b.qualityVerificationId ? store.get('qualityVerifications', b.qualityVerificationId) : null;
  const works = b.dispatchIds
    .map((id) => store.get('dispatches', id))
    .filter(Boolean)
    .map((d) => {
      const w = store.get('works', d!.workId);
      return w ? { code: w.code, name: w.name, useType: USE_TYPE_LABELS[w.useType], locality: w.locality, quantity: d!.quantity, unit: d!.unit, state: d!.state } : null;
    })
    .filter(Boolean);
  return {
    code: b.code,
    state: b.state,
    center: center ? { name: center.name, type: center.type, entity: centerEntity?.name ?? null } : null,
    period: { start: b.periodStart, end: b.periodEnd },
    composition: batchComposition(b),
    outputs: figuresPublic ? b.outputs : null,
    outputsWithheld: !figuresPublic && !!b.outputs,
    dispatched: figuresPublic ? dispatchedQuantity(b) : null,
    quality: qv ? { result: qv.result, at: qv.createdAt, entity: store.get('entities', qv.entityId)?.name ?? null } : null,
    hazard: { suspected: b.receptionIds.some((rid) => store.get('receptions', rid)?.subcategory === 'possible_hazardous'), decisions: b.hazardDecisionIds.map((id) => store.get('hazardDecisions', id)?.decision).filter(Boolean) },
    receptions: b.receptionIds.length,
    works,
    chainId: chainIdOf('batch', b.id),
    publicUrl: `${env.publicBaseUrl}/publico/lote/${b.code}`,
    branding: brandingBlock(),
  };
}

/** 13.2 Página pública de obra: el momento de cierre de toda la plataforma. */
export function workPage(code: string) {
  const store = db();
  const w: Work = getWorkOrThrow(code);
  const dispatches = w.dispatchIds.map((id) => store.get('dispatches', id)).filter(Boolean);
  const batches = dispatches.map((d) => store.get('batches', d!.batchId)).filter(Boolean) as Batch[];
  const entityChain: { role: string; name: string }[] = [];
  const seen = new Set<string>();
  const pushEntity = (role: string, id?: string | null) => {
    const e = id ? store.get('entities', id) : undefined;
    if (!e || seen.has(`${role}:${e.id}`)) return;
    seen.add(`${role}:${e.id}`);
    entityChain.push({ role, name: e.name });
  };
  const coord = store.find('entities', (e) => e.type === 'coordinating');
  pushEntity('Coordinación', coord?.id);
  for (const b of batches) {
    for (const rid of b.receptionIds) {
      const t = store.get('trips', store.get('receptions', rid)?.tripId || '');
      if (t) pushEntity('Retiro', t.departure.entityId);
    }
    const c = store.get('centers', b.centerId);
    pushEntity('Centro de disposición', c?.entityId);
    const qv = b.qualityVerificationId ? store.get('qualityVerifications', b.qualityVerificationId) : null;
    pushEntity('Verificación técnica', qv?.entityId);
  }
  pushEntity('Destino final', w.entityId);
  return {
    code: w.code,
    name: w.name,
    useType: USE_TYPE_LABELS[w.useType],
    locality: w.locality,
    dateOfUse: w.dateOfUse ?? w.useRecordedAt ?? null,
    useRecorded: !!w.useRecordedAt,
    batches: batches.map((b) => {
      const d = dispatches.find((x) => x!.batchId === b.id)!;
      return { code: b.code, center: store.get('centers', b.centerId)?.name ?? null, quantity: d.quantity, received: d.quantityReceived, unit: d.unit, state: d.state, quality: b.qualityResult, composition: batchComposition(b) };
    }),
    composition: workComposition(w),
    entityChain,
    massBalanceText: MASS_BALANCE_TEXT,
    chainId: chainIdOf('work', w.id),
    chainIds: [chainIdOf('work', w.id), ...batches.map((b) => chainIdOf('batch', b.id))],
    publicUrl: `${env.publicBaseUrl}/publico/obra/${w.code}`,
    qrCode: w.qrCode,
    branding: brandingBlock(),
  };
}

export function brandingBlock() {
  const cfg = getConfig();
  return { entityName: cfg.branding.entityName, logoUrl: cfg.branding.logoUrl, tagline: KINDRA_TAGLINE, simulatedLabel: cfg.demoMode ? cfg.simulatedDataLabel : null };
}

/** 13.3 QR imprimible en SVG. kind: lote | obra | ficha | sector | vehiculo | certificado */
export async function qrSvg(kind: string, code: string): Promise<string> {
  const base = env.publicBaseUrl;
  const urls: Record<string, string> = {
    lote: `${base}/publico/lote/${code}`,
    obra: `${base}/publico/obra/${code}`,
    ficha: `${base}/publico/ficha/${code}`,
    sector: `${base}/tablero?sector=${code}`,
    vehiculo: code,
    certificado: `${base}/publico/certificado/${code}`,
    tablero: `${base}/tablero`,
  };
  const target = urls[kind];
  if (!target) throw notFound('Tipo de QR desconocido.');
  return QRCode.toString(target, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, width: 512 });
}

export function qrTarget(kind: string, code: string): string {
  const base = env.publicBaseUrl;
  return ({ lote: `${base}/publico/lote/${code}`, obra: `${base}/publico/obra/${code}`, ficha: `${base}/publico/ficha/${code}`, sector: `${base}/tablero?sector=${code}`, certificado: `${base}/publico/certificado/${code}`, tablero: `${base}/tablero`, vehiculo: code } as Record<string, string>)[kind] || base;
}

/** 9.7 verificación pública de certificado. */
export function certificatePage(code: string): (Certificate & { valid: true; branding: ReturnType<typeof brandingBlock>; sample: boolean }) | { valid: false } {
  const c = db().find('certificates', (x) => x.code === code.trim().toUpperCase());
  if (!c) return { valid: false };
  return { ...c, valid: true, branding: brandingBlock(), sample: true };
}
