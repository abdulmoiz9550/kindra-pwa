import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Circle, QrCode, Download } from 'lucide-react';
import type { TraceabilityRecord } from '@kindra/shared';
import { effectiveOriginState } from '@kindra/shared';
import { api } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import { Card, Spinner, Alert, OriginStateBadge, ProgressBar } from '../../components/ui';
import { IntegrityButton } from '../../components/IntegrityButton';
import { EventHistory } from '../../components/EventHistory';
import { PublicHeader } from '../../components/PublicHeader';

/** 11.6: versión pública de la ficha. Sin datos del reportante, sin ubicación exacta, solo fotos moderadas. */
export default function PublicRecord() {
  const { code = '' } = useParams();
  const q = useQuery({ queryKey: ['public', 'ficha', code], queryFn: () => api.get<TraceabilityRecord>(`/public/ficha/${encodeURIComponent(code)}`) });
  if (q.isLoading) return <Spinner label="Cargando la ficha…" />;
  if (q.error || !q.data) return <Alert tone="bad">No se encontró un reporte con el código {code}.</Alert>;
  const r = q.data;
  const state = effectiveOriginState(r.origin);
  return (
    <div className="max-w-3xl mx-auto">
      <PublicHeader title={`Reporte ${r.origin.code}`} subtitle={`Sector ${r.sectorName}. Versión pública: sin datos personales ni ubicación exacta.`} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <OriginStateBadge state={state} />
        <span className="text-xs text-muted">Registrado el {fmtDate(r.origin.date)}</span>
      </div>
      <div className="space-y-4">
        <Card title="Los siete datos de la ficha" subtitle={`${r.completeness} de 7 completos`}>
          <ProgressBar value={(r.completeness / 7) * 100} tone="ok" />
          <ol className="mt-3 space-y-2">
            {r.fields.map((f) => (
              <li key={f.index} className="flex gap-2 text-sm">
                <span className={`mt-0.5 shrink-0 ${f.complete ? 'text-ok' : 'text-muted'}`} aria-label={f.complete ? 'completo' : 'pendiente'}>
                  {f.complete ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                </span>
                <span>
                  <span className="font-semibold">
                    {f.index}. {f.label}
                  </span>
                  <span className="block text-ink-2">{f.value || 'Todavía sin dato'}</span>
                </span>
              </li>
            ))}
          </ol>
        </Card>

        {r.photos.length > 0 && (
          <Card title="Fotos" subtitle="Solo fotos revisadas y aprobadas.">
            <div className="flex flex-wrap gap-2">
              {r.photos.map((p) => (
                <img key={p.id} src={p.url} alt={`Foto del reporte, ${p.kind}`} className="h-28 w-28 rounded-lg object-cover border border-line" />
              ))}
            </div>
          </Card>
        )}

        {(r.batches.length > 0 || r.works.length > 0) && (
          <Card title="Lotes y obras vinculados">
            <ul className="text-sm space-y-1">
              {r.batches.map((b) => (
                <li key={b.id}>
                  <Link to={`/publico/lote/${b.code}`} className="text-primary underline">
                    Lote {b.code}
                  </Link>
                </li>
              ))}
              {r.works.map((w) => (
                <li key={w.id}>
                  <Link to={`/publico/obra/${w.code}`} className="text-primary underline">
                    Obra {w.code}: {w.name}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card title="Historial de eventos" subtitle="Cada evento muestra la entidad que lo registró y la hora del servidor.">
          <EventHistory events={r.history} compact />
        </Card>

        <Card title="Verificar integridad" subtitle="Recalcula el sello de todos los eventos de este reporte y de sus viajes, lotes y obras.">
          <IntegrityButton recordCode={r.origin.code} />
        </Card>

        <div className="flex flex-wrap gap-2 no-print">
          <a href={`/api/origins/${r.origin.code}/export?format=csv`} target="_blank" rel="noreferrer" className="btn-ghost">
            <Download size={18} /> CSV
          </a>
          <a href={`/api/origins/${r.origin.code}/export?format=json`} target="_blank" rel="noreferrer" className="btn-ghost">
            <Download size={18} /> JSON
          </a>
          <Link to={`/publico/qr/ficha/${r.origin.code}`} className="btn-ghost">
            <QrCode size={18} /> QR
          </Link>
        </div>
      </div>
    </div>
  );
}
