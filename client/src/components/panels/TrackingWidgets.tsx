import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Truck } from 'lucide-react';
import { api } from '../../lib/api';
import { fmtTime } from '../../lib/format';
import { Alert, Card, KeyValue } from '../ui';

interface Indicators {
  trips: number;
  averageMinutesByRoute: { route: string; trips: number; averageMinutes: number }[];
  stopsPerTrip: number | null;
  completeTracePercent: number | null;
  tripsWithTrace: number;
}

/** Indicadores de rutas para el panel del supervisor (addendum v1.3). */
export function TrackingIndicators() {
  const q = useQuery({ queryKey: ['tracking', 'indicators'], queryFn: () => api.get<Indicators>('/tracking/indicators') });
  if (!q.data) return null;
  const d = q.data;
  return (
    <Card className="mb-3" title="Seguimiento de rutas" actions={<Link to="/panel/seguimiento" className="btn-secondary btn-sm">Ver camiones</Link>}>
      <KeyValue
        items={[
          { k: 'Viajes cerrados', v: d.trips },
          { k: 'Paradas por viaje', v: d.stopsPerTrip ?? 'sin trazados' },
          { k: 'Viajes con trazado completo', v: d.completeTracePercent == null ? '—' : `${d.completeTracePercent} %` },
        ]}
      />
      {d.averageMinutesByRoute.length > 0 && (
        <table className="table-plain mt-2 text-sm">
          <thead><tr><th>Ruta</th><th>Viajes</th><th>Tiempo medio</th></tr></thead>
          <tbody>{d.averageMinutesByRoute.slice(0, 8).map((r) => <tr key={r.route}><td>{r.route}</td><td>{r.trips}</td><td>{r.averageMinutes} min</td></tr>)}</tbody>
        </table>
      )}
    </Card>
  );
}

/** Estado del viaje para el ciudadano, al estilo Uber, sin la posición del camión. */
export function CitizenTripStatus({ code }: { code: string }) {
  const q = useQuery({ queryKey: ['trip-status', code], queryFn: () => api.get<{ code: string; state: string; message: string; eta: string | null }[]>(`/tracking/origins/${encodeURIComponent(code)}/status`), refetchInterval: 60_000 });
  const live = (q.data || []).filter((t) => t.state === 'in_transit');
  if (!live.length) return null;
  return (
    <Alert tone="info" className="mb-3" title="El camión va en camino">
      {live.map((t) => (
        <span key={t.code} className="flex items-center gap-2">
          <Truck size={16} /> {t.message}{t.eta ? ` Llegada aproximada: ${fmtTime(t.eta)}.` : ''}
        </span>
      ))}
    </Alert>
  );
}
