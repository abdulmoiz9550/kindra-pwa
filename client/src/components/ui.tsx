import { useState, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Info, X, CheckCircle2, AlertTriangle, XCircle, Clock, Circle } from 'lucide-react';
import type { OriginEffectiveState, BatchState, TripState, DispatchState } from '@kindra/shared';
import { ORIGIN_STATE_LABELS, BATCH_STATE_LABELS, TRIP_STATE_LABELS, DISPATCH_STATE_LABELS } from '@kindra/shared';
import { fmtDate } from '../lib/format';

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-10 text-muted">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-primary" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export function Card({ children, className = '', title, subtitle, actions }: { children: ReactNode; className?: string; title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="mb-3 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-base font-bold leading-tight">{title}</h2>}
            {subtitle && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function Button({ variant = 'primary', size, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' }) {
  const v = { primary: 'btn-primary', secondary: 'btn-secondary', ghost: 'btn-ghost', danger: 'btn-danger' }[variant];
  return <button type="button" {...props} className={`${v} ${size === 'sm' ? 'btn-sm' : ''} ${className}`} />;
}

export function Field({ label, hint, error, children, required }: { label: string; hint?: string; error?: string | null; children: ReactNode; required?: boolean }) {
  return (
    <label className="block mb-4">
      <span className="label">
        {label}
        {required && <span className="text-bad"> *</span>}
      </span>
      {children}
      {hint && !error && <span className="block text-xs text-muted mt-1">{hint}</span>}
      {error && <span className="block text-xs text-bad mt-1" role="alert">{error}</span>}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`input ${props.className || ''}`} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`input ${props.className || ''}`} />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`input min-h-[96px] ${props.className || ''}`} />;
}

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral' | 'primary';
const toneClass: Record<Tone, string> = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  info: 'bg-info-soft text-info',
  neutral: 'bg-surface-2 text-ink-2',
  primary: 'bg-primary-soft text-primary',
};
const toneIcon: Record<Tone, ReactNode> = {
  ok: <CheckCircle2 size={14} aria-hidden />,
  warn: <AlertTriangle size={14} aria-hidden />,
  bad: <XCircle size={14} aria-hidden />,
  info: <Info size={14} aria-hidden />,
  neutral: <Circle size={12} aria-hidden />,
  primary: <Clock size={14} aria-hidden />,
};

/** Insignia de estado: siempre con icono y texto, nunca solo color (18.3). */
export function Badge({ tone = 'neutral', children, icon = true }: { tone?: Tone; children: ReactNode; icon?: boolean }) {
  return (
    <span className={`badge ${toneClass[tone]}`}>
      {icon && toneIcon[tone]}
      {children}
    </span>
  );
}

export function originTone(state: OriginEffectiveState): Tone {
  switch (state) {
    case 'pending_authorization':
    case 'registered':
      return 'bad';
    case 'validated':
      return 'warn';
    case 'under_removal':
    case 'disputed':
      return 'warn';
    case 'rejected':
      return 'neutral';
    case 'duplicate':
      return 'neutral';
    default:
      return 'ok';
  }
}
export function OriginStateBadge({ state }: { state: OriginEffectiveState }) {
  return <Badge tone={originTone(state)}>{ORIGIN_STATE_LABELS[state] || state}</Badge>;
}
export function BatchStateBadge({ state }: { state: BatchState }) {
  const tone: Tone = state === 'held' ? 'bad' : state === 'rejected' ? 'bad' : ['approved', 'partially_dispatched', 'fully_dispatched'].includes(state) ? 'ok' : state === 'under_verification' ? 'warn' : 'info';
  return <Badge tone={tone}>{BATCH_STATE_LABELS[state] || state}</Badge>;
}
export function TripStateBadge({ state }: { state: TripState }) {
  const tone: Tone = state === 'received' ? 'ok' : state === 'no_arrival' ? 'bad' : 'warn';
  return <Badge tone={tone}>{TRIP_STATE_LABELS[state] || state}</Badge>;
}
export function DispatchStateBadge({ state }: { state: DispatchState }) {
  const tone: Tone = state === 'received' ? 'ok' : state === 'discrepancy' ? 'bad' : 'warn';
  return <Badge tone={tone}>{DISPATCH_STATE_LABELS[state] || state}</Badge>;
}

export function Alert({ tone = 'info', title, children, className = '' }: { tone?: Tone; title?: string; children?: ReactNode; className?: string }) {
  return (
    <div role={tone === 'bad' ? 'alert' : 'status'} className={`rounded-[10px] border px-3 py-3 text-sm ${toneClass[tone]} border-current/20 ${className}`}>
      <div className="flex gap-2">
        <span className="mt-0.5 shrink-0">{toneIcon[tone]}</span>
        <div className="min-w-0">
          {title && <p className="font-semibold">{title}</p>}
          {children && <div className="text-ink">{children}</div>}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="rounded-[var(--radius)] border border-dashed border-line p-6 text-center text-muted">
      <p className="font-semibold text-ink-2">{title}</p>
      {text && <p className="text-sm mt-1">{text}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1300] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-surface p-4 shadow-xl`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" className="btn-ghost btn-sm" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Confirmación doble para acciones delicadas (p. ej. reinicio de demo, 17). */
export function ConfirmButton({ label, confirmLabel = 'Confirmar', onConfirm, variant = 'danger', children, typed }: { label: string; confirmLabel?: string; onConfirm: () => void | Promise<void>; variant?: 'danger' | 'primary' | 'secondary'; children?: ReactNode; typed?: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={label}>
        <div className="text-sm text-ink-2 mb-3">{children || '¿Seguro que quieres continuar?'}</div>
        {typed && (
          <Field label={`Escribe ${typed} para confirmar`}>
            <Input value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          </Field>
        )}
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            variant={variant}
            disabled={busy || (!!typed && text !== typed)}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                setOpen(false);
                setText('');
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Un momento…' : confirmLabel}
          </Button>
        </div>
      </Modal>
    </>
  );
}

/** 10.5: explicación de una línea disponible con un toque. */
export function HelpTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block align-middle">
      <button type="button" aria-label="Qué significa esta cifra" aria-expanded={open} className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-muted hover:bg-surface-2" onClick={() => setOpen((o) => !o)}>
        <Info size={15} />
      </button>
      {open && (
        <span role="note" className="absolute left-0 top-7 z-20 w-64 rounded-lg border border-line bg-surface p-2 text-xs text-ink shadow-lg">
          {text}
        </span>
      )}
    </span>
  );
}

/** 12.4: fuente y fecha del último dato de cada cifra. */
export function SourceNote({ source, asOf }: { source: string; asOf: string | null }) {
  return (
    <p className="text-[11px] text-muted mt-1 leading-snug">
      Fuente: {source}
      {asOf ? ` · dato más reciente: ${fmtDate(asOf)}` : ' · sin datos todavía'}
    </p>
  );
}

/** Ficha numérica (hero number) con fuente y explicación. */
export function StatTile({ label, value, unit, source, asOf, explanation, tone }: { label: string; value: string | number; unit?: string; source?: string; asOf?: string | null; explanation?: string; tone?: Tone }) {
  return (
    <div className="card">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted flex items-center">
        {label}
        {explanation && <HelpTip text={explanation} />}
      </p>
      <p className={`mt-1 text-3xl font-bold leading-none ${tone ? toneClass[tone].split(' ')[1] : ''}`}>
        {value}
        {unit && <span className="text-base font-semibold text-muted ml-1">{unit}</span>}
      </p>
      {source && <SourceNote source={source} asOf={asOf ?? null} />}
    </div>
  );
}

export function ProgressBar({ value, label, tone = 'primary' }: { value: number; label?: string; tone?: Tone }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const color = { ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad', info: 'bg-info', neutral: 'bg-muted', primary: 'bg-primary' }[tone];
  return (
    <div>
      {label && (
        <div className="flex justify-between text-sm mb-1">
          <span>{label}</span>
          <span className="font-semibold">{pct} %</span>
        </div>
      )}
      <div className="h-3 w-full rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={`h-3 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function PageTitle({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold leading-tight title-mark">{title}</h1>
        {subtitle && <p className="text-sm text-muted mt-1 max-w-prose">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number }[] }) {
  return (
    <div role="tablist" className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
      {items.map((it) => (
        <button key={it.value} role="tab" aria-selected={value === it.value} type="button" className={`chip whitespace-nowrap ${value === it.value ? 'chip-active' : ''}`} onClick={() => onChange(it.value)}>
          {it.label}
          {typeof it.count === 'number' && <span className={`ml-2 rounded-full px-1.5 text-xs ${value === it.value ? 'bg-white/20' : 'bg-surface-2'}`}>{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Provisional({ children = 'provisional' }: { children?: ReactNode }) {
  return <span className="badge bg-warn-soft text-warn ml-1">{children}</span>;
}

export function KeyValue({ items }: { items: { k: string; v: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
      {items.map((it) => (
        <div key={it.k} className="flex flex-col">
          <dt className="text-xs text-muted">{it.k}</dt>
          <dd className="font-medium">{it.v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
