import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import type { OriginEffectiveState } from '@kindra/shared';
import { SIZE_LABELS, URGENCY_LABELS, PRIORITY_LABELS } from '@kindra/shared';
import { fmtRelative, fmtDateTime, fmtNum, unitLabel } from '../../lib/format';
import { Badge, OriginStateBadge, BatchStateBadge, TripStateBadge, originTone } from '../ui';
import type { OriginView, TripView, BatchView, SectorShare } from './types';

/** Color del punto en el mapa según estado efectivo (con leyenda textual al lado). */
export function stateColor(state: OriginEffectiveState): string {
  const t = originTone(state);
  return t === 'bad' ? 'var(--bad)' : t === 'warn' ? 'var(--warn)' : t === 'ok' ? 'var(--ok)' : 'var(--muted)';
}

export function MapLegend() {
  return (
    <ul className="flex flex-wrap gap-3 text-xs mt-2" aria-label="Leyenda del mapa">
      <li className="flex items-center gap-1"><span className="h-3 w-3 rounded-full" style={{ background: 'var(--bad)' }} /> Pendiente</li>
      <li className="flex items-center gap-1"><span className="h-3 w-3 rounded-full" style={{ background: 'var(--warn)' }} /> En proceso</li>
      <li className="flex items-center gap-1"><span className="h-3 w-3 rounded-full" style={{ background: 'var(--ok)' }} /> Retirado o más</li>
      <li className="flex items-center gap-1"><span className="h-3 w-3 rounded-full" style={{ background: 'var(--muted)' }} /> Rechazado / duplicado</li>
    </ul>
  );
}

export function PriorityBadge({ priority }: { priority: string | null | undefined }) {
  if (!priority) return <Badge tone="neutral" icon={false}>Sin prioridad</Badge>;
  const tone = priority === 'high' ? 'bad' : priority === 'medium' ? 'warn' : 'info';
  return <Badge tone={tone} icon={false}>Prioridad {PRIORITY_LABELS[priority as keyof typeof PRIORITY_LABELS]}</Badge>;
}

/** Tarjeta compacta de origen para listas de paneles. */
export function OriginRow({ o, onOpen, extra, selectable, selected, onToggle }: { o: OriginView; onOpen?: (o: OriginView) => void; extra?: ReactNode; selectable?: boolean; selected?: boolean; onToggle?: () => void }) {
  const photo = o.photos[0];
  return (
    <div className={`flex gap-3 rounded-lg border border-line p-3 bg-surface ${selected ? 'ring-2 ring-primary' : ''}`}>
      {selectable && (
        <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--primary)]" checked={!!selected} onChange={onToggle} aria-label={`Seleccionar ${o.code}`} />
      )}
      {photo ? (
        <img src={photo.url} alt="" className="h-16 w-16 rounded-md object-cover shrink-0" />
      ) : (
        <div className="h-16 w-16 rounded-md bg-surface-2 shrink-0 grid place-items-center text-xs text-muted">sin foto</div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="font-bold text-primary underline-offset-2 hover:underline" onClick={() => onOpen?.(o)}>
            {o.code}
          </button>
          <OriginStateBadge state={o.effectiveState} />
          {o.type === 'institutional' && <Badge tone="info" icon={false}>Institucional</Badge>}
          {o.priority && <PriorityBadge priority={o.priority} />}
        </div>
        <p className="text-sm text-ink-2 truncate">
          {o.sectorName}{o.street ? ` · ${o.street}` : ''}{o.reference ? ` (${o.reference})` : ''}
        </p>
        <p className="text-xs text-muted">
          {SIZE_LABELS[o.size]}{o.urgency ? ` · ${URGENCY_LABELS[o.urgency]}` : ''} · {fmtRelative(o.createdAt)}
          {o.reporterAlias ? ` · ${o.reporterAlias}` : o.anonymous ? ' · anónimo' : ''}
        </p>
        {o.possibleDuplicateCode && <p className="text-xs text-warn font-semibold">Posible duplicado de {o.possibleDuplicateCode}</p>}
        {o.manualReview && <p className="text-xs text-bad font-semibold">Revisión manual: dos fotos ilegibles</p>}
        {!o.zoneAuthorized && <p className="text-xs text-bad font-semibold">Zona pendiente de autorización</p>}
        {extra}
      </div>
    </div>
  );
}

export function TripRow({ t, actions }: { t: TripView; actions?: ReactNode }) {
  return (
    <div className="rounded-lg border border-line p-3 bg-surface">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold">{t.code}</span>
        <TripStateBadge state={t.state} />
        <span className="text-sm text-ink-2">{t.vehiclePlate} · {t.vehicleType}</span>
      </div>
      <p className="text-sm">Orígenes: {t.originCodes.join(', ') || '—'} · {t.sectorNames.join(', ')}</p>
      <p className="text-xs text-muted">
        Salida {fmtDateTime(t.departure.serverTime)} → {t.centerName}
        {t.arrival ? ` · llegada ${fmtDateTime(t.arrival.serverTime)}` : ''}
        {typeof t.estimatedVolumeM3 === 'number' ? ` · ${fmtNum(t.estimatedVolumeM3)} m³ (estimado)` : ''}
        {t.departure.fillLevel ? ` · ${t.departure.fillLevel === 'half' ? 'medio' : 'lleno'}` : ''}
      </p>
      {actions && <div className="mt-2 flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Composición por sector (7.5): barras horizontales con etiqueta y tabla. */
export function CompositionBars({ composition, withTable = true }: { composition: SectorShare[]; withTable?: boolean }) {
  if (!composition.length) return <p className="text-sm text-muted">Sin recepciones todavía.</p>;
  const colors = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)'];
  return (
    <div>
      <ul className="space-y-1.5" aria-label="Composición por sector">
        {composition.map((c, i) => (
          <li key={c.sectorId} className="text-sm">
            <div className="flex justify-between">
              <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm" style={{ background: colors[i % colors.length] }} aria-hidden />{c.sectorName}</span>
              <span className="font-semibold">{Math.round(c.share * 100)} %</span>
            </div>
            <div className="h-2 rounded-full bg-surface-2"><div className="h-2 rounded-full" style={{ width: `${Math.max(2, c.share * 100)}%`, background: colors[i % colors.length] }} /></div>
          </li>
        ))}
      </ul>
      {withTable && (
        <table className="table-plain mt-2">
          <thead><tr><th>Sector</th><th>Viajes</th><th>Peso</th><th>Parte</th></tr></thead>
          <tbody>
            {composition.map((c) => (
              <tr key={c.sectorId}><td>{c.sectorName}</td><td>{c.trips}</td><td>{fmtNum(c.weight)}</td><td>{Math.round(c.share * 100)} %</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function BatchHeader({ b }: { b: BatchView }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-bold">{b.code}</span>
      <BatchStateBadge state={b.state} />
      {b.pendingHazard > 0 && <Badge tone="bad">{b.pendingHazard} recepción{b.pendingHazard === 1 ? '' : 'es'} sospechosa{b.pendingHazard === 1 ? '' : 's'} sin decisión</Badge>}
      {b.unclassified > 0 && <Badge tone="warn">{b.unclassified} sin clasificar</Badge>}
      <Link to={`/publico/lote/${b.code}`} className="text-xs text-primary inline-flex items-center gap-1"><ExternalLink size={12} /> página pública</Link>
    </div>
  );
}

export function OutputsSummary({ b }: { b: BatchView }) {
  if (!b.outputs) return null;
  const u = unitLabel(b.outputs.unit);
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm mt-2">
      <div><dt className="text-xs text-muted">Agregado producido</dt><dd className="font-semibold">{fmtNum(b.outputs.aggregate)} {u}</dd></div>
      <div><dt className="text-xs text-muted">Metal al Estado</dt><dd className="font-semibold">{fmtNum(b.outputs.metal)} {u}</dd></div>
      <div><dt className="text-xs text-muted">Disposición especial</dt><dd className="font-semibold">{fmtNum(b.outputs.specialDisposal)} {u}</dd></div>
      <div><dt className="text-xs text-muted">Rechazos al CDF</dt><dd className="font-semibold">{fmtNum(b.outputs.rejects)} {u}</dd></div>
    </dl>
  );
}

/** Lista de verificación de tres estados: no se puede enviar hasta responder todo. */
export function Checklist({ items, value, onChange }: { items: { key: string; label: string; provisional: boolean }[]; value: Record<string, boolean | null>; onChange: (v: Record<string, boolean | null>) => void }) {
  return (
    <fieldset className="space-y-2">
      <legend className="label">Lista de verificación {items.some((i) => i.provisional) && <span className="badge bg-warn-soft text-warn ml-1">provisional</span>}</legend>
      {items.map((it) => (
        <div key={it.key} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-2">
          <span className="text-sm">{it.label}</span>
          <div className="flex gap-1" role="radiogroup" aria-label={it.label}>
            {[true, false].map((v) => (
              <button key={String(v)} type="button" role="radio" aria-checked={value[it.key] === v} className={`chip ${value[it.key] === v ? 'chip-active' : ''}`} onClick={() => onChange({ ...value, [it.key]: v })}>
                {v ? 'Sí' : 'No'}
              </button>
            ))}
          </div>
        </div>
      ))}
    </fieldset>
  );
}

export function checklistComplete(items: { key: string }[], value: Record<string, boolean | null>): value is Record<string, boolean> {
  return items.every((i) => typeof value[i.key] === 'boolean');
}

/** Pequeño hook de envío con estado ocupado y error. */
export function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ocurrió un error.');
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run, setError };
}
