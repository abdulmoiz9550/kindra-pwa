import Reconciliation from './Reconciliation';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { EXPORT_ROLES } from '@kindra/shared';
import type { GeoPoint, ReportIndicator, ReportSnapshotRow, ReportSnapshotTotals } from '@kindra/shared';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { usePublicConfig } from '../../lib/config';
import { toast } from '../../lib/toast';
import { useTab } from '../../lib/useTab';
import { fmtDateTime, fmtNum, unitLabel } from '../../lib/format';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, PageTitle, Select, Spinner, Tabs } from '../../components/ui';
import { HBars } from '../../components/charts/Bars';
import { MapView } from '../../components/MapView';

type Measure = keyof ReportSnapshotTotals;
interface Sum {
  value: number | null;
  missing: number;
}
type Row = ReportSnapshotRow & { operatorName: string | null };
interface SnapshotView {
  snapshot: { id: string; title: string; source: string; reportedAt: string; importedAt: string; note: string };
  indicators: ReportIndicator[];
  facilities: { facilityId: string; name: string; type: string; location: GeoPoint | null; coordinates: 'exact' | 'missing'; active: boolean; operators: { id: string | null; name: string | null }[]; rows: Row[]; totals: Record<Measure, Sum> }[];
  unlinked: Row[];
  totals: Record<Measure, Sum>;
  filtered: boolean;
  consistency: Record<Measure, { reported: number | null; computed: number | null; difference: number | null }>;
  operators: { id: string; name: string }[];
  scope: 'global' | 'facility' | 'organization';
}
interface ActivitySummary {
  loadsDay: number;
  loads: number;
  m3Day: number | null;
  m3: number | null;
  tonnesDay: number | null;
  tonnes: number | null;
  withoutQuantity: number;
  flagged: number;
}
interface Activity {
  from: string | null;
  to: string;
  source: string;
  rows: (ActivitySummary & { facilityId: string; facilityName: string; operatorId: string | null; operatorName: string })[];
  totals: ActivitySummary;
  records: { id: string; tripId: string; tripCode: string | null; originCodes: string[]; facilityId: string; facilityName: string | null; operatorId: string | null; receivedAt: string; quantity: number | null; unit: 't' | 'm3' | null; flagged: boolean; check: { dispatched: number | null; difference: number | null } | null }[];
}

const MEASURES: { value: Measure; label: string; unit: string }[] = [
  { value: 'tonnesAccumulated', label: 'Toneladas, acumulado', unit: 't' },
  { value: 'tonnesToday', label: 'Toneladas, del día', unit: 't' },
  { value: 'm3Accumulated', label: 'm³, acumulado', unit: 'm³' },
  { value: 'm3Today', label: 'm³, del día', unit: 'm³' },
];
/** El reporte trae dos decimales; un guion se muestra como guion, nunca como cero. */
const num = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/** v4.0, secciones 3, 4, 8 y 20: reportes por centro físico y operador. */
export default function Reports() {
  const [tab, setTab] = useTab<'snapshot' | 'activity' | 'reconciliation'>('snapshot');
  return (
    <div>
      <PageTitle title="Reportes por centro" subtitle="Cifras por centro físico y por operador. Metros cúbicos y toneladas se muestran por separado, igual que el día y el acumulado." />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'snapshot', label: 'Reporte operativo oficial' },
          { value: 'activity', label: 'Registros de Kindra' },
          { value: 'reconciliation', label: 'Conciliación' },
        ]}
      />
      <div className="mt-3">{tab === 'snapshot' ? <Snapshot /> : tab === 'activity' ? <ActivityReport /> : <Reconciliation />}</div>
    </div>
  );
}

function Snapshot() {
  const role = useAuth((s) => s.user?.activeRole);
  const [operator, setOperator] = useState('');
  const [facility, setFacility] = useState('');
  const [measure, setMeasure] = useState<Measure>('tonnesAccumulated');
  const [busy, setBusy] = useState(false);
  const qs = new URLSearchParams({ ...(operator ? { operator } : {}), ...(facility ? { facility } : {}) }).toString();
  const q = useQuery({ queryKey: ['reports', 'snapshot', qs], queryFn: () => api.get<SnapshotView>(`/reports/snapshots/view${qs ? `?${qs}` : ''}`), placeholderData: (p) => p });
  if (q.isLoading) return <Spinner label="Cargando el reporte…" />;
  if (q.error || !q.data) return <Alert tone="bad">{errorMessage(q.error)}</Alert>;
  const d = q.data;
  const unit = MEASURES.find((m) => m.value === measure)!.unit;
  const shown = d.facilities.filter((f) => f.rows.length > 0);
  const missing = d.facilities.filter((f) => f.coordinates === 'missing');
  const mismatches = MEASURES.filter((m) => d.consistency[m.value].difference);
  const canExport = !!role && EXPORT_ROLES.includes(role);

  const download = async () => {
    setBusy(true);
    try {
      const csv = await api.text(`/reports/snapshots/export${qs ? `?${qs}` : ''}`);
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `reporte-operativo-${d.snapshot.reportedAt.slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Descarga lista. Quedó registrada en la bitácora.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Alert tone="info" title={`${d.snapshot.title} · ${fmtDateTime(d.snapshot.reportedAt)}`}>
        {d.snapshot.note} Fuente: {d.snapshot.source}.
      </Alert>

      {d.scope === 'global' && (
        <section aria-label="Indicadores reportados" className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {d.indicators.map((i) => (
            <div key={i.key} className="card !p-3">
              <p className="text-xs text-muted">{i.label}</p>
              {i.value !== null && (
                <p className="text-xl font-bold mt-1">
                  {i.value.toLocaleString('es-VE', { maximumFractionDigits: 2 })} <span className="text-xs text-muted font-semibold">{i.unit}</span>
                </p>
              )}
              {i.breakdown?.map((b) => (
                <p key={b.label} className="text-xs mt-1">
                  {b.label}: <strong>{b.value}</strong>
                </p>
              ))}
              <p className="text-[11px] text-muted mt-1">Reportado, {fmtDateTime(d.snapshot.reportedAt)}</p>
            </div>
          ))}
        </section>
      )}

      <Card title="Por centro físico y operador" actions={canExport && <Button size="sm" variant="secondary" disabled={busy} onClick={download}>{busy ? 'Preparando…' : 'Exportar CSV'}</Button>}>
        <div className="grid sm:grid-cols-3 gap-x-3">
          {d.scope !== 'organization' && (
            <Field label="Operador">
              <Select value={operator} onChange={(e) => setOperator(e.target.value)}>
                <option value="">Todos los operadores</option>
                {d.operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
            </Field>
          )}
          {d.scope !== 'facility' && (
            <Field label="Centro">
              <Select value={facility} onChange={(e) => setFacility(e.target.value)}>
                <option value="">Todos los centros</option>
                {d.facilities.map((f) => <option key={f.facilityId} value={f.facilityId}>{f.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Medida del gráfico">
            <Select value={measure} onChange={(e) => setMeasure(e.target.value as Measure)}>
              {MEASURES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </Select>
          </Field>
        </div>
        {shown.length === 0 && d.unlinked.length === 0 ? (
          <EmptyState title="Sin filas en este alcance" text="El reporte no trae cifras para tu organización o para este filtro." />
        ) : (
          <>
            <HBars linkRow={(r) => (d.scope === 'facility' ? r.label : <button type="button" className="underline text-primary text-left" onClick={() => { const id = shown.find((x) => x.name === r.label)?.facilityId || ''; setFacility(facility === id ? '' : id); }}>{r.label}</button>)} title={`${MEASURES.find((m) => m.value === measure)!.label} · ${fmtDateTime(d.snapshot.reportedAt)}`} unit={unit} rows={shown.map((f) => ({ label: f.name, value: f.totals[measure].value, display: f.totals[measure].value === null ? 'sin cifra en el reporte' : `${num(f.totals[measure].value)} ${unit}` }))} />
            <div className="overflow-x-auto mt-4">
              <table className="table-plain">
                <caption className="sr-only">Cifras por centro físico y operador</caption>
                <thead>
                  <tr>
                    <th scope="col" className="min-w-[150px]">Centro físico / operador</th>
                    {['m³ del día', 'm³ acumulado', 't del día', 't acumulado'].map((h) => <th key={h} scope="col" className="text-right whitespace-nowrap !pl-4 !normal-case">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((f) => (
                    <FacilityRows key={f.facilityId} active={f.active} name={f.name} note={f.coordinates === 'missing' ? 'sin coordenadas' : undefined} rows={f.rows} totals={f.totals} />
                  ))}
                  {d.unlinked.map((r) => (
                    <tr key={r.id}>
                      <td>
                        {r.label} <Badge tone="warn">Sitio por confirmar</Badge>
                        <span className="block text-xs text-muted">{r.facilityPending}</span>
                      </td>
                      <Figures r={r} />
                    </tr>
                  ))}
                  <tr className="font-bold">
                    <td>{d.filtered || d.scope !== 'global' ? 'Suma de lo mostrado' : 'Suma de las filas'}</td>
                    <TotalFigures totals={d.totals} />
                  </tr>
                  {!d.filtered && d.scope === 'global' && (
                    <tr>
                      <td className="text-muted">Total oficial del reporte</td>
                      <Figures r={{ m3Today: d.consistency.m3Today.reported, m3Accumulated: d.consistency.m3Accumulated.reported, tonnesToday: d.consistency.tonnesToday.reported, tonnesAccumulated: d.consistency.tonnesAccumulated.reported }} />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted mt-2">Un guion (—) es una cifra que el reporte no trae. No significa cero y no entra en las sumas. Un asterisco (*) marca una suma parcial: alguna fila no trae cifra.</p>
          </>
        )}
      </Card>

      {d.scope === 'global' && !d.filtered && mismatches.length > 0 && (
        <Alert tone="warn" title="Discrepancia de la fuente">
          {mismatches.map((m) => `${m.label}: total oficial ${num(d.consistency[m.value].reported)}, suma de filas ${num(d.consistency[m.value].computed)} (diferencia ${num(d.consistency[m.value].difference)} ${m.unit}).`).join(' ')} La cifra oficial no se corrige; se guardan ambas.
        </Alert>
      )}

      <Card title="Ubicación de los centros" subtitle="Un punto por sitio físico, con las coordenadas entregadas al proyecto.">
        <MapView height={300} points={d.facilities.filter((f) => f.location).map((f) => ({ id: f.facilityId, lat: f.location!.lat, lng: f.location!.lng, color: 'var(--brand-teal)', label: `${f.name}${f.operators.some((o) => o.name) ? ` · ${f.operators.map((o) => o.name).filter(Boolean).join(', ')}` : ''}`, onClick: d.scope === 'facility' ? undefined : () => setFacility(f.facilityId) }))} />
        {missing.length > 0 && <p className="text-sm mt-2">Sin coordenadas entregadas: {missing.map((f) => f.name).join(', ')}. No se ubican hasta recibirlas.</p>}
      </Card>
    </div>
  );
}

const KEYS: Measure[] = ['m3Today', 'm3Accumulated', 'tonnesToday', 'tonnesAccumulated'];
const CELL = 'text-right tabular-nums whitespace-nowrap !pl-4';

function Figures({ r }: { r: ReportSnapshotTotals }) {
  return <>{KEYS.map((k) => <td key={k} className={CELL}>{num(r[k])}</td>)}</>;
}

/** Suma de filas. El asterisco avisa que alguna fila no trae cifra: el total es parcial. */
function TotalFigures({ totals }: { totals: Record<Measure, Sum> }) {
  return (
    <>
      {KEYS.map((k) => (
        <td key={k} className={CELL}>
          {num(totals[k].value)}
          {totals[k].value !== null && totals[k].missing > 0 && <span title={`${totals[k].missing} fila(s) sin cifra`}>*</span>}
        </td>
      ))}
    </>
  );
}

function FacilityRows({ name, active, note, rows, totals }: { name: string; active: boolean; note?: string; rows: Row[]; totals: Record<Measure, Sum> }) {
  return (
    <>
      <tr className="font-semibold">
        <td>
          {name} <Badge tone={active ? 'ok' : 'neutral'}>{active ? 'Activo' : 'Sin material hoy'}</Badge> {note && <Badge tone="warn" icon={false}>{note}</Badge>}
        </td>
        {rows.length === 1 ? <Figures r={rows[0]} /> : <TotalFigures totals={totals} />}
      </tr>
      {rows.map((r) => (
        <tr key={r.id} className="text-sm">
          <td className="!pl-6 text-ink-2">
            {r.operatorName || 'Operador no indicado en el reporte'}
            <span className="block text-xs text-muted">En el reporte: {r.label}</span>
          </td>
          {rows.length === 1 ? <td colSpan={4} /> : <Figures r={r} />}
        </tr>
      ))}
    </>
  );
}

function ActivityReport() {
  const { data: cfg } = usePublicConfig();
  const role = useAuth((s) => s.user?.activeRole);
  const [f, setF] = useState({ from: '', to: '', facility: '', sector: '' });
  const [pick, setPick] = useState<{ facilityId: string; operatorId: string | null } | null>(null);
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const q = useQuery({ queryKey: ['reports', 'activity', qs], queryFn: () => api.get<Activity>(`/reports/activity${qs ? `?${qs}` : ''}`), placeholderData: (p) => p });
  if (q.isLoading) return <Spinner label="Cargando los registros…" />;
  if (q.error || !q.data) return <Alert tone="bad">{errorMessage(q.error)}</Alert>;
  const d = q.data;
  const set = (k: keyof typeof f) => (v: string) => {
    setPick(null);
    setF({ ...f, [k]: v });
  };
  const period = `${d.from ? `del ${d.from} ` : ''}al ${d.to}`;
  const records = pick ? d.records.filter((r) => r.facilityId === pick.facilityId && r.operatorId === pick.operatorId) : d.records;
  return (
    <div className="space-y-4">
      {cfg?.demoMode && <Alert tone="warn">Esta instalación tiene datos de demostración: estos registros no son cifras operativas reales.</Alert>}
      <Card title="Recepciones registradas por los centros" subtitle={`Fuente: ${d.source}. Periodo: ${period}.`}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3">
          <Field label="Desde"><Input type="date" value={f.from} onChange={(e) => set('from')(e.target.value)} /></Field>
          <Field label="Hasta"><Input type="date" value={f.to} onChange={(e) => set('to')(e.target.value)} /></Field>
          {role !== 'center' && (
            <Field label="Centro">
              <Select value={f.facility} onChange={(e) => set('facility')(e.target.value)}>
                <option value="">Todos</option>
                {cfg?.centers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Sector">
            <Select value={f.sector} onChange={(e) => set('sector')(e.target.value)}>
              <option value="">Todos</option>
              {cfg?.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
        </div>
        {d.rows.length === 0 ? (
          <EmptyState title="Sin recepciones en este periodo" text="Cuando un centro confirme una llegada aparecerá aquí. Prueba con otro rango de fechas." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-plain">
              <thead>
                <tr>
                  <th scope="col">Centro / operador</th>
                  {[`Viajes el ${d.to}`, 'Viajes, periodo', `m³ el ${d.to}`, 'm³, periodo', `t el ${d.to}`, 't, periodo', 'Sin cantidad', 'Discrepancias'].map((h) => <th key={h} scope="col" className="text-right">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r) => (
                  <tr key={`${r.facilityId}${r.operatorId}`}>
                    <td>
                      <button type="button" className="text-primary underline text-left" onClick={() => setPick({ facilityId: r.facilityId, operatorId: r.operatorId })}>{r.facilityName}</button>
                      <span className="block text-xs text-muted">{r.operatorName}</span>
                    </td>
                    <SummaryCells s={r} />
                  </tr>
                ))}
                <tr className="font-bold">
                  <td>Total</td>
                  <SummaryCells s={d.totals} />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {d.records.length > 0 && (
        <Card title={pick ? 'Registros del centro y operador elegidos' : 'Registros'} subtitle={role === 'entity_admin' ? undefined : 'Cada fila abre el recorrido del viaje.'} actions={pick && <Button size="sm" variant="ghost" onClick={() => setPick(null)}>Ver todos</Button>}>
          <ul className="divide-y divide-line">
            {records.map((r) => (
              <li key={r.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  {role === 'entity_admin' ? <strong>{r.tripCode}</strong> : <Link className="font-semibold text-primary underline" to={`/panel/viaje/${r.tripId}`}>{r.tripCode}</Link>} · {r.facilityName} · {r.originCodes.join(', ')}
                  <span className="block text-xs text-muted">{fmtDateTime(r.receivedAt)}</span>
                </span>
                <span className="flex items-center gap-2">
                  {r.flagged && <Badge tone="warn">Por revisar{r.check?.difference ? ` (${r.check.difference > 0 ? '+' : ''}${fmtNum(r.check.difference)} m³)` : ''}</Badge>}
                  {r.quantity === null ? <span className="text-muted">sin cantidad registrada</span> : <strong>{num(r.quantity)} {unitLabel(r.unit)}</strong>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function SummaryCells({ s }: { s: ActivitySummary }) {
  return (
    <>
      <td className="text-right">{s.loadsDay}</td>
      <td className="text-right">{s.loads}</td>
      <td className="text-right">{num(s.m3Day)}</td>
      <td className="text-right">{num(s.m3)}</td>
      <td className="text-right">{num(s.tonnesDay)}</td>
      <td className="text-right">{num(s.tonnes)}</td>
      <td className="text-right">{s.withoutQuantity}</td>
      <td className="text-right">{s.flagged}</td>
    </>
  );
}
