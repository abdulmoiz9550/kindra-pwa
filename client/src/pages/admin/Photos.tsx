import { useState } from 'react';
import type { Photo } from '@kindra/shared';
import { Button, Badge, Spinner, Tabs, EmptyState } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';
import { Section, useAdminList, useAdminAction } from './shared';

type Mode = 'pending' | 'approved' | 'rejected' | 'all';

const KIND_LABEL: Record<string, string> = {
  origin: 'origen',
  trip_departure: 'salida de viaje',
  trip_arrival: 'llegada',
  reception: 'recepción',
  before: 'antes',
  after: 'después',
  selfie: 'selfie',
  on_site: 'verificación en sitio',
  evidence: 'evidencia',
  document: 'documento',
  voice: 'nota de voz',
  other: 'otro',
};

/** 7.14 / 18.7: las fotos ciudadanas no son públicas hasta que un administrador o moderador las aprueba. */
export default function Photos() {
  const [mode, setMode] = useState<Mode>('pending');
  const q = useAdminList<Photo>(`photos?moderation=${mode}`);
  const { post, busy } = useAdminAction();
  const list = (q.data || []).filter((p) => p.kind !== 'voice');
  return (
    <Section title="Moderación de fotos" subtitle="Antes de aprobar, revisa que no se vean rostros ni direcciones legibles. Las fotos aprobadas aparecen en la ficha pública y en el tablero.">
      <Tabs value={mode} onChange={setMode} items={[{ value: 'pending', label: 'Pendientes' }, { value: 'approved', label: 'Aprobadas' }, { value: 'rejected', label: 'Rechazadas' }, { value: 'all', label: 'Todas' }]} />
      {q.isLoading && <Spinner />}
      {!q.isLoading && list.length === 0 && <EmptyState title="No hay fotos en esta lista" />}
      <ul className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
        {list.map((p) => (
          <li key={p.id} className="card !p-2">
            {p.url.endsWith('.pdf') ? (
              <a href={p.url} target="_blank" rel="noreferrer" className="block h-40 grid place-items-center bg-surface-2 rounded text-sm text-primary underline">
                Documento PDF
              </a>
            ) : (
              <img src={p.url} alt={`Foto ${KIND_LABEL[p.kind] || p.kind}`} className="h-40 w-full object-cover rounded" />
            )}
            <div className="mt-2 flex flex-wrap gap-1 text-xs">
              <Badge tone="neutral" icon={false}>
                {KIND_LABEL[p.kind] || p.kind}
              </Badge>
              <Badge tone={p.moderation === 'approved' ? 'ok' : p.moderation === 'rejected' ? 'bad' : 'warn'}>{p.moderation === 'approved' ? 'aprobada' : p.moderation === 'rejected' ? 'rechazada' : 'pendiente'}</Badge>
              {p.unreadable && <Badge tone="bad">ilegible</Badge>}
            </div>
            <p className="text-[11px] text-muted mt-1">{fmtDateTime(p.uploadedAt)}</p>
            <div className="mt-2 flex gap-1">
              {p.moderation !== 'approved' && (
                <Button size="sm" disabled={busy} onClick={() => post(`photos/${p.id}/moderate`, { decision: 'approved' }, 'Foto aprobada.')}>
                  Aprobar
                </Button>
              )}
              {p.moderation !== 'rejected' && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => post(`photos/${p.id}/moderate`, { decision: 'rejected' }, 'Foto rechazada.')}>
                  Rechazar
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
