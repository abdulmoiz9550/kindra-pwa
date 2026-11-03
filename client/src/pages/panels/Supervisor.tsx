import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { USE_TYPE_LABELS } from '@kindra/shared';
import type { ObservedObjectType } from '@kindra/shared';
import { api, errorMessage } from '../../lib/api';
import { toast } from '../../lib/toast';
import { fmtDateTime, fmtRelative, fmtNum, fmtDate, unitLabel } from '../../lib/format';
import { Card, Button, Field, Select, Textarea, Alert, EmptyState, Modal, PageTitle, Tabs, Spinner, Badge, OriginStateBadge, TripStateBadge, BatchStateBadge } from '../../components/ui';
import { EventHistory } from '../../components/EventHistory';
import { CompositionBars, useSubmit } from '../../components/panels/shared';
import type { SupervisorOverview } from '../../components/panels/types';

type Tab = 'origins' | 'trips' | 'batches' | 'works' | 'discrepancies' | 'times' | 'observations' | 'alerts';
interface Target { objectType: ObservedObjectType; objectId: string; code: string }

export default function Supervisor() {
  const qc = useQueryClient();
  const [sector, setSector] = useState('');
  const [tab, setTab] = useState<Tab>('origins');
  const [target, setTarget] = useState<Target | null>(null);
  const q = useQuery({ queryKey: ['supervisor', 'overview', sector], queryFn: () => api.get<SupervisorOverview>(`/supervisor/overview${sector ? `?sector=${sector}` : ''}`) });
  const d = q.data;
  const refresh = () => qc.invalidateQueries({ queryKey: ['supervisor'] });
  if (q.isLoading) return <Spinner label="Cargando la cadena…" />;
  if (q.error || !d) return <Alert tone="bad">{errorMessage(q.error)}</Alert>;
  const observe = (objectType: ObservedObjectType, objectId: string, code: string) => <Button size="sm" variant="ghost" onClick={() => setTarget({ objectType, objectId, code })}>Observar</Button>;
  const openAlerts = d.alerts.filter((a) => !a.resolvedAt);
  return (
    <div>
      <PageTitle
        title="Panel del supervisor ambiental"
        subtitle="Vista de solo lectura de toda la cadena. Puedes agregar observaciones y marcarlas como alerta para el coordinador."
        actions={
          <Select value={sector} onChange={(e) => setSector(e.target.value)} className="!w-auto" aria-label="Filtrar por sector">
            <option value="">Todos los sectores</option>
            {d.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'origins', label: 'Orígenes', count: d.origins.length },
          { value: 'trips', label: 'Viajes', count: d.trips.length },
          { value: 'batches', label: 'Lotes', count: d.batches.length },
          { value: 'works', label: 'Obras', count: d.works.length },
          { value: 'discrepancies', label: 'Discrepancias', count: d.discrepancies.length },
          { value: 'times', label: 'Horas inconsistentes', count: d.inconsistentTimes.length },
          { value: 'observations', label: 'Observaciones', count: d.observations.length },
          { value: 'alerts', label: 'Alertas', count: openAlerts.length },
        ]}
      />
      <div className="mt-3 space-y-4">
        {tab === 'origins' && (
          <Card title="Orígenes">
            {d.origins.length === 0 ? <EmptyState title="Sin orígenes en este filtro" /> : (
              <div className="overflow-x-auto">
                <table className="table-plain">
                  <thead><tr><th>Código</th><th>Sector</th><th>Estado</th><th>Tipo</th><th>Fecha</th><th>Ficha</th><th></th></tr></thead>
                  <tbody>
                    {d.origins.map((o) => (
                      <tr key={o.id}><td className="font-semibold">{o.code}</td><td>{o.sectorName}</td><td><OriginStateBadge state={o.effectiveState} /></td><td>{o.type === 'citizen' ? 'Ciudadano' : 'Institucional'}</td><td>{fmtDate(o.createdAt)}</td><td>{o.completeness}/7 · <Link className="text-primary underline" to={`/reporte/${o.code}`}>ver</Link></td><td>{observe('origin', o.id, o.code)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
        {tab === 'trips' && (
          <Card title="Viajes">
            {d.trips.length === 0 ? <EmptyState title="Sin viajes" /> : (
              <div className="overflow-x-auto">
                <table className="table-plain">
                  <thead><tr><th>Viaje</th><th>Vehículo</th><th>Orígenes</th><th>Centro</th><th>Salida</th><th>Llegada</th><th>Estado</th><th></th></tr></thead>
                  <tbody>
                    {d.trips.map((t) => (
                      <tr key={t.id}><td className="font-semibold">{t.code}</td><td>{t.vehiclePlate}</td><td>{t.originCodes.join(', ')}</td><td>{t.centerName}</td><td>{fmtDateTime(t.departure.serverTime)}</td><td>{t.arrival ? fmtDateTime(t.arrival.serverTime) : '—'}</td><td><TripStateBadge state={t.state} /></td><td>{observe('trip', t.id, t.code)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
        {tab === 'batches' && (
          <div className="space-y-3">
            {d.batches.length === 0 ? <EmptyState title="Sin lotes" /> : d.batches.map((b) => (
              <Card key={b.id} title={<span className="flex items-center gap-2">{b.code} <BatchStateBadge state={b.state} /></span>} subtitle={`${b.centerName} · ${fmtDate(b.periodStart)} – ${fmtDate(b.periodEnd)} · ${b.receptionIds.length} recepciones${b.outputs ? ` · agregado ${fmtNum(b.outputs.aggregate)} ${unitLabel(b.outputs.unit)}` : ''}`} actions={<div className="flex gap-2">{observe('batch', b.id, b.code)}<Link to={`/publico/lote/${b.code}`} className="btn-ghost btn-sm">Página pública</Link></div>}>
                <CompositionBars composition={b.composition} withTable={false} />
                {b.pendingHazard > 0 && <p className="text-sm text-bad mt-2">{b.pendingHazard} recepción(es) sospechosa(s) sin decisión del evaluador.</p>}
              </Card>
            ))}
          </div>
        )}
        {tab === 'works' && (
          <div className="space-y-3">
            {d.works.length === 0 ? <EmptyState title="Sin obras" /> : d.works.map((w) => (
              <Card key={w.id} title={`${w.code} · ${w.name}`} subtitle={`${USE_TYPE_LABELS[w.useType]} · ${w.locality} · ${w.useRecordedAt ? `uso registrado ${fmtDate(w.dateOfUse || w.useRecordedAt)}` : 'uso sin registrar'}`} actions={<div className="flex gap-2">{observe('work', w.id, w.code)}<Link to={`/publico/obra/${w.code}`} className="btn-ghost btn-sm">Página pública</Link></div>}>
                <CompositionBars composition={w.composition} withTable={false} />
              </Card>
            ))}
          </div>
        )}
        {tab === 'discrepancies' && (
          <Card title="Discrepancia de conteo por centro y día (7.9)" subtitle="Viajes salidos hacia el centro frente a viajes confirmados.">
            {d.discrepancies.length === 0 ? <EmptyState title="Sin discrepancias" /> : (
              <table className="table-plain"><thead><tr><th>Centro</th><th>Día</th><th>Salidos</th><th>Confirmados</th><th>Diferencia</th></tr></thead><tbody>{d.discrepancies.map((x, i) => <tr key={i}><td>{x.centerName}</td><td>{x.day}</td><td>{x.departed}</td><td>{x.confirmed}</td><td className="font-semibold text-bad">{x.difference}</td></tr>)}</tbody></table>
            )}
          </Card>
        )}
        {tab === 'times' && (
          <Card title="Eventos con hora inconsistente (3.4)" subtitle="La hora del dispositivo difiere de la del servidor más allá del umbral configurado, sin pérdida de conexión documentada.">
            {d.inconsistentTimes.length === 0 ? <EmptyState title="Ningún evento con hora inconsistente" /> : <EventHistory events={d.inconsistentTimes} />}
          </Card>
        )}
        {tab === 'observations' && (
          <Card title="Observaciones registradas">
            {d.observations.length === 0 ? <EmptyState title="Todavía no hay observaciones" /> : (
              <ul className="space-y-2">
                {d.observations.map((o) => (
                  <li key={o.id} className="rounded-lg border border-line p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      {o.isAlert ? <Badge tone="bad">Alerta</Badge> : <Badge tone="info">Observación</Badge>}
                      <span className="font-semibold">{o.objectType === 'origin' ? 'Origen' : o.objectType === 'trip' ? 'Viaje' : o.objectType === 'batch' ? 'Lote' : 'Obra'} {o.objectCode}</span>
                      <span className="text-xs text-muted ml-auto">{o.entityName} · {fmtRelative(o.createdAt)}</span>
                    </div>
                    <p className="mt-1">{o.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
        {tab === 'alerts' && (
          <Card title="Alertas del sistema">
            {d.alerts.length === 0 ? <EmptyState title="Sin alertas" /> : (
              <ul className="space-y-2">
                {d.alerts.map((a) => (
                  <li key={a.id} className="rounded-lg border border-line p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={a.resolvedAt ? 'ok' : 'bad'}>{a.resolvedAt ? 'Resuelta' : 'Abierta'}</Badge>
                      <span className="font-semibold">{a.objectCode || a.objectId}</span>
                      <span className="text-xs text-muted ml-auto">{fmtRelative(a.createdAt)}</span>
                    </div>
                    <p className="mt-1">{a.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
      <ObservationModal target={target} onClose={() => setTarget(null)} onDone={() => { setTarget(null); refresh(); }} />
    </div>
  );
}

function ObservationModal({ target, onClose, onDone }: { target: Target | null; onClose: () => void; onDone: () => void }) {
  const { busy, error, run } = useSubmit();
  const [text, setText] = useState('');
  const [isAlert, setIsAlert] = useState(false);
  if (!target) return null;
  const kind = target.objectType === 'origin' ? 'origen' : target.objectType === 'trip' ? 'viaje' : target.objectType === 'batch' ? 'lote' : 'obra';
  return (
    <Modal open onClose={onClose} title={`Observación sobre el ${kind} ${target.code}`}>
      <Field label="Texto de la observación" required>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Qué observaste y dónde." />
      </Field>
      <label className="flex items-center gap-2 text-sm mb-3">
        <input type="checkbox" className="h-5 w-5 accent-[var(--primary)]" checked={isAlert} onChange={(e) => setIsAlert(e.target.checked)} />
        Marcar como alerta (avisa al coordinador)
      </label>
      {error && <Alert tone="bad" className="mb-2">{error}</Alert>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button disabled={busy || text.trim().length < 2} onClick={() => run(async () => { await api.post('/supervisor/observations', { objectType: target.objectType, objectId: target.objectId, text: text.trim(), isAlert }); toast.success(isAlert ? 'Alerta registrada y enviada al coordinador.' : 'Observación registrada.'); onDone(); })}>
          {busy ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </Modal>
  );
}
