import type { Center, Entity, Sector, User } from '@kindra/shared';
import { DEFAULT_SPACE_ID } from '@kindra/shared';
import { db } from '../core/db';
import { newId, nowIso } from '../core/ids';
import { hashPassword } from '../services/auth';
import { newCardCode, newReferralCode } from '../services/referrals';

/**
 * Arranque real, sin datos simulados: solo sobre una base vacía, con DEMO_MODE=false y SEED_ON_EMPTY=false.
 * Crea los cuatro sitios confirmados, las dos zonas provisionales, los operadores genéricos y la primera cuenta
 * de administración (ADMIN_ALIAS y ADMIN_PASSWORD). No crea orígenes, viajes, lotes ni usuarios de prueba.
 */
export function startClean(alias: string, password: string): boolean {
  const store = db();
  if (store.count('users') || store.count('origins') || store.allEvents().length) return false;
  if (password.length < 12) throw new Error('ADMIN_PASSWORD debe tener al menos 12 caracteres.');
  const ent = (id: string, name: string, type: Entity['type'], legalType: Entity['legalType']) =>
    store.put('entities', { id, name, type, description: '', logoUrl: null, active: true, legalType, taxId: null, spaceId: DEFAULT_SPACE_ID, publicationPolicy: { officialFigures: { mode: 'public' }, discrepancies: { mode: 'public' }, photos: { mode: 'public' }, observations: { mode: 'public' } } });
  ent('en_coord', 'Ente Coordinador', 'coordinating', 'public_institution');
  ent('en_cnorte', 'Operador Contratista', 'center', 'company');
  ent('en_csur', 'Operador Público', 'center', 'public_institution');
  ent('en_cfinal', 'Operador por confirmar', 'center', 'public_institution');
  const sec = (id: string, name: string, polygon: Sector['polygon']) => store.put('sectors', { id, name, parish: 'Parroquia piloto (provisional)', polygon, authorized: true, provisional: true, spaceId: DEFAULT_SPACE_ID });
  sec('sc_este', 'Zona Este, Caraballeda (provisional)', [[10.63, -66.875], [10.63, -66.82], [10.595, -66.82], [10.595, -66.875]]);
  sec('sc_oeste', 'Zona Oeste, Catia La Mar (provisional)', [[10.625, -67.035], [10.625, -66.99], [10.575, -66.99], [10.575, -67.035]]);
  // Las ubicaciones exactas las completa ensureReportSnapshots con los datos confirmados.
  const cen = (id: string, name: string, shortCode: string, type: Center['type'], sectorId: string, entityId: string) => store.put('centers', { id, name, shortCode, type, sectorId, entityId, location: null, operatorEntityIds: [] });
  cen('ce_norte', 'Caraballeda', 'CARAB', 'CDT', 'sc_este', 'en_cnorte');
  cen('ce_sur', 'Playa Escondida', 'PESC', 'CDT', 'sc_este', 'en_cnorte');
  cen('ce_playa_grande', 'Playa Grande', 'PGC6', 'CDT', 'sc_oeste', 'en_cnorte');
  cen('ce_final', 'Santa Eduvigis (Parque Tecnológico Ambiental)', 'SEDUV', 'CDF', 'sc_oeste', 'en_cfinal');
  const admin: User = { id: newId('us'), alias, roles: ['admin', 'citizen'], entityId: null, centerId: null, sectorId: null, verificationStatus: 'verified', passwordHash: hashPassword(password), active: true, createdAt: nowIso(), cardCode: newCardCode(), referralCode: newReferralCode() } as User;
  store.put('users', admin);
  return true;
}
