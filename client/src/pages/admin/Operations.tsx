import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { INFO_CLASSIFICATION_LABELS, RETENTION_PROPOSAL, ROLES, ROLE_LABELS } from '@kindra/shared';
import type { Entity, InfoClassification, NewsItem, OriginEffectiveState, Role, AppConfig } from '@kindra/shared';
import { api } from '../../lib/api';
import { fmtDate, fmtDateTime } from '../../lib/format';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, OriginStateBadge, Select, Spinner, Textarea } from '../../components/ui';
import { TraceList, type TraceRow } from '../../components/TraceList';
import type { HelpData } from '../../components/News';
import { PublicFigures } from './Challenges';
import { Section, useAdminAction, useAdminGet, useAdminList } from './shared';

/** Vista global o de una organización (v4.0, 5.1). */
export function EntityScope({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const q = useAdminList<Entity>('entities');
  return <Select aria-label="Alcance" value={value} onChange={(e) => onChange(e.target.value)}><option value="">Vista global</option>{q.data?.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select>;
}

export function Traceability() {
  const [entity, setEntity] = useState('');
  const q = useAdminGet<TraceRow[]>(`traceability${entity ? `?entity=${entity}` : ''}`);
  return <Section title="Trazabilidad" subtitle="Del origen al destino. Solo lectura." actions={<EntityScope value={entity} onChange={setEntity} />}>{q.isLoading ? <Spinner /> : <TraceList rows={q.data || []} />}</Section>;
}

interface Queue { coordinators: { id: string; alias: string }[]; reports: { id: string; code: string; sectorName: string | null; state: OriginEffectiveState; createdAt: string; closedAt: string | null; assignedTo: string | null; escalated: boolean; note: string | null }[] }

export function CitizenReports() {
  const q = useAdminGet<Queue>('citizen-reports');
  const { post, busy } = useAdminAction();
  const [view, setView] = useState('open');
  const [esc, setEsc] = useState<{ id: string; code: string; note: string } | null>(null);
  if (q.isLoading || !q.data) return <Spinner />;
  const d = q.data;
  const closed = (s: string) => ['closed', 'rejected'].includes(s);
  const rows = d.reports.filter((r) => (view === 'all' ? true : view === 'open' ? !closed(r.state) : view === 'new' ? r.state === 'registered' : r.escalated));
  return (
    <Section title="Reportes ciudadanos" subtitle="Asigna, escala y sigue cada reporte. La decisión la registra la coordinación.">
      <div className="max-w-xs mb-3"><Select aria-label="Filtrar" value={view} onChange={(e) => setView(e.target.value)}><option value="open">Abiertos</option><option value="new">Por validar</option><option value="escalated">Escalados</option><option value="all">Todos</option></Select></div>
      {rows.length === 0 ? <EmptyState title="Sin reportes en este filtro" /> : (
        <Card>
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="py-2.5 text-sm flex flex-wrap items-center justify-between gap-2">
                <span><Link className="font-bold text-primary underline" to={`/reporte/${r.code}`}>{r.code}</Link> <OriginStateBadge state={r.state} /> {r.escalated && <Badge tone="bad">Escalado</Badge>}<span className="block text-xs text-muted">{r.sectorName} · recibido {fmtDateTime(r.createdAt)}{r.closedAt ? ` · cerrado ${fmtDateTime(r.closedAt)}` : ''}{r.note ? ` · ${r.note}` : ''}</span></span>
                <span className="flex items-center gap-2">
                  <Select aria-label={`Asignar ${r.code}`} disabled={busy} value={r.assignedTo || ''} onChange={(e) => post(`citizen-reports/${r.id}`, { userId: e.target.value || null }, 'Asignación guardada.')}><option value="">Sin asignar</option>{d.coordinators.map((c) => <option key={c.id} value={c.id}>{c.alias}</option>)}</Select>
                  {!r.escalated && !closed(r.state) && <Button size="sm" variant="secondary" onClick={() => setEsc({ id: r.id, code: r.code, note: '' })}>Escalar</Button>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Modal open={!!esc} onClose={() => setEsc(null)} title={`Escalar ${esc?.code ?? ''}`}>
        {esc && <><Field label="Motivo" required><Textarea value={esc.note} maxLength={400} onChange={(e) => setEsc({ ...esc, note: e.target.value })} /></Field><Button disabled={busy || esc.note.trim().length < 3} onClick={async () => { if (await post(`citizen-reports/${esc.id}`, { escalate: true, note: esc.note.trim() }, 'Reporte escalado.')) setEsc(null); }}>Escalar</Button></>}
      </Modal>
    </Section>
  );
}

type NewsDraft = Omit<NewsItem, 'id' | 'updatedAt'> & { id?: string };

export function Content() {
  const q = useAdminList<NewsItem>('news');
  const { post, put, busy } = useAdminAction();
  const [d, setD] = useState<NewsDraft | null>(null);
  const help = useQuery({ queryKey: ['public', 'help'], queryFn: () => api.get<HelpData>('/public/ayuda') });
  const [h, setH] = useState({ about: '', privacy: '', contact: '' });
  useEffect(() => {
    if (help.data) setH({ about: help.data.about, privacy: help.data.privacy, contact: help.data.contact });
  }, [help.data]);
  return (
    <Section title="Noticias y ayuda" subtitle="Publica solo textos aprobados." actions={<Button onClick={() => setD({ kind: 'news', title: '', body: '', audience: [], published: false, publishedAt: new Date().toISOString() })}>Nueva publicación</Button>}>
      <div className="space-y-4">
        <Card title="Noticias y campañas">
          {!q.data?.length ? <EmptyState title="Todavía no hay publicaciones" /> : <ul className="divide-y divide-line text-sm">{q.data.map((n) => <li key={n.id} className="py-2 flex justify-between gap-2"><span><strong>{n.title}</strong> <Badge tone={n.published ? 'ok' : 'neutral'}>{n.published ? 'Publicada' : 'Borrador'}</Badge><span className="block text-xs text-muted">{n.kind === 'campaign' ? 'Campaña' : 'Noticia'} · {fmtDate(n.publishedAt)} · {n.audience.length ? n.audience.map((r) => ROLE_LABELS[r]).join(', ') : 'todas las personas'}</span></span><Button size="sm" variant="ghost" onClick={() => { const { updatedAt: _u, ...rest } = n; setD(rest); }}>Editar</Button></li>)}</ul>}
        </Card>
        <PublicFigures />
        <Card title="Página de ayuda" subtitle="Lo que quede vacío se muestra como pendiente de publicación.">
          <Field label="Acerca de Kindra"><Textarea rows={4} value={h.about} onChange={(e) => setH({ ...h, about: e.target.value })} /></Field>
          <Field label="Aviso de privacidad (texto aprobado)"><Textarea rows={6} value={h.privacy} onChange={(e) => setH({ ...h, privacy: e.target.value })} /></Field>
          <Field label="Contacto y soporte"><Textarea rows={2} value={h.contact} onChange={(e) => setH({ ...h, contact: e.target.value })} /></Field>
          <Button disabled={busy || !help.data} onClick={async () => { if (await put('help', h, 'Ayuda guardada.')) help.refetch(); }}>Guardar</Button>
        </Card>
      </div>
      <Modal open={!!d} onClose={() => setD(null)} title={d?.id ? 'Editar publicación' : 'Nueva publicación'} wide>
        {d && (
          <>
            <div className="grid sm:grid-cols-2 gap-x-3">
              <Field label="Tipo"><Select value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value as NewsDraft['kind'] })}><option value="news">Noticia</option><option value="campaign">Campaña</option></Select></Field>
              <Field label="Fecha de publicación" required><Input type="date" value={new Date(d.publishedAt).toLocaleDateString('en-CA', { timeZone: 'America/Caracas' })} onChange={(e) => e.target.value && setD({ ...d, publishedAt: `${e.target.value}T04:00:00.000Z` })} /></Field>
            </div>
            <Field label="Título" required><Input value={d.title} maxLength={160} onChange={(e) => setD({ ...d, title: e.target.value })} /></Field>
            <Field label="Texto" required><Textarea rows={6} value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} /></Field>
            <fieldset className="mb-3"><legend className="label">Para quién (vacío = todas las personas)</legend><div className="flex flex-wrap gap-2">{ROLES.map((r: Role) => <button key={r} type="button" aria-pressed={d.audience.includes(r)} className={`chip ${d.audience.includes(r) ? 'chip-active' : ''}`} onClick={() => setD({ ...d, audience: d.audience.includes(r) ? d.audience.filter((x) => x !== r) : [...d.audience, r] })}>{ROLE_LABELS[r]}</button>)}</div></fieldset>
            <label className="flex items-center gap-2 text-sm mb-3"><input type="checkbox" checked={d.published} onChange={(e) => setD({ ...d, published: e.target.checked })} /> Publicada</label>
            <Button disabled={busy || d.title.trim().length < 3 || d.body.trim().length < 3} onClick={async () => { if (await post('news', d, 'Publicación guardada.')) setD(null); }}>Guardar</Button>
          </>
        )}
      </Modal>
    </Section>
  );
}

export function DataQuality() {
  const q = useAdminGet<{ checkedAt: string; total: number; checks: { key: string; label: string; count: number; items: { code: string; link: string | null }[] }[] }>('data-quality');
  if (q.isLoading || !q.data) return <Spinner />;
  return (
    <Card title="Calidad de datos" subtitle={`Revisado ${fmtDateTime(q.data.checkedAt)}. Solo señala; no cambia ningún registro.`}>
      <ul className="divide-y divide-line text-sm">
        {q.data.checks.map((c) => (
          <li key={c.key} className="py-2">
            <div className="flex justify-between gap-2"><span>{c.label}</span><Badge tone={c.count ? 'warn' : 'ok'}>{c.count}</Badge></div>
            {c.count > 0 && <p className="text-xs mt-1 flex flex-wrap gap-2">{c.items.map((x, n) => (x.link ? <Link key={n} className="text-primary underline" to={x.link}>{x.code}</Link> : <span key={n}>{x.code}</span>))}{c.count > c.items.length && <span className="text-muted">y {c.count - c.items.length} más</span>}</p>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function Reviews() {
  const q = useAdminList<{ key: string; label: string; scope: string; lastAt: string | null; lastBy: string | null; lastNote: string | null; due: boolean }>('reviews');
  const { post, busy } = useAdminAction();
  const [note, setNote] = useState<Record<string, string>>({});
  if (q.isLoading) return <Spinner />;
  return (
    <Card title="Calendario de revisiones">
      <ul className="divide-y divide-line text-sm">
        {q.data?.map((r) => (
          <li key={r.key} className="py-2.5">
            <p><strong>{r.label}</strong> {r.due && <Badge tone="warn">Por hacer</Badge>}</p>
            <p className="text-ink-2">{r.scope}</p>
            <p className="text-xs text-muted">{r.lastAt ? `Última: ${fmtDateTime(r.lastAt)} · ${r.lastBy ?? ''} · ${r.lastNote ?? ''}` : 'Sin revisiones registradas'}</p>
            <div className="flex gap-2 mt-1"><Input placeholder="Resultado de la revisión" aria-label={`Resultado, ${r.label}`} value={note[r.key] || ''} onChange={(e) => setNote({ ...note, [r.key]: e.target.value })} /><Button size="sm" disabled={busy || (note[r.key] || '').trim().length < 3} onClick={async () => { if (await post(`reviews/${r.key}`, { note: note[r.key].trim() }, 'Revisión registrada.')) setNote({ ...note, [r.key]: '' }); }}>Registrar</Button></div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function Retention() {
  const q = useAdminGet<AppConfig>('config');
  const { put, busy } = useAdminAction();
  const [edit, setEdit] = useState<{ level: InfoClassification; period: string; legalBasis: string; approvalReference: string } | null>(null);
  if (q.isLoading) return <Spinner />;
  return (
    <Card className="mt-4" title="Conservación por nivel" subtitle="Se publica un plazo solo con su causal legal y la referencia de aprobación. La plataforma no borra nada por su cuenta.">
      <ul className="divide-y divide-line text-sm">
        {(Object.keys(INFO_CLASSIFICATION_LABELS) as InfoClassification[]).map((k) => {
          const r = q.data?.retention?.[k];
          return <li key={k} className="py-2 flex justify-between gap-2"><span><strong>{INFO_CLASSIFICATION_LABELS[k]}</strong><span className="block text-xs text-muted">{r ? `${r.period} · ${r.legalBasis} · aprobación ${r.approvalReference} · ${fmtDate(r.updatedAt)}` : `Pendiente de aprobación. Propuesta técnica: ${RETENTION_PROPOSAL[k]}`}</span></span><Button size="sm" variant="ghost" onClick={() => setEdit({ level: k, period: r?.period || RETENTION_PROPOSAL[k], legalBasis: r?.legalBasis || '', approvalReference: r?.approvalReference || '' })}>Editar</Button></li>;
        })}
      </ul>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit ? INFO_CLASSIFICATION_LABELS[edit.level] : ''}>
        {edit && <><Field label="Plazo" required><Input value={edit.period} onChange={(e) => setEdit({ ...edit, period: e.target.value })} /></Field><Field label="Causal legal" required><Input value={edit.legalBasis} onChange={(e) => setEdit({ ...edit, legalBasis: e.target.value })} /></Field><Field label="Referencia de aprobación" required><Input value={edit.approvalReference} onChange={(e) => setEdit({ ...edit, approvalReference: e.target.value })} /></Field><Button disabled={busy || edit.period.length < 2 || edit.legalBasis.length < 3 || edit.approvalReference.length < 3} onClick={async () => { const { level, ...body } = edit; if (await put(`retention/${level}`, body, 'Plazo guardado.')) setEdit(null); }}>Guardar</Button></>}
      </Modal>
    </Card>
  );
}

interface Dash {
  asOf: string;
  indicators: { label: string; value: number; to: string }[];
  trend: { month: string; origins: number; arrivals: number }[];
  alerts: { id: string; text: string; createdAt: string; link: string | null }[];
  alertCount: number;
  modules: { label: string; active: boolean }[];
  quality: { label: string; count: number }[] | null;
  approvals: { label: string; count: number; to: string }[];
  report: { title: string; reportedAt: string; indicators: { key: string; label: string; value: number | null; unit?: string }[] } | null;
}

export function Dashboard({ entity }: { entity: string }) {
  const q = useAdminGet<Dash>(`dashboard${entity ? `?entity=${entity}` : ''}`);
  if (q.isLoading) return <Spinner />;
  if (!q.data) return <Alert tone="bad">No se pudo cargar el resumen.</Alert>;
  const d = q.data;
  return (
    <div className="space-y-4 mb-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {d.indicators.map((i) => <Link key={i.label} to={i.to} className="card !p-3 hover:bg-surface-2"><p className="text-xs text-muted">{i.label}</p><p className="text-2xl font-bold">{i.value}</p></Link>)}
      </div>
      <p className="text-xs text-muted">Registros de Kindra al {fmtDateTime(d.asOf)}.</p>
      {d.report && <Card title={d.report.title} subtitle={`Reporte oficial, ${fmtDateTime(d.report.reportedAt)}`} actions={<Link className="btn-ghost btn-sm" to="/panel/reportes">Abrir</Link>}><div className="grid grid-cols-2 md:grid-cols-4 gap-2">{d.report.indicators.map((i) => <div key={i.key}><p className="text-xs text-muted">{i.label}</p><p className="font-bold">{i.value?.toLocaleString('es-VE')} {i.unit}</p></div>)}</div></Card>}
      <div className="grid md:grid-cols-2 gap-3">
        <Card title={`Alertas operativas (${d.alertCount})`}>{d.alerts.length === 0 ? <p className="text-sm text-muted">Sin alertas abiertas.</p> : <ul className="divide-y divide-line text-sm">{d.alerts.map((a) => <li key={a.id} className="py-1.5">{a.link ? <Link className="underline" to={a.link}>{a.text}</Link> : a.text}<span className="block text-xs text-muted">{fmtDateTime(a.createdAt)}</span></li>)}</ul>}</Card>
        {d.approvals.length > 0 && <Card title="Aprobaciones pendientes"><ul className="divide-y divide-line text-sm">{d.approvals.map((a) => <li key={a.label} className="py-1.5 flex justify-between"><Link className="underline" to={a.to}>{a.label}</Link><strong>{a.count}</strong></li>)}</ul></Card>}
        <Card title="Módulos"><ul className="text-sm space-y-1">{d.modules.map((m) => <li key={m.label} className="flex justify-between gap-2"><span>{m.label}</span><Badge tone={m.active ? 'ok' : 'neutral'}>{m.active ? 'Activo' : 'Inactivo'}</Badge></li>)}</ul></Card>
        {d.quality && <Card title="Calidad de datos" actions={<Link className="btn-ghost btn-sm" to="/admin/gobierno?tab=quality">Ver detalle</Link>}><ul className="text-sm space-y-1">{d.quality.map((c) => <li key={c.label} className="flex justify-between gap-2"><span>{c.label}</span><strong>{c.count}</strong></li>)}</ul></Card>}
      </div>
      {d.trend.length > 0 && <Card title="Tendencia mensual"><table className="table-plain"><thead><tr><th>Mes</th><th className="text-right">Orígenes registrados</th><th className="text-right">Llegadas confirmadas</th></tr></thead><tbody>{d.trend.map((m) => <tr key={m.month}><td>{m.month}</td><td className="text-right">{m.origins}</td><td className="text-right">{m.arrivals}</td></tr>)}</tbody></table></Card>}
    </div>
  );
}
