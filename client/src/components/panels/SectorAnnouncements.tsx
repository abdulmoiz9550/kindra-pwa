import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { toast } from '../../lib/toast';
import { fmtDateTime } from '../../lib/format';
import { Button, Card, EmptyState, Field, Select, Spinner, Textarea, Badge } from '../ui';

interface Data {
  announcements: { id: string; kind: string; text: string; sectorName: string | null; createdAt: string }[];
  sectors: { id: string; name: string; residents: number }[];
}

/**
 * Avisos comunitarios por proximidad (addendum, parte 1). Los automáticos salen cuando hay puntos del sector
 * asignados para retiro (uno por sector y por día). El coordinador también puede enviar uno manual.
 */
export function SectorAnnouncements() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['coord', 'announcements'], queryFn: () => api.get<Data>('/coord/announcements') });
  const [sectorId, setSectorId] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  if (q.isLoading || !q.data) return <Spinner />;
  const sector = q.data.sectors.find((s) => s.id === sectorId);
  const send = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ residents: number }>('/coord/announcements', { sectorId, text });
      toast.success(`Aviso enviado a ${r.residents} vecino${r.residents === 1 ? '' : 's'} con cuenta en el sector.`);
      setText('');
      qc.invalidateQueries({ queryKey: ['coord', 'announcements'] });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid md:grid-cols-2 gap-3">
      <Card
        title={
          <span className="inline-flex items-center gap-2">
            <Megaphone size={18} /> Enviar aviso a un sector
          </span>
        }
        subtitle="Llega a las personas con cuenta que indicaron ese sector como residencia. Los avisos automáticos de puntos asignados para retiro salen solos, uno por día."
      >
        <Field label="Sector" required>
          <Select value={sectorId} onChange={(e) => setSectorId(e.target.value)}>
            <option value="">Elige un sector</option>
            {q.data.sectors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.residents} vecino{s.residents === 1 ? '' : 's'}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Aviso" required hint={`${text.length}/400. Lenguaje claro, sin promesas de fechas que no estén confirmadas.`}>
          <Textarea value={text} maxLength={400} onChange={(e) => setText(e.target.value)} placeholder="Ej.: Mañana pasan camiones por la calle principal. Mantén despejado el paso." />
        </Field>
        <Button onClick={send} disabled={busy || !sectorId || text.trim().length < 10}>
          Enviar aviso{sector ? ` a ${sector.name}` : ''}
        </Button>
      </Card>
      <Card title="Avisos enviados">
        {q.data.announcements.length === 0 ? (
          <EmptyState title="Sin avisos todavía" />
        ) : (
          <ul className="divide-y divide-line text-sm max-h-[28rem] overflow-y-auto">
            {q.data.announcements.map((a) => (
              <li key={a.id} className="py-2">
                <div className="flex flex-wrap items-center gap-2 mb-0.5">
                  <Badge tone={a.kind === 'sector_assigned' ? 'info' : 'primary'} icon={false}>
                    {a.kind === 'sector_assigned' ? 'Automático' : 'Manual'}
                  </Badge>
                  <span className="font-semibold">{a.sectorName}</span>
                  <span className="text-xs text-muted">{fmtDateTime(a.createdAt)}</span>
                </div>
                <p>{a.text}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
