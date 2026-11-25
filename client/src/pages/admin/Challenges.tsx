import { useState } from 'react';
import { CHALLENGE_METRIC_LABELS, ROLE_LABELS } from '@kindra/shared';
import type { AppConfig, EcoChallenge, ReportSnapshot, Role } from '@kindra/shared';
import { useFeature } from '../../lib/config';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, Select, Spinner, Textarea } from '../../components/ui';
import { Section, useAdminAction, useAdminGet, useAdminList } from './shared';

type Draft = Omit<EcoChallenge, 'id' | 'participants' | 'updatedAt'> & { id?: string };
const AUDIENCE: Role[] = ['citizen', 'monitor', 'householder', 'business'];
const EMPTY: Draft = { title: '', rules: '', recognition: '', startDate: '', endDate: '', metric: 'pickups', target: 1, audience: [], approvalReference: '', published: false };

export default function AdminChallenges() {
  const q = useAdminList<EcoChallenge>('challenges');
  const on = useFeature('eco_challenges');
  const { post, busy } = useAdminAction();
  const [d, setD] = useState<Draft | null>(null);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x!, ...p }));
  if (q.isLoading) return <Spinner />;
  return (
    <Section title="Retos ecológicos" subtitle="Cada reto necesita la referencia de aprobación del proyecto para publicarse. No suman puntos." actions={<Button onClick={() => setD({ ...EMPTY })}>Nuevo reto</Button>}>
      {!on && <Alert tone="info" className="mb-3">La función está apagada: nadie ve los retos. Se enciende en Funciones.</Alert>}
      {!q.data?.length ? <EmptyState title="Todavía no hay retos" /> : (
        <Card><ul className="divide-y divide-line text-sm">{q.data.map((c) => <li key={c.id} className="py-2 flex justify-between gap-2"><span><strong>{c.title}</strong> <Badge tone={c.published ? 'ok' : 'neutral'}>{c.published ? 'Publicado' : 'Borrador'}</Badge><span className="block text-xs text-muted">{c.startDate} a {c.endDate} · {CHALLENGE_METRIC_LABELS[c.metric]} · meta {c.target} · {c.participants.length} participantes</span></span><Button size="sm" variant="ghost" onClick={() => { const { participants: _p, updatedAt: _u, ...rest } = c; setD(rest); }}>Editar</Button></li>)}</ul></Card>
      )}
      <Modal open={!!d} onClose={() => setD(null)} title={d?.id ? 'Editar reto' : 'Nuevo reto'} wide>
        {d && (
          <>
            <Field label="Nombre" required><Input value={d.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} /></Field>
            <Field label="Reglas" required><Textarea rows={4} value={d.rules} maxLength={3000} onChange={(e) => set({ rules: e.target.value })} /></Field>
            <Field label="Reconocimiento (opcional)"><Input value={d.recognition} maxLength={300} onChange={(e) => set({ recognition: e.target.value })} /></Field>
            <div className="grid sm:grid-cols-2 gap-x-3">
              <Field label="Desde" required><Input type="date" value={d.startDate} onChange={(e) => set({ startDate: e.target.value })} /></Field>
              <Field label="Hasta" required><Input type="date" value={d.endDate} onChange={(e) => set({ endDate: e.target.value })} /></Field>
              <Field label="Qué cuenta"><Select value={d.metric} onChange={(e) => set({ metric: e.target.value as Draft['metric'] })}>{Object.entries(CHALLENGE_METRIC_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
              <Field label="Meta" required><Input type="number" min={1} value={d.target} onChange={(e) => set({ target: Number(e.target.value) })} /></Field>
            </div>
            <fieldset className="mb-3"><legend className="label">Para quién (vacío = todas las personas)</legend><div className="flex flex-wrap gap-2">{AUDIENCE.map((r) => <button key={r} type="button" aria-pressed={d.audience.includes(r)} className={`chip ${d.audience.includes(r) ? 'chip-active' : ''}`} onClick={() => set({ audience: d.audience.includes(r) ? d.audience.filter((x) => x !== r) : [...d.audience, r] })}>{ROLE_LABELS[r]}</button>)}</div></fieldset>
            <Field label="Referencia de aprobación" required={d.published}><Input value={d.approvalReference} maxLength={200} onChange={(e) => set({ approvalReference: e.target.value })} /></Field>
            <label className="flex items-center gap-2 text-sm mb-3"><input type="checkbox" checked={d.published} onChange={(e) => set({ published: e.target.checked })} /> Publicado</label>
            <Button disabled={busy || d.title.trim().length < 3 || d.rules.trim().length < 5 || !d.startDate || !d.endDate || !(d.target >= 1) || (d.published && d.approvalReference.trim().length < 3)} onClick={async () => { if (await post('challenges', d, 'Reto guardado.')) setD(null); }}>Guardar</Button>
          </>
        )}
      </Modal>
    </Section>
  );
}

/** Qué cifras del reporte oficial se muestran en el tablero público. Ninguna hasta que alguien las apruebe. */
export function PublicFigures() {
  const cfg = useAdminGet<AppConfig>('config');
  const snaps = useAdminGet<ReportSnapshot[]>('public-report/options');
  const { put, busy } = useAdminAction();
  const [draft, setDraft] = useState<{ keys: string[]; approvalReference: string } | null>(null);
  if (cfg.isLoading || snaps.isLoading) return <Spinner />;
  const cur = draft ?? { keys: cfg.data?.publicReport?.keys ?? [], approvalReference: cfg.data?.publicReport?.approvalReference ?? '' };
  const indicators = snaps.data?.[0]?.indicators ?? [];
  return (
    <Card title="Cifras oficiales en el tablero público" subtitle="Privadas por defecto. Marca solo las que tienen aprobación para hacerse públicas.">
      {indicators.map((i) => <label key={i.key} className="flex items-center gap-2 text-sm py-1"><input type="checkbox" className="h-5 w-5 accent-[var(--primary)]" checked={cur.keys.includes(i.key)} onChange={(e) => setDraft({ ...cur, keys: e.target.checked ? [...cur.keys, i.key] : cur.keys.filter((k) => k !== i.key) })} /> {i.label}</label>)}
      <Field label="Referencia de aprobación" required={cur.keys.length > 0}><Input value={cur.approvalReference} maxLength={200} onChange={(e) => setDraft({ ...cur, approvalReference: e.target.value })} /></Field>
      <Button disabled={busy || !draft || (cur.keys.length > 0 && cur.approvalReference.trim().length < 3)} onClick={async () => { if (await put('public-report', cur, 'Cifras públicas guardadas.')) setDraft(null); }}>Guardar</Button>
    </Card>
  );
}
