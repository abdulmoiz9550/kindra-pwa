import { Link } from 'react-router-dom';
import { Card, Alert, Spinner } from '../../components/ui';
import { Section, useAdminGet } from './shared';

interface OverviewData {
  counts: Record<string, number>;
  persistence: string;
  sseClients: number;
}

const LABELS: Record<string, string> = {
  entities: 'Entidades',
  users: 'Usuarios',
  sectors: 'Sectores',
  centers: 'Centros',
  vehicles: 'Vehículos',
  origins: 'Orígenes',
  trips: 'Viajes',
  batches: 'Lotes',
  works: 'Obras',
  events: 'Eventos en la bitácora',
  photosPending: 'Fotos por moderar',
  usersPendingVerification: 'Usuarios por verificar',
};

export default function Overview() {
  const q = useAdminGet<OverviewData>('overview');
  if (q.isLoading) return <Spinner />;
  const d = q.data;
  return (
    <Section title="Resumen" subtitle="Estado general de la plataforma.">
      <Alert tone="info" className="mb-4">
        La bitácora de eventos no se puede editar ni borrar; las correcciones se registran como nuevos eventos que referencian al original y exigen un motivo.
      </Alert>
      {d && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(d.counts).map(([k, v]) => (
              <Card key={k}>
                <p className="text-xs text-muted">{LABELS[k] || k}</p>
                <p className="text-2xl font-bold">{v}</p>
              </Card>
            ))}
          </div>
          <p className="text-xs text-muted mt-4">
            Persistencia: {d.persistence === 'memory' ? 'memoria (modo de pruebas; se activa PostgreSQL solo con variables de entorno)' : 'PostgreSQL'} · {d.sseClients} {d.sseClients === 1 ? 'pantalla conectada' : 'pantallas conectadas'} en vivo.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            {(d.counts.photosPending || 0) > 0 && (
              <Link to="/admin/fotos" className="btn-secondary btn-sm">
                Moderar {d.counts.photosPending} fotos
              </Link>
            )}
            {(d.counts.usersPendingVerification || 0) > 0 && (
              <Link to="/admin/usuarios" className="btn-secondary btn-sm">
                Verificar {d.counts.usersPendingVerification} usuarios
              </Link>
            )}
          </div>
        </>
      )}
    </Section>
  );
}
