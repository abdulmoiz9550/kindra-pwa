import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { OriginEffectiveState, OutputUnit } from '@kindra/shared';
import { fmtDate, fmtNum, unitLabel } from '../lib/format';
import { Badge, Card, EmptyState, Input, OriginStateBadge } from './ui';

export interface TraceRow {
  id: string; code: string; type: string; sectorName: string | null; state: OriginEffectiveState; material: string | null; quantity: number | null; unit: OutputUnit | null; createdAt: string;
  trips: { id: string; code: string; state: string; centerName: string | null }[];
  batches: { code: string; state: string }[];
  discrepancies: number; completeness: number; missing: string[]; corrected: boolean;
}

/** Del origen al destino, con las etapas que faltan a la vista. */
export function TraceList({ rows, links = true }: { rows: TraceRow[]; links?: boolean }) {
  const [text, setText] = useState('');
  const t = text.trim().toLowerCase();
  const list = rows.filter((r) => !t || [r.code, r.sectorName, r.material, ...r.trips.map((x) => x.code), ...r.batches.map((x) => x.code)].some((v) => v?.toLowerCase().includes(t)));
  return (
    <Card>
      <Input placeholder="Buscar por código, sector o material" aria-label="Buscar" value={text} onChange={(e) => setText(e.target.value)} />
      {list.length === 0 ? <EmptyState title="Sin registros en este alcance" /> : (
        <ul className="divide-y divide-line mt-2">
          {list.map((r) => (
            <li key={r.id} className="py-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                {links ? <Link className="font-bold text-primary underline" to={`/reporte/${r.code}`}>{r.code}</Link> : <strong>{r.code}</strong>}
                <OriginStateBadge state={r.state} />
                <Badge tone="neutral" icon={false}>{r.type === 'citizen' ? 'Ciudadano' : 'Institucional'}</Badge>
                {r.corrected && <Badge tone="info">Corregido</Badge>}
                {r.discrepancies > 0 && <Badge tone="warn">Discrepancia por revisar</Badge>}
              </div>
              <p>{[r.sectorName, r.material, r.quantity !== null && r.unit ? `${fmtNum(r.quantity, 2)} ${unitLabel(r.unit)} (estimado)` : null, fmtDate(r.createdAt)].filter(Boolean).join(' · ')}</p>
              <p className="text-xs text-muted">Viajes: {r.trips.length ? r.trips.map((x) => `${x.code}${x.centerName ? ` → ${x.centerName}` : ''}`).join(', ') : 'ninguno'} · Lotes: {r.batches.length ? r.batches.map((x) => x.code).join(', ') : 'ninguno'}</p>
              {r.missing.length > 0 && <p className="text-xs text-muted">Etapas pendientes: {r.missing.join(', ')}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
