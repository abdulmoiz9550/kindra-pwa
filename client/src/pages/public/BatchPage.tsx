import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { QrCode } from 'lucide-react';
import type { BatchState, BatchOutputs } from '@kindra/shared';
import { api } from '../../lib/api';
import { fmtDate, fmtNum, unitLabel } from '../../lib/format';
import { Card, Spinner, Alert, BatchStateBadge, KeyValue, Badge } from '../../components/ui';
import { IntegrityButton } from '../../components/IntegrityButton';
import { PublicHeader } from '../../components/PublicHeader';
import { CompositionBars } from '../../components/charts/Bars';

interface BatchPageData {
  code: string;
  state: BatchState;
  center: { name: string; type: string; entity: string | null } | null;
  period: { start: string; end: string };
  composition: { sectorId: string; sectorName: string; share: number; weight: number; trips: number }[];
  outputs: BatchOutputs | null;
  outputsWithheld: boolean;
  dispatched: number | null;
  quality: { result: 'approved' | 'rejected'; at: string; entity: string | null } | null;
  hazard: { suspected: boolean; decisions: string[] };
  receptions: number;
  works: { code: string; name: string; useType: string; locality: string; quantity: number; unit: string; state: string }[];
  chainId: string;
  publicUrl: string;
}

export default function BatchPage() {
  const { code = '' } = useParams();
  const q = useQuery({ queryKey: ['public', 'lote', code], queryFn: () => api.get<BatchPageData>(`/public/lotes/${encodeURIComponent(code)}`) });
  if (q.isLoading) return <Spinner label="Cargando el lote…" />;
  if (q.error || !q.data) return <Alert tone="bad">No se encontró el lote {code}.</Alert>;
  const b = q.data;
  const u = unitLabel(b.outputs?.unit);
  return (
    <div className="max-w-3xl mx-auto">
      <PublicHeader title={`Lote ${b.code}`} subtitle="Un lote reúne todo lo que un centro recibió en un periodo. Se clasifica, se tritura y se verifica antes de usarse en una obra." />
      <div className="mb-3">
        <BatchStateBadge state={b.state} />
      </div>
      <div className="space-y-4">
        <Card title="Centro y periodo">
          <KeyValue
            items={[
              { k: 'Centro', v: b.center ? `${b.center.name} (${b.center.type === 'CDT' ? 'disposición temporal' : 'disposición final'})` : '—' },
              { k: 'Entidad responsable', v: b.center?.entity ?? '—' },
              { k: 'Periodo', v: `${fmtDate(b.period.start)} a ${fmtDate(b.period.end)}` },
              { k: 'Viajes recibidos', v: b.receptions },
            ]}
          />
        </Card>

        <Card title="De qué sectores vino el material">
          <CompositionBars composition={b.composition} title="Composición por sector" />
        </Card>

        <Card title="Salidas del lote">
          {b.outputs ? (
            <KeyValue
              items={[
                { k: 'Agregado producido', v: `${fmtNum(b.outputs.aggregate)} ${u}` },
                { k: 'Metal entregado al Estado', v: `${fmtNum(b.outputs.metal)} ${u}` },
                { k: 'Material a disposición especial', v: `${fmtNum(b.outputs.specialDisposal)} ${u}` },
                { k: 'Rechazos al centro de disposición final', v: `${fmtNum(b.outputs.rejects)} ${u}` },
                { k: 'Despachado a obras', v: b.dispatched === null ? '—' : `${fmtNum(b.dispatched)} ${u}` },
              ]}
            />
          ) : b.outputsWithheld ? (
            <p className="text-sm text-muted">La entidad del centro publica estas cifras con retraso o de forma interna.</p>
          ) : (
            <p className="text-sm text-muted">El centro todavía no registró las salidas de este lote.</p>
          )}
        </Card>

        <Card title="Material peligroso y verificación de calidad">
          <div className="flex flex-wrap gap-2 mb-2">
            {b.hazard.suspected ? (
              <Badge tone={b.hazard.decisions.length ? 'info' : 'warn'}>{b.hazard.decisions.length ? `Se sospechó material peligroso · decisión: ${b.hazard.decisions.map((d) => (d === 'release' ? 'liberado' : 'disposición especial')).join(', ')}` : 'Se sospechó material peligroso · pendiente de decisión'}</Badge>
            ) : (
              <Badge tone="ok">Sin sospecha de material peligroso</Badge>
            )}
            {b.quality ? <Badge tone={b.quality.result === 'approved' ? 'ok' : 'bad'}>{b.quality.result === 'approved' ? 'Calidad aprobada' : 'Calidad rechazada'} · {fmtDate(b.quality.at)}</Badge> : <Badge tone="neutral">Verificación de calidad pendiente</Badge>}
          </div>
          {b.quality?.entity && <p className="text-xs text-muted">Verificado por: {b.quality.entity}</p>}
        </Card>

        <Card title="Obras a las que se despachó">
          {b.works.length === 0 ? (
            <p className="text-sm text-muted">Este lote todavía no se ha despachado a ninguna obra.</p>
          ) : (
            <ul className="divide-y divide-line">
              {b.works.map((w, i) => (
                <li key={`${w.code}-${i}`} className="py-2 text-sm">
                  <Link to={`/publico/obra/${w.code}`} className="font-medium text-primary underline">
                    {w.name}
                  </Link>
                  <span className="text-muted">
                    {' '}
                    · {w.useType} · {w.locality} · {fmtNum(w.quantity)} {unitLabel(w.unit)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Verificar integridad" subtitle="Recalcula el sello de cada evento de este lote y comprueba que nadie lo alteró.">
          <IntegrityButton chainIds={[b.chainId]} />
        </Card>

        <div className="flex gap-2 no-print">
          <Link to={`/publico/qr/lote/${b.code}`} className="btn-ghost">
            <QrCode size={18} /> QR de este lote
          </Link>
        </div>
      </div>
    </div>
  );
}
