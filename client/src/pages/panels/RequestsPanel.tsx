import { useState } from 'react';
import type { PickupUnit } from '@kindra/shared';
import { useAuth } from '../../lib/auth';
import { errorMessage } from '../../lib/api';
import { useTab } from '../../lib/useTab';
import { Alert, Button, EmptyState, Field, Input, Modal, PageTitle, Select, Spinner, Tabs, Textarea } from '../../components/ui';
import { History, PickupCard, UNIT_LABEL, today, usePickupAction, usePickups, useRequestContext, type PickupView } from '../../components/Requests';
import { TextModal } from '../Driver';

type Tab = 'open' | 'review' | 'closed';

/** Solicitudes y asignaciones: coordinación, entidad de retiro, centro y administración (v4.0, 17 y 25.6). */
export default function RequestsPanel() {
  const role = useAuth((s) => s.user?.activeRole);
  const q = usePickups();
  const { run, busy } = usePickupAction();
  const [tab, setTab] = useTab<Tab>('open');
  const [creating, setCreating] = useState(false);
  const [schedule, setSchedule] = useState<PickupView | null>(null);
  const [manage, setManage] = useState<{ r: PickupView; action: 'reassign' | 'cancel' } | null>(null);
  const [receive, setReceive] = useState<PickupView | null>(null);
  const [assign, setAssign] = useState<PickupView | null>(null);
  const ctx = useRequestContext();
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Alert tone="bad">{errorMessage(q.error)}</Alert>;
  const groups: Record<Tab, PickupView[]> = {
    open: q.data.filter((r) => ['submitted', 'new', 'assigned', 'en_route', 'arrived', 'collected'].includes(r.status)),
    review: q.data.filter((r) => ['issue', 'received'].includes(r.status)),
    closed: q.data.filter((r) => ['completed', 'cancelled'].includes(r.status)),
  };
  const coord = role === 'coordinator';
  const canManage = coord || role === 'entity_admin';
  return (
    <div>
      <PageTitle title="Solicitudes" subtitle="Asignación, seguimiento y cierre. La recepción la confirma el centro y la validación es de la coordinación." actions={['coordinator', 'entity_admin', 'removal'].includes(role || '') ? <Button onClick={() => setCreating(true)}>Nueva solicitud</Button> : undefined} />
      <Tabs value={tab} onChange={setTab} items={[{ value: 'open', label: 'En curso', count: groups.open.length }, { value: 'review', label: 'Por revisar', count: groups.review.length }, { value: 'closed', label: 'Cerradas', count: groups.closed.length }]} />
      <div className="mt-3 grid md:grid-cols-2 gap-3">
        {groups[tab].map((r) => (
          <PickupCard
            key={r.id}
            r={r}
            actions={
              <>
                {r.rejections.length > 0 && <Alert tone="warn" className="w-full">Rechazos: {r.rejections.map((x) => `${x.driverAlias ?? 'conductor'}: ${x.reasonLabel ?? x.reason}${x.note ? ` (${x.note})` : ''}`).join('; ')}</Alert>}
                {coord && r.status === 'submitted' && <Button size="sm" onClick={() => setSchedule(r)}>Programar</Button>}
                {coord && r.status === 'received' && <Button size="sm" disabled={busy} onClick={() => run(`/${r.id}/validate`, {}, 'Solicitud validada y cerrada.')}>Validar y cerrar</Button>}
                {role === 'center' && r.module !== 'debris' && r.status === 'collected' && <Button size="sm" onClick={() => setReceive(r)}>Confirmar recepción</Button>}
                {(canManage || role === 'removal') && ['new', 'assigned'].includes(r.status) && <Button size="sm" onClick={() => setAssign(r)}>{r.driverId ? 'Cambiar conductor' : 'Asignar conductor'}</Button>}
                {canManage && ['new', 'assigned', 'en_route', 'arrived', 'issue'].includes(r.status) && r.driverId && <Button size="sm" variant="secondary" onClick={() => setManage({ r, action: 'reassign' })}>Reasignar</Button>}
                {canManage && ['submitted', 'new', 'assigned', 'en_route', 'arrived', 'issue'].includes(r.status) && <Button size="sm" variant="ghost" onClick={() => setManage({ r, action: 'cancel' })}>Cancelar</Button>}
                <History r={r} />
              </>
            }
          />
        ))}
      </div>
      {groups[tab].length === 0 && <EmptyState title="No hay solicitudes aquí" />}
      {creating && <CreateModal onClose={() => setCreating(false)} />}
      {schedule && <ScheduleModal r={schedule} onClose={() => setSchedule(null)} />}
      {receive && <ReceiveModal r={receive} onClose={() => setReceive(null)} />}
      <Modal open={!!assign} onClose={() => setAssign(null)} title={`Asignar conductor ${assign?.code ?? ''}`}>
        {assign && <AssignForm drivers={(ctx.data?.drivers ?? []).filter((d) => d.entityId === assign.operatorEntityId)} busy={busy} onSend={async (driverId) => { if (await run(`/${assign.id}/assign`, { driverId }, 'Conductor asignado.')) setAssign(null); }} />}
      </Modal>
      <TextModal key={manage?.r.id} open={!!manage} title={manage?.action === 'cancel' ? 'Cancelar solicitud' : 'Reasignar solicitud'} label="Motivo" busy={busy} onClose={() => setManage(null)} onSend={async (note) => { if (await run(`/${manage!.r.id}/manage`, { action: manage!.action, note }, 'Cambio registrado.')) setManage(null); }} />
    </div>
  );
}

function WhenFields({ f, set }: { f: { date: string; windowFrom: string; windowTo: string }; set: (p: Partial<{ date: string; windowFrom: string; windowTo: string }>) => void }) {
  return (
    <div className="grid grid-cols-3 gap-x-3">
      <Field label="Fecha" required><Input type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} /></Field>
      <Field label="Desde" required><Input type="time" value={f.windowFrom} onChange={(e) => set({ windowFrom: e.target.value })} /></Field>
      <Field label="Hasta" required><Input type="time" value={f.windowTo} onChange={(e) => set({ windowTo: e.target.value })} /></Field>
    </div>
  );
}

function CreateModal({ onClose }: { onClose: () => void }) {
  const ctx = useRequestContext();
  const { run, busy } = usePickupAction();
  const [f, setF] = useState({ originId: '', operatorEntityId: '', centerId: '', material: '', estimatedQuantity: '', unit: 'm3' as PickupUnit, date: today(), windowFrom: '', windowTo: '', instructions: '', handlingNotes: '' });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const ok = f.originId && f.operatorEntityId && f.centerId && f.material.length > 1 && Number(f.estimatedQuantity) > 0 && f.date && f.windowFrom && f.windowTo && f.windowFrom < f.windowTo;
  return (
    <Modal open onClose={onClose} title="Nueva solicitud de recolección" wide>
      <Field label="Origen validado" required><Select value={f.originId} onChange={(e) => set({ originId: e.target.value })}><option value="">Elige el origen</option>{ctx.data?.origins.map((o) => <option key={o.id} value={o.id}>{o.code} · {o.sectorName}</option>)}</Select></Field>
      <div className="grid sm:grid-cols-2 gap-x-3">
        <Field label="Entidad de retiro" required><Select value={f.operatorEntityId} onChange={(e) => set({ operatorEntityId: e.target.value })}><option value="">Elige la entidad</option>{ctx.data?.operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
        <Field label="Centro de destino" required><Select value={f.centerId} onChange={(e) => set({ centerId: e.target.value })}><option value="">Elige el centro</option>{ctx.data?.centers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Material" required><Input value={f.material} onChange={(e) => set({ material: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-x-2"><Field label="Cantidad estimada" required><Input type="number" min={0} step="0.1" value={f.estimatedQuantity} onChange={(e) => set({ estimatedQuantity: e.target.value })} /></Field><Field label="Unidad"><Select value={f.unit} onChange={(e) => set({ unit: e.target.value as PickupUnit })}><option value="m3">m³</option><option value="t">t</option></Select></Field></div>
      </div>
      <WhenFields f={f} set={set} />
      <Field label="Indicaciones"><Textarea value={f.instructions} onChange={(e) => set({ instructions: e.target.value })} /></Field>
      <Field label="Seguridad y manejo"><Textarea value={f.handlingNotes} onChange={(e) => set({ handlingNotes: e.target.value })} /></Field>
      <Button disabled={busy || !ok} onClick={async () => { if (await run('', { ...f, module: 'debris', estimatedQuantity: Number(f.estimatedQuantity), instructions: f.instructions || null, handlingNotes: f.handlingNotes || null }, 'Solicitud creada.')) onClose(); }}>Crear solicitud</Button>
    </Modal>
  );
}

function ScheduleModal({ r, onClose }: { r: PickupView; onClose: () => void }) {
  const ctx = useRequestContext();
  const { run, busy } = usePickupAction();
  const [f, setF] = useState({ operatorEntityId: '', centerId: '', date: r.date, windowFrom: r.windowFrom, windowTo: r.windowTo, handlingNotes: '' });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  return (
    <Modal open onClose={onClose} title={`Programar ${r.code}`}>
      <Field label="Entidad de retiro" required><Select value={f.operatorEntityId} onChange={(e) => set({ operatorEntityId: e.target.value })}><option value="">Elige la entidad</option>{ctx.data?.operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
      <Field label="Centro de destino" required><Select value={f.centerId} onChange={(e) => set({ centerId: e.target.value })}><option value="">Elige el centro</option>{ctx.data?.centers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
      <WhenFields f={f} set={set} />
      <Field label="Seguridad y manejo"><Textarea value={f.handlingNotes} onChange={(e) => set({ handlingNotes: e.target.value })} /></Field>
      <Button disabled={busy || !f.operatorEntityId || !f.centerId || f.windowFrom >= f.windowTo} onClick={async () => { if (await run(`/${r.id}/schedule`, { ...f, handlingNotes: f.handlingNotes || null }, 'Recolección programada.')) onClose(); }}>Programar</Button>
    </Modal>
  );
}

function ReceiveModal({ r, onClose }: { r: PickupView; onClose: () => void }) {
  const { run, busy } = usePickupAction();
  const [f, setF] = useState({ quantity: '', condition: '' });
  return (
    <Modal open onClose={onClose} title={`Recibir ${r.code}`}>
      <p className="text-sm mb-2">Declarado por el conductor: {r.collected ? `${r.collected.quantity} ${UNIT_LABEL[r.collected.unit]}` : '—'}. Esa cifra no se modifica.</p>
      <Field label={`Cantidad recibida (${UNIT_LABEL[r.unit]})`} required><Input type="number" min={0} step="0.01" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></Field>
      <Field label="Condición"><Input value={f.condition} onChange={(e) => setF({ ...f, condition: e.target.value })} /></Field>
      <Button disabled={busy || f.quantity === ''} onClick={async () => { if (await run(`/${r.id}/receive`, { quantity: Number(f.quantity), unit: r.unit, condition: f.condition || null }, 'Recepción confirmada.')) onClose(); }}>Confirmar recepción</Button>
    </Modal>
  );
}

function AssignForm({ drivers, busy, onSend }: { drivers: { id: string; alias: string }[]; busy: boolean; onSend: (id: string) => void }) {
  const [id, setId] = useState('');
  if (!drivers.length) return <Alert tone="info">La entidad operadora no tiene conductores activos. Créalos desde Usuarios.</Alert>;
  return (
    <>
      <Field label="Conductor" required><Select value={id} onChange={(e) => setId(e.target.value)}><option value="">Elige el conductor</option>{drivers.map((d) => <option key={d.id} value={d.id}>{d.alias}</option>)}</Select></Field>
      <Button disabled={busy || !id} onClick={() => onSend(id)}>Asignar</Button>
    </>
  );
}
