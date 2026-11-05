import QRCode from 'qrcode';
import type { KindraCard, User, Achievement } from '@kindra/shared';
import { ROLE_LABELS, stageOf } from '@kindra/shared';
import { db } from '../core/db';
import { env } from '../config/env';
import { notFound } from '../core/errors';
import { computePoints, type PointsSummary } from './points';
import { ensureUserCodes, newCardCode } from './referrals';
import { spaceName, spaceOfUser } from './spaces';

/**
 * Tarjeta Kindra (addendum, parte 1): la misma tarjeta y el mismo QR personal e intransferible para cada usuario.
 * El QR apunta a una página pública que solo muestra datos no sensibles. Si se pierde, se regenera
 * y el QR anterior deja de valer.
 */
export const cardVerifyUrl = (code: string) => `${env.publicBaseUrl}/publico/tarjeta/${code}`;

export async function cardFor(user: User): Promise<KindraCard> {
  const u = ensureUserCodes(user);
  const pts = computePoints(u.id);
  const entity = u.entityId ? db().get('entities', u.entityId) : undefined;
  const verifyUrl = cardVerifyUrl(u.cardCode!);
  return {
    cardCode: u.cardCode!,
    alias: u.alias,
    levelName: pts.level.name,
    points: pts.points,
    memberSince: u.createdAt,
    verified: u.verificationStatus === 'verified',
    roles: u.roles,
    entityName: entity?.name ?? null,
    spaceName: spaceName(spaceOfUser(u)),
    verifyUrl,
    qrSvg: await QRCode.toString(verifyUrl, { type: 'svg', margin: 1, width: 320, errorCorrectionLevel: 'M' }),
  };
}

export function regenerateCard(user: User): User {
  return db().update('users', user.id, { cardCode: newCardCode() });
}

/** Lo que muestra el QR al escanearlo: sin teléfono, nombre real ni foto. */
export function publicCard(code: string) {
  const u = db().find('users', (x) => x.cardCode === code.trim().toUpperCase());
  if (!u) throw notFound('Esta tarjeta no existe o fue reemplazada por una nueva.');
  const pts = computePoints(u.id);
  const entity = u.entityId ? db().get('entities', u.entityId) : undefined;
  return {
    cardCode: u.cardCode,
    alias: u.alias,
    active: u.active,
    levelName: pts.level.name,
    memberSince: u.createdAt,
    identityVerified: u.verificationStatus === 'verified',
    roles: u.roles.map((r) => ROLE_LABELS[r]),
    entityName: entity?.name ?? null,
    spaceName: spaceName(spaceOfUser(u)),
  };
}

// ---------------------------------------------------------------- logros en dos capas

interface PersonalDef {
  key: string;
  name: string;
  description: string;
  counter: keyof PointsSummary['milestones'];
  target: number;
}

const PERSONAL: PersonalDef[] = [
  { key: 'first_validated', name: 'Primer reporte validado', description: 'El coordinador confirmó uno de tus reportes.', counter: 'validatedReports', target: 1 },
  { key: 'trusted_reporter', name: 'Reportes confiables', description: 'Cinco reportes tuyos fueron validados.', counter: 'validatedReports', target: 5 },
  { key: 'removal_confirmed', name: 'Retiro confirmado', description: 'Confirmaste que retiraron el escombro de un reporte tuyo.', counter: 'confirmedRemovals', target: 1 },
  { key: 'full_cycle', name: 'Ciclo completo', description: 'El material de un reporte tuyo llegó a una obra pública.', counter: 'closedReports', target: 1 },
  { key: 'all_lessons', name: 'Aprendizaje completo', description: 'Completaste todas las lecciones sobre escombros.', counter: 'lessonsCompleted', target: 5 },
  { key: 'on_site', name: 'Verificación en sitio', description: 'Verificaste un origen en tu sector como contralor comunitario.', counter: 'onSiteVerifications', target: 1 },
  { key: 'referral', name: 'Vecino que suma', description: 'Una persona que invitaste tuvo su primer reporte validado.', counter: 'validatedReferrals', target: 1 },
];

/**
 * Logros (addendum, parte 1: dos capas).
 * Capa personal: hechos verificados de la persona. Capa comunitaria: avance real de su sector de residencia (9.6).
 * Se derivan de la bitácora, nunca se guardan. Sin rachas ni premios por cantidad de reportes (9.4).
 */
export function achievementsFor(user: User): { personal: Achievement[]; community: Achievement[]; sectorName: string | null } {
  const store = db();
  const pts = computePoints(user.id);
  const lessonsTotal = Math.max(1, store.count('lessons'));
  const personal: Achievement[] = PERSONAL.map((d) => {
    const target = d.key === 'all_lessons' ? lessonsTotal : d.target;
    const list = pts.milestones[d.counter];
    const earned = list.length >= target;
    const description = d.key === 'all_lessons' ? `Completaste las ${lessonsTotal} lecciones sobre escombros.` : d.description;
    return { key: d.key, layer: 'personal', name: d.name, description, earned, earnedAt: earned ? list[target - 1] : null, progress: { current: Math.min(list.length, target), target } };
  });

  const sector = user.sectorId ? store.get('sectors', user.sectorId) : undefined;
  if (!sector) return { personal, community: [], sectorName: null };
  const os = store.filter('origins', (o) => o.sectorId === sector.id && !['rejected', 'duplicate'].includes(o.state));
  const removed = os.filter((o) => stageOf(o.state) >= stageOf('removed') || (o.state === 'disputed' && stageOf(o.preDisputeState || '') >= stageOf('removed')));
  const inWork = os.filter((o) => o.state === 'in_work' || o.state === 'closed');
  const sortedTimes = (arr: (string | null | undefined)[]) => arr.filter((x): x is string => !!x).sort();
  const removedTimes = sortedTimes(removed.map((o) => o.removedAt || o.inBatchAt || o.inWorkAt || o.closedAt));
  const workTimes = sortedTimes(inWork.map((o) => o.inWorkAt || o.closedAt));
  const pct = os.length ? Math.round((removed.length / os.length) * 100) : 0;
  const mk = (key: string, name: string, description: string, current: number, target: number, times: string[]): Achievement => ({
    key,
    layer: 'community',
    name,
    description,
    earned: current >= target,
    earnedAt: current >= target ? times[target - 1] ?? null : null,
    progress: { current: Math.min(current, target), target },
  });
  const community: Achievement[] = [
    mk('sector_first_removal', 'Primer retiro del sector', `Se retiró el primer punto de escombro en ${sector.name}.`, removed.length, 1, removedTimes),
    mk('sector_ten_removed', 'Diez puntos despejados', `Diez puntos de ${sector.name} ya fueron retirados.`, removed.length, 10, removedTimes),
    mk('sector_first_work', 'Material del sector en una obra', `Material de ${sector.name} ya se usó en una obra pública.`, inWork.length, 1, workTimes),
    {
      key: 'sector_half',
      layer: 'community',
      name: 'Mitad del camino',
      description: `La mitad de los puntos reportados en ${sector.name} ya fueron retirados.`,
      earned: os.length > 0 && pct >= 50,
      earnedAt: null,
      progress: { current: Math.min(pct, 50), target: 50 },
    },
  ];
  return { personal, community, sectorName: sector.name };
}
