import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CitizenTripStatus } from '../components/panels/TrackingWidgets';
import { CheckCircle2, Circle, Download, QrCode } from 'lucide-react';
import type { TraceabilityRecord, SatisfactionAnswer } from '@kindra/shared';
import { PUBLIC_LOT_STATES, effectiveOriginState, SATISFACTION_LABELS, BATCH_STATE_LABELS, TRIP_STATE_LABELS, USE_TYPE_LABELS } from '@kindra/shared';
import { api, errorMessage } from '../lib/api';
import { getToken } from '../lib/auth';
import { toast } from '../lib/toast';
import { fmtDateTime } from '../lib/format';
import { EventHistory } from '../components/EventHistory';
import { IntegrityButton } from '../components/IntegrityButton';
import { MonitorActions } from '../components/MonitorActions';
import { Alert, Button, Card, OriginStateBadge, PageTitle, Spinner, Textarea } from '../components/ui';

/** 11 / 16.4 Ficha de trazabilidad de un origen. */
export default function RecordPage() {
  const { code = '' } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['origins', code], queryFn: () => api.get<TraceabilityRecord>(`/origins/${code}`) });
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<string | null>(null);

  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Alert tone="bad">{q.error ? errorMessage(q.error) : 'No se encontró el reporte.'}</Alert>;
  const r = q.data;
  const o = r.origin;
  const state = effectiveOriginState(o);
  const removal = r.closures.find((c) => c.type === 'removal');
  const work = r.closures.find((c) => c.type === 'work');
  const refresh = () => qc.invalidateQueries({ queryKey: ['origins', code] });

  const respondRemoval = async (response: 'confirmed' | 'disputed') => {
    setBusy(true);
    try {
      const res = await api.post<{ text: string }>(`/origins/${code}/closure/removal`, { response, comment: comment.trim() || null });
      setReply(res.text);
      refresh();
      qc.invalidateQueries({ queryKey: ['notifications'] });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const respondSatisfaction = async (answer: SatisfactionAnswer) => {
    setBusy(true);
    try {
      const res = await api.post<{ text: string }>(`/origins/${code}/closure/work`, { answer, comment: comment.trim() || null });
      setReply(res.text);
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const download = async (format: 'csv' | 'json') => {
    try {
      const res = await fetch(`/api/origins/${code}/export?format=${format}`, { headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {} });
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `ficha-${code}.${format}`;
      a.click();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <PageTitle title={`Ficha ${o.code}`} subtitle={`${r.sectorName} · reportado ${fmtDateTime(o.createdAt)}`} actions={<OriginStateBadge state={state} />} />
      {r.reportStatus && <ReportStatusCard s={r.reportStatus} />}
      {r.validationLayers && <LayersCard layers={r.validationLayers} />}
      <CitizenTripStatus code={o.code} />
      {r.isPublicVersion && (
        <Alert tone="info" className="mb-3">
          Estás viendo la versión pública de la ficha: sin datos del reportante ni ubicación exacta, solo fotos moderadas.
        </Alert>
      )}

      {o.photoRetakeRequested && (
        <Alert tone="warn" className="mb-3" title="Hace falta otra foto">
          No se ve bien el escombro en la foto enviada. Puedes mandar otra desde <Link to="/aura" className="underline">AURA</Link>.
        </Alert>
      )}

      {removal && removal.citizenResponse === 'no_response' && (
        <Card className="mb-3 border-primary" title="Cierre Propuesto">
          <p className="text-sm text-ink-2 mb-3">El Ente de Retiro marcó el punto como despejado. Confirma si de verdad quedó limpio, o disputa el cierre si el escombro sigue ahí o quedó incompleto: el caso se reabre y lo revisa un Contralor Comunitario.{r.reportStatus?.confirmBy ? ` Tienes hasta el ${fmtDateTime(r.reportStatus.confirmBy)}.` : ''}</p>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comentario (opcional)" aria-label="Comentario" />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button onClick={() => respondRemoval('confirmed')} disabled={busy}>
              Confirmar
            </Button>
            {o.anonymous ? (
              <p className="text-xs text-muted self-center">Los reportes sin cuenta no pueden abrir una disputa. Si el escombro sigue ahí, repórtalo de nuevo.</p>
            ) : (
              <Button variant="secondary" onClick={() => respondRemoval('disputed')} disabled={busy}>
                Disputar
              </Button>
            )}
          </div>
        </Card>
      )}
      {work && !work.satisfactionAnswer && (
        <Card className="mb-3 border-primary" title="Una última cosa, y ayuda mucho">
          <div id="satisfaccion">
            <p className="text-sm text-ink-2 mb-3">¿Sentiste que tu reporte fue tomado en cuenta?</p>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Si quieres contar qué faltó, aquí (opcional)" aria-label="Comentario" />
            <div className="mt-2 flex flex-wrap gap-2">
              {(['yes', 'somewhat', 'no'] as SatisfactionAnswer[]).map((a) => (
                <Button key={a} variant={a === 'yes' ? 'primary' : 'secondary'} onClick={() => respondSatisfaction(a)} disabled={busy}>
                  {SATISFACTION_LABELS[a]}
                </Button>
              ))}
            </div>
          </div>
        </Card>
      )}
      {reply && (
        <Alert tone="ok" className="mb-3">
          {reply}
        </Alert>
      )}

      <Card title="Los siete campos" subtitle={`Completitud: ${r.completeness} de 7`} className="mb-3">
        <div className="flex gap-1 mb-3" aria-hidden>
          {r.fields.map((f) => (
            <span key={f.index} className={`h-2 flex-1 rounded-full ${f.complete ? 'bg-ok' : 'bg-surface-2'}`} />
          ))}
        </div>
        <ol className="space-y-2">
          {r.fields.map((f) => (
            <li key={f.index} className="flex gap-2 text-sm">
              {f.complete ? <CheckCircle2 size={18} className="text-ok shrink-0 mt-0.5" aria-label="Completo" /> : <Circle size={18} className="text-muted shrink-0 mt-0.5" aria-label="Pendiente" />}
              <div>
                <p className="font-semibold">
                  {f.index}. {f.label}
                </p>
                <p className="text-ink-2">{f.value || 'Todavía sin dato'}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      {r.photos.length > 0 && (
        <Card title="Fotos" className="mb-3">
          <div className="flex flex-wrap gap-2">
            {r.photos.map((p) => (
              <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
                <img src={p.url} alt={`Foto (${p.kind})`} className="h-28 w-28 rounded-lg object-cover border border-line" />
              </a>
            ))}
          </div>
        </Card>
      )}

      {(r.trips.length > 0 || r.batches.length > 0 || r.works.length > 0) && (
        <Card title="Recorrido" className="mb-3">
          <ul className="text-sm space-y-1">
            {r.trips.map((t) => (
              <li key={t.id}>
                Viaje {t.code}: {TRIP_STATE_LABELS[t.state]} · salida {fmtDateTime(t.departure.serverTime)}
                {t.estimatedVolumeM3 ? ` · volumen estimado ${t.estimatedVolumeM3} m³` : ''}
              </li>
            ))}
            {r.batches.map((b) => (
              <li key={b.id}>
                Lote <Link to={`/publico/lote/${b.code}`} className="underline">{b.code}</Link>: {BATCH_STATE_LABELS[b.state]}
              </li>
            ))}
            {r.works.map((w) => (
              <li key={w.id}>
                Obra <Link to={`/publico/obra/${w.code}`} className="underline">{w.code}</Link>: {USE_TYPE_LABELS[w.useType]} en {w.locality}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!r.isPublicVersion && <MonitorActions origin={o} />}

      <Card title="Historial completo" subtitle="Cada evento con su entidad, usuario, hora del servidor y del dispositivo." className="mb-3">
        <EventHistory events={r.history} />
      </Card>

      <Card title="Verificar y exportar" className="mb-3">
        <IntegrityButton recordCode={o.code} />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => download('csv')}>
            <Download size={16} /> CSV
          </Button>
          <Button variant="ghost" size="sm" onClick={() => download('json')}>
            <Download size={16} /> JSON
          </Button>
          <Link to={`/publico/ficha/${o.code}`} className="btn-ghost btn-sm">
            Versión pública
          </Link>
          <Link to={`/publico/qr/ficha/${o.code}`} className="btn-ghost btn-sm">
            <QrCode size={16} /> QR
          </Link>
        </div>
      </Card>
    </div>
  );
}

/** Addendum v4.2, secciones 4 y 7: estado del reporte y los 4 estados públicos del lote. */
export function ReportStatusCard({ s }: { s: NonNullable<TraceabilityRecord['reportStatus']> }) {
  return (
    <Card className="mb-3" title={`Estado: ${s.label}`} subtitle={s.reason ? `Motivo: ${s.reason}` : s.lotCodes.length ? `Lote${s.lotCodes.length > 1 ? 's' : ''} ${s.lotCodes.join(', ')}` : undefined}>
      <ol className="grid grid-cols-4 gap-1 text-center text-xs" aria-label="Estados públicos del lote">
        {PUBLIC_LOT_STATES.map((label, i) => {
          const done = s.publicStage > i;
          return (
            <li key={label} className={`rounded-md border px-1 py-2 ${done ? 'border-ok bg-ok-soft font-semibold' : 'border-line text-muted'}`}>
              <span aria-hidden>{done ? '✓' : i + 1}</span> {label}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/** Las cuatro capas de validación del registro. */
function LayersCard({ layers }: { layers: NonNullable<TraceabilityRecord['validationLayers']> }) {
  return (
    <Card className="mb-3" title="Capas de validación">
      <ul className="text-sm space-y-1">
        {layers.map((l) => <li key={l.layer} className={l.done ? '' : 'text-muted'}><span aria-hidden>{l.done ? '✓' : '○'}</span> <strong>{l.layer}</strong>: {l.what}{l.done && l.at ? ` · ${fmtDateTime(l.at)}` : l.done ? '' : ' · pendiente'}</li>)}
      </ul>
    </Card>
  );
}
