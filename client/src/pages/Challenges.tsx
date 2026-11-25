import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CHALLENGE_METRIC_LABELS } from '@kindra/shared';
import type { EcoChallenge } from '@kindra/shared';
import { api, errorMessage } from '../lib/api';
import { toast } from '../lib/toast';
import { fmtDate } from '../lib/format';
import { Alert, Badge, Button, Card, EmptyState, PageTitle, ProgressBar, Spinner } from '../components/ui';

type Row = Omit<EcoChallenge, 'participants'> & { open: boolean; joined: boolean; participantCount: number; progress: number };

/** v4.0, 25.3: retos aprobados por el proyecto. */
export default function Challenges() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ['challenges'], queryFn: () => api.get<Row[]>('/profiles/challenges') });
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Alert tone="bad">{errorMessage(q.error)}</Alert>;
  const join = async (id: string) => {
    setBusy(true);
    try {
      await api.post(`/profiles/challenges/${id}/join`);
      toast.success('Ya participas en el reto.');
      qc.invalidateQueries({ queryKey: ['challenges'] });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <PageTitle title="Retos ecológicos" subtitle="El avance cuenta solo hechos verificados desde que te unes." />
      {q.data.length === 0 && <EmptyState title="Todavía no hay retos publicados" />}
      {q.data.map((c) => (
        <Card key={c.id} title={c.title} subtitle={`${fmtDate(`${c.startDate}T12:00:00Z`)} a ${fmtDate(`${c.endDate}T12:00:00Z`)} · ${c.participantCount} participantes`}>
          <p className="text-sm whitespace-pre-line mb-2">{c.rules}</p>
          {c.recognition && <p className="text-sm mb-2">Reconocimiento: {c.recognition}</p>}
          {c.joined ? <ProgressBar value={(c.progress / c.target) * 100} label={`${c.progress} de ${c.target} · ${CHALLENGE_METRIC_LABELS[c.metric]}`} /> : <p className="text-sm mb-2">Meta: {c.target} · {CHALLENGE_METRIC_LABELS[c.metric]}</p>}
          {!c.open ? <Badge tone="neutral">No está abierto</Badge> : !c.joined ? <Button disabled={busy} onClick={() => join(c.id)}>Participar</Button> : c.progress >= c.target ? <Badge tone="ok">Meta cumplida</Badge> : null}
        </Card>
      ))}
    </div>
  );
}
