import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '../../lib/api';
import { fmtTime, fmtRelative } from '../../lib/format';
import type { ActiveTrip } from '../../lib/tracking';
import { MapView } from '../../components/MapView';
import { Alert, Badge, Card, EmptyState, PageTitle, Spinner } from '../../components/ui';

/**
 * Seguimiento interno de camiones (addendum v1.3): administrador principal, coordinador, supervisor y centro de destino.
 * Nunca público ni en el tablero ciudadano.
 */
export default function TrackingLive() {
  const q = useQuery({ queryKey: ['tracking', 'active'], queryFn: () => api.get<ActiveTrip[]>('/tracking/active'), refetchInterval: 15_000 });
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Alert tone="bad">{q.error ? errorMessage(q.error) : 'No se pudo cargar el seguimiento.'}</Alert>;
  const trips = q.data;
  const points = trips.filter((t) => t.lastPosition).map((t) => ({ id: t.key, lat: t.lastPosition!.lat, lng: t.lastPosition!.lng, color: t.openAlerts ? '#c0392b' : 'var(--brand-teal)', label: `${t.vehiclePlate ?? t.code} → ${t.toLabel}${t.eta ? ` · llega ~${fmtTime(t.eta)}` : ''}` }));
  return (
    <div>
      <PageTitle title="Seguimiento de camiones" subtitle="Viajes en curso con su última posición y llegada estimada. Solo para roles autorizados; las posiciones nunca son públicas." />
      <MapView points={points} height={380} className="mb-3" />
      {trips.length === 0 ? (
        <EmptyState title="No hay viajes en curso" />
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {trips.map((t) => (
              <li key={t.key} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <strong>{t.code}</strong> · {t.vehiclePlate ?? 'sin placa'} · {t.fromLabel} → {t.toLabel}
                  <span className="block text-xs text-muted">
                    Salió {fmtRelative(t.departureAt)} · {t.eta ? `llegada estimada ${fmtTime(t.eta)}` : 'sin estimación'} · {t.lastPosition ? `última posición ${fmtRelative(t.lastPosition.at)}` : 'sin posiciones todavía'}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {t.openAlerts > 0 && <Badge tone="bad">{t.openAlerts} alerta{t.openAlerts === 1 ? '' : 's'}</Badge>}
                  <Link to={`/panel/viaje/${t.key}`} className="btn-secondary btn-sm">Ver recorrido</Link>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
