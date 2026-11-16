import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, ShieldX } from 'lucide-react';
import { GEOFENCE_LABELS, STOP_REASON_LABELS, EVENT_LABELS } from '@kindra/shared';
import { api, errorMessage } from '../../lib/api';
import { fmtDateTime, fmtTime } from '../../lib/format';
import { SOURCE_LABELS, type TrackView } from '../../lib/tracking';
import { MapView, type MapLine, type MapPoint } from '../../components/MapView';
import { Alert, Badge, Button, Card, KeyValue, PageTitle, Spinner } from '../../components/ui';

/** Detalle y repetición del recorrido de un viaje (addendum v1.3). Solo roles autorizados; nunca público. */
export default function TripDetail() {
  const { key = '' } = useParams();
  const q = useQuery({ queryKey: ['tracking', 'trip', key], queryFn: () => api.get<TrackView>(`/tracking/trips/${key}`), refetchInterval: (qq) => (qq.state.data?.state === 'in_transit' ? 20_000 : false) });
  const [cursor, setCursor] = useState<number | null>(null);
  const [verify, setVerify] = useState<{ status: string; count: number } | null>(null);
  const flat = useMemo(() => (q.data?.segments || []).flat(), [q.data]);
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Alert tone="bad">{q.error ? errorMessage(q.error) : 'No se pudo cargar el viaje.'}</Alert>;
  const t = q.data;
  const idx = cursor ?? flat.length - 1;
  const upTo = flat[idx]?.[2];
  const lines: MapLine[] = [];
  if (t.planned?.planned) lines.push({ id: 'planned', positions: t.planned.planned, color: '#8a9aa3', dashed: true, label: 'Ruta planificada' });
  t.segments.forEach((seg, i) => {
    const pts = seg.filter((p) => !upTo || p[2] <= upTo).map((p) => [p[0], p[1]] as [number, number]);
    if (pts.length > 1) lines.push({ id: `seg${i}`, positions: pts, color: 'var(--brand-teal)', label: 'Trazado real' });
  });
  const points: MapPoint[] = [];
  if (t.from) points.push({ id: 'A', lat: t.from.lat, lng: t.from.lng, color: 'var(--brand-green)', label: `A · ${t.fromLabel}` });
  if (t.to) points.push({ id: 'C', lat: t.to.lat, lng: t.to.lng, color: 'var(--brand-deep)', label: `C · ${t.toLabel}` });
  t.stops.forEach((s, i) => points.push({ id: `s${i}`, lat: s.lat, lng: s.lng, radius: 7, color: s.insidePerimeter || s.declared ? 'var(--brand-orange)' : '#c0392b', label: `Parada de ${Math.round(s.durationS / 60)} min · ${fmtTime(s.start)}${s.declared ? ' · declarada' : ''}${s.insidePerimeter ? ' · en perímetro' : ''}` }));
  const cur = flat[idx];
  if (cur) points.push({ id: 'cur', lat: cur[0], lng: cur[1], radius: 9, color: 'var(--brand-orange)', label: `Posición ${fmtTime(cur[2])}` });
  const doVerify = async () => setVerify(await api.get<{ status: string; count: number }>(`/tracking/trips/${t.key}/verify`));
  return (
    <div>
      <PageTitle title={`Recorrido ${t.code}`} subtitle={`${t.fromLabel} → ${t.toLabel}${t.vehiclePlate ? ` · ${t.vehiclePlate}` : ''}`} actions={<Link to="/panel/seguimiento" className="btn-secondary btn-sm">Seguimiento</Link>} />
      <div className="grid md:grid-cols-[1fr_320px] gap-3">
        <div>
          <MapView lines={lines} points={points} height={420} fitSectors={false} center={cur ? [cur[0], cur[1]] : t.from ? [t.from.lat, t.from.lng] : null} zoom={13} />
          {flat.length > 1 && (
            <Card className="mt-3" title="Repetir el recorrido">
              <input type="range" min={0} max={flat.length - 1} value={idx} onChange={(e) => setCursor(Number(e.target.value))} className="w-full" aria-label="Momento del recorrido" />
              <p className="text-xs text-muted mt-1">{fmtDateTime(flat[idx]?.[2])} · {idx + 1} de {flat.length} posiciones. Los huecos sin señal se muestran como huecos, nunca se rellenan.</p>
            </Card>
          )}
        </div>
        <div className="space-y-3">
          <Card title="Estado">
            <KeyValue
              items={[
                { k: 'Estado', v: t.state === 'in_transit' ? 'En camino' : t.state === 'received' ? 'Llegó' : 'Sin llegada' },
                { k: 'Salida', v: fmtDateTime(t.departureAt) },
                { k: t.arrivalAt ? 'Llegada' : 'Llegada estimada', v: t.arrivalAt ? fmtDateTime(t.arrivalAt) : t.eta ? fmtTime(t.eta) : 'sin estimación' },
                { k: 'Perímetro salida', v: t.departureCheck ? GEOFENCE_LABELS[t.departureCheck as keyof typeof GEOFENCE_LABELS] : '—' },
                { k: 'Perímetro llegada', v: t.arrivalCheck ? GEOFENCE_LABELS[t.arrivalCheck as keyof typeof GEOFENCE_LABELS] : '—' },
                { k: 'Fuentes', v: t.sources.map((s) => SOURCE_LABELS[s] || s).join(', ') || 'ninguna todavía' },
                { k: 'Trazado completo', v: t.complete ? 'Sí' : 'No' },
              ]}
            />
            {t.traceSealed && (
              <div className="mt-3">
                <Button size="sm" variant="secondary" onClick={doVerify}>Verificar integridad del trazado</Button>
                {verify && (
                  <p className={`mt-2 text-sm inline-flex items-center gap-1 ${verify.status === 'intact' ? 'text-ok' : 'text-bad'}`}>
                    {verify.status === 'intact' ? <ShieldCheck size={16} /> : <ShieldX size={16} />} {verify.status === 'intact' ? `Intacto (${verify.count} posiciones)` : 'Alterado'}
                  </p>
                )}
              </div>
            )}
          </Card>
          <Card title="Alertas">
            {t.alerts.length ? (
              <ul className="space-y-1 text-sm">
                {t.alerts.map((a) => (
                  <li key={a.id}>
                    <Badge tone={a.resolvedAt ? 'neutral' : 'bad'} icon={false}>{fmtTime(a.createdAt)}</Badge> {a.text}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Sin alertas.</p>
            )}
          </Card>
          <Card title="Paradas">
            {t.stops.length || t.declaredStops.length ? (
              <ul className="space-y-1 text-sm">
                {t.stops.map((s, i) => (
                  <li key={i}>{fmtTime(s.start)} · {Math.round(s.durationS / 60)} min {s.declared ? '· declarada' : s.insidePerimeter ? '· en perímetro' : '· no declarada'}</li>
                ))}
                {t.declaredStops.map((s) => (
                  <li key={s.id} className="text-muted">Declarada {fmtTime(s.at)}: {STOP_REASON_LABELS[s.reason as keyof typeof STOP_REASON_LABELS] || s.reason}{s.note ? ` · ${s.note}` : ''}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Sin paradas.</p>
            )}
          </Card>
          <Card title="Puntos de control">
            <ul className="space-y-1 text-sm">
              {t.checkpoints.map((c, i) => (
                <li key={i}>{fmtTime(c.at)} · {(EVENT_LABELS as Record<string, string>)[c.type] || c.type}{c.type === 'gate_presence' ? ` · ${String(c.data.gateName)} (${GEOFENCE_LABELS[c.data.geofence as keyof typeof GEOFENCE_LABELS]})` : ''}</li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
