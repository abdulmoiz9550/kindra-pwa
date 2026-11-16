import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Alert, Badge, Button, Card, KeyValue, Spinner } from '../../components/ui';
import { Section, useAdminList } from './shared';

interface Gate { kind: 'center' | 'work'; id: string; name: string; code: string; hasPoint: boolean; qrSvg: string }
interface Status { traccar: { configured: boolean; forwardSecretSet: boolean; lastPollAt: string | null; lastError: string | null; lastForwardAt: string | null; devicesSeen: number }; routing: string; forwardUrl: string }

/** QR fijos de las puertas de centros y obras (addendum v1.3) y estado del servidor de rastreo. */
export default function Gates() {
  const q = useAdminList<Gate>('gates');
  const st = useQuery({ queryKey: ['admin', 'tracking-status'], queryFn: () => api.get<Status>('/admin/tracking/status') });
  return (
    <Section title="Puertas y rastreo" subtitle="Cada centro y obra tiene un QR fijo en su puerta. Si no hay personal, el escolta lo escanea con su teléfono para registrar presencia; solo cuenta dentro del perímetro." actions={<Button variant="secondary" onClick={() => window.print()}>Imprimir</Button>}>
      {st.data && (
        <Card className="mb-3 no-print" title="Servidor de rastreo (Traccar)">
          {!st.data.traccar.configured && <Alert tone="warn" className="mb-2">Traccar no está configurado: hoy solo llegan posiciones desde el teléfono del escolta y los puntos de control. Configura TRACCAR_URL y el token en el servidor.</Alert>}
          <KeyValue
            items={[
              { k: 'Configurado', v: st.data.traccar.configured ? 'Sí' : 'No' },
              { k: 'Secreto de reenvío', v: st.data.traccar.forwardSecretSet ? 'Definido' : 'Falta TRACCAR_FORWARD_SECRET' },
              { k: 'URL de reenvío para Traccar', v: <span className="font-mono text-xs break-all">{st.data.forwardUrl}</span> },
              { k: 'Último reenvío recibido', v: st.data.traccar.lastForwardAt ?? '—' },
              { k: 'Última consulta', v: st.data.traccar.lastPollAt ?? '—' },
              { k: 'Último error', v: st.data.traccar.lastError ?? '—' },
              { k: 'Rutas planificadas', v: st.data.routing },
            ]}
          />
        </Card>
      )}
      {q.isLoading && <Spinner />}
      <ul className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
        {(q.data || []).map((g) => (
          <li key={g.code}>
            <Card className="text-center break-inside-avoid">
              <p className="text-xs uppercase tracking-widest text-muted">{g.kind === 'center' ? 'Centro' : 'Obra'}</p>
              <p className="font-bold">{g.name}</p>
              <div className="mx-auto my-2 w-44" dangerouslySetInnerHTML={{ __html: g.qrSvg }} role="img" aria-label={`QR de la puerta ${g.code}`} />
              <p className="font-mono text-sm">{g.code}</p>
              {!g.hasPoint && <Badge tone="warn" icon={false}>Sin coordenadas: no hay control de perímetro</Badge>}
              <p className="text-[11px] text-muted mt-1">con tecnología Kindra</p>
            </Card>
          </li>
        ))}
      </ul>
    </Section>
  );
}
