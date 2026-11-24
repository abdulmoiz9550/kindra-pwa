import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Business, Center, Entity, Group, ModuleDefinition, Sector } from '@kindra/shared';
import { fmtDateTime, fmtNum } from '../../lib/format';
import { usePublicConfig } from '../../lib/config';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, Select, Spinner, Tabs, Textarea } from '../../components/ui';
import { Section, useAdminAction, useAdminList } from './shared';

type GroupRow = Group & { members: number; leaders: string[]; impact: { validated: { kg: number | null; t: number | null; m3: number | null; activities: number; hours: number | null } } };

/** Supervisión de comunidades, grupos costeros y comercios (v4.0, 25.6). */
export default function Participation() {
  const [tab, setTab] = useState<'groups' | 'businesses'>('groups');
  return (
    <Section title="Comunidades y comercios" subtitle="Registro y supervisión de comunidades, grupos costeros y puntos de acopio.">
      <Tabs value={tab} onChange={setTab} items={[{ value: 'groups', label: 'Comunidades y grupos' }, { value: 'businesses', label: 'Comercios' }]} />
      <div className="mt-3">{tab === 'groups' ? <Groups /> : <Businesses />}</div>
    </Section>
  );
}

const NEW_GROUP = { kind: 'community' as Group['kind'], name: '', region: '', sectorId: '', description: '', contact: '', active: true, leaderAlias: '' };
type GroupDraft = typeof NEW_GROUP & { id?: string };

function Groups() {
  const q = useAdminList<GroupRow>('groups');
  const sectors = useAdminList<Sector>('sectors');
  const { post, busy } = useAdminAction();
  const [d, setD] = useState<GroupDraft | null>(null);
  if (q.isLoading) return <Spinner />;
  const set = (p: Partial<GroupDraft>) => setD((x) => ({ ...x!, ...p }));
  return (
    <>
      <div className="flex justify-end mb-3"><Button onClick={() => setD({ ...NEW_GROUP })}>Nuevo grupo</Button></div>
      {!(q.data || []).length ? <EmptyState title="Sin grupos registrados" /> : (
        <div className="grid md:grid-cols-2 gap-3">
          {q.data!.map((g) => {
            const v = g.impact.validated;
            return (
              <Card key={g.id} title={g.name} subtitle={`${g.kind === 'coastal' ? 'Grupo costero' : 'Comunidad'} · ${g.region}`} actions={<Button size="sm" variant="ghost" onClick={() => setD({ id: g.id, kind: g.kind, name: g.name, region: g.region, sectorId: g.sectorId || '', description: g.description, contact: g.contact || '', active: g.active, leaderAlias: '' })}>Editar</Button>}>
                <p className="text-sm">{g.members} miembros · lidera {g.leaders.join(', ') || 'sin asignar'} {!g.active && <Badge tone="neutral">Inactivo</Badge>} {g.isDemo && <Badge tone="warn">Demostración</Badge>}</p>
                <p className="text-xs text-muted">Validado: {v.activities} actividades{v.hours !== null ? ` · ${fmtNum(v.hours, 2)} h` : ''}{v.kg !== null ? ` · ${fmtNum(v.kg, 2)} kg` : ''}{v.t !== null ? ` · ${fmtNum(v.t, 2)} t` : ''}{v.m3 !== null ? ` · ${fmtNum(v.m3, 2)} m³` : ''}</p>
              </Card>
            );
          })}
        </div>
      )}
      <Modal open={!!d} onClose={() => setD(null)} title={d?.id ? 'Editar grupo' : 'Nuevo grupo'}>
        {d && (
          <>
            <Field label="Tipo"><Select value={d.kind} disabled={!!d.id} onChange={(e) => set({ kind: e.target.value as Group['kind'] })}><option value="community">Comunidad</option><option value="coastal">Grupo costero</option></Select></Field>
            <Field label="Nombre" required><Input value={d.name} onChange={(e) => set({ name: e.target.value })} /></Field>
            <Field label="Región" required><Input value={d.region} onChange={(e) => set({ region: e.target.value })} /></Field>
            <Field label="Sector"><Select value={d.sectorId} onChange={(e) => set({ sectorId: e.target.value })}><option value="">Sin sector</option>{sectors.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Descripción"><Textarea value={d.description} onChange={(e) => set({ description: e.target.value })} /></Field>
            <Field label="Contacto"><Input value={d.contact} onChange={(e) => set({ contact: e.target.value })} /></Field>
            <Field label="Alias de quien lidera" hint="Recibe el perfil del grupo."><Input value={d.leaderAlias} onChange={(e) => set({ leaderAlias: e.target.value })} /></Field>
            <label className="flex items-center gap-2 text-sm mb-3"><input type="checkbox" className="h-5 w-5" checked={d.active} onChange={(e) => set({ active: e.target.checked })} /> Activo</label>
            <Button disabled={busy || d.name.length < 3 || d.region.length < 2} onClick={async () => { if (await post('groups', { ...d, sectorId: d.sectorId || null, contact: d.contact || null, leaderAlias: d.leaderAlias || null }, 'Grupo guardado.')) setD(null); }}>Guardar</Button>
          </>
        )}
      </Modal>
    </>
  );
}

const NEW_BUSINESS: Omit<Business, 'id' | 'createdAt' | 'updatedAt'> & { id?: string } = { name: '', category: '', address: '', sectorId: null, contact: null, openingHours: '', collectionPoint: { acceptedMaterials: [], storageInstructions: '', status: 'paused', location: null }, active: true };

function Businesses() {
  const q = useAdminList<Business>('businesses');
  const { post, busy } = useAdminAction();
  const [d, setD] = useState<typeof NEW_BUSINESS | null>(null);
  if (q.isLoading) return <Spinner />;
  const set = (p: Partial<typeof NEW_BUSINESS>) => setD((x) => ({ ...x!, ...p }));
  return (
    <>
      <Alert tone="info" className="mb-3">Después de crear un comercio, asigna sus cuentas en Usuarios con el rol Comercio.</Alert>
      <div className="flex justify-end mb-3"><Button onClick={() => setD(structuredClone(NEW_BUSINESS))}>Nuevo comercio</Button></div>
      {!(q.data || []).length ? <EmptyState title="Sin comercios registrados" /> : <div className="grid md:grid-cols-2 gap-3">{q.data!.map((b) => <Card key={b.id} title={b.name} subtitle={`${b.category} · ${b.address}`} actions={<Button size="sm" variant="ghost" onClick={() => { const { createdAt: _c, updatedAt: _u, ...rest } = b; setD(rest); }}>Editar</Button>}><p className="text-sm">Horario: {b.openingHours} · servicio {b.collectionPoint.status === 'active' ? 'activo' : 'en pausa'} {b.isDemo && <Badge tone="warn">Demostración</Badge>} {!b.active && <Badge tone="neutral">Inactivo</Badge>}</p></Card>)}</div>}
      <Modal open={!!d} onClose={() => setD(null)} title={d?.id ? 'Editar comercio' : 'Nuevo comercio'}>
        {d && (
          <>
            <Field label="Nombre" required><Input value={d.name} onChange={(e) => set({ name: e.target.value })} /></Field>
            <Field label="Categoría" required><Input value={d.category} onChange={(e) => set({ category: e.target.value })} /></Field>
            <Field label="Dirección" required><Input value={d.address} onChange={(e) => set({ address: e.target.value })} /></Field>
            <Field label="Contacto"><Input value={d.contact || ''} onChange={(e) => set({ contact: e.target.value || null })} /></Field>
            <Field label="Horario" required><Input value={d.openingHours} onChange={(e) => set({ openingHours: e.target.value })} /></Field>
            <label className="flex items-center gap-2 text-sm mb-3"><input type="checkbox" className="h-5 w-5" checked={d.active} onChange={(e) => set({ active: e.target.checked })} /> Activo</label>
            <Button disabled={busy || d.name.length < 2 || d.category.length < 2 || d.address.length < 4 || d.openingHours.length < 2} onClick={async () => { const { isDemo: _i, ...body } = d; if (await post('businesses', body, 'Comercio guardado.')) setD(null); }}>Guardar</Button>
          </>
        )}
      </Modal>
    </>
  );
}

/** Operadores: organizaciones que operan en los centros, sin crear sitios (v4.0, sección 4). */
export function Operators() {
  const entities = useAdminList<Entity>('entities');
  const centers = useAdminList<Center>('centers');
  if (entities.isLoading || centers.isLoading) return <Spinner />;
  const rows = (entities.data || []).filter((e) => e.type === 'center');
  return (
    <Section title="Operadores" subtitle="Cada operador se vincula a uno o más centros físicos. Un operador nunca es un centro." actions={<Link className="btn-secondary" to="/admin/entidades">Editar organizaciones</Link>}>
      <Card>
        <div className="overflow-x-auto"><table className="table-plain"><thead><tr><th>Operador</th><th>Centros físicos</th><th>Estado</th></tr></thead><tbody>{rows.map((e) => { const cs = (centers.data || []).filter((c) => c.entityId === e.id || (c.operatorEntityIds || []).includes(e.id)); return <tr key={e.id}><td className="font-semibold">{e.name}</td><td>{cs.map((c) => c.name).join(', ') || 'Ninguno'}</td><td>{e.active ? 'Activo' : 'Inactivo'}</td></tr>; })}</tbody></table></div>
      </Card>
    </Section>
  );
}

const DEF_FIELDS: [keyof ModuleDefinition & string, string][] = [['workflow', 'Flujo de trabajo'], ['dataFields', 'Campos de datos'], ['units', 'Unidades'], ['validationRules', 'Reglas de validación'], ['roles', 'Roles'], ['risks', 'Riesgos']];
type DefDraft = Record<'workflow' | 'dataFields' | 'units' | 'validationRules' | 'roles' | 'risks' | 'approvalReference', string>;
const EMPTY_DEF: DefDraft = { workflow: '', dataFields: '', units: '', validationRules: '', roles: '', risks: '', approvalReference: '' };

/** Módulos: definición, activación y aprobación del esquema de puntos (v4.0, secciones 2 y 29). */
export function Modules() {
  const defs = useAdminList<ModuleDefinition>('module-definitions');
  const features = useAdminList<{ key: string; label: string; description: string; group: string; enabled: boolean; available: boolean; locked?: boolean }>('features');
  const { data: cfg } = usePublicConfig();
  const { put, busy } = useAdminAction();
  const [d, setD] = useState<DefDraft | null>(null);
  const [ref, setRef] = useState('');
  if (defs.isLoading || features.isLoading) return <Spinner />;
  const cur = defs.data?.find((x) => x.id === 'oil_module');
  const inc = cfg?.incentives;
  return (
    <Section title="Módulos" subtitle="Escombros está activo. Los módulos futuros siguen ocultos hasta completar su definición y encenderlos aquí.">
      <div className="space-y-3">
        {(features.data || []).filter((f) => f.group === 'module').map((f) => (
          <Card key={f.key} title={f.label} subtitle={f.description} actions={<Badge tone={f.enabled ? 'ok' : 'neutral'}>{f.enabled ? 'Activo' : 'Inactivo'}</Badge>}>
            {f.key === 'oil_module' && (
              <div className="flex flex-wrap gap-2 items-center text-sm">
                <span>{cur ? `Definición guardada el ${fmtDateTime(cur.updatedAt)}` : 'Sin definición'}</span>
                <Button size="sm" variant="secondary" onClick={() => setD(cur ? { workflow: cur.workflow, dataFields: cur.dataFields, units: cur.units, validationRules: cur.validationRules, roles: cur.roles, risks: cur.risks, approvalReference: cur.approvalReference } : { ...EMPTY_DEF })}>Definición</Button>
                <Button size="sm" disabled={busy} variant={f.enabled ? 'danger' : 'primary'} onClick={() => put('features', { oil_module: !f.enabled }, f.enabled ? 'Módulo apagado.' : 'Módulo encendido.')}>{f.enabled ? 'Apagar' : 'Encender'}</Button>
              </div>
            )}
          </Card>
        ))}
        <Card title="Esquema de puntos y niveles" subtitle="Mientras no tenga una aprobación registrada, las pantallas lo muestran como pendiente." actions={<Badge tone={inc?.status === 'approved' ? 'ok' : 'warn'}>{inc?.status === 'approved' ? 'Aprobado' : 'Pendiente de aprobación'}</Badge>}>
          {inc?.status === 'approved' ? (
            <div className="text-sm"><p>Referencia: {inc.reference} · {fmtDateTime(inc.approvedAt)}</p><Button size="sm" variant="secondary" className="mt-2" disabled={busy} onClick={() => put('incentives', { status: 'pending', reference: null }, 'Aprobación retirada.')}>Retirar aprobación</Button></div>
          ) : (
            <div className="flex flex-wrap items-end gap-2"><Field label="Documento que lo aprueba"><Input value={ref} onChange={(e) => setRef(e.target.value)} /></Field><Button className="mb-3" disabled={busy || ref.trim().length < 3} onClick={() => put('incentives', { status: 'approved', reference: ref }, 'Aprobación registrada.')}>Registrar aprobación</Button></div>
          )}
        </Card>
      </div>
      <Modal open={!!d} onClose={() => setD(null)} title="Definición del módulo de aceite" wide>
        {d && (
          <>
            {DEF_FIELDS.map(([k, l]) => <Field key={k} label={l} required><Textarea value={d[k as keyof DefDraft]} onChange={(e) => setD({ ...d, [k]: e.target.value })} /></Field>)}
            <Field label="Referencia de aprobación" required><Input value={d.approvalReference} onChange={(e) => setD({ ...d, approvalReference: e.target.value })} /></Field>
            <Button disabled={busy} onClick={async () => { if (await put('module-definitions/oil_module', d, 'Definición guardada.')) setD(null); }}>Guardar definición</Button>
          </>
        )}
      </Modal>
    </Section>
  );
}
