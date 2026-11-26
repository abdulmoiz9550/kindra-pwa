import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PICKUP_STATUS_LABELS, statusText } from '@kindra/shared';
import type { GeoPoint, PickupRequest, PickupStatus, PickupUnit } from '@kindra/shared';
import { api, errorMessage } from '../lib/api';
import { toast } from '../lib/toast';
import { fmtDateTime, fmtNum } from '../lib/format';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Spinner, type Tone } from './ui';
import { HBars } from './charts/Bars';
import { Link } from 'react-router-dom';
import { useModule } from '../lib/module';

export interface PickupView extends Omit<PickupRequest, 'received' | 'rejections'> {
  sectorName: string | null;
  centerName: string | null;
  requesterName: string | null;
  operatorName: string | null;
  driverAlias: string | null;
  tripCode: string | null;
  photoUrls: string[];
  received: { quantity: number | null; unit: PickupUnit | null; condition: string | null; at: string; check: { dispatched: number | null; difference: number | null; flagged: boolean } | null } | null;
  rejections: { driverId: string; reason: string; note: string | null; at: string; driverAlias?: string | null; reasonLabel?: string }[];
}

export interface RequestContext {
  modules: { key: 'debris' | 'oil'; label: string; units: PickupUnit[] }[];
  vehicles: { id: string; plate: string }[];
  centers: { id: string; name: string }[];
  operators: { id: string; name: string }[];
  drivers?: { id: string; alias: string; entityId: string }[];
  origins: { id: string; code: string; sectorName: string | null }[];
}

export const UNIT_LABEL: Record<PickupUnit, string> = { l: 'litros', kg: 'kg', t: 't', m3: 'm³' };
export const MODULE_LABEL: Record<string, string> = { debris: 'Escombros', oil: 'Aceite de cocina usado' };
const TONE: Record<PickupStatus, Tone> = { submitted: 'info', new: 'info', assigned: 'warn', en_route: 'warn', arrived: 'warn', collected: 'warn', received: 'info', completed: 'ok', issue: 'bad', cancelled: 'neutral' };

export function PickupBadge({ status }: { status: PickupStatus }) {
  return <Badge tone={TONE[status]}>{statusText('pickup', status, PICKUP_STATUS_LABELS[status])}</Badge>;
}

/** Fecha del piloto (Venezuela), sin importar la zona horaria del teléfono. */
export const dayOf = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
export const today = () => dayOf(new Date());

export function usePickups() {
  const module = useModule((s) => s.module);
  return useQuery({ queryKey: ['requests'], queryFn: () => api.get<PickupView[]>('/requests'), refetchInterval: 30_000, select: (l) => (module ? l.filter((r) => r.module === module) : l) });
}
export function useRequestContext() {
  return useQuery({ queryKey: ['requests', 'context'], queryFn: () => api.get<RequestContext>('/requests/context') });
}

/** Ejecuta una acción sobre solicitudes; solo avisa del éxito cuando el servidor lo confirmó. */
export function usePickupAction() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const run = async (path: string, body: unknown, ok: string): Promise<PickupView | null> => {
    setBusy(true);
    try {
      const r = await api.post<PickupView>(`/requests${path}`, body);
      toast.success(ok);
      return r;
    } catch (err) {
      toast.error(errorMessage(err));
      return null;
    } finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: ['requests'] });
    }
  };
  return { run, busy };
}

export const gmaps = (p: GeoPoint) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;

export function PickupCard({ r, actions, showMap = false }: { r: PickupView; actions?: ReactNode; showMap?: boolean }) {
  return (
    <article className="rounded-xl border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="font-mono">{r.code}</strong>
        <PickupBadge status={r.status} />
      </div>
      <p className="text-sm mt-1">
        {MODULE_LABEL[r.module]} · {r.material} · {fmtNum(r.estimatedQuantity, 2)} {UNIT_LABEL[r.unit]} <span className="text-muted">(estimado)</span>
      </p>
      <p className="text-sm">
        {r.date} · {r.windowFrom} a {r.windowTo}
      </p>
      <p className="text-xs text-muted">
        {[r.requesterName, r.address, r.sectorName].filter(Boolean).join(' · ') || 'Dirección por confirmar'}
        {r.centerName ? ` → ${r.centerName}` : ''}
      </p>
      {showMap && r.location && (
        <a className="text-sm text-primary underline" href={gmaps(r.location)} target="_blank" rel="noreferrer">
          Abrir ubicación
        </a>
      )}
      {r.instructions && <p className="text-sm mt-1">Indicaciones: {r.instructions}</p>}
      {r.handlingNotes && <Alert tone="warn" className="mt-2">Seguridad y manejo: {r.handlingNotes}</Alert>}
      {r.operatorName && <p className="text-xs text-muted">Equipo: {r.operatorName}{r.driverAlias ? ` · ${r.driverAlias}` : ''}</p>}
      {r.collected && <p className="text-sm mt-1">Recolectado: <strong>{fmtNum(r.collected.quantity, 2)} {UNIT_LABEL[r.collected.unit]}</strong> · {fmtDateTime(r.collected.at)}</p>}
      {r.received && (
        <p className="text-sm">
          Recibido en el centro: <strong>{r.received.quantity === null ? 'sin cantidad registrada' : `${fmtNum(r.received.quantity, 2)} ${UNIT_LABEL[r.received.unit!]}`}</strong> · {fmtDateTime(r.received.at)}
          {r.received.check?.flagged && <Badge tone="warn">Diferencia {fmtNum(r.received.check.difference, 2)}, por revisar</Badge>}
        </p>
      )}
      {r.issue && <Alert tone="bad" className="mt-2">Incidencia: {r.issue.text}</Alert>}
      {r.photoUrls.length > 0 && <div className="flex gap-2 mt-2">{r.photoUrls.map((u) => <img key={u} src={u} alt="Foto de la solicitud" className="h-16 w-16 rounded object-cover" />)}</div>}
      {actions && <div className="mt-2 flex flex-wrap gap-2">{actions}</div>}
    </article>
  );
}

export function History({ r }: { r: PickupView }) {
  const names: Record<string, string> = { created: 'Creada', submitted: 'Enviada', scheduled: 'Programada', accepted: 'Aceptada', rejected: 'Rechazada', en_route: 'En camino', arrived: 'Llegada al punto', collected: 'Recolectada', received: 'Recibida', validated: 'Validada', issue: 'Incidencia', reassign: 'Reasignada', cancel: 'Cancelada', cancelled_by_requester: 'Cancelada por quien la pidió' };
  return <ul className="text-xs text-muted">{r.history.map((h, n) => <li key={n}>{fmtDateTime(h.at)} · {names[h.action] || h.action}{h.note ? ` · ${h.note}` : ''}</li>)}</ul>;
}

export interface Impact {
  from: string | null;
  to: string | null;
  completed: number;
  status: string;
  onTime: { count: number; total: number } | null;
  m3: number | null;
  t: number | null;
  l: number | null;
  months: { month: string; completed: number; m3: number | null; t: number | null; l: number | null }[];
  source: string;
}

/** Impacto verificado con rango de fechas. Cada unidad va en su propia serie; nunca se suman. */
export function ImpactPanel({ title, countLabel }: { title: string; countLabel: string }) {
  const [f, setF] = useState({ from: '', to: '', module: '', status: '' });
  const [month, setMonth] = useState<string | null>(null);
  const own = usePickups();
  const ctx = useRequestContext();
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const q = useQuery({ queryKey: ['requests', 'impact', qs], queryFn: () => api.get<Impact>(`/requests/impact${qs ? `?${qs}` : ''}`), placeholderData: (p) => p });
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Alert tone="bad">{errorMessage(q.error)}</Alert>;
  const d = q.data;
  const units = (['m3', 't', 'l'] as const).filter((u) => d[u] !== null);
  return (
    <div className="space-y-4">
      <Card title={title} subtitle={`Fuente: ${d.source}. Periodo: ${d.from || d.to ? `${d.from || 'inicio'} a ${d.to || 'hoy'}` : 'todo el registro'}.`}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3">
          <Field label="Desde"><Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
          <Field label="Hasta"><Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
          <Field label="Estado">
            <select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              <option value="">Validadas</option>
              <option value="received">Recibidas, por validar</option>
            </select>
          </Field>
          {(ctx.data?.modules.length ?? 0) > 1 && (
            <Field label="Módulo">
              <select className="input" value={f.module} onChange={(e) => setF({ ...f, module: e.target.value })}>
                <option value="">Todos</option>
                {ctx.data!.modules.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </Field>
          )}
        </div>
        {d.completed === 0 ? (
          <EmptyState title="Sin recolecciones en este periodo" text="Aparecen cuando el centro confirma la recepción y la coordinación valida." />
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              <Kpi label={d.status === 'received' ? 'Recibidas, por validar' : countLabel} value={String(d.completed)} />
              {d.onTime && <Kpi label="Recolectadas a tiempo" value={`${Math.round((d.onTime.count / d.onTime.total) * 100)} %`} note={`${d.onTime.count} de ${d.onTime.total}, hasta el fin del horario acordado`} />}
              {units.map((u) => <Kpi key={u} label="Cantidad recibida" value={`${fmtNum(d[u], 2)} ${UNIT_LABEL[u]}`} />)}
            </div>
            <HBars title={`${countLabel}, por mes`} rows={d.months.map((m) => ({ label: m.month, value: m.completed }))} linkRow={(r) => <button type="button" className="underline text-primary" onClick={() => setMonth(month === r.label ? null : r.label)}>{r.label}</button>} />
            {month && <div className="mt-3 space-y-2"><h3 className="label">Registros de {month}</h3>{(own.data || []).filter((r) => r.date.startsWith(month) && r.status === d.status && (!f.module || r.module === f.module) && (!f.from || r.date >= f.from) && (!f.to || r.date <= f.to)).map((r) => <PickupCard key={r.id} r={r} />)}</div>}
            {units.map((u) => (
              <div key={u} className="mt-4">
                <HBars title={`Cantidad recibida por mes (${UNIT_LABEL[u]})`} unit={UNIT_LABEL[u]} rows={d.months.map((m) => ({ label: m.month, value: m[u] }))} />
              </div>
            ))}
          </>
        )}
        <p className="text-xs text-muted mt-3">No se muestran equivalencias ambientales: todavía no hay una metodología aprobada.</p>
      </Card>
    </div>
  );
}

export function Kpi({ label, value, note, to }: { label: string; value: ReactNode; note?: string; to?: string }) {
  const body = (
    <div className="card !p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-xl font-bold mt-1">{value}</p>
      {note && <p className="text-[11px] text-muted mt-1">{note}</p>}
    </div>
  );
  return to ? <Link to={to} className="block hover:opacity-80">{body}</Link> : body;
}
