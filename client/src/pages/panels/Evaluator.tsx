import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SUBCATEGORY_LABELS } from '@kindra/shared';
import { api, errorMessage } from '../../lib/api';
import { toast } from '../../lib/toast';
import { fmtDate, fmtDateTime, fmtNum, unitLabel } from '../../lib/format';
import { Card, Button, Field, Textarea, Alert, EmptyState, PageTitle, Tabs, Spinner, Badge, KeyValue } from '../../components/ui';
import { PhotoCapture, type CapturedPhoto } from '../../components/PhotoCapture';
import { CompositionBars, BatchHeader, OutputsSummary, Checklist, checklistComplete, useSubmit } from '../../components/panels/shared';
import type { EvalOverview, BatchView, ChecklistItem } from '../../components/panels/types';

type Tab = 'held' | 'verification' | 'decided';

export default function Evaluator() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['eval', 'overview'], queryFn: () => api.get<EvalOverview>('/eval/overview') });
  const [tab, setTab] = useState<Tab>('held');
  const d = q.data;
  const refresh = () => qc.invalidateQueries({ queryKey: ['eval'] });
  if (q.isLoading) return <Spinner label="Cargando el panel…" />;
  if (q.error || !d) return <Alert tone="bad">{errorMessage(q.error)}</Alert>;
  const held = d.batches.filter((b) => b.state === 'held').length;
  const uv = d.batches.filter((b) => b.state === 'under_verification').length;
  return (
    <div>
      <PageTitle title="Panel del evaluador técnico" subtitle="Decisiones sobre material peligroso y verificación de calidad de cada lote. Toda decisión exige lista completa y justificación escrita." />
      <Tabs value={tab} onChange={setTab} items={[{ value: 'held', label: 'Lotes retenidos', count: held }, { value: 'verification', label: 'Por verificar', count: uv }, { value: 'decided', label: 'Decididos', count: d.decided.length }]} />
      <div className="mt-3 space-y-4">
        {tab === 'held' &&
          (held === 0 ? <EmptyState title="No hay lotes retenidos" text="Cuando un centro marque una recepción como posible material peligroso, aparecerá aquí." /> : d.centers.filter((c) => c.held.length).map((c) => (
            <Card key={c.centerId} title={c.centerName} subtitle={`${c.held.length} lote${c.held.length === 1 ? '' : 's'} retenido${c.held.length === 1 ? '' : 's'}`}>
              <div className="space-y-4">{c.held.map((b) => <HazardForm key={b.id} b={b} checklist={d.hazardChecklist} onDone={refresh} />)}</div>
            </Card>
          )))}
        {tab === 'verification' &&
          (uv === 0 ? <EmptyState title="No hay lotes esperando verificación de calidad" /> : d.centers.filter((c) => c.underVerification.length).map((c) => (
            <Card key={c.centerId} title={c.centerName} subtitle={`${c.underVerification.length} lote${c.underVerification.length === 1 ? '' : 's'} por verificar`}>
              <div className="space-y-4">{c.underVerification.map((b) => <QualityForm key={b.id} b={b} checklist={d.qualityChecklist} onDone={refresh} />)}</div>
            </Card>
          )))}
        {tab === 'decided' && (
          <Card title="Lotes con verificación registrada">
            {d.decided.length === 0 ? <EmptyState title="Todavía no hay lotes verificados" /> : (
              <ul className="space-y-3">
                {d.decided.map((b) => (
                  <li key={b.id} className="rounded-lg border border-line p-3">
                    <BatchHeader b={b} />
                    <p className="text-xs text-muted mt-1">{b.centerName} · periodo {fmtDate(b.periodStart)} – {fmtDate(b.periodEnd)}</p>
                    {b.qualityVerification && <KeyValue items={[{ k: 'Resultado', v: b.qualityVerification.result === 'approved' ? 'Aprobado' : 'Rechazado' }, { k: 'Fecha', v: fmtDateTime(b.qualityVerification.createdAt) }, { k: 'Justificación', v: b.qualityVerification.justification }]} />}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

function HazardForm({ b, checklist, onDone }: { b: BatchView; checklist: ChecklistItem[]; onDone: () => void }) {
  const { busy, error, run } = useSubmit();
  const suspected = b.receptions.filter((r) => r.subcategory === 'possible_hazardous' && !r.hazardDecision);
  const [ids, setIds] = useState<string[]>(suspected.map((r) => r.id));
  const [check, setCheck] = useState<Record<string, boolean | null>>({});
  const [decision, setDecision] = useState<'release' | 'special_disposal' | ''>('');
  const [just, setJust] = useState('');
  const ready = ids.length > 0 && checklistComplete(checklist, check) && !!decision && just.trim().length >= 5;
  return (
    <div className="rounded-lg border border-bad/40 p-3">
      <BatchHeader b={b} />
      <p className="text-xs text-muted mt-1">Periodo {fmtDate(b.periodStart)} – {fmtDate(b.periodEnd)} · {b.receptionIds.length} recepciones</p>
      <h4 className="label mt-3">Recepciones sospechosas</h4>
      <ul className="space-y-2">
        {suspected.map((r) => (
          <li key={r.id} className="flex gap-3 rounded-lg border border-line p-2 text-sm">
            <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--primary)]" checked={ids.includes(r.id)} onChange={() => setIds((s) => (s.includes(r.id) ? s.filter((x) => x !== r.id) : [...s, r.id]))} aria-label={`Incluir recepción del viaje ${r.tripCode}`} />
            {r.photoUrl && <img src={r.photoUrl} alt="" className="h-16 w-16 rounded object-cover" />}
            <div>
              <p className="font-semibold">Viaje {r.tripCode} · {r.originCodes.join(', ')}</p>
              <p className="text-muted">{r.sectorNames.join(', ')} · <Badge tone="bad">{SUBCATEGORY_LABELS.possible_hazardous}</Badge></p>
              {r.note && <p className="text-xs mt-1">Nota del centro: {r.note}</p>}
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3">
        <Checklist items={checklist} value={check} onChange={setCheck} />
      </div>
      <fieldset className="mt-3">
        <legend className="label">Decisión</legend>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`chip ${decision === 'release' ? 'chip-active' : ''}`} onClick={() => setDecision('release')} aria-pressed={decision === 'release'}>Liberar: no es material peligroso</button>
          <button type="button" className={`chip ${decision === 'special_disposal' ? 'chip-active' : ''}`} onClick={() => setDecision('special_disposal')} aria-pressed={decision === 'special_disposal'}>Desviar a disposición especial</button>
        </div>
      </fieldset>
      <Field label="Justificación escrita (obligatoria)" required>
        <Textarea value={just} onChange={(e) => setJust(e.target.value)} placeholder="Qué observaste y por qué decides así." />
      </Field>
      {error && <Alert tone="bad" className="mb-2">{error}</Alert>}
      <Button disabled={busy || !ready} onClick={() => run(async () => { const r = await api.post<{ batch: BatchView }>(`/eval/batches/${b.id}/hazard-decision`, { receptionIds: ids, checklist: check, decision, justification: just.trim() }); toast.success(r.batch.state === 'held' ? 'Decisión registrada. Quedan recepciones sospechosas por decidir.' : `Decisión registrada. El lote ${b.code} quedó liberado.`); onDone(); })}>
        {busy ? 'Registrando…' : 'Registrar decisión'}
      </Button>
      {!ready && <p className="text-xs text-muted mt-1">Responde toda la lista, elige la decisión y escribe la justificación.</p>}
    </div>
  );
}

function QualityForm({ b, checklist, onDone }: { b: BatchView; checklist: ChecklistItem[]; onDone: () => void }) {
  const { busy, error, run } = useSubmit();
  const [check, setCheck] = useState<Record<string, boolean | null>>({});
  const [result, setResult] = useState<'approved' | 'rejected' | ''>('');
  const [just, setJust] = useState('');
  const [docs, setDocs] = useState<CapturedPhoto[]>([]);
  const [docId, setDocId] = useState<string | null>(null);
  const ready = checklistComplete(checklist, check) && !!result && just.trim().length >= 5;
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const dataUrl = await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => rej(new Error('No se pudo leer el archivo.')); fr.readAsDataURL(file); });
    try {
      const p = await api.post<{ id: string }>('/photos', { dataUrl, kind: 'document' });
      setDocId(p.id);
      toast.success('Documento adjuntado.');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <div className="rounded-lg border border-line p-3">
      <BatchHeader b={b} />
      <p className="text-xs text-muted mt-1">Periodo {fmtDate(b.periodStart)} – {fmtDate(b.periodEnd)} · {b.receptionIds.length} recepciones{b.outputs ? ` · agregado ${fmtNum(b.outputs.aggregate)} ${unitLabel(b.outputs.unit)}` : ''}</p>
      <OutputsSummary b={b} />
      <div className="mt-2"><CompositionBars composition={b.composition} withTable={false} /></div>
      <div className="mt-3"><Checklist items={checklist} value={check} onChange={setCheck} /></div>
      <fieldset className="mt-3">
        <legend className="label">Resultado</legend>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`chip ${result === 'approved' ? 'chip-active' : ''}`} onClick={() => setResult('approved')} aria-pressed={result === 'approved'}>Aprobado</button>
          <button type="button" className={`chip ${result === 'rejected' ? 'chip-active' : ''}`} onClick={() => setResult('rejected')} aria-pressed={result === 'rejected'}>Rechazado</button>
        </div>
      </fieldset>
      <Field label="Justificación escrita (obligatoria)" required>
        <Textarea value={just} onChange={(e) => setJust(e.target.value)} />
      </Field>
      <div className="mb-3">
        <span className="label">Documento adjunto (opcional)</span>
        <div className="flex flex-wrap gap-2 items-center">
          <label className="btn-secondary btn-sm cursor-pointer">Subir PDF o imagen<input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} /></label>
          <PhotoCapture kind="document" label="Foto del informe" photos={docs} onChange={(p) => { setDocs(p); setDocId(p[0]?.id || null); }} max={1} withLocation={false} />
          {docId && <Badge tone="ok">Documento adjunto</Badge>}
        </div>
      </div>
      {error && <Alert tone="bad" className="mb-2">{error}</Alert>}
      <Button disabled={busy || !ready} onClick={() => run(async () => { await api.post(`/eval/batches/${b.id}/quality`, { checklist: check, result, justification: just.trim(), documentId: docId }); toast.success(result === 'approved' ? `Lote ${b.code} aprobado. El centro ya puede despacharlo.` : `Lote ${b.code} rechazado. No podrá despacharse a obras.`); onDone(); })}>
        {busy ? 'Registrando…' : 'Registrar verificación'}
      </Button>
    </div>
  );
}
