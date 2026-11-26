import { useEffect, useState } from 'react';
import { Link, Route, Routes, Navigate } from 'react-router-dom';
import { PICKUP_REJECT_LABELS } from '@kindra/shared';
import type { PickupRejectReason, PickupUnit } from '@kindra/shared';
import { useAuth } from '../lib/auth';
import { useTab } from '../lib/useTab';
import { useNotifications } from '../lib/notifications';
import { pendingPaths, sendOrQueue } from '../lib/offlineActions';
import { errorMessage } from '../lib/api';
import { toast } from '../lib/toast';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, PageTitle, Select, Spinner, Tabs, Textarea } from '../components/ui';
import { PhotoCapture, type CapturedPhoto } from '../components/PhotoCapture';
import { History, ImpactPanel, Kpi, PickupCard, UNIT_LABEL, dayOf, today, usePickupAction, usePickups, useRequestContext, type PickupView } from '../components/Requests';

const ACTIVE = ['assigned', 'en_route', 'arrived'];

/** v4.0, sección 17: conductor. Nadie confirma ni valida su propia entrega. */
export default function Driver() {
  return (
    <Routes>
      <Route index element={<Home />} />
      <Route path="asignaciones" element={<Requests />} />
      <Route path="solicitudes" element={<Navigate to="/conductor/asignaciones" replace />} />
      <Route path="actividad" element={<Activity />} />
      <Route path="impacto" element={<div><PageTitle title="Mi impacto" subtitle="Solo cuenta lo que el centro recibió y la coordinación validó." /><ImpactPanel title="Recolecciones validadas" countLabel="Recolecciones completadas" /></div>} />
      <Route path="*" element={<Navigate to="/conductor" replace />} />
    </Routes>
  );
}

function Home() {
  const user = useAuth((s) => s.user);
  const q = usePickups();
  const { notifications } = useNotifications();
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Alert tone="bad">{errorMessage(q.error)}</Alert>;
  const mine = q.data.filter((r) => r.driverId);
  const active = mine.filter((r) => ACTIVE.includes(r.status));
  const next = active[0] ?? null;
  const day = today();
  const doneToday = mine.filter((r) => r.status === 'completed' && r.validatedAt && dayOf(new Date(r.validatedAt)) === day).length;
  const alerts = notifications.filter((n) => !n.readAt).slice(0, 3);
  return (
    <div className="space-y-4">
      <PageTitle title={`Hola, ${user?.name || user?.alias}`} subtitle="Tu trabajo de hoy." />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Kpi label="Asignadas para hoy" value={active.filter((r) => r.date === day).length} note={day} to="/conductor/asignaciones" />
        <Kpi label="Esperan una acción tuya" value={active.length} to="/conductor/asignaciones" />
        <Kpi label="Validadas hoy" value={doneToday} note={day} />
        <Kpi label="Validadas en el piloto" value={mine.filter((r) => r.status === 'completed').length} to="/conductor/impacto" />
      </div>
      {alerts.length > 0 && <Alert tone="info" title="Avisos">{alerts.map((a) => a.text).join(' ')} <Link className="underline" to="/notificaciones">Ver todos</Link></Alert>}
      {mine.some((r) => r.status === 'issue') && <Alert tone="warn">Tienes una solicitud con incidencia. La coordinación la está revisando.</Alert>}
      <Card title="Siguiente recolección">
        <div className="flex flex-wrap gap-2 mb-3"><Link className="btn-secondary btn-sm" to="/panel/escolta">Mi ruta</Link><Link className="btn-ghost btn-sm" to="/aprende">Formación y seguridad</Link></div>
        {next ? <PickupCard r={next} showMap actions={<Link className="btn-primary btn-sm" to="/conductor/asignaciones">Continuar</Link>} /> : <EmptyState title="No tienes recolecciones asignadas" text="Tu operador te asigna los retiros." />}
      </Card>
    </div>
  );
}

function Requests() {
  const user = useAuth((s) => s.user);
  const q = usePickups();
  const { run, busy } = usePickupAction();
  const [tab, setTab] = useTab<'available' | 'mine' | 'closed'>('mine');
  const [reject, setReject] = useState<PickupView | null>(null);
  const [issue, setIssue] = useState<PickupView | null>(null);
  const [collect, setCollect] = useState<PickupView | null>(null);
  const pending = usePendingPaths(collect);
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Alert tone="bad">{errorMessage(q.error)}</Alert>;
  // Addendum v4.2: en escombros no hay solicitudes para tomar; solo asignaciones del operador.
  const available = q.data.filter((r) => r.status === 'new' && !r.driverId && r.module !== 'debris');
  const mine = q.data.filter((r) => r.driverId && [...ACTIVE, 'issue', 'collected'].includes(r.status));
  const closed = q.data.filter((r) => r.driverId && ['received', 'completed', 'cancelled'].includes(r.status));
  const list = tab === 'available' ? available : tab === 'mine' ? mine : closed;

  const actions = (r: PickupView) => {
    if (r.status === 'new') return <><Button size="sm" disabled={busy} onClick={() => run(`/${r.id}/accept`, {}, 'Solicitud asignada a ti.')}>Aceptar</Button><Button size="sm" variant="secondary" onClick={() => setReject(r)}>Rechazar</Button></>;
    if (r.status === 'assigned') return <><Button size="sm" disabled={busy} onClick={() => run(`/${r.id}/status`, { to: 'en_route' }, 'En camino.')}>Salir hacia el punto</Button>{r.module !== 'debris' && <Button size="sm" variant="secondary" onClick={() => setReject(r)}>Rechazar</Button>}<Button size="sm" variant="ghost" onClick={() => setIssue(r)}>Reportar incidencia</Button></>;
    if (r.status === 'en_route') return <><Button size="sm" disabled={busy} onClick={() => run(`/${r.id}/status`, { to: 'arrived' }, 'Llegada registrada.')}>Llegué al punto</Button><Button size="sm" variant="ghost" onClick={() => setIssue(r)}>Reportar incidencia</Button></>;
    if (pending.includes(`/requests/${r.id}/collect`)) return <Badge tone="warn">Pendiente de Sincronizar</Badge>;
    if (r.status === 'arrived') return <><Button size="sm" onClick={() => setCollect(r)}>Registrar recolección</Button><Button size="sm" variant="ghost" onClick={() => setIssue(r)}>Reportar incidencia</Button></>;
    if (r.status === 'collected') return <>{r.tripId && <Link className="btn-primary btn-sm" to="/panel/escolta">Ir a mi ruta</Link>}<span className="text-sm text-muted self-center">El centro confirma la recepción.</span></>;
    return null;
  };
  return (
    <div>
      <PageTitle title="Asignaciones" subtitle="Retiros que te asignó tu operador. Registra la salida y la llegada; la recepción la confirma el centro." />
      <Tabs value={tab} onChange={setTab} items={[...(available.length ? [{ value: 'available' as const, label: 'Disponibles', count: available.length }] : []), { value: 'mine', label: 'En curso', count: mine.length }, { value: 'closed', label: 'Cerradas', count: closed.length }]} />
      <div className="mt-3 grid md:grid-cols-2 gap-3">
        {list.map((r) => <PickupCard key={r.id} r={r} showMap actions={<>{actions(r)}{tab === 'closed' && <History r={r} />}</>} />)}
      </div>
      {list.length === 0 && <EmptyState title={tab === 'available' ? 'No hay solicitudes disponibles' : tab === 'mine' ? 'No tienes asignaciones en curso' : 'Todavía no hay asignaciones cerradas'} text={user?.preferences?.available === false ? 'Tu perfil está marcado como no disponible.' : undefined} />}
      <RejectModal r={reject} busy={busy} onClose={() => setReject(null)} onSend={async (reason, note) => { if (await run(`/${reject!.id}/reject`, { reason, note }, 'Rechazo registrado.')) setReject(null); }} />
      <TextModal key={issue?.id} open={!!issue} title="Reportar incidencia" label="Qué pasó" busy={busy} onClose={() => setIssue(null)} onSend={async (text) => { if (await run(`/${issue!.id}/issue`, { text }, 'Incidencia enviada a la coordinación.')) setIssue(null); }} />
      {collect && <CollectModal r={collect} onClose={() => setCollect(null)} />}
    </div>
  );
}

/** Acciones guardadas en el teléfono que todavía no llegan al servidor. */
function usePendingPaths(trigger: unknown): string[] {
  const [paths, setPaths] = useState<string[]>([]);
  useEffect(() => {
    const refresh = () => void pendingPaths().then(setPaths);
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [trigger]);
  return paths;
}

function RejectModal({ r, busy, onClose, onSend }: { r: PickupView | null; busy: boolean; onClose: () => void; onSend: (reason: PickupRejectReason, note: string | null) => void }) {
  const [reason, setReason] = useState<PickupRejectReason | ''>('');
  const [note, setNote] = useState('');
  return (
    <Modal open={!!r} onClose={onClose} title={`Rechazar ${r?.code ?? ''}`}>
      <Field label="Motivo" required>
        <Select value={reason} onChange={(e) => setReason(e.target.value as PickupRejectReason)}>
          <option value="">Elige un motivo</option>
          {Object.entries(PICKUP_REJECT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </Field>
      <Field label="Detalle" required={reason === 'other'}><Textarea value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></Field>
      <Button variant="danger" disabled={busy || !reason || (reason === 'other' && !note.trim())} onClick={() => onSend(reason as PickupRejectReason, note.trim() || null)}>Confirmar rechazo</Button>
    </Modal>
  );
}

export function TextModal({ open, title, label, busy, onClose, onSend }: { open: boolean; title: string; label: string; busy: boolean; onClose: () => void; onSend: (text: string) => void }) {
  const [text, setText] = useState('');
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <Field label={label} required><Textarea value={text} maxLength={300} onChange={(e) => setText(e.target.value)} /></Field>
      <Button disabled={busy || text.trim().length < 3} onClick={() => onSend(text.trim())}>Enviar</Button>
    </Modal>
  );
}

function CollectModal({ r, onClose }: { r: PickupView; onClose: () => void }) {
  const ctx = useRequestContext();
  const qc = useQueryClient();
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const units = ctx.data?.modules.find((m) => m.key === r.module)?.units ?? [r.unit];
  const [f, setF] = useState({ quantity: '', unit: r.unit as PickupUnit, vehicleId: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const p = photos[0];
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await sendOrQueue(`/requests/${r.id}/collect`, { quantity: Number(f.quantity), unit: f.unit, vehicleId: f.vehicleId, note: f.note || null, location: p?.location ?? null }, `Recolección ${r.code}`, { dataUrl: p.preview, kind: 'trip_departure', location: p?.location ?? null });
      if (res) toast.success('Recolección registrada.');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: ['requests'] });
    }
  };
  return (
    <Modal open onClose={onClose} title={`Recolección ${r.code}`}>
      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Cantidad recolectada" required hint={`Estimado: ${r.estimatedQuantity} ${UNIT_LABEL[r.unit]}`}><Input type="number" min={0} step="0.01" inputMode="decimal" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></Field>
        <Field label="Unidad" required><Select value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value as PickupUnit })}>{units.map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}</Select></Field>
      </div>
      <Field label="Vehículo" required><Select value={f.vehicleId} onChange={(e) => setF({ ...f, vehicleId: e.target.value })}><option value="">Elige el vehículo</option>{ctx.data?.vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate}</option>)}</Select></Field>
      <PhotoCapture kind="trip_departure" label="Foto de la carga (obligatoria)" photos={photos} onChange={setPhotos} max={1} deferUpload />
      <Field label="Nota o discrepancia"><Textarea value={f.note} maxLength={500} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      {error && <Alert tone="bad" className="mb-2">{error}</Alert>}
      <Button disabled={busy || !(Number(f.quantity) > 0) || !f.vehicleId || !p} onClick={send}>{busy ? 'Enviando…' : 'Registrar recolección'}</Button>
    </Modal>
  );
}

function Activity() {
  const q = usePickups();
  const [f, setF] = useState({ from: '', to: '', status: '' });
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Alert tone="bad">{errorMessage(q.error)}</Alert>;
  const rows = q.data.filter((r) => r.driverId && (!f.from || r.date >= f.from) && (!f.to || r.date <= f.to) && (!f.status || r.status === f.status)).reverse();
  return (
    <div>
      <PageTitle title="Actividad" subtitle="Tu historial de asignaciones." />
      <Card>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3">
          <Field label="Desde"><Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
          <Field label="Hasta"><Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
          <Field label="Estado"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">Todos</option><option value="completed">Validadas</option><option value="received">Recibidas</option><option value="collected">En tránsito</option><option value="cancelled">Canceladas</option></Select></Field>
        </div>
        {rows.length === 0 ? <EmptyState title="Sin actividad en este filtro" /> : <div className="space-y-2">{rows.map((r) => <PickupCard key={r.id} r={r} actions={<History r={r} />} />)}</div>}
      </Card>
    </div>
  );
}
