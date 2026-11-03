import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { QrCode, ArrowRight } from 'lucide-react';
import { api } from '../../lib/api';
import { fmtDate, fmtNum, unitLabel } from '../../lib/format';
import { Card, Spinner, Alert, KeyValue, Badge, DispatchStateBadge } from '../../components/ui';
import { IntegrityButton } from '../../components/IntegrityButton';
import { PublicHeader } from '../../components/PublicHeader';
import { CompositionBars } from '../../components/charts/Bars';
import type { DispatchState } from '@kindra/shared';

interface Composition {
  sectorId: string;
  sectorName: string;
  share: number;
  weight: number;
  trips: number;
}

interface WorkPageData {
  code: string;
  name: string;
  useType: string;
  locality: string;
  dateOfUse: string | null;
  useRecorded: boolean;
  batches: { code: string; center: string | null; quantity: number; received: number | null; unit: string; state: DispatchState; quality: string | null; composition: Composition[] }[];
  composition: Composition[];
  entityChain: { role: string; name: string }[];
  massBalanceText: string;
  chainId: string;
  chainIds: string[];
  publicUrl: string;
  qrCode: string;
}

export default function WorkPage() {
  const { code = '' } = useParams();
  const q = useQuery({ queryKey: ['public', 'obra', code], queryFn: () => api.get<WorkPageData>(`/public/obras/${encodeURIComponent(code)}`) });
  if (q.isLoading) return <Spinner label="Cargando la obra…" />;
  if (q.error || !q.data) return <Alert tone="bad">No se encontró la obra {code}.</Alert>;
  const w = q.data;
  return (
    <div className="max-w-3xl mx-auto">
      <PublicHeader title={w.name} subtitle="Esta obra se hizo con agregado reciclado del escombro del terremoto. Aquí está el camino de vuelta hasta los sectores de donde salió el material." />
      <div className="mb-3 flex flex-wrap gap-2">
        <Badge tone="primary">Obra {w.code}</Badge>
        {w.useRecorded ? <Badge tone="ok">Uso registrado</Badge> : <Badge tone="warn">Uso pendiente de registrar</Badge>}
      </div>
      <div className="space-y-4">
        <Card title="Datos de la obra">
          <KeyValue
            items={[
              { k: 'Tipo de uso', v: w.useType },
              { k: 'Localidad beneficiada', v: w.locality },
              { k: 'Fecha de uso', v: w.dateOfUse ? fmtDate(w.dateOfUse) : 'Pendiente' },
              { k: 'Lotes recibidos', v: w.batches.length },
            ]}
          />
        </Card>

        <Card title="Sectores de origen del material" subtitle={w.massBalanceText}>
          <CompositionBars composition={w.composition} title="Participación por sector" />
        </Card>

        <Card title="Lotes recibidos">
          {w.batches.length === 0 ? (
            <p className="text-sm text-muted">Esta obra todavía no recibió lotes.</p>
          ) : (
            <ul className="divide-y divide-line">
              {w.batches.map((b, i) => (
                <li key={`${b.code}-${i}`} className="py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/publico/lote/${b.code}`} className="font-semibold text-primary underline">
                      Lote {b.code}
                    </Link>
                    <span className="text-muted">{b.center}</span>
                    <DispatchStateBadge state={b.state} />
                    {b.quality && <Badge tone={b.quality === 'approved' ? 'ok' : 'bad'}>{b.quality === 'approved' ? 'calidad aprobada' : 'calidad rechazada'}</Badge>}
                  </div>
                  <p className="text-xs text-muted mt-1">
                    Despachado: {fmtNum(b.quantity)} {unitLabel(b.unit)}
                    {b.received !== null && b.received !== undefined ? ` · recibido en obra: ${fmtNum(b.received)} ${unitLabel(b.unit)}` : ''}
                    {b.composition.length ? ` · sectores: ${b.composition.map((c) => `${c.sectorName} ${Math.round(c.share * 100)} %`).join(', ')}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Entidades que participaron" subtitle="Cada paso lo firmó una entidad distinta. No se muestran nombres de personas.">
          <ol className="flex flex-wrap items-center gap-2 text-sm">
            {w.entityChain.map((e, i) => (
              <li key={`${e.role}-${e.name}`} className="inline-flex items-center gap-2">
                <span className="rounded-lg border border-line bg-surface-2 px-3 py-2">
                  <span className="block text-[11px] uppercase tracking-wide text-muted">{e.role}</span>
                  <span className="font-medium">{e.name}</span>
                </span>
                {i < w.entityChain.length - 1 && <ArrowRight size={16} className="text-muted" aria-hidden />}
              </li>
            ))}
          </ol>
        </Card>

        <Card title="Verificar integridad" subtitle="Recalcula el sello de los eventos de esta obra y de sus lotes.">
          <IntegrityButton chainIds={w.chainIds} />
        </Card>

        <div className="flex flex-wrap gap-2 no-print">
          <Link to={`/publico/qr/obra/${w.code}`} className="btn-ghost">
            <QrCode size={18} /> QR de esta obra
          </Link>
          <Link to="/tablero" className="btn-ghost">
            Ver el tablero público
          </Link>
        </div>
      </div>
    </div>
  );
}
