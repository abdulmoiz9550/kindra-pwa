import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { usePublicConfig } from '../../lib/config';
import { toast } from '../../lib/toast';
import { fmtDateTime } from '../../lib/format';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Select, Spinner, Textarea } from '../../components/ui';

interface Row { label: string; facility: string | null; operator: string | null; official: { tonnesToday: number | null; tonnesAccumulated: number | null; m3Today: number | null; m3Accumulated: number | null; tonnesMethod: string }; kindra: { tonnesToday: number | null; tonnesAccumulated: number | null; m3Today: number | null; m3Accumulated: number | null; tonnesWeighed: number | null } }
interface Disc { id: string; snapshotId: string; label: string; metric: string; official: number | null; kindra: number | null; differencePct: number | null; reason: string; ownerId: string | null; dueDate: string | null; status: 'open' | 'resolved'; resolution?: string | null; createdAt: string }
interface View { snapshot: { id: string; title: string; source: string; reportedAt: string; importedAt: string }; rows: Row[]; discrepancies: Disc[] }
interface DraftRow { label: string; facilityId: string; operatorEntityId: string; m3Today: string; m3Accumulated: string; tonnesToday: string; tonnesAccumulated: string }

const n = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const toNum = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));
const EMPTY_ROW: DraftRow = { label: '', facilityId: '', operatorEntityId: '', m3Today: '', m3Accumulated: '', tonnesToday: '', tonnesAccumulated: '' };

/**
 * Addendum v4.2, sección 14: conciliación semanal con el reporte oficial. Importación manual (archivo CSV o carga a
 * mano), comparación por centro y operador en t y m³ por separado, y discrepancias con responsable y fecha.
 */
export default function Reconciliation() {
  const role = useAuth((s) => s.user?.activeRole);
  const canEdit = role === 'coordinator' || role === 'admin';
  const qc = useQueryClient();
  const v = useQuery({ queryKey: ['reconciliation'], queryFn: () => api.get<View | null>('/reports/reconciliation') });
  const all = useQuery({ queryKey: ['reconciliation', 'all'], queryFn: () => api.get<Disc[]>('/reports/reconciliation/discrepancies') });
  const [importing, setImporting] = useState(false);
  if (v.isLoading) return <Spinner />;
  if (v.error) return <Alert tone="bad">{errorMessage(v.error)}</Alert>;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['reconciliation'] });
    qc.invalidateQueries({ queryKey: ['reports'] });
  };
  return (
    <div className="space-y-4">
      {canEdit && (importing ? <ImportForm onDone={() => { setImporting(false); refresh(); }} onCancel={() => setImporting(false)} /> : <Button onClick={() => setImporting(true)}>Importar reporte oficial</Button>)}
      {!v.data ? <EmptyState title="Todavía no hay reportes oficiales importados" /> : (
        <Card title={`Comparación con ${v.data.snapshot.title}`} subtitle={`Fuente: ${v.data.snapshot.source} · Fecha de la fuente: ${fmtDateTime(v.data.snapshot.reportedAt)} · Importado: ${fmtDateTime(v.data.snapshot.importedAt)}`}>
          <div className="overflow-x-auto">
            <table className="table-plain text-sm">
              <thead><tr><th scope="col">Fila</th><th scope="col" className="text-right">t oficial (acum.)</th><th scope="col" className="text-right">t Kindra (acum.)</th><th scope="col" className="text-right">t pesadas Kindra</th><th scope="col" className="text-right">m³ oficial (acum.)</th><th scope="col" className="text-right">m³ Kindra (acum.)</th></tr></thead>
              <tbody>
                {v.data.rows.map((r) => (
                  <tr key={r.label}>
                    <td>{r.label}<span className="block text-xs text-muted">{[r.facility, r.operator].filter(Boolean).join(' · ')}</span></td>
                    <td className="text-right">{n(r.official.tonnesAccumulated)}{r.official.tonnesMethod.startsWith('Estimación') && <span className="block"><Badge tone="warn" icon={false}>estimación por factor</Badge></span>}</td>
                    <td className="text-right">{n(r.kindra.tonnesAccumulated)}</td>
                    <td className="text-right">{n(r.kindra.tonnesWeighed)}</td>
                    <td className="text-right">{n(r.official.m3Accumulated)}</td>
                    <td className="text-right">{n(r.kindra.m3Accumulated)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted mt-2">Las toneladas y los m³ nunca se suman entre sí. Una diferencia mayor al 5 % abre una discrepancia.</p>
        </Card>
      )}
      <Card title="Discrepancias de conciliación" subtitle="Cada una tiene responsable y fecha de resolución.">
        {!all.data?.length ? <p className="text-sm text-muted">Sin discrepancias.</p> : <ul className="divide-y divide-line">{all.data.map((d) => <DiscItem key={d.id} d={d} canEdit={canEdit} onDone={refresh} />)}</ul>}
      </Card>
    </div>
  );
}

function DiscItem({ d, canEdit, onDone }: { d: Disc; canEdit: boolean; onDone: () => void }) {
  const users = useQuery({ queryKey: ['reconciliation', 'owners'], queryFn: () => api.get<{ id: string; alias: string }[]>('/reports/reconciliation/owners').catch(() => []), enabled: canEdit });
  const [owner, setOwner] = useState(d.ownerId ?? '');
  const [due, setDue] = useState(d.dueDate ?? '');
  const [res, setRes] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      await api.post(`/reports/reconciliation/discrepancies/${d.id}`, body);
      toast.success('Guardado.');
      onDone();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="py-2 text-sm">
      <div className="flex flex-wrap justify-between gap-2"><strong>{d.label}</strong><Badge tone={d.status === 'open' ? 'warn' : 'ok'}>{d.status === 'open' ? 'Abierta' : 'Resuelta'}</Badge></div>
      <p>{d.reason}{d.differencePct != null ? ` (${d.differencePct} %)` : ''} · oficial {n(d.official)} · Kindra {n(d.kindra)}</p>
      {d.resolution && <p className="text-muted">Resolución: {d.resolution}</p>}
      {canEdit && d.status === 'open' && (
        <div className="grid sm:grid-cols-3 gap-x-2 mt-1">
          <Field label="Responsable"><Select value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">Sin asignar</option>{(users.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.alias}</option>)}</Select></Field>
          <Field label="Fecha de resolución"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
          <div className="self-end mb-3"><Button size="sm" disabled={busy} onClick={() => save({ ownerId: owner || null, dueDate: due || null })}>Asignar</Button></div>
          <Field label="Explicación para resolver"><Input value={res} maxLength={1000} onChange={(e) => setRes(e.target.value)} /></Field>
          <div className="self-end mb-3"><Button size="sm" variant="secondary" disabled={busy || res.trim().length < 5} onClick={() => save({ resolution: res.trim() })}>Resolver</Button></div>
        </div>
      )}
    </li>
  );
}

function ImportForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { data: cfg } = usePublicConfig();
  const centers = useQuery({ queryKey: ['reconciliation', 'centers'], queryFn: () => api.get<{ centers: { id: string; name: string }[]; operators: { id: string; name: string }[] }>('/reports/reconciliation/catalog') });
  const [f, setF] = useState({ title: '', source: 'Plan de Despeje Digno y Seguro / Totalidad de Vestigios', reportedAt: '', note: '' });
  const [rows, setRows] = useState<DraftRow[]>([{ ...EMPTY_ROW }]);
  const [busy, setBusy] = useState(false);
  void cfg;
  const fromCsv = async (file: File) => {
    // Columnas: fila;centro;operador;m3_dia;m3_acumulado;t_dia;t_acumulado (coma o punto y coma).
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const out: DraftRow[] = [];
    for (const line of lines.slice(1)) {
      const c = line.split(/[;,\t]/).map((x) => x.trim());
      const center = centers.data?.centers.find((x) => x.id === c[1] || x.name.toLowerCase() === (c[1] || '').toLowerCase());
      const op = centers.data?.operators.find((x) => x.id === c[2] || x.name.toLowerCase() === (c[2] || '').toLowerCase());
      out.push({ label: c[0] || '', facilityId: center?.id ?? '', operatorEntityId: op?.id ?? '', m3Today: c[3] ?? '', m3Accumulated: c[4] ?? '', tonnesToday: c[5] ?? '', tonnesAccumulated: c[6] ?? '' });
    }
    if (out.length) setRows(out);
    else toast.error('El archivo no tiene filas.');
  };
  const send = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ discrepancies: unknown[] }>('/reports/snapshots/import', { ...f, reportedAt: new Date(f.reportedAt).toISOString(), rows: rows.filter((r) => r.label.trim()).map((r) => ({ label: r.label.trim(), facilityId: r.facilityId || null, operatorEntityId: r.operatorEntityId || null, m3Today: toNum(r.m3Today), m3Accumulated: toNum(r.m3Accumulated), tonnesToday: toNum(r.tonnesToday), tonnesAccumulated: toNum(r.tonnesAccumulated) })) });
      toast.success(`Reporte importado. ${r.discrepancies.length} discrepancia(s) abierta(s).`);
      onDone();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const set = (i: number, p: Partial<DraftRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  return (
    <Card title="Importar reporte oficial" subtitle="Se guarda como instantánea con su fecha y hora de fuente. Las anteriores no se modifican.">
      <div className="grid sm:grid-cols-2 gap-x-3">
        <Field label="Título" required><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Fuente" required><Input value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} /></Field>
        <Field label="Fecha y hora del reporte en la fuente" required><Input type="datetime-local" value={f.reportedAt} onChange={(e) => setF({ ...f, reportedAt: e.target.value })} /></Field>
        <Field label="Archivo CSV (opcional)" hint="Columnas: fila; centro; operador; m3_día; m3_acumulado; t_día; t_acumulado"><input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && void fromCsv(e.target.files[0])} /></Field>
      </div>
      <Field label="Nota (explica correcciones del reporte oficial)"><Textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-2 md:grid-cols-7 gap-1">
            <Input aria-label="Fila" placeholder="Fila" value={r.label} onChange={(e) => set(i, { label: e.target.value })} />
            <Select aria-label="Centro" value={r.facilityId} onChange={(e) => set(i, { facilityId: e.target.value })}><option value="">Centro</option>{centers.data?.centers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
            <Select aria-label="Operador" value={r.operatorEntityId} onChange={(e) => set(i, { operatorEntityId: e.target.value })}><option value="">Operador</option>{centers.data?.operators.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
            <Input aria-label="m³ del día" placeholder="m³ día" inputMode="decimal" value={r.m3Today} onChange={(e) => set(i, { m3Today: e.target.value })} />
            <Input aria-label="m³ acumulado" placeholder="m³ acum." inputMode="decimal" value={r.m3Accumulated} onChange={(e) => set(i, { m3Accumulated: e.target.value })} />
            <Input aria-label="t del día" placeholder="t día" inputMode="decimal" value={r.tonnesToday} onChange={(e) => set(i, { tonnesToday: e.target.value })} />
            <Input aria-label="t acumulado" placeholder="t acum." inputMode="decimal" value={r.tonnesAccumulated} onChange={(e) => set(i, { tonnesAccumulated: e.target.value })} />
          </div>
        ))}
        <Button size="sm" variant="ghost" onClick={() => setRows([...rows, { ...EMPTY_ROW }])}>Añadir fila</Button>
      </div>
      <div className="mt-3 flex gap-2">
        <Button disabled={busy || f.title.trim().length < 3 || !f.reportedAt || !rows.some((r) => r.label.trim())} onClick={send}>Importar y conciliar</Button>
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
      </div>
    </Card>
  );
}
