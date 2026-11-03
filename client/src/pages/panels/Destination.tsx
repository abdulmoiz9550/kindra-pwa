import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QrCode } from 'lucide-react';
import { USE_TYPE_LABELS } from '@kindra/shared';
import type { WorkUseType } from '@kindra/shared';
import { api, errorMessage } from '../../lib/api';
import { toast } from '../../lib/toast';
import { fmtNum, fmtDate, unitLabel } from '../../lib/format';
import { Card, Button, Field, Input, Select, Textarea, Alert, EmptyState, Modal, PageTitle, Tabs, Spinner, Badge, DispatchStateBadge } from '../../components/ui';
import { CompositionBars, useSubmit } from '../../components/panels/shared';
import type { DestOverview, WorkView } from '../../components/panels/types';

type Tab = 'pending' | 'works' | 'new';

export default function Destination() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['dest', 'overview'], queryFn: () => api.get<DestOverview>('/dest/overview') });
  const [tab, setTab] = useState<Tab>('pending');
  const [useFor, setUseFor] = useState<WorkView | null>(null);
  const d = q.data;
  const refresh = () => qc.invalidateQueries({ queryKey: ['dest'] });
  if (q.isLoading) return <Spinner label="Cargando el panel…" />;
  if (q.error || !d) return <Alert tone="bad">{errorMessage(q.error)}</Alert>;
  return (
    <div>
      <PageTitle title="Panel de destino final" subtitle="Obras registradas, despachos por confirmar y registro de uso. Al registrar el uso se envía el cierre final a los ciudadanos de los sectores involucrados." />
      <Tabs value={tab} onChange={setTab} items={[{ value: 'pending', label: 'Despachos pendientes', count: d.pendingDispatches.length }, { value: 'works', label: 'Obras', count: d.works.length }, { value: 'new', label: 'Registrar obra' }]} />
      <div className="mt-3 space-y-4">
        {tab === 'pending' && (
          <Card title="Despachos pendientes de confirmar" subtitle="Indica la cantidad recibida. Si es distinta a la despachada, queda registrada como discrepancia.">
            {d.pendingDispatches.length === 0 ? <EmptyState title="No tienes despachos pendientes" /> : <ul className="space-y-2">{d.pendingDispatches.map((x) => <PendingDispatch key={x.id} x={x} onDone={refresh} />)}</ul>}
          </Card>
        )}
        {tab === 'works' && (
          <div className="space-y-3">
            {d.works.length === 0 ? <EmptyState title="Todavía no registraste obras" action={<Button onClick={() => setTab('new')}>Registrar obra</Button>} /> : d.works.map((w) => <WorkCard key={w.id} w={w} onUse={() => setUseFor(w)} />)}
          </div>
        )}
        {tab === 'new' && <WorkForm sectors={d.sectors} onDone={() => { refresh(); setTab('works'); }} />}
      </div>
      <UseModal w={useFor} sectors={d.sectors} onClose={() => setUseFor(null)} onDone={() => { setUseFor(null); refresh(); }} />
    </div>
  );
}

function PendingDispatch({ x, onDone }: { x: DestOverview['pendingDispatches'][number]; onDone: () => void }) {
  const { busy, error, run } = useSubmit();
  const [qty, setQty] = useState(String(x.quantity));
  const [note, setNote] = useState('');
  const differs = qty !== '' && Math.abs(Number(qty) - x.quantity) > 1e-9;
  return (
    <li className="rounded-lg border border-line p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold">{x.code}</span>
        <DispatchStateBadge state={x.state} />
        <span>Lote {x.batchCode} · {x.centerName}</span>
        <span className="text-muted">→ {x.workCode} · {x.workName}</span>
      </div>
      <p className="mt-1">Cantidad despachada: <strong>{fmtNum(x.quantity)} {unitLabel(x.unit)}</strong></p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <Field label={`Cantidad recibida (${unitLabel(x.unit)})`} required>
          <Input type="number" min={0} step="0.1" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} className="!w-40" />
        </Field>
        <Field label="Nota (opcional)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} className="!w-56" />
        </Field>
        <Button className="mb-4" disabled={busy || qty === ''} onClick={() => run(async () => { await api.post(`/dest/dispatches/${x.id}/receive`, { quantityReceived: Number(qty), note: note || null }); toast.success(differs ? 'Recepción registrada con discrepancia de cantidad.' : 'Recepción confirmada.'); onDone(); })}>
          {differs ? 'Confirmar con discrepancia' : 'Confirmar recepción'}
        </Button>
      </div>
      {differs && <Alert tone="warn">La cantidad difiere de la despachada: se registrará una discrepancia visible para el supervisor.</Alert>}
      {error && <Alert tone="bad" className="mt-2">{error}</Alert>}
    </li>
  );
}

function WorkCard({ w, onUse }: { w: WorkView; onUse: () => void }) {
  const received = w.dispatches.filter((x) => x.state !== 'pending');
  return (
    <Card
      title={<span>{w.code} · {w.name}</span>}
      subtitle={`${USE_TYPE_LABELS[w.useType]} · ${w.locality}${w.sectorName ? ` · ${w.sectorName}` : ''}`}
      actions={
        <div className="flex gap-2 flex-wrap">
          <Link to={`/publico/qr/obra/${w.code}`} className="btn-ghost btn-sm"><QrCode size={16} /> QR</Link>
          <Link to={`/publico/obra/${w.code}`} className="btn-ghost btn-sm">Página pública</Link>
        </div>
      }
    >
      <div className="flex flex-wrap gap-2 mb-2">
        {w.useRecordedAt ? <Badge tone="ok">Uso registrado el {fmtDate(w.dateOfUse || w.useRecordedAt)}</Badge> : <Badge tone="warn">Uso sin registrar</Badge>}
        <Badge tone="neutral" icon={false}>{w.dispatches.length} despacho{w.dispatches.length === 1 ? '' : 's'}</Badge>
        {w.totalReceived > 0 && <Badge tone="info" icon={false}>Recibido: {fmtNum(w.totalReceived)} {unitLabel(w.unit)}</Badge>}
      </div>
      {w.dispatches.length > 0 && (
        <table className="table-plain mb-2">
          <thead><tr><th>Despacho</th><th>Lote</th><th>Centro</th><th>Despachado</th><th>Recibido</th><th>Estado</th></tr></thead>
          <tbody>{w.dispatches.map((x) => <tr key={x.id}><td>{x.code}</td><td>{x.batchCode}</td><td>{x.centerName}</td><td>{fmtNum(x.quantity)} {unitLabel(x.unit)}</td><td>{x.quantityReceived == null ? '—' : fmtNum(x.quantityReceived)}</td><td><DispatchStateBadge state={x.state} /></td></tr>)}</tbody>
        </table>
      )}
      {w.composition.length > 0 && (
        <div className="mb-2">
          <p className="text-xs text-muted mb-1">Sectores de origen del material (balance de masas, 7.6)</p>
          <CompositionBars composition={w.composition} withTable={false} />
        </div>
      )}
      {!w.useRecordedAt && (
        <Button size="sm" disabled={received.length === 0} onClick={onUse}>
          Registrar uso
        </Button>
      )}
      {!w.useRecordedAt && received.length === 0 && <p className="text-xs text-muted mt-1">Confirma al menos un despacho antes de registrar el uso.</p>}
    </Card>
  );
}

function WorkForm({ sectors, onDone }: { sectors: DestOverview['sectors']; onDone: () => void }) {
  const { busy, error, run } = useSubmit();
  const [f, setF] = useState({ name: '', useType: 'road_base' as WorkUseType, locality: '', sectorId: '', dateOfUse: '' });
  return (
    <Card title="Registrar obra" subtitle="Nombre genérico, tipo de uso y localidad beneficiada. La plataforma genera su QR.">
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field label="Nombre genérico" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ej. Base de vía, tramo 2" /></Field>
        <Field label="Tipo de uso" required>
          <Select value={f.useType} onChange={(e) => setF({ ...f, useType: e.target.value as WorkUseType })}>{Object.entries(USE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        </Field>
        <Field label="Localidad beneficiada" required><Input value={f.locality} onChange={(e) => setF({ ...f, locality: e.target.value })} /></Field>
        <Field label="Sector (opcional)">
          <Select value={f.sectorId} onChange={(e) => setF({ ...f, sectorId: e.target.value })}><option value="">Sin sector</option>{sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        </Field>
        <Field label="Fecha prevista de uso (opcional)"><Input type="date" value={f.dateOfUse} onChange={(e) => setF({ ...f, dateOfUse: e.target.value })} /></Field>
      </div>
      {error && <Alert tone="bad" className="mb-2">{error}</Alert>}
      <Button disabled={busy || !f.name.trim() || !f.locality.trim()} onClick={() => run(async () => { const w = await api.post<WorkView>('/dest/works', { name: f.name.trim(), useType: f.useType, locality: f.locality.trim(), sectorId: f.sectorId || null, dateOfUse: f.dateOfUse || null }); toast.success(`Obra ${w.code} registrada.`); onDone(); })}>
        {busy ? 'Registrando…' : 'Registrar obra'}
      </Button>
    </Card>
  );
}

function UseModal({ w, sectors, onClose, onDone }: { w: WorkView | null; sectors: DestOverview['sectors']; onClose: () => void; onDone: () => void }) {
  const { busy, error, run } = useSubmit();
  const [f, setF] = useState({ useType: '' as WorkUseType | '', locality: '', dateOfUse: new Date().toISOString().slice(0, 10), sectorId: '' });
  if (!w) return null;
  return (
    <Modal open onClose={onClose} title={`Registrar uso · ${w.code}`}>
      <p className="text-sm text-ink-2 mb-3">Confirma tipo de uso, localidad beneficiada y fecha. Al guardar, los reportes de los sectores presentes en los lotes recibidos pasan a “material usado en obra” y reciben el cierre final.</p>
      <Field label="Tipo de uso"><Select value={f.useType} onChange={(e) => setF({ ...f, useType: e.target.value as WorkUseType })}><option value="">Mantener: {USE_TYPE_LABELS[w.useType]}</option>{Object.entries(USE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
      <Field label="Localidad beneficiada"><Input value={f.locality} onChange={(e) => setF({ ...f, locality: e.target.value })} placeholder={w.locality} /></Field>
      <Field label="Fecha de uso" required><Input type="date" value={f.dateOfUse} onChange={(e) => setF({ ...f, dateOfUse: e.target.value })} /></Field>
      <Field label="Sector"><Select value={f.sectorId} onChange={(e) => setF({ ...f, sectorId: e.target.value })}><option value="">Mantener{w.sectorName ? `: ${w.sectorName}` : ''}</option>{sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
      <Field label="Nota interna (no se guarda)"><Textarea placeholder="Solo como ayuda para quien registra" /></Field>
      {error && <Alert tone="bad" className="mb-2">{error}</Alert>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button disabled={busy || !f.dateOfUse} onClick={() => run(async () => { const r = await api.post<{ closedOrigins: number }>(`/dest/works/${w.id}/use`, { useType: f.useType || undefined, locality: f.locality.trim() || undefined, dateOfUse: new Date(f.dateOfUse).toISOString(), sectorId: f.sectorId || null }); toast.success(`Uso registrado. Se envió el cierre final a ${r.closedOrigins} reporte${r.closedOrigins === 1 ? '' : 's'}.`); onDone(); })}>
          {busy ? 'Registrando…' : 'Registrar uso'}
        </Button>
      </div>
    </Modal>
  );
}
