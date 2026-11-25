import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { EventView, Role, User, Vehicle, VehicleType } from '@kindra/shared';
import { EVENT_LABELS, ROLE_LABELS, ENTITY_ASSIGNABLE_ROLES, LEGAL_TYPE_LABELS, ENTITY_TYPE_LABELS } from '@kindra/shared';
import { api, errorMessage } from '../../lib/api';
import { toast } from '../../lib/toast';
import { useTab } from '../../lib/useTab';
import { MapView } from '../../components/MapView';
import { TraceList, type TraceRow } from '../../components/TraceList';
import { fmtDateTime } from '../../lib/format';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, PageTitle, Select, Spinner, StatTile, Tabs, Textarea } from '../../components/ui';

type UserRow = Omit<User, 'passwordHash'>;

interface Overview {
  entity: { id: string; name: string; type: keyof typeof ENTITY_TYPE_LABELS; legalType: keyof typeof LEGAL_TYPE_LABELS | null; taxId: string | null };
  counts: { users: number; activeUsers: number; pendingVerification: number; pendingProposals: number; vehicles: number; centers: number; events30d: number };
  byType: { type: string; label: string; n: number }[];
  recent: { id: string; type: string; label: string; serverTime: string; objectType: string; objectId: string; userAlias: string | null }[];
  centers: { id: string; name: string }[];
}

interface UserDraft {
  id?: string;
  alias: string;
  name: string;
  phone: string;
  roles: Role[];
  centerId: string;
  password: string;
  active: boolean;
  email: string;
  vehicleId: string;
  operationalArea: string;
}

const EMPTY_USER: UserDraft = { alias: '', name: '', phone: '', roles: [], centerId: '', password: '', active: true, email: '', vehicleId: '', operationalArea: '' };
const VERIF: Record<string, string> = { not_required: 'no requerida', pending: 'pendiente', verified: 'verificada', rejected: 'rechazada' };

/**
 * Panel del administrador de entidad (addendum, parte 3). Gestiona solo los usuarios y las operaciones
 * de su propia entidad. No puede tocar otras entidades, funciones, reglas ni la identidad de la plataforma.
 */
export default function EntityAdmin() {
  const [tab, setTab] = useTab<'ops' | 'users' | 'facilities' | 'trace' | 'audit' | 'vehicles' | 'documents'>('ops');
  const overview = useQuery({ queryKey: ['entity-admin', 'overview'], queryFn: () => api.get<Overview>('/entity-admin/overview') });
  if (overview.isLoading) return <Spinner />;
  if (overview.error || !overview.data) return <Alert tone="bad">{overview.error ? errorMessage(overview.error) : 'No se pudo cargar el panel.'}</Alert>;
  const o = overview.data;
  return (
    <div>
      <PageTitle
        title={o.entity.name}
        subtitle={`${ENTITY_TYPE_LABELS[o.entity.type]} · ${LEGAL_TYPE_LABELS[o.entity.legalType || 'public_institution']}${o.entity.taxId ? ` · RIF ${o.entity.taxId}` : ''}. Administras solo los usuarios y las operaciones de esta entidad.`}
      />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'ops', label: 'Operaciones' },
          { value: 'users', label: 'Usuarios', count: o.counts.users },
          { value: 'facilities', label: 'Instalaciones', count: o.counts.centers },
          { value: 'trace', label: 'Trazabilidad' },
          { value: 'audit', label: 'Auditoría' },
          { value: 'vehicles', label: 'Vehículos', count: o.counts.vehicles },
          { value: 'documents', label: 'Documentos y evidencias' },
        ]}
      />
      <div className="mt-3">
        {tab === 'ops' && <Operations o={o} />}
        {tab === 'users' && <EntityUsers centers={o.centers} />}
        {tab === 'facilities' && <EntityFacilities />}
        {tab === 'trace' && <EntityTrace />}
        {tab === 'audit' && <EntityAudit />}
        {tab === 'vehicles' && <EntityVehicles />}
        {tab === 'documents' && <EntityDocuments />}
      </div>
    </div>
  );
}

function EntityFacilities() {
  const q = useQuery({ queryKey: ['entity-admin', 'facilities'], queryFn: () => api.get<{ id: string; name: string; type: string; location: { lat: number; lng: number } | null; sectorName: string | null }[]>('/entity-admin/facilities') });
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Alert tone="bad">{errorMessage(q.error)}</Alert>;
  const pts = q.data.filter((c) => c.location);
  return (
    <Card title="Instalaciones" subtitle="Coordenadas verificadas por Kindra.">
      {q.data.length === 0 ? <EmptyState title="Tu entidad no tiene instalaciones asignadas" /> : (
        <>
          {pts.length > 0 && <MapView height={260} points={pts.map((c) => ({ id: c.id, lat: c.location!.lat, lng: c.location!.lng, color: 'var(--brand-teal)', label: c.name }))} />}
          <ul className="divide-y divide-line text-sm mt-2">{q.data.map((c) => <li key={c.id} className="py-2"><strong>{c.name}</strong> · {c.type} · {c.sectorName}<span className="block text-xs text-muted">{c.location ? `${c.location.lat}, ${c.location.lng}` : 'Sin coordenadas'}</span></li>)}</ul>
        </>
      )}
    </Card>
  );
}

function EntityTrace() {
  const q = useQuery({ queryKey: ['entity-admin', 'trace'], queryFn: () => api.get<TraceRow[]>('/entity-admin/traceability') });
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Alert tone="bad">{errorMessage(q.error)}</Alert>;
  return <TraceList rows={q.data} links={false} />;
}

function EntityAudit() {
  const q = useQuery({ queryKey: ['entity-admin', 'audit'], queryFn: () => api.get<EventView[]>('/entity-admin/audit') });
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Alert tone="bad">{errorMessage(q.error)}</Alert>;
  return <Card title="Historial de tu entidad" subtitle="Últimos 300 eventos. Nadie puede editarlos ni borrarlos.">{q.data.length === 0 ? <EmptyState title="Sin eventos" /> : <ul className="divide-y divide-line text-sm">{q.data.map((e) => <li key={e.id} className="py-1.5">{EVENT_LABELS[e.type as keyof typeof EVENT_LABELS] || e.type}<span className="block text-xs text-muted">{fmtDateTime(e.serverTime)}</span></li>)}</ul>}</Card>;
}

/** Documentos y evidencias que subieron las cuentas de la entidad. */
function EntityDocuments() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['entity-admin', 'documents'], queryFn: () => api.get<{ id: string; url: string; kind: string; uploadedAt: string; by: string }[]>('/entity-admin/documents') });
  const upload = async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => no(new Error('No se pudo leer el archivo.')); r.readAsDataURL(file); });
      await api.post('/photos', { dataUrl, kind: 'document' });
      toast.success('Documento subido.');
      qc.invalidateQueries({ queryKey: ['entity-admin', 'documents'] });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Alert tone="bad">{errorMessage(q.error)}</Alert>;
  return (
    <Card title="Documentos y evidencias" subtitle="Los abre solo quien tiene permiso; cada enlace vence." actions={<label className="btn-secondary btn-sm cursor-pointer">Subir PDF o imagen<input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => upload(e.target.files?.[0])} /></label>}>
      {q.data.length === 0 ? <p className="text-sm text-muted">Todavía no hay archivos de tu entidad.</p> : <ul className="divide-y divide-line text-sm">{q.data.map((p) => <li key={p.id} className="py-2 flex justify-between gap-2"><span>{fmtDateTime(p.uploadedAt)} · {p.by}</span><a className="text-primary underline" href={p.url} target="_blank" rel="noreferrer">Abrir</a></li>)}</ul>}
    </Card>
  );
}

function Operations({ o }: { o: Overview }) {
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatTile label="Usuarios activos" value={o.counts.activeUsers} />
        <StatTile label="Verificación pendiente" value={o.counts.pendingVerification} tone={o.counts.pendingVerification ? 'warn' : undefined} />
        <StatTile label="Propuestas esperando a Kindra" value={o.counts.pendingProposals} />
        <StatTile label="Eventos en 30 días" value={o.counts.events30d} />
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <Card title="Actividad de los últimos 30 días">
          {o.byType.length ? (
            <ul className="divide-y divide-line text-sm">
              {o.byType.map((t) => (
                <li key={t.type} className="flex justify-between py-1.5">
                  <span>{t.label}</span>
                  <strong>{t.n}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Sin actividad reciente.</p>
          )}
        </Card>
        <Card title="Últimos eventos de tu entidad" subtitle="Solo lectura. Nadie puede editar ni borrar eventos.">
          {o.recent.length ? (
            <ul className="divide-y divide-line text-sm max-h-96 overflow-y-auto">
              {o.recent.map((e) => (
                <li key={e.id} className="py-1.5">
                  <span className="font-medium">{e.label}</span>
                  <span className="block text-xs text-muted">
                    {fmtDateTime(e.serverTime)}
                    {e.userAlias ? ` · ${e.userAlias}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Todavía no hay eventos.</p>
          )}
        </Card>
      </div>
    </>
  );
}

function EntityUsers({ centers }: { centers: Overview['centers'] }) {
  const qc = useQueryClient();
  const vehicles = useQuery({ queryKey: ['entity-admin', 'vehicles'], queryFn: () => api.get<{ vehicles: (Vehicle & { typeName: string | null })[]; types: VehicleType[] }>('/entity-admin/vehicles') });
  const users = useQuery({ queryKey: ['entity-admin', 'users'], queryFn: () => api.get<UserRow[]>('/entity-admin/users') });
  const [editing, setEditing] = useState<UserDraft | null>(null);
  const [proposing, setProposing] = useState<{ user: UserRow; note: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      qc.invalidateQueries({ queryKey: ['entity-admin'] });
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (!editing) return;
    const body = { ...editing, email: editing.email || null, vehicleId: editing.vehicleId || null, operationalArea: editing.operationalArea || null, roles: editing.roles, centerId: editing.centerId || null, password: editing.password || undefined, name: editing.name || undefined, phone: editing.phone || undefined };
    if (await run(() => api.post('/entity-admin/users', body), 'Usuario guardado.')) setEditing(null);
  };
  const propose = async () => {
    if (!proposing) return;
    if (await run(() => api.post(`/entity-admin/users/${proposing.user.id}/propose-evaluator`, { note: proposing.note || null }), 'Propuesta enviada a Kindra.')) setProposing(null);
  };
  const toggleRole = (r: Role) => editing && setEditing({ ...editing, roles: editing.roles.includes(r) ? editing.roles.filter((x) => x !== r) : [...editing.roles, r] });
  if (users.isLoading) return <Spinner />;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <p className="text-sm text-muted max-w-prose">Puedes dar de alta y editar usuarios de tu entidad con roles operativos. Los evaluadores los propones tú y los activa Kindra. Los roles de administración solo los activa Kindra.</p>
        <Button onClick={() => setEditing({ ...EMPTY_USER })}>Nuevo usuario</Button>
      </div>
      {!users.data?.length ? (
        <EmptyState title="Sin usuarios" text="Crea el primer usuario de tu entidad." />
      ) : (
        <ul className="grid md:grid-cols-2 gap-3">
          {users.data.map((u) => {
            const editable = !u.roles.some((r) => r === 'admin' || r === 'entity_admin');
            const proposed = (u.proposedRoles || []).some((p) => p.role === 'evaluator');
            return (
              <li key={u.id}>
                <Card
                  title={u.alias}
                  subtitle={`${u.name || ''}${u.phone ? ` · ${u.phone}` : ''}`}
                  actions={
                    editable ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing({ id: u.id, alias: u.alias, name: u.name || '', phone: u.phone || '', roles: u.roles.filter((r) => ENTITY_ASSIGNABLE_ROLES.includes(r)), centerId: u.centerId || '', password: '', active: u.active, email: u.email || '', vehicleId: u.vehicleId || '', operationalArea: u.operationalArea || '' })}
                      >
                        Editar
                      </Button>
                    ) : undefined
                  }
                >
                  <div className="flex flex-wrap gap-1">
                    {u.roles.map((r) => (
                      <Badge key={r} tone="primary" icon={false}>
                        {ROLE_LABELS[r]}
                      </Badge>
                    ))}
                    <Badge tone={u.verificationStatus === 'verified' ? 'ok' : u.verificationStatus === 'pending' ? 'warn' : 'neutral'}>Identidad: {VERIF[u.verificationStatus]}</Badge>
                    {proposed && <Badge tone="info">Evaluador propuesto, espera a Kindra</Badge>}
                    {!u.active && <Badge tone="bad">inactivo</Badge>}
                  </div>
                  {editable && !u.roles.includes('evaluator') && !proposed && (
                    <Button className="mt-2" variant="secondary" size="sm" onClick={() => setProposing({ user: u, note: '' })}>
                      Proponer como evaluador
                    </Button>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Editar usuario' : 'Nuevo usuario de la entidad'} wide>
        {editing && (
          <div>
            <div className="grid sm:grid-cols-2 sm:gap-3">
              <Field label="Alias" required>
                <Input value={editing.alias} onChange={(e) => setEditing({ ...editing, alias: e.target.value })} />
              </Field>
              <Field label="Nombre">
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </Field>
              <Field label="Teléfono">
                <Input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
              </Field>
              <Field label={editing.id ? 'Nueva contraseña (opcional)' : 'Contraseña inicial'} required={!editing.id}>
                <Input type="password" autoComplete="new-password" value={editing.password} onChange={(e) => setEditing({ ...editing, password: e.target.value })} />
              </Field>
            </div>
            <fieldset className="mb-4">
              <legend className="label">Rol en la entidad</legend>
              <div className="flex flex-wrap gap-2">
                {ENTITY_ASSIGNABLE_ROLES.map((r) => (
                  <label key={r} className={`chip cursor-pointer ${editing.roles.includes(r) ? 'chip-active' : ''}`}>
                    <input type="checkbox" className="sr-only" checked={editing.roles.includes(r)} onChange={() => toggleRole(r)} /> {ROLE_LABELS[r]}
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label="Correo"><Input type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></Field>
            {editing.roles.includes('driver') && (
              <div className="grid sm:grid-cols-2 sm:gap-3">
                <Field label="Vehículo asignado"><Select value={editing.vehicleId} onChange={(e) => setEditing({ ...editing, vehicleId: e.target.value })}><option value="">Sin asignar</option>{vehicles.data?.vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate}</option>)}</Select></Field>
                <Field label="Área operativa"><Input value={editing.operationalArea} onChange={(e) => setEditing({ ...editing, operationalArea: e.target.value })} /></Field>
              </div>
            )}
            {editing.roles.includes('center') && (
              <Field label="Centro" required>
                <Select value={editing.centerId} onChange={(e) => setEditing({ ...editing, centerId: e.target.value })}>
                  <option value="">Elige un centro de tu entidad</option>
                  {centers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {editing.id && (
              <label className="flex items-center gap-2 text-sm mb-4">
                <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> Cuenta activa
              </label>
            )}
            <Alert tone="info" className="mb-3">
              Los usuarios nuevos deben completar la verificación por selfie antes de usar su rol.
            </Alert>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button onClick={save} disabled={busy || editing.alias.trim().length < 3 || !editing.roles.length}>
                Guardar
              </Button>
            </div>
          </div>
        )}
      </Modal>
      <Modal open={!!proposing} onClose={() => setProposing(null)} title="Proponer evaluador técnico">
        {proposing && (
          <div>
            <p className="text-sm mb-3">
              Propones a <strong>{proposing.user.alias}</strong> como evaluador técnico. Kindra revisa la propuesta y activa el rol; hasta entonces no puede decidir sobre material peligroso ni verificar calidad.
            </p>
            <Field label="Motivo o credenciales" hint="Opcional. Por ejemplo, profesión y número de colegiatura.">
              <Textarea value={proposing.note} onChange={(e) => setProposing({ ...proposing, note: e.target.value })} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setProposing(null)}>
                Cancelar
              </Button>
              <Button onClick={propose} disabled={busy}>
                Enviar propuesta
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

function EntityVehicles() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['entity-admin', 'vehicles'], queryFn: () => api.get<{ vehicles: (Vehicle & { typeName: string | null })[]; types: VehicleType[] }>('/entity-admin/vehicles') });
  const [editing, setEditing] = useState<{ id?: string; plate: string; typeId: string; active: boolean; imei?: string | null; trackerType?: 'gps' | 'traccar_client' | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await api.post('/entity-admin/vehicles', editing);
      toast.success('Vehículo guardado.');
      qc.invalidateQueries({ queryKey: ['entity-admin'] });
      setEditing(null);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  if (q.isLoading || !q.data) return <Spinner />;
  return (
    <>
      <div className="flex justify-between items-center gap-2 mb-3">
        <p className="text-sm text-muted">Cada vehículo tiene su propio QR para que el centro confirme la llegada con un escaneo.</p>
        <Button onClick={() => setEditing({ plate: '', typeId: q.data!.types[0]?.id || '', active: true })} disabled={!q.data.types.length}>
          Nuevo vehículo
        </Button>
      </div>
      {!q.data.vehicles.length ? (
        <EmptyState title="Sin vehículos" text="Registra los vehículos de tu entidad." />
      ) : (
        <ul className="grid md:grid-cols-3 gap-3">
          {q.data.vehicles.map((v) => (
            <li key={v.id}>
              <Card title={v.plate} subtitle={v.typeName || ''} actions={<Button variant="ghost" size="sm" onClick={() => setEditing({ id: v.id, plate: v.plate, typeId: v.typeId, active: v.active, imei: v.imei ?? '', trackerType: v.trackerType ?? null })}>Editar</Button>}>
                <p className="font-mono text-sm">{v.qrCode}</p>
                {!v.active && <Badge tone="bad">inactivo</Badge>}
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Editar vehículo' : 'Nuevo vehículo'}>
        {editing && (
          <div>
            <Field label="Placa" required>
              <Input value={editing.plate} onChange={(e) => setEditing({ ...editing, plate: e.target.value.toUpperCase() })} />
            </Field>
            <Field label="Tipo" required>
              <Select value={editing.typeId} onChange={(e) => setEditing({ ...editing, typeId: e.target.value })}>
                {q.data!.types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="IMEI del dispositivo de rastreo" hint="GPS instalado o teléfono con Traccar Client.">
              <Input value={editing.imei || ''} inputMode="numeric" onChange={(e) => setEditing({ ...editing, imei: e.target.value })} />
            </Field>
            <Field label="Fuente">
              <Select value={editing.trackerType || ''} onChange={(e) => setEditing({ ...editing, trackerType: (e.target.value || null) as 'gps' | 'traccar_client' | null })}>
                <option value="">Sin dispositivo</option>
                <option value="gps">GPS instalado en el camión</option>
                <option value="traccar_client">Teléfono con Traccar Client</option>
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-sm mb-4">
              <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> Vehículo activo
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button onClick={save} disabled={busy || editing.plate.trim().length < 3 || !editing.typeId}>
                Guardar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
