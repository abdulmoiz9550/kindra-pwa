import { useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { fmtNum } from '../../lib/format';

/**
 * Gráficos sencillos en HTML: una sola escala, marcas finas, etiquetas en color de texto,
 * leyenda textual y vista de tabla siempre disponible ("Ver como tabla").
 */

export interface BarRow {
  label: string;
  value: number | null;
  /** Texto de valor a mostrar (si no, se formatea el número). */
  display?: string;
  href?: string;
  colorVar?: string;
}

const SERIES = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6'];

export function TableToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="text-xs text-primary underline" onClick={onToggle} aria-pressed={open}>
      {open ? 'Ver como gráfico' : 'Ver como tabla'}
    </button>
  );
}

/** Barras horizontales (magnitud) con tabla alternativa. */
export function HBars({ rows, unit = '', max, title, caption, colorVar = '--s1', pct = false, linkRow }: { rows: BarRow[]; unit?: string; max?: number; title?: ReactNode; caption?: string; colorVar?: string; pct?: boolean; linkRow?: (r: BarRow) => ReactNode }) {
  const [table, setTable] = useState(false);
  const values = rows.map((r) => r.value ?? 0);
  const top = max ?? Math.max(1, ...values);
  const fmt = (v: number | null, d?: string) => (d ? d : v === null ? '—' : pct ? `${Math.round(v * 100)} %` : `${fmtNum(v)}${unit ? ` ${unit}` : ''}`);
  return (
    <div>
      {(title || rows.length > 0) && (
        <div className="flex items-center justify-between gap-2 mb-2">
          {title && <h3 className="text-sm font-semibold">{title}</h3>}
          <TableToggle open={table} onToggle={() => setTable((t) => !t)} />
        </div>
      )}
      {!rows.length && <p className="text-sm text-muted">Sin datos todavía.</p>}
      {table ? (
        <table className="table-plain">
          <thead>
            <tr>
              <th scope="col">Nombre</th>
              <th scope="col" className="text-right">
                Valor
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td>{linkRow ? linkRow(r) : r.label}</td>
                <td className="text-right font-medium">{fmt(r.value, r.display)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="space-y-2" aria-label={typeof title === 'string' ? title : undefined}>
          {rows.map((r) => {
            const v = r.value ?? 0;
            const w = top > 0 ? Math.max(0, Math.min(100, (v / top) * 100)) : 0;
            return (
              <li key={r.label} className="text-sm">
                <div className="flex justify-between gap-2 mb-0.5">
                  <span className="truncate">{linkRow ? linkRow(r) : r.label}</span>
                  <span className="font-medium shrink-0">{fmt(r.value, r.display)}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-surface-2" aria-hidden>
                  <div className="h-2 rounded-r-full rounded-l-sm" style={{ width: `${w}%`, background: `var(${r.colorVar || colorVar})`, minWidth: v > 0 ? 4 : 0 }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {caption && <p className="text-xs text-muted mt-2">{caption}</p>}
    </div>
  );
}

export interface Segment {
  key: string;
  label: string;
  value: number;
  tone: 'ok' | 'warn' | 'bad';
}

const toneVar = { ok: '--ok', warn: '--warn', bad: '--bad' } as const;
const toneIcon = {
  ok: <CheckCircle2 size={13} aria-hidden />,
  warn: <AlertTriangle size={13} aria-hidden />,
  bad: <XCircle size={13} aria-hidden />,
};

/** Barra segmentada de estado (semáforo) por fila: siempre con icono, texto y números. */
export function StatusBars({ rows, legend }: { rows: { label: string; href?: string; segments: Segment[]; total: number; note?: string }[]; legend: Segment[] }) {
  const [table, setTable] = useState(false);
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <ul className="flex flex-wrap gap-3 text-xs" aria-label="Leyenda">
          {legend.map((s) => (
            <li key={s.key} className="inline-flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-sm" style={{ background: `var(${toneVar[s.tone]})` }} aria-hidden />
              {toneIcon[s.tone]}
              {s.label}
            </li>
          ))}
        </ul>
        <TableToggle open={table} onToggle={() => setTable((t) => !t)} />
      </div>
      {table ? (
        <table className="table-plain">
          <thead>
            <tr>
              <th scope="col">Sector</th>
              {legend.map((s) => (
                <th key={s.key} scope="col" className="text-right">
                  {s.label}
                </th>
              ))}
              <th scope="col" className="text-right">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                {r.segments.map((s) => (
                  <td key={s.key} className="text-right">
                    {s.value}
                  </td>
                ))}
                <td className="text-right font-medium">{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.label}>
              <div className="flex justify-between text-sm mb-1 gap-2">
                <span className="font-medium truncate">{r.label}</span>
                <span className="text-muted shrink-0">
                  {r.total} {r.total === 1 ? 'origen' : 'orígenes'}
                  {r.note ? ` · ${r.note}` : ''}
                </span>
              </div>
              <div className="flex h-4 w-full overflow-hidden rounded-full bg-surface-2 gap-[2px]" role="img" aria-label={`${r.label}: ${r.segments.map((s) => `${s.label} ${s.value}`).join(', ')}`}>
                {r.segments.map((s) => (
                  <div key={s.key} style={{ width: r.total ? `${(s.value / r.total) * 100}%` : '0%', background: `var(${toneVar[s.tone]})` }} />
                ))}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                {r.segments.map((s) => (
                  <span key={s.key} className="inline-flex items-center gap-1">
                    <span style={{ color: `var(${toneVar[s.tone]})` }}>{toneIcon[s.tone]}</span>
                    {s.label}: <strong>{s.value}</strong>
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Composición por sector (participación): barras con colores de serie en orden fijo + tabla. */
export function CompositionBars({ composition, title = 'Composición por sector', linkSector = true }: { composition: { sectorId: string; sectorName: string; share: number; weight: number; trips: number }[]; title?: string; linkSector?: boolean }) {
  const rows: BarRow[] = composition.map((c, i) => ({ label: c.sectorName, value: c.share, colorVar: SERIES[i % SERIES.length], href: linkSector ? `/tablero?sector=${c.sectorId}` : undefined }));
  return (
    <HBars
      rows={rows}
      title={title}
      pct
      max={1}
      caption={composition.length ? `Participación calculada por viajes recibidos (o volumen estimado cuando todos los viajes lo tienen). ${composition.reduce((s, c) => s + c.trips, 0)} viajes en total.` : undefined}
      linkRow={(r) => (r.href ? <a href={r.href} className="underline text-primary">{r.label}</a> : r.label)}
    />
  );
}
