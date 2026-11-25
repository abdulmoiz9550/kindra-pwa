import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { OutputUnit } from '@kindra/shared';
import { api, errorMessage } from '../../lib/api';
import { toast } from '../../lib/toast';
import { useTab } from '../../lib/useTab';
import { fmtNum, unitLabel } from '../../lib/format';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, PageTitle, Select, Spinner } from '../../components/ui';
import { PhotoCapture, type CapturedPhoto } from '../../components/PhotoCapture';
import { BatchHeader, OutputsSummary, useSubmit } from '../../components/panels/shared';
import { ResolveCorrection } from '../../components/Corrections';
import { Kpi } from '../../components/Requests';
import type { BatchView } from '../../components/panels/types';

interface Data { center: { id: string; name: string }; queue: BatchView[]; history: BatchView[]; flagged: number }

/** v4.0, 5.6: procesamiento. Separado de quien recibe y de quien evalúa. */
export default function Processing() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['processing'], queryFn: () => api.get<Data>('/processing/overview') });
  const [tab] = useTab<'home' | 'queue' | 'balance' | 'history'>('home', ['home', 'queue', 'balance', 'history']);
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Alert tone="bad">{errorMessage(q.error)}</Alert>;
  const d = q.data;
  const ready = d.queue.filter((b) => b.state === 'closed');
  const refresh = () => qc.invalidateQueries({ queryKey: ['processing'] });
  const balance = d.history.filter((b) => b.materialBalance);
  return (
    <div className="space-y-4">
      <PageTitle title={tab === 'queue' ? 'Por procesar' : tab === 'balance' ? 'Balance de material' : tab === 'history' ? 'Historial' : 'Procesamiento'} subtitle={d.center.name} />
      {tab === 'home' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Kpi label="Lotes abiertos" value={d.queue.filter((b) => b.state === 'open').length} />
          <Kpi label="Listos para procesar" value={ready.length} />
          <Kpi label="Retenidos por el evaluador" value={d.queue.filter((b) => b.state === 'held').length} />
          <Kpi label="Balances por revisar" value={d.flagged} note="Entrada distinta de salidas" />
        </div>
      )}
      {(tab === 'home' || tab === 'queue') && d.history.filter((b) => b.openCorrection).map((b) => <ResolveCorrection key={b.openCorrection!.id} b={b} base="processing" onDone={refresh} />)}
      {(tab === 'home' || tab === 'queue') && (
        <Card title="Lotes de tu centro">
          {d.queue.length === 0 ? <EmptyState title="No hay lotes en cola" /> : <div className="space-y-3">{d.queue.map((b) => <Lot key={b.id} b={b} onDone={refresh} />)}</div>}
        </Card>
      )}
      {tab === 'balance' && (
        <Card title="Entrada y salidas por lote" subtitle="Cada lote en su propia unidad.">
          {balance.length === 0 ? <EmptyState title="Todavía no hay lotes con entrada registrada" /> : (
            <div className="overflow-x-auto"><table className="table-plain"><thead><tr><th>Lote</th><th className="text-right">Entrada</th><th className="text-right">Salidas</th><th className="text-right">Diferencia</th></tr></thead><tbody>{balance.map((b) => { const m = b.materialBalance!; return <tr key={b.id}><td>{b.code}</td><td className="text-right">{fmtNum(m.input, 2)} {unitLabel(m.unit)}</td><td className="text-right">{fmtNum(m.output, 2)} {unitLabel(m.unit)}</td><td className="text-right">{m.flagged ? <Badge tone="warn">{fmtNum(m.difference, 2)} {unitLabel(m.unit)}</Badge> : 'Cuadra'}</td></tr>; })}</tbody></table></div>
          )}
        </Card>
      )}
      {tab === 'history' && <Card title="Lotes procesados">{d.history.length === 0 ? <EmptyState title="Todavía no hay lotes procesados" /> : <div className="space-y-3">{d.history.map((b) => <div key={b.id} className="rounded-lg border border-line p-3"><BatchHeader b={b} /><OutputsSummary b={b} />{b.outputs?.method && <p className="text-sm">Método: {b.outputs.method}</p>}</div>)}</div>}</Card>}
    </div>
  );
}

const NUMS = [['input', 'Cantidad de entrada'], ['aggregate', 'Agregado'], ['metal', 'Metal'], ['specialDisposal', 'A disposición especial'], ['rejects', 'Rechazos']] as const;

function Lot({ b, onDone }: { b: BatchView; onDone: () => void }) {
  const { busy, error, run } = useSubmit();
  const [f, setF] = useState({ unit: 't' as OutputUnit, input: '', aggregate: '', metal: '', specialDisposal: '', rejects: '', method: '' });
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  return (
    <div className="rounded-lg border border-line p-3">
      <BatchHeader b={b} />
      <p className="text-xs text-muted mt-1">{b.receptionIds.length} recepciones · {b.unclassified} sin clasificar</p>
      {error && <Alert tone="bad" className="mt-2">{error}</Alert>}
      {b.state === 'held' && <Alert tone="warn" className="mt-2">El evaluador debe decidir antes de procesar.</Alert>}
      {b.state === 'open' && <Button size="sm" variant="secondary" className="mt-2" disabled={busy} onClick={() => run(async () => { await api.post(`/processing/batches/${b.id}/close`); toast.success(`Lote ${b.code} cerrado.`); onDone(); })}>Cerrar lote</Button>}
      {b.state === 'closed' && (
        <div className="mt-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3">
            <Field label="Unidad" required><Select value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value as OutputUnit })}><option value="t">Toneladas (t)</option><option value="m3">Metros cúbicos (m³)</option></Select></Field>
            {NUMS.map(([k, l]) => <Field key={k} label={l} required><Input type="number" min={0} step="0.1" inputMode="decimal" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>)}
          </div>
          <Field label="Separación o trituración: método" required><Input value={f.method} maxLength={200} onChange={(e) => setF({ ...f, method: e.target.value })} /></Field>
          <PhotoCapture kind="document" label="Evidencia (opcional)" photos={photos} onChange={setPhotos} max={1} withLocation={false} />
          <Button className="mt-3" disabled={busy || NUMS.some(([k]) => f[k] === '') || !(Number(f.input) > 0) || f.method.trim().length < 2} onClick={() => run(async () => { await api.post(`/processing/batches/${b.id}/outputs`, { unit: f.unit, input: Number(f.input), aggregate: Number(f.aggregate), metal: Number(f.metal), specialDisposal: Number(f.specialDisposal), rejects: Number(f.rejects), method: f.method.trim(), evidencePhotoId: photos[0]?.id ?? null }); toast.success(`Salidas de ${b.code} registradas.`); onDone(); })}>Guardar registro</Button>
        </div>
      )}
    </div>
  );
}
