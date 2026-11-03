import { useState } from 'react';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import type { EventView } from '@kindra/shared';
import { fmtDateTime } from '../lib/format';

/** 11.3: historial completo con entidad, usuario, hora del servidor, hora del dispositivo, evidencia y marca de hora inconsistente. */
export function EventHistory({ events, compact = false }: { events: EventView[]; compact?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!events.length) return <p className="text-sm text-muted">Todavía no hay eventos.</p>;
  return (
    <ol className="relative border-l border-line ml-2 pl-4 space-y-3">
      {events.map((e) => {
        const hasData = Object.keys(e.data || {}).length > 0;
        return (
          <li key={e.id} className="relative">
            <span className={`absolute -left-[21px] top-1.5 h-3 w-3 rounded-full border-2 border-surface ${e.type === 'correction' ? 'bg-warn' : e.inconsistentTime ? 'bg-bad' : 'bg-primary'}`} aria-hidden />
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-semibold text-sm">{e.label}</span>
              <span className="text-xs text-muted">#{e.seq}</span>
              {e.inconsistentTime && (
                <span className="badge bg-bad-soft text-bad">
                  <AlertTriangle size={12} /> hora inconsistente
                </span>
              )}
              {e.correctedEventId && <span className="badge bg-warn-soft text-warn">corrige un evento previo</span>}
            </div>
            <p className="text-xs text-muted">
              {e.entityName || 'Plataforma'}
              {e.userAlias ? ` · ${e.userAlias}` : ''} · servidor: {fmtDateTime(e.serverTime)}
              {!compact && ` · dispositivo: ${fmtDateTime(e.deviceTime)}`}
            </p>
            {(hasData || e.photoUrl) && (
              <button type="button" className="mt-1 text-xs text-primary inline-flex items-center gap-1" onClick={() => setOpen(open === e.id ? null : e.id)} aria-expanded={open === e.id}>
                <ChevronDown size={14} className={open === e.id ? 'rotate-180' : ''} /> {open === e.id ? 'Ocultar detalle' : 'Ver detalle'}
              </button>
            )}
            {open === e.id && (
              <div className="mt-2 rounded-lg bg-surface-2 p-2 text-xs">
                {e.photoUrl && <img src={e.photoUrl} alt="Evidencia" className="mb-2 max-h-40 rounded-md" />}
                {hasData && (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    {Object.entries(e.data).map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="text-muted capitalize">{k}</dt>
                        <dd className="break-words">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <p className="mt-2 font-mono text-[10px] text-muted break-all">sello: {e.hash}</p>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
