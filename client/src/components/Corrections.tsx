import { useState } from 'react';
import type { OutputUnit } from '@kindra/shared';
import { api } from '../lib/api';
import { toast } from '../lib/toast';
import { Alert, Button, Field, Input, Select, Textarea } from './ui';
import { useSubmit } from './panels/shared';
import type { BatchView } from './panels/types';

/** El evaluador pide corregir; mientras esté pendiente no se verifica el lote. */
export function RequestCorrection({ b, onDone }: { b: BatchView; onDone: () => void }) {
  const { busy, error, run } = useSubmit();
  const [note, setNote] = useState('');
  if (b.openCorrection) return <Alert tone="warn" className="mt-2" title="Corrección pendiente en el centro">{b.openCorrection.note}</Alert>;
  return (
    <details className="mt-2 rounded-lg border border-line p-2">
      <summary className="cursor-pointer text-sm font-semibold">Solicitar corrección</summary>
      <Field label="Qué debe corregir el centro" required><Textarea value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /></Field>
      {error && <Alert tone="bad" className="mb-2">{error}</Alert>}
      <Button size="sm" variant="secondary" disabled={busy || note.trim().length < 5} onClick={() => run(async () => { await api.post(`/eval/batches/${b.id}/request-correction`, { note: note.trim() }); toast.success('Corrección solicitada.'); onDone(); })}>Enviar solicitud</Button>
    </details>
  );
}

const NUMS = [['aggregate', 'Agregado'], ['metal', 'Metal'], ['specialDisposal', 'A disposición especial'], ['rejects', 'Rechazos']] as const;

/** El centro corrige; el valor anterior y el motivo quedan en la bitácora. */
export function ResolveCorrection({ b, base, onDone }: { b: BatchView; base: 'center' | 'processing'; onDone: () => void }) {
  const { busy, error, run } = useSubmit();
  const o = b.outputs;
  const [f, setF] = useState({ unit: (o?.unit ?? 't') as OutputUnit, input: String(o?.input ?? ''), aggregate: String(o?.aggregate ?? ''), metal: String(o?.metal ?? ''), specialDisposal: String(o?.specialDisposal ?? ''), rejects: String(o?.rejects ?? ''), note: '' });
  if (!b.openCorrection) return null;
  const send = () =>
    run(async () => {
      await api.post(`/${base}/corrections/${b.openCorrection!.id}/resolve`, { note: f.note.trim(), outputs: { unit: f.unit, aggregate: Number(f.aggregate), metal: Number(f.metal), specialDisposal: Number(f.specialDisposal), rejects: Number(f.rejects), ...(f.input ? { input: Number(f.input) } : {}) } });
      toast.success(`Lote ${b.code} corregido.`);
      onDone();
    });
  return (
    <div className="mt-2 rounded-lg border border-warn p-3">
      <Alert tone="warn" title={`Corrección pedida por el evaluador · ${b.code}`}>{b.openCorrection.note}</Alert>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 mt-2">
        <Field label="Unidad" required><Select value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value as OutputUnit })}><option value="t">Toneladas (t)</option><option value="m3">Metros cúbicos (m³)</option></Select></Field>
        <Field label="Cantidad de entrada"><Input type="number" min={0} step="0.01" value={f.input} onChange={(e) => setF({ ...f, input: e.target.value })} /></Field>
        {NUMS.map(([k, l]) => <Field key={k} label={l} required><Input type="number" min={0} step="0.01" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>)}
      </div>
      <Field label="Motivo de la corrección" required><Textarea value={f.note} maxLength={500} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      {error && <Alert tone="bad" className="mb-2">{error}</Alert>}
      <Button disabled={busy || f.note.trim().length < 5 || NUMS.some(([k]) => f[k] === '')} onClick={send}>Guardar corrección</Button>
    </div>
  );
}
