import { useState } from 'react';
import type { Role, User, Entity, Center, Sector, Photo, VerificationStatus } from '@kindra/shared';
import { ROLES, ROLE_LABELS, INSTITUTIONAL_ROLES } from '@kindra/shared';
import { Card, Button, Field, Input, Select, Badge, Modal, Spinner, Tabs } from '../../components/ui';
import { Section, useAdminList, useAdminAction } from './shared';

type UserRow = Omit<User, 'passwordHash'>;

interface Draft {
  id?: string;
  alias: string;
  name: string;
  phone: string;
  roles: Role[];
  entityId: string;
  centerId: string;
  sectorId: string;
  password: string;
  active: boolean;
  verificationStatus: VerificationStatus;
}

const EMPTY: Draft = { alias: '', name: '', phone: '', roles: ['citizen'], entityId: '', centerId: '', sectorId: '', password: '', active: true, verificationStatus: 'not_required' };

const VERIF_LABEL: Record<VerificationStatus, string> = { not_required: 'no requerida', pending: 'pendiente', verified: 'verificado', rejected: 'rechazada' };

export default function Users() {
  const users = useAdminList<UserRow>('users');
  const entities = useAdminList<Entity>('entities');
  const centers = useAdminList<Center>('centers');
  const sectors = useAdminList<Sector>('sectors');
  const photos = useAdminList<Photo>('photos?moderation=all');
  const { post, busy } = useAdminAction();
  const [tab, setTab] = useState<'all' | 'pending'>('all');
  const [editing, setEditing] = useState<Draft | null>(null);

  const list = (users.data || []).filter((u) => tab === 'all' || u.verificationStatus === 'pending');
  const selfieOf = (u: UserRow) => (u.selfiePhotoId ? photos.data?.find((p) => p.id === u.selfiePhotoId) : photos.data?.find((p) => p.kind === 'selfie' && p.uploadedBy === u.id));

  const edit = (u?: UserRow) =>
    setEditing(u ? { id: u.id, alias: u.alias, name: u.name || '', phone: u.phone || '', roles: u.roles, entityId: u.entityId || '', centerId: u.centerId || '', sectorId: u.sectorId || '', password: '', active: u.active, verificationStatus: u.verificationStatus } : { ...EMPTY });

  const save = async () => {
    if (!editing) return;
    const body = { ...editing, entityId: editing.entityId || null, centerId: editing.centerId || null, sectorId: editing.sectorId || null, password: editing.password || undefined, name: editing.name || undefined, phone: editing.phone || undefined };
    const r = await post('users', body, 'Usuario guardado.');
    if (r) setEditing(null);
  };

  const toggleRole = (r: Role) => editing && setEditing({ ...editing, roles: editing.roles.includes(r) ? editing.roles.filter((x) => x !== r) : [...editing.roles, r] });
  const institutional = editing?.roles.some((r) => INSTITUTIONAL_ROLES.includes(r));

  return (
    <Section title="Usuarios y activación de roles" subtitle="Una persona, una cuenta, varios roles. Los roles institucionales y el de contralor requieren verificación por selfie. El evaluador nunca se autoasigna: lo activa el administrador tras la designación de la entidad." actions={<Button onClick={() => edit()}>Nuevo usuario</Button>}>
      <Tabs value={tab} onChange={setTab} items={[{ value: 'all', label: 'Todos', count: users.data?.length }, { value: 'pending', label: 'Verificación pendiente', count: users.data?.filter((u) => u.verificationStatus === 'pending').length }]} />
      {users.isLoading && <Spinner />}
      <ul className="grid md:grid-cols-2 gap-3 mt-2">
        {list.map((u) => {
          const selfie = selfieOf(u);
          return (
            <li key={u.id}>
              <Card
                title={
                  <span>
                    {u.alias} {u.isDemo && <Badge tone="info" icon={false}>prueba</Badge>}
                  </span>
                }
                subtitle={`${u.name || ''}${u.phone ? ` · ${u.phone}` : ''}`}
                actions={
                  <Button variant="ghost" size="sm" onClick={() => edit(u)}>
                    Editar
                  </Button>
                }
              >
                <div className="flex flex-wrap gap-1 mb-2">
                  {u.roles.map((r) => (
                    <Badge key={r} tone="primary" icon={false}>
                      {ROLE_LABELS[r]}
                    </Badge>
                  ))}
                  <Badge tone={u.verificationStatus === 'verified' ? 'ok' : u.verificationStatus === 'pending' ? 'warn' : 'neutral'}>Verificación: {VERIF_LABEL[u.verificationStatus]}</Badge>
                  {!u.active && <Badge tone="bad">inactivo</Badge>}
                </div>
                <p className="text-xs text-muted">
                  {u.entityId ? `Entidad: ${entities.data?.find((e) => e.id === u.entityId)?.name || u.entityId}` : 'Sin entidad'}
                  {u.centerId ? ` · Centro: ${centers.data?.find((c) => c.id === u.centerId)?.name || u.centerId}` : ''}
                </p>
                {u.verificationStatus === 'pending' && (
                  <div className="mt-2 flex items-center gap-2">
                    {selfie ? <img src={selfie.url} alt={`Selfie de ${u.alias}`} className="h-16 w-16 rounded-lg object-cover border border-line" /> : <span className="text-xs text-muted">Sin selfie adjunta</span>}
                    <Button size="sm" disabled={busy} onClick={() => post(`users/${u.id}/verification`, { status: 'verified' }, 'Usuario verificado.')}>
                      Verificar
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => post(`users/${u.id}/verification`, { status: 'rejected' }, 'Verificación rechazada.')}>
                      Rechazar
                    </Button>
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Editar usuario' : 'Nuevo usuario'} wide>
        {editing && (
          <div>
            <div className="grid sm:grid-cols-2 sm:gap-3">
              <Field label="Alias público" required>
                <Input value={editing.alias} onChange={(e) => setEditing({ ...editing, alias: e.target.value })} />
              </Field>
              <Field label="Nombre">
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </Field>
              <Field label="Teléfono">
                <Input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
              </Field>
              <Field label={editing.id ? 'Nueva contraseña (opcional)' : 'Contraseña inicial'} required={!editing.id}>
                <Input type="password" value={editing.password} onChange={(e) => setEditing({ ...editing, password: e.target.value })} autoComplete="new-password" />
              </Field>
            </div>
            <fieldset className="mb-4">
              <legend className="label">Roles</legend>
              <div className="flex flex-wrap gap-2">
                {ROLES.map((r) => (
                  <label key={r} className={`chip cursor-pointer ${editing.roles.includes(r) ? 'chip-active' : ''}`}>
                    <input type="checkbox" className="sr-only" checked={editing.roles.includes(r)} onChange={() => toggleRole(r)} /> {ROLE_LABELS[r]}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid sm:grid-cols-3 sm:gap-3">
              <Field label="Entidad" required={institutional}>
                <Select value={editing.entityId} onChange={(e) => setEditing({ ...editing, entityId: e.target.value })}>
                  <option value="">Sin entidad</option>
                  {(entities.data || []).map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Centro asignado" required={editing.roles.includes('center')}>
                <Select value={editing.centerId} onChange={(e) => setEditing({ ...editing, centerId: e.target.value })}>
                  <option value="">Sin centro</option>
                  {(centers.data || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Sector de residencia">
                <Select value={editing.sectorId} onChange={(e) => setEditing({ ...editing, sectorId: e.target.value })}>
                  <option value="">Sin sector</option>
                  {(sectors.data || []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="grid sm:grid-cols-2 sm:gap-3">
              <Field label="Estado de verificación">
                <Select value={editing.verificationStatus} onChange={(e) => setEditing({ ...editing, verificationStatus: e.target.value as VerificationStatus })}>
                  {(Object.keys(VERIF_LABEL) as VerificationStatus[]).map((v) => (
                    <option key={v} value={v}>
                      {VERIF_LABEL[v]}
                    </option>
                  ))}
                </Select>
              </Field>
              <label className="flex items-center gap-2 text-sm mt-7">
                <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> Cuenta activa
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button onClick={save} disabled={busy}>
                Guardar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Section>
  );
}
