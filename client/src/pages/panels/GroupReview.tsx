import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { WASTE_CATEGORY_LABELS } from '@kindra/shared';
import type { WasteReport } from '@kindra/shared';
import { api, errorMessage } from '../../lib/api';
import { toast } from '../../lib/toast';
import { fmtNum } from '../../lib/format';
import { Alert, Button, Card, EmptyState, Field, Input, Modal, PageTitle, Spinner, Textarea } from '../../components/ui';
import type { ActivityView } from '../GroupArea';

type ReportRow = WasteReport & { groupName: string | null; photoUrls: string[] };

/** La coordinación valida lo que declaran comunidades y grupos costeros (v4.0, 25.2 y 25.4). */
export default function GroupReview() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['profiles', 'review'], queryFn: () => api.get<{ reports: ReportRow[]; activities: (ActivityView & { groupName: string | null })[] }>('/profiles/review') });
  const [cur, setCur] = useState<ReportRow | null>(null);
  const [f, setF] = useState({ quantity: '', note: '' });
  const [busy, setBusy] = useState(false);
  const act = async (path: string, body: unknown, ok: string) => {
    setBusy(true);
    try {
      await api.post(`/profiles/review/${path}`, body);
      toast.success(ok);
      setCur(null);
      qc.invalidateQueries({ queryKey: ['profiles'] });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Alert tone="bad">{errorMessage(q.error)}</Alert>;
  const u = (r: ReportRow) => (r.unit === 'm3' ? 'm³' : r.unit ?? '');
  return (
    <div className="space-y-4">
      <PageTitle title="Comunidades y grupos" subtitle="Solo lo que valides cuenta en el impacto del grupo." />
      <Card title="Reportes por revisar">
        {q.data.reports.length === 0 ? <EmptyState title="No hay reportes por revisar" /> : (
          <ul className="divide-y divide-line">
            {q.data.reports.map((r) => (
              <li key={r.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span><strong className="font-mono">{r.code}</strong> · {r.groupName}<span className="block text-xs text-muted">{r.kind === 'collection' ? 'Recolección' : 'Observación'} · {WASTE_CATEGORY_LABELS[r.category]} · {r.place} · {r.date}{r.quantity !== null ? ` · ${fmtNum(r.quantity, 2)} ${u(r)}` : ''}</span></span>
                <Button size="sm" variant="secondary" onClick={() => { setF({ quantity: r.quantity === null ? '' : String(r.quantity), note: '' }); setCur(r); }}>Revisar</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Jornadas por validar">
        {q.data.activities.length === 0 ? <EmptyState title="No hay jornadas por validar" /> : (
          <ul className="divide-y divide-line">
            {q.data.activities.map((a) => (
              <li key={a.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span><strong>{a.title}</strong> · {a.groupName}<span className="block text-xs text-muted">{a.date} · {a.participants.filter((p) => p.attended).length} asistentes · {fmtNum(a.participants.reduce((s, p) => s + (p.hours ?? 0), 0), 2)} horas declaradas</span></span>
                <Button size="sm" disabled={busy} onClick={() => act(`activities/${a.id}/validate`, {}, 'Jornada validada.')}>Validar</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Modal open={!!cur} onClose={() => setCur(null)} title={`Revisar ${cur?.code ?? ''}`}>
        {cur && (
          <>
            <p className="text-sm">{cur.description}</p>
            {cur.photoUrls.length > 0 && <div className="flex gap-2 my-2">{cur.photoUrls.map((p) => <img key={p} src={p} alt="Evidencia" className="h-28 w-28 rounded object-cover" />)}</div>}
            {cur.kind === 'collection' && <Field label={`Cantidad validada (${u(cur)})`} hint={`Declarada: ${fmtNum(cur.quantity, 2)} ${u(cur)}. No se sobrescribe.`}><Input type="number" min={0} step="0.1" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></Field>}
            <Field label="Nota" hint="Obligatoria si rechazas o cambias la cantidad."><Textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy} onClick={() => act(`reports/${cur.id}`, { action: 'validate', quantity: f.quantity === '' ? null : Number(f.quantity), note: f.note || null }, 'Reporte validado.')}>Validar</Button>
              {cur.status === 'submitted' && <Button variant="secondary" disabled={busy} onClick={() => act(`reports/${cur.id}`, { action: 'start' }, 'Marcado en revisión.')}>Dejar en revisión</Button>}
              <Button variant="danger" disabled={busy || !f.note.trim()} onClick={() => act(`reports/${cur.id}`, { action: 'reject', note: f.note }, 'Reporte rechazado.')}>Rechazar</Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
