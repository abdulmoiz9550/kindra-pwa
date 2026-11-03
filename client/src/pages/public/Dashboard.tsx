import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Radio, QrCode, BookOpen } from 'lucide-react';
import type { SourcedFigure } from '@kindra/shared';
import { USE_TYPE_LABELS } from '@kindra/shared';
import { api } from '../../lib/api';
import { usePublicConfig } from '../../lib/config';
import { useLiveUpdates } from '../../lib/live';
import { fmtNum, fmtPct, fmtRelative, fmtDate } from '../../lib/format';
import { Card, Spinner, Alert, StatTile, HelpTip, SourceNote, ProgressBar, EmptyState } from '../../components/ui';
import { MapView } from '../../components/MapView';
import { PublicHeader } from '../../components/PublicHeader';
import { HBars, StatusBars, TableToggle } from '../../components/charts/Bars';

interface DashboardData {
  generatedAt: string;
  sectorId: string | null;
  sectorName: string | null;
  simulated: boolean;
  trafficLight: { sectorId: string; sectorName: string; pending: number; inProgress: number; done: number; total: number; authorized: boolean }[];
  heatMap: { sectorId: string; sectorName: string; polygon: [number, number][]; unattended: number; intensity: number }[];
  origins: { open: SourcedFigure; closed: SourcedFigure; total: SourcedFigure; rejected: SourcedFigure };
  completeness: SourcedFigure<number | null> & { full: number; counted: number };
  tripsPerCenter: { centerId: string; centerName: string; received: SourcedFigure; inTransit: number; noArrival: number }[];
  tonnes: { centerId: string; centerName: string; official: SourcedFigure<number | null>; estimatedM3: SourcedFigure<number | null> }[];
  discrepancies: { centerId: string; centerName: string; day: string; departed: number; confirmed: number; difference: number }[] | null;
  valorization: { total: SourcedFigure<number | null>; perCenter: { centerId: string; centerName: string; rate: SourcedFigure<number | null> }[]; perSector: { sectorId: string; sectorName: string; rate: SourcedFigure<number | null> }[] };
  works: { supplied: SourcedFigure; localities: SourcedFigure<string[]>; list: { code: string; name: string; useType: string; locality: string; dateOfUse: string | null }[] };
  jobs: { direct: SourcedFigure; indirect: SourcedFigure };
  satisfaction: SourcedFigure<number | null> & { answers: number };
  collectiveGoal: { sectorId: string; sectorName: string; percent: number; done: number; total: number }[];
  beforeAfter: { originCode: string; sectorName: string; beforeUrl: string; afterUrl: string }[];
}

const VAL_EXPLANATION = 'Tasa de valorización: de todo lo que entró a los centros, qué parte se convirtió en material para otras obras.';

export default function Dashboard() {
  const [params, setParams] = useSearchParams();
  const sector = params.get('sector') || '';
  const { data: cfg } = usePublicConfig();
  const { connected, lastEventAt } = useLiveUpdates();
  const q = useQuery({ queryKey: ['public', 'dashboard', sector], queryFn: () => api.get<DashboardData>(`/public/dashboard${sector ? `?sector=${encodeURIComponent(sector)}` : ''}`), refetchInterval: 60_000 });
  const d = q.data;

  const setSector = (id: string) => {
    const next = new URLSearchParams(params);
    if (id) next.set('sector', id);
    else next.delete('sector');
    setParams(next, { replace: true });
  };

  const heatSectors = useMemo(
    () =>
      (d?.heatMap || []).map((h) => ({
        id: h.sectorId,
        name: h.sectorName,
        polygon: h.polygon,
        color: 'var(--bad)',
        fillOpacity: h.unattended === 0 ? 0.06 : 0.15 + 0.55 * h.intensity,
        label: `${h.sectorName}: ${h.unattended} ${h.unattended === 1 ? 'origen sin atender' : 'orígenes sin atender'}`,
      })),
    [d?.heatMap],
  );

  return (
    <div>
      <PublicHeader title="Cómo va el retiro de escombros" subtitle="Cifras calculadas a partir de los registros de cada entidad. Cada número indica quién lo reportó y cuándo." />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por sector">
          <button type="button" className={`chip ${!sector ? 'chip-active' : ''}`} onClick={() => setSector('')} aria-pressed={!sector}>
            Total
          </button>
          {(cfg?.sectors || []).map((s) => (
            <button key={s.id} type="button" className={`chip ${sector === s.id ? 'chip-active' : ''}`} onClick={() => setSector(s.id)} aria-pressed={sector === s.id}>
              {s.name}
            </button>
          ))}
        </div>
        <span className={`ml-auto inline-flex items-center gap-1 text-xs ${connected ? 'text-ok' : 'text-muted'}`} role="status">
          <Radio size={14} aria-hidden /> {connected ? 'En vivo' : 'Sin conexión en vivo'}
          {d && ` · actualizado ${fmtRelative(lastEventAt || d.generatedAt)}`}
        </span>
      </div>

      {q.isLoading && <Spinner label="Cargando el tablero…" />}
      {q.error && <Alert tone="bad">No se pudo cargar el tablero. Inténtalo de nuevo en un momento.</Alert>}

      {d && (
        <div className="space-y-4">
          {/* Semáforo */}
          <Card title="Semáforo de orígenes por sector" subtitle="Pendiente: reportado y aún sin retiro. En proceso: con camión asignado o en revisión. Atendido: retirado o más allá.">
            <StatusBars
              legend={[
                { key: 'pending', label: 'Pendiente', value: 0, tone: 'bad' },
                { key: 'inProgress', label: 'En proceso', value: 0, tone: 'warn' },
                { key: 'done', label: 'Atendido', value: 0, tone: 'ok' },
              ]}
              rows={d.trafficLight.map((t) => ({
                label: t.sectorName,
                total: t.total,
                note: t.authorized ? undefined : 'zona pendiente de autorización',
                segments: [
                  { key: 'pending', label: 'Pendiente', value: t.pending, tone: 'bad' },
                  { key: 'inProgress', label: 'En proceso', value: t.inProgress, tone: 'warn' },
                  { key: 'done', label: 'Atendido', value: t.done, tone: 'ok' },
                ],
              }))}
            />
            <SourceNote source={d.origins.total.source} asOf={d.origins.total.asOf} />
          </Card>

          {/* Mapa de calor */}
          <Card
            title={
              <span className="inline-flex items-center">
                Zonas críticas
                <HelpTip text="Concentración de orígenes sin atender por sector. No se muestran puntos individuales ni direcciones." />
              </span>
            }
            subtitle="Cuanto más oscuro el sector, más orígenes esperan atención."
          >
            <MapView sectors={heatSectors} height={300} />
            <ul className="mt-2 flex flex-wrap gap-3 text-xs">
              {d.heatMap.map((h) => (
                <li key={h.sectorId} className="inline-flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ background: 'var(--bad)', opacity: h.unattended === 0 ? 0.1 : 0.15 + 0.55 * h.intensity }} aria-hidden />
                  {h.sectorName}: {h.unattended}
                </li>
              ))}
            </ul>
          </Card>

          {/* Cifras principales */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatTile label="Orígenes abiertos" value={d.origins.open.value} source={d.origins.open.source} asOf={d.origins.open.asOf} explanation={d.origins.open.explanation} />
            <StatTile label="Orígenes cerrados" value={d.origins.closed.value} source={d.origins.closed.source} asOf={d.origins.closed.asOf} explanation={d.origins.closed.explanation} tone="ok" />
            <StatTile label="Fichas completas (7 de 7)" value={fmtPct(d.completeness.value)} source={d.completeness.source} asOf={d.completeness.asOf} explanation={`${d.completeness.explanation} ${d.completeness.full} de ${d.completeness.counted} fichas.`} />
            <StatTile label="Satisfacción ciudadana" value={fmtPct(d.satisfaction.value)} source={d.satisfaction.source} asOf={d.satisfaction.asOf} explanation={`${d.satisfaction.explanation} ${d.satisfaction.answers} respuestas.`} />
          </div>

          {/* Valorización */}
          <Card
            title={
              <span className="inline-flex items-center">
                Tasa de valorización
                <HelpTip text={VAL_EXPLANATION} />
              </span>
            }
            subtitle={VAL_EXPLANATION}
          >
            <p className="text-3xl font-bold leading-none mb-1">{fmtPct(d.valorization.total.value)}</p>
            <SourceNote source={d.valorization.total.source} asOf={d.valorization.total.asOf} />
            <div className="grid md:grid-cols-2 gap-4 mt-4">
              <HBars title="Por centro" pct max={1} rows={d.valorization.perCenter.map((c) => ({ label: c.centerName, value: c.rate.value }))} colorVar="--s1" />
              <HBars title="Por sector" pct max={1} rows={d.valorization.perSector.map((s) => ({ label: s.sectorName, value: s.rate.value }))} colorVar="--s3" />
            </div>
          </Card>

          {/* Viajes y toneladas por centro */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card title="Viajes recibidos por centro">
              <HBars rows={d.tripsPerCenter.map((c) => ({ label: c.centerName, value: c.received.value, display: `${c.received.value}${c.inTransit ? ` · ${c.inTransit} en tránsito` : ''}${c.noArrival ? ` · ${c.noArrival} sin llegada` : ''}` }))} colorVar="--s1" />
              {d.tripsPerCenter[0] && <SourceNote source={d.tripsPerCenter.map((c) => c.received.source).join(', ')} asOf={d.tripsPerCenter.map((c) => c.received.asOf).sort().reverse()[0] ?? null} />}
            </Card>
            <TonnesCard tonnes={d.tonnes} />
          </div>

          {/* Discrepancias */}
          {d.discrepancies && (
            <Card
              title={
                <span className="inline-flex items-center">
                  Discrepancia de conteo
                  <HelpTip text="Por cada centro y día se comparan los viajes que salieron hacia ese centro con los que el centro confirmó. La diferencia son viajes sin llegada confirmada." />
                </span>
              }
            >
              {d.discrepancies.length === 0 ? (
                <p className="text-sm text-muted">Sin discrepancias: todos los viajes registrados tienen llegada confirmada.</p>
              ) : (
                <table className="table-plain">
                  <thead>
                    <tr>
                      <th scope="col">Día</th>
                      <th scope="col">Centro</th>
                      <th scope="col" className="text-right">
                        Salieron
                      </th>
                      <th scope="col" className="text-right">
                        Confirmados
                      </th>
                      <th scope="col" className="text-right">
                        Diferencia
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.discrepancies.map((x) => (
                      <tr key={`${x.centerId}-${x.day}`}>
                        <td>{fmtDate(x.day)}</td>
                        <td>{x.centerName}</td>
                        <td className="text-right">{x.departed}</td>
                        <td className="text-right">{x.confirmed}</td>
                        <td className="text-right font-semibold text-bad">{x.difference}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <SourceNote source="Calculado por la plataforma con las salidas del ente de retiro y las llegadas confirmadas por cada centro" asOf={d.generatedAt} />
            </Card>
          )}

          {/* Obras y empleos */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card
              title={
                <span className="inline-flex items-center">
                  Obras abastecidas
                  <HelpTip text={d.works.supplied.explanation} />
                </span>
              }
            >
              <p className="text-3xl font-bold leading-none">{d.works.supplied.value}</p>
              <p className="text-sm text-muted mt-1">
                Localidades beneficiadas: {d.works.localities.value.length ? d.works.localities.value.join(', ') : 'ninguna todavía'}
              </p>
              <SourceNote source={d.works.supplied.source} asOf={d.works.supplied.asOf} />
              {d.works.list.length > 0 && (
                <ul className="mt-3 divide-y divide-line">
                  {d.works.list.map((w) => (
                    <li key={w.code} className="py-2 text-sm">
                      <Link to={`/publico/obra/${w.code}`} className="font-medium text-primary underline">
                        {w.name}
                      </Link>
                      <span className="text-muted">
                        {' '}
                        · {USE_TYPE_LABELS[w.useType as keyof typeof USE_TYPE_LABELS] || w.useType} · {w.locality}
                        {w.dateOfUse ? ` · ${fmtDate(w.dateOfUse)}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card
              title={
                <span className="inline-flex items-center">
                  Empleos registrados
                  <HelpTip text={`${d.jobs.direct.explanation} ${d.jobs.indirect.explanation}`} />
                </span>
              }
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted">Directos</p>
                  <p className="text-3xl font-bold leading-none">{d.jobs.direct.value}</p>
                </div>
                <div>
                  <p className="text-xs text-muted">Indirectos</p>
                  <p className="text-3xl font-bold leading-none">{d.jobs.indirect.value}</p>
                </div>
              </div>
              <SourceNote source={d.jobs.direct.source} asOf={d.jobs.direct.asOf} />
            </Card>
          </div>

          {/* Meta colectiva */}
          <Card
            title={
              <span className="inline-flex items-center">
                Meta colectiva por sector
                <HelpTip text="Porcentaje de los orígenes del sector que ya fueron retirados o avanzaron más allá del retiro." />
              </span>
            }
          >
            <div className="space-y-3">
              {d.collectiveGoal.map((g) => (
                <ProgressBar key={g.sectorId} value={g.percent} label={`${g.sectorName} · ${g.done} de ${g.total}`} tone="ok" />
              ))}
            </div>
            <SourceNote source={d.origins.total.source} asOf={d.origins.total.asOf} />
          </Card>

          {/* Antes y después */}
          <Card title="Antes y después" subtitle="Solo fotos revisadas y aprobadas, sin rostros ni direcciones.">
            {d.beforeAfter.length === 0 ? (
              <EmptyState title="Todavía no hay pares de fotos aprobados" />
            ) : (
              <ul className="grid sm:grid-cols-2 gap-3">
                {d.beforeAfter.map((p) => (
                  <li key={p.originCode} className="rounded-lg border border-line overflow-hidden">
                    <div className="grid grid-cols-2">
                      <figure>
                        <img src={p.beforeUrl} alt={`Antes del retiro, ${p.sectorName}`} className="h-36 w-full object-cover" />
                        <figcaption className="text-[11px] text-center text-muted py-1">Antes</figcaption>
                      </figure>
                      <figure>
                        <img src={p.afterUrl} alt={`Después del retiro, ${p.sectorName}`} className="h-36 w-full object-cover" />
                        <figcaption className="text-[11px] text-center text-muted py-1">Después</figcaption>
                      </figure>
                    </div>
                    <p className="px-2 pb-2 text-xs text-muted">
                      {p.sectorName} ·{' '}
                      <Link to={`/publico/ficha/${p.originCode}`} className="underline text-primary">
                        ver ficha pública
                      </Link>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="flex flex-wrap gap-2 no-print">
            <Link to="/aprende" className="btn-secondary">
              <BookOpen size={18} /> Ver lecciones
            </Link>
            <Link to={sector ? `/publico/qr/sector/${sector}` : '/publico/qr/tablero/total'} className="btn-ghost">
              <QrCode size={18} /> QR de este tablero
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function TonnesCard({ tonnes }: { tonnes: DashboardData['tonnes'] }) {
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...tonnes.flatMap((t) => [t.official.value ?? 0, t.estimatedM3.value ?? 0]));
  return (
    <Card
      title={
        <span className="inline-flex items-center">
          Toneladas oficiales y volumen estimado
          <HelpTip text={`${tonnes[0]?.official.explanation || 'Toneladas que la entidad del centro reportó en sus resúmenes diarios.'} ${tonnes[0]?.estimatedM3.explanation || ''}`} />
        </span>
      }
      actions={<TableToggle open={table} onToggle={() => setTable((t) => !t)} />}
    >
      <ul className="flex flex-wrap gap-3 text-xs mb-2" aria-label="Leyenda">
        <li className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: 'var(--s1)' }} aria-hidden /> Toneladas oficiales (t)
        </li>
        <li className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: 'var(--s2)' }} aria-hidden /> Volumen estimado (m³) · estimado
        </li>
      </ul>
      {table ? (
        <table className="table-plain">
          <thead>
            <tr>
              <th scope="col">Centro</th>
              <th scope="col" className="text-right">
                Oficial (t)
              </th>
              <th scope="col" className="text-right">
                Estimado (m³)
              </th>
            </tr>
          </thead>
          <tbody>
            {tonnes.map((t) => (
              <tr key={t.centerId}>
                <td>{t.centerName}</td>
                <td className="text-right">{fmtNum(t.official.value)}</td>
                <td className="text-right">{fmtNum(t.estimatedM3.value)} (estimado)</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="space-y-3">
          {tonnes.map((t) => (
            <li key={t.centerId} className="text-sm">
              <p className="font-medium">{t.centerName}</p>
              <Row label="Oficial" value={t.official.value} unit="t" max={max} colorVar="--s1" />
              <Row label="Estimado" value={t.estimatedM3.value} unit="m³ (estimado)" max={max} colorVar="--s2" />
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted mt-2">Las dos cifras usan unidades distintas y se muestran lado a lado, no para compararlas una con otra, sino para que la estimación de la plataforma acompañe siempre a la cifra oficial.</p>
      {tonnes[0] && <SourceNote source={`${tonnes.map((t) => t.official.source).join(', ')} (oficial); ${tonnes[0].estimatedM3.source} (estimado)`} asOf={tonnes.map((t) => t.official.asOf || t.estimatedM3.asOf).filter(Boolean).sort().reverse()[0] ?? null} />}
    </Card>
  );
}

function Row({ label, value, unit, max, colorVar }: { label: string; value: number | null; unit: string; max: number; colorVar: string }) {
  const w = value === null ? 0 : Math.min(100, (value / max) * 100);
  return (
    <div className="flex items-center gap-2 text-xs mt-1">
      <span className="w-16 text-muted">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-surface-2" aria-hidden>
        <div className="h-2 rounded-r-full" style={{ width: `${w}%`, background: `var(${colorVar})`, minWidth: value ? 4 : 0 }} />
      </div>
      <span className="w-28 text-right font-medium">
        {value === null ? 'sin dato' : `${fmtNum(value)} ${unit}`}
      </span>
    </div>
  );
}
