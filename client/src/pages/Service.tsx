import { useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Business, PickupUnit } from '@kindra/shared';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { usePublicConfig } from '../lib/config';
import { toast } from '../lib/toast';
import { useTab } from '../lib/useTab';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, KeyValue, PageTitle, Select, Spinner, Tabs, Textarea } from '../components/ui';
import { PhotoCapture, type CapturedPhoto } from '../components/PhotoCapture';
import { History, ImpactPanel, Kpi, PickupCard, UNIT_LABEL, today, usePickupAction, usePickups, useRequestContext, type PickupView } from '../components/Requests';
import { TextModal } from './Driver';
import { NewsBlock } from '../components/News';
import { Modal } from '../components/ui';
import { fmtDateTime, fmtNum } from '../lib/format';

type Who = 'householder' | 'business';
const BASE: Record<Who, string> = { householder: '/hogar', business: '/comercio' };
const OPEN = ['submitted', 'new', 'assigned', 'en_route', 'arrived', 'issue'];

/** v4.0, 25.1: hogar. */
export function Household() {
  return (
    <Routes>
      <Route index element={<Home who="householder" />} />
      <Route path="solicitar" element={<RequestForm who="householder" />} />
      <Route path="solicitudes" element={<MyRequests who="householder" title="Mis solicitudes" />} />
      <Route path="impacto" element={<Impact title="Mi impacto" />} />
      <Route path="*" element={<Navigate to="/hogar" replace />} />
    </Routes>
  );
}

/** v4.0, 25.3: comercio. Solo ve sus propios registros. */
export function BusinessArea() {
  return (
    <Routes>
      <Route index element={<Home who="business" />} />
      <Route path="punto" element={<CollectionPoint />} />
      <Route path="solicitar" element={<RequestForm who="business" />} />
      <Route path="agenda" element={<MyRequests who="business" title="Agenda de recolección" />} />
      <Route path="historial" element={<BusinessHistory />} />
      <Route path="impacto" element={<Impact title="Impacto y reportes" />} />
      <Route path="datos" element={<BusinessProfile />} />
      <Route path="*" element={<Navigate to="/comercio" replace />} />
    </Routes>
  );
}

const Impact = ({ title }: { title: string }) => (
  <div>
    <PageTitle title={title} subtitle="Cantidades recibidas y validadas de tus solicitudes." />
    <ImpactPanel title="Recolecciones validadas" countLabel="Recolecciones completadas" />
  </div>
);

function useBusiness() {
  return useQuery({ queryKey: ['profiles', 'business'], queryFn: () => api.get<{ business: Business; users: { alias: string; name: string | null }[] }>('/profiles/business') });
}

function Home({ who }: { who: Who }) {
  const user = useAuth((s) => s.user);
  const q = usePickups();
  const b = useQuery({ queryKey: ['profiles', 'business'], queryFn: () => api.get<{ business: Business }>('/profiles/business'), enabled: who === 'business' });
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Alert tone="bad">{errorMessage(q.error)}</Alert>;
  if (b.error) return <Alert tone="warn">{errorMessage(b.error)}</Alert>;
  const open = q.data.filter((r) => OPEN.includes(r.status));
  const next = open.find((r) => r.status !== 'submitted' && r.date >= today()) ?? null;
  const done = q.data.filter((r) => r.status === 'completed');
  return (
    <div className="space-y-4">
      <PageTitle title={who === 'business' ? b.data?.business.name ?? 'Comercio' : `Hola, ${user?.name || user?.alias}`} subtitle={who === 'business' ? 'Tus recolecciones y tu punto de acopio.' : 'Tus solicitudes y la próxima recolección.'} actions={<Link className="btn-primary" to={`${BASE[who]}/solicitar`}>Solicitar</Link>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Kpi label="Solicitudes abiertas" value={open.length} to={who === 'business' ? '/comercio/agenda' : '/hogar/solicitudes'} />
        <Kpi label="Por programar" value={open.filter((r) => r.status === 'submitted').length} />
        <Kpi label="Con incidencia" value={open.filter((r) => r.status === 'issue').length} />
        <Kpi label="Completadas y validadas" value={done.length} note="Todo el registro" to={`${BASE[who]}/impacto`} />
      </div>
      <Card title="Próxima recolección">
        {next ? <PickupCard r={next} /> : <EmptyState title="No hay una recolección programada" text="Cuando la coordinación programe una, aparecerá aquí con su fecha y horario." />}
      </Card>
      <NewsBlock />
      {open.some((r) => r.status === 'submitted') && <Card title="Pendientes de programar"><div className="space-y-2">{open.filter((r) => r.status === 'submitted').map((r) => <PickupCard key={r.id} r={r} />)}</div></Card>}
    </div>
  );
}

function RequestForm({ who }: { who: Who }) {
  const ctx = useRequestContext();
  const { data: cfg } = usePublicConfig();
  const user = useAuth((s) => s.user);
  const biz = useQuery({ queryKey: ['profiles', 'business'], queryFn: () => api.get<{ business: Business }>('/profiles/business'), enabled: who === 'business' });
  const nav = useNavigate();
  const { run, busy } = usePickupAction();
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [f, setF] = useState({ quantity: '', address: '', sectorId: user?.sectorId || '', date: '', from: '', to: '', instructions: '' });
  if (ctx.isLoading) return <Spinner />;
  const services = (ctx.data?.modules || []).filter((m) => m.key !== 'debris');
  const m = services[0];
  const address = f.address || (who === 'business' ? biz.data?.business.address : user?.preferences?.address) || '';
  const unit = (m?.units[0] ?? 'l') as PickupUnit;
  const send = async () => {
    const r = await run('/service', { module: m.key, material: m.label, estimatedQuantity: Number(f.quantity), unit, address, location: biz.data?.business.collectionPoint.location ?? null, sectorId: f.sectorId || null, date: f.date, windowFrom: f.from, windowTo: f.to, instructions: f.instructions || null, photoIds: photos.map((p) => p.id) }, 'Solicitud enviada. Te avisamos cuando quede programada.');
    if (r) nav(`${BASE[who]}/${who === 'business' ? 'agenda' : 'solicitudes'}`);
  };
  return (
    <div className="max-w-xl space-y-4">
      <PageTitle title={who === 'business' ? 'Solicitar recolección' : 'Solicitar'} subtitle="Elige qué necesitas que se recoja." />
      <Card title="Escombros" subtitle="Se solicita con un aviso: queda registrado con su código y puedes seguirlo.">
        <div className="flex flex-wrap gap-2">
          <Link className="btn-primary" to="/avisar">Avisar de un escombro</Link>
          <Link className="btn-secondary" to="/mis-reportes">Ver mis avisos</Link>
        </div>
      </Card>
      {m && (
        <Card title={m.label}>
          <Field label={`Cantidad estimada (${UNIT_LABEL[unit]})`} required><Input type="number" min={0} step="0.1" inputMode="decimal" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></Field>
          <Field label="Dirección de recolección" required><Input value={address} maxLength={200} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
          <Field label="Sector"><Select value={f.sectorId} onChange={(e) => setF({ ...f, sectorId: e.target.value })}><option value="">Sin indicar</option>{cfg?.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <div className="grid grid-cols-3 gap-x-3">
            <Field label="Fecha" required><Input type="date" min={today()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
            <Field label="Desde" required><Input type="time" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
            <Field label="Hasta" required><Input type="time" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
          </div>
          <Field label="Indicaciones"><Textarea value={f.instructions} maxLength={500} onChange={(e) => setF({ ...f, instructions: e.target.value })} /></Field>
          <PhotoCapture kind="document" label="Foto (opcional)" photos={photos} onChange={setPhotos} max={3} withLocation={false} />
          <Button className="mt-3" disabled={busy || !(Number(f.quantity) > 0) || address.trim().length < 4 || !f.date || !f.from || !f.to || f.from >= f.to} onClick={send}>{busy ? 'Enviando…' : 'Enviar solicitud'}</Button>
        </Card>
      )}
    </div>
  );
}

function MyRequests({ who, title }: { who: Who; title: string }) {
  const q = usePickups();
  const { run, busy } = usePickupAction();
  const [tab, setTab] = useTab<'open' | 'closed'>('open');
  const [cancel, setCancel] = useState<PickupView | null>(null);
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Alert tone="bad">{errorMessage(q.error)}</Alert>;
  const open = q.data.filter((r) => OPEN.includes(r.status) || r.status === 'collected' || r.status === 'received');
  const closed = q.data.filter((r) => ['completed', 'cancelled'].includes(r.status));
  const list = tab === 'open' ? open : closed;
  return (
    <div>
      <PageTitle title={title} subtitle="Cada solicitud conserva su código desde que la envías hasta que se cierra." actions={<Link className="btn-primary btn-sm" to={`${BASE[who]}/solicitar`}>Solicitar</Link>} />
      <Tabs value={tab} onChange={setTab} items={[{ value: 'open', label: 'En curso', count: open.length }, { value: 'closed', label: 'Cerradas', count: closed.length }]} />
      <div className="mt-3 grid md:grid-cols-2 gap-3">
        {list.map((r) => <PickupCard key={r.id} r={r} actions={<><History r={r} /><Receipt r={r} />{['submitted', 'new', 'assigned'].includes(r.status) && <Button size="sm" variant="secondary" onClick={() => setCancel(r)}>Cancelar</Button>}</>} />)}
      </div>
      {list.length === 0 && <EmptyState title={tab === 'open' ? 'No tienes solicitudes en curso' : 'Todavía no hay solicitudes cerradas'} />}
      {who === 'householder' && <p className="text-sm mt-4">Los avisos de escombro están en <Link className="underline text-primary" to="/mis-reportes">Mis reportes</Link>.</p>}
      <TextModal key={cancel?.id} open={!!cancel} title={`Cancelar ${cancel?.code ?? ''}`} label="Motivo" busy={busy} onClose={() => setCancel(null)} onSend={async (note) => { if (await run(`/${cancel!.id}/cancel`, { note }, 'Solicitud cancelada.')) setCancel(null); }} />
    </div>
  );
}

/** Comprobante imprimible de una recolección recibida y validada. */
function Receipt({ r }: { r: PickupView }) {
  const [open, setOpen] = useState(false);
  if (r.status !== 'completed' || !r.received) return null;
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Comprobante</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Comprobante ${r.code}`}>
        <KeyValue items={[{ k: 'Código', v: r.code }, { k: 'Material', v: r.material }, { k: 'Cantidad recibida', v: r.received.quantity === null ? 'sin cantidad registrada' : `${fmtNum(r.received.quantity, 2)} ${UNIT_LABEL[r.received.unit!]}` }, { k: 'Recibido en', v: r.centerName || '—' }, { k: 'Fecha de recepción', v: fmtDateTime(r.received.at) }, { k: 'Validado', v: r.validatedAt ? fmtDateTime(r.validatedAt) : '—' }]} />
        <Button className="mt-3 no-print" onClick={() => window.print()}>Imprimir</Button>
      </Modal>
    </>
  );
}

function BusinessHistory() {
  const q = usePickups();
  const [f, setF] = useState({ from: '', to: '' });
  if (q.isLoading) return <Spinner />;
  const rows = (q.data || []).filter((r) => ['received', 'completed', 'cancelled'].includes(r.status) && (!f.from || r.date >= f.from) && (!f.to || r.date <= f.to)).reverse();
  return (
    <div>
      <PageTitle title="Historial de recolección" subtitle="Solo los registros de tu comercio." />
      <Card>
        <div className="grid grid-cols-2 gap-x-3"><Field label="Desde"><Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field><Field label="Hasta"><Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field></div>
        {rows.length === 0 ? <EmptyState title="Sin recolecciones en este periodo" /> : <div className="space-y-2">{rows.map((r) => <PickupCard key={r.id} r={r} actions={<><History r={r} /><Receipt r={r} /></>} />)}</div>}
      </Card>
    </div>
  );
}

function useSaveBusiness() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const save = async (b: Business) => {
    setBusy(true);
    try {
      await api.put('/profiles/business', { name: b.name, category: b.category, address: b.address, sectorId: b.sectorId, contact: b.contact, openingHours: b.openingHours, collectionPoint: b.collectionPoint });
      toast.success('Cambios guardados.');
      qc.invalidateQueries({ queryKey: ['profiles', 'business'] });
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { save, busy };
}

function CollectionPoint() {
  const q = useBusiness();
  const { save, busy } = useSaveBusiness();
  const [d, setD] = useState<Business | null>(null);
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Alert tone="bad">{errorMessage(q.error)}</Alert>;
  const b = q.data.business;
  const cp = b.collectionPoint;
  return (
    <div className="max-w-xl">
      <PageTitle title="Punto de acopio" />
      {!d ? (
        <Card actions={<Button size="sm" variant="secondary" onClick={() => setD(structuredClone(b))}>Editar</Button>} title={b.name}>
          <KeyValue items={[{ k: 'Estado del servicio', v: <Badge tone={cp.status === 'active' ? 'ok' : 'warn'}>{cp.status === 'active' ? 'Activo' : 'En pausa'}</Badge> }, { k: 'Dirección', v: b.address }, { k: 'Horario', v: b.openingHours }, { k: 'Materiales aceptados', v: cp.acceptedMaterials.join(', ') || 'Sin definir' }, { k: 'Almacenamiento y manejo', v: cp.storageInstructions || 'Sin definir' }]} />
        </Card>
      ) : (
        <Card title="Editar punto de acopio">
          <Field label="Horario" required><Input value={d.openingHours} onChange={(e) => setD({ ...d, openingHours: e.target.value })} /></Field>
          <Field label="Materiales aceptados" hint="Separados por comas."><Input value={d.collectionPoint.acceptedMaterials.join(', ')} onChange={(e) => setD({ ...d, collectionPoint: { ...d.collectionPoint, acceptedMaterials: e.target.value.split(',').map((s) => s.trimStart()) } })} /></Field>
          <Field label="Instrucciones de almacenamiento y manejo"><Textarea value={d.collectionPoint.storageInstructions} onChange={(e) => setD({ ...d, collectionPoint: { ...d.collectionPoint, storageInstructions: e.target.value } })} /></Field>
          <Field label="Estado del servicio"><Select value={d.collectionPoint.status} onChange={(e) => setD({ ...d, collectionPoint: { ...d.collectionPoint, status: e.target.value as 'active' | 'paused' } })}><option value="active">Activo</option><option value="paused">En pausa</option></Select></Field>
          <div className="flex gap-2"><Button disabled={busy} onClick={async () => { if (await save({ ...d, collectionPoint: { ...d.collectionPoint, acceptedMaterials: d.collectionPoint.acceptedMaterials.map((s) => s.trim()).filter((s) => s.length > 1) } })) setD(null); }}>Guardar</Button><Button variant="ghost" onClick={() => setD(null)}>Cancelar</Button></div>
        </Card>
      )}
    </div>
  );
}

function BusinessProfile() {
  const q = useBusiness();
  const { save, busy } = useSaveBusiness();
  const { data: cfg } = usePublicConfig();
  const [d, setD] = useState<Business | null>(null);
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Alert tone="bad">{errorMessage(q.error)}</Alert>;
  const b = d ?? q.data.business;
  const set = (p: Partial<Business>) => setD({ ...b, ...p });
  return (
    <div className="max-w-xl space-y-4">
      <PageTitle title="Datos del comercio" />
      <Card>
        <Field label="Nombre" required><Input value={b.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Categoría" required><Input value={b.category} onChange={(e) => set({ category: e.target.value })} /></Field>
        <Field label="Dirección" required><Input value={b.address} onChange={(e) => set({ address: e.target.value })} /></Field>
        <Field label="Sector"><Select value={b.sectorId || ''} onChange={(e) => set({ sectorId: e.target.value || null })}><option value="">Sin indicar</option>{cfg?.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Contacto" hint="No se publica."><Input value={b.contact || ''} onChange={(e) => set({ contact: e.target.value || null })} /></Field>
        <Field label="Horario" required><Input value={b.openingHours} onChange={(e) => set({ openingHours: e.target.value })} /></Field>
        <Button disabled={busy || !d} onClick={async () => { if (await save(b)) setD(null); }}>Guardar</Button>
      </Card>
      <Card title="Cuentas autorizadas" subtitle="Las asigna la administración."><ul className="text-sm">{q.data.users.map((u) => <li key={u.alias}>{u.alias}{u.name ? ` · ${u.name}` : ''}</li>)}</ul></Card>
    </div>
  );
}
