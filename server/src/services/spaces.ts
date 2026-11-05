import type { Space, Origin, User, Entity } from '@kindra/shared';
import { DEFAULT_SPACE_ID } from '@kindra/shared';
import { db } from '../core/db';
import { newId, nowIso } from '../core/ids';
import { badRequest, notFound } from '../core/errors';

/**
 * Espacios por convenio (27.1). Entidades, usuarios, sectores y registros quedan vinculados a un espacio
 * para sumar nuevos convenios sin rehacer nada. Lo que no tiene espacio pertenece al espacio principal.
 */
export function ensureDefaultSpace(): Space {
  const store = db();
  const existing = store.get('spaces', DEFAULT_SPACE_ID);
  if (existing) return existing;
  return store.put('spaces', {
    id: DEFAULT_SPACE_ID,
    name: 'Convenio La Guaira: escombros',
    description: 'Retiro y trazabilidad circular de escombros en La Guaira.',
    agreementRef: null,
    active: true,
    createdAt: nowIso(),
  });
}

export function listSpaces(): Space[] {
  ensureDefaultSpace();
  return db()
    .list('spaces')
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

export function upsertSpace(input: { id?: string; name: string; description: string; agreementRef?: string | null; active?: boolean }): Space {
  const store = db();
  const existing = input.id ? store.get('spaces', input.id) : undefined;
  if (input.id && !existing) throw notFound('El espacio no existe.');
  if (!input.name?.trim()) throw badRequest('El nombre del espacio es obligatorio.');
  if (existing?.id === DEFAULT_SPACE_ID && input.active === false) throw badRequest('El espacio principal no se puede desactivar.');
  return store.put('spaces', {
    id: existing?.id || newId('sp'),
    name: input.name.trim(),
    description: input.description?.trim() || '',
    agreementRef: input.agreementRef?.trim() || null,
    active: input.active ?? existing?.active ?? true,
    createdAt: existing?.createdAt || nowIso(),
  });
}

export function assertSpace(spaceId: string | null | undefined): string {
  const id = spaceId || DEFAULT_SPACE_ID;
  if (id === DEFAULT_SPACE_ID) {
    ensureDefaultSpace();
    return id;
  }
  if (!db().get('spaces', id)) throw badRequest('El espacio indicado no existe.');
  return id;
}

export function spaceOfSector(sectorId: string | null | undefined): string {
  const s = sectorId ? db().get('sectors', sectorId) : undefined;
  return s?.spaceId || DEFAULT_SPACE_ID;
}

export function spaceOfOrigin(o: Origin): string {
  return o.spaceId || spaceOfSector(o.sectorId);
}

export const spaceOfUser = (u: User) => u.spaceId || DEFAULT_SPACE_ID;
export const spaceOfEntity = (e: Entity) => e.spaceId || DEFAULT_SPACE_ID;

export function spaceName(id: string | null | undefined): string | null {
  return db().get('spaces', id || DEFAULT_SPACE_ID)?.name ?? null;
}

/** Cuántos objetos usan cada espacio (para el panel). */
export function spaceUsage(): Record<string, { entities: number; users: number; sectors: number; origins: number }> {
  const store = db();
  const out: Record<string, { entities: number; users: number; sectors: number; origins: number }> = {};
  const bump = (id: string, k: 'entities' | 'users' | 'sectors' | 'origins') => {
    out[id] ||= { entities: 0, users: 0, sectors: 0, origins: 0 };
    out[id][k]++;
  };
  for (const e of store.list('entities')) bump(spaceOfEntity(e), 'entities');
  for (const u of store.list('users')) bump(spaceOfUser(u), 'users');
  for (const s of store.list('sectors')) bump(s.spaceId || DEFAULT_SPACE_ID, 'sectors');
  for (const o of store.list('origins')) bump(spaceOfOrigin(o), 'origins');
  return out;
}
