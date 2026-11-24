import { useState } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ACTIVITY_STATUS_LABELS, WASTE_CATEGORY_LABELS, WASTE_REPORT_STATUS_LABELS } from '@kindra/shared';
import type { Group, GroupActivity, GroupKind, WasteReport } from '@kindra/shared';
import { api, errorMessage } from '../lib/api';
import { toast } from '../lib/toast';
import { fmtNum } from '../lib/format';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, PageTitle, Select, Spinner, Textarea } from '../components/ui';
import { HBars } from '../components/charts/Bars';
import { PhotoCapture, type CapturedPhoto } from '../components/PhotoCapture';
import { Kpi, today } from '../components/Requests';

interface Totals { kg: number | null; t: number | null; m3: number | null; activities: number; hours: number | null }
interface ImpactData { from: string | null; to: string | null; totals: { validated: Totals; reported: Totals }; months: (Omit<Totals, 'activities'> & { month: string; activities: number })[]; method: string }
export type ActivityView = Omit<GroupActivity, 'participants'> & { count: number; joined: boolean; participants: { userId: string; alias: string | null; attended: boolean | null; hours: number | null }[] };
interface HomeData {
  group: Group & { sectorName: string | null };
  leader: boolean;
  members: { id: string; alias: string | null; role: 'leader' | 'member'; status: string }[];
  activities: ActivityView[];
  upcoming: ActivityView | null;
  reports: (WasteReport & { reporterAlias: string | null; photoUrls: string[] })[];
  impact: ImpactData;
}

const BASE: Record<GroupKind, string> = { community: '/comunidad', coastal: '/costero' };
const useHome = () => useQuery({ queryKey: ['profiles', 'group'], queryFn: () => api.get<HomeData>('/profiles/group') });

function useAct() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      qc.invalidateQueries({ queryKey: ['profiles'] });
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { act, busy };
}

/** v4.0, 25.2 y 25.4: comunidades y grupos costeros. Lo declarado y lo validado van siempre aparte. */
export default function GroupArea({ kind }: { kind: GroupKind }) {
  const q = useHome();
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <div className="max-w-lg"><Alert tone="warn">{errorMessage(q.error)}</Alert><Link className="btn-secondary mt-3" to="/grupos">Ver comunidades y grupos</Link></div>;
  const d = q.data;
  return (
    <Routes>
      <Route index element={<Home d={d} kind={kind} />} />
      <Route path="actividades" element={<Activities d={d} kind={kind} />} />
      <Route path="reportes" element={<Reports d={d} />} />
      <Route path="impacto" element={<Impact />} />
      <Route path="miembros" element={<Members d={d} />} />
      <Route path="datos" element={<Profile key={d.group.id} d={d} />} />
      <Route path="*" element={<Navigate to={BASE[kind]} replace />} />
    </Routes>
  );
}

const val = (n: number | null, unit: string) => (n === null ? '—' : `${fmtNum(n, 2)} ${unit}`);

function WasteKpis({ t }: { t: Totals }) {
  const units = (['kg', 't', 'm3'] as const).filter((u) => t[u] !== null);
  return <>{units.length === 0 ? <Kpi label="Residuos recolectados, validado" value="—" note="Sin reportes validados" /> : units.map((u) => <Kpi key={u} label="Residuos recolectados, validado" value={val(t[u], u === 'm3' ? 'm³' : u)} note="Todo el registro" />)}</>;
}

function Home({ d, kind }: { d: HomeData; kind: GroupKind }) {
  const v = d.impact.totals.validated;
  const pending = d.members.filter((m) => m.status === 'requested').length;
  return (
    <div className="space-y-4">
      <PageTitle title={d.group.name} subtitle={[d.group.region, d.group.sectorName].filter(Boolean).join(' · ')} actions={d.group.isDemo ? <Badge tone="warn">Demostración</Badge> : undefined} />
      {d.leader && pending > 0 && <Alert tone="info">Hay {pending} solicitud(es) de membresía. <Link className="underline" to={`${BASE[kind]}/miembros`}>Revisar</Link></Alert>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Kpi label="Miembros activos" value={d.members.filter((m) => m.status === 'active').length} />
        <Kpi label={kind === 'coastal' ? 'Jornadas validadas' : 'Actividades validadas'} value={v.activities} note="Todo el registro" />
        <Kpi label="Horas de voluntariado, validadas" value={val(v.hours, 'h')} />
        <WasteKpis t={v} />
      </div>
      <Card title={kind === 'coastal' ? 'Próxima jornada' : 'Próxima actividad'}>{d.upcoming ? <ActivityCard a={d.upcoming} d={d} /> : <EmptyState title="Nada programado" text={d.leader ? 'Crea una desde el menú de actividades.' : undefined} />}</Card>
    </div>
  );
}

function ActivityCard({ a, d, onComplete }: { a: ActivityView; d: HomeData; onComplete?: () => void }) {
  const { act, busy } = useAct();
  const full = a.capacity !== null && a.count >= a.capacity;
  return (
    <article className="rounded-xl border border-line p-3 text-sm">
      <div className="flex flex-wrap gap-2 items-center"><strong>{a.title}</strong><Badge tone={a.status === 'published' ? 'info' : a.status === 'completed' ? 'ok' : 'neutral'}>{ACTIVITY_STATUS_LABELS[a.status]}</Badge>{a.status === 'completed' && <Badge tone={a.validatedAt ? 'ok' : 'warn'}>{a.validatedAt ? 'Validada' : 'Declarada, por validar'}</Badge>}</div>
      <p>{a.date} · {a.time} · {a.place}</p>
      <p className="text-muted">Punto de encuentro: {a.meetingPoint} · {a.count}{a.capacity !== null ? ` de ${a.capacity}` : ''} inscritos</p>
      {a.instructions && <p>{a.instructions}</p>}
      <div className="flex flex-wrap gap-2 mt-2">
        {a.status === 'published' && <Button size="sm" variant={a.joined ? 'secondary' : 'primary'} disabled={busy || (full && !a.joined)} onClick={() => act(() => api.post(`/profiles/group/activities/${a.id}/join`, { join: !a.joined }), a.joined ? 'Saliste de la lista.' : 'Inscripción registrada.')}>{a.joined ? 'No podré ir' : full ? 'Sin cupos' : 'Inscribirme'}</Button>}
        {d.leader && a.status === 'draft' && <Button size="sm" disabled={busy} onClick={() => act(() => api.post(`/profiles/group/activities/${a.id}/status`, { to: 'published' }), 'Actividad publicada.')}>Publicar</Button>}
        {d.leader && a.status === 'published' && onComplete && a.date <= today() && <Button size="sm" variant="secondary" onClick={onComplete}>Registrar asistencia</Button>}
        {d.leader && ['draft', 'published'].includes(a.status) && <Button size="sm" variant="ghost" disabled={busy} onClick={() => window.confirm('¿Cancelar esta actividad?') && act(() => api.post(`/profiles/group/activities/${a.id}/status`, { to: 'cancelled' }), 'Actividad cancelada.')}>Cancelar</Button>}
      </div>
      {a.status === 'completed' && a.participants.length > 0 && <ul className="text-xs text-muted mt-2">{a.participants.map((p) => <li key={p.userId}>{p.alias}: {p.attended ? `asistió${p.hours !== null ? `, ${fmtNum(p.hours, 2)} h` : ''}` : 'no asistió'}</li>)}</ul>}
    </article>
  );
}

const NEW_ACTIVITY = { title: '', date: '', time: '', place: '', meetingPoint: '', instructions: '', capacity: '' };

function Activities({ d, kind }: { d: HomeData; kind: GroupKind }) {
  const { act, busy } = useAct();
  const [f, setF] = useState<typeof NEW_ACTIVITY | null>(null);
  const [done, setDone] = useState<ActivityView | null>(null);
  const [att, setAtt] = useState<Record<string, { attended: boolean; hours: string }>>({});
  const name = kind === 'coastal' ? 'jornada' : 'actividad';
  const ready = f && f.title.length > 2 && f.date && f.time && f.place.length > 1 && f.meetingPoint.length > 1;
  const create = async (publish: boolean) => {
    if (f && (await act(() => api.post('/profiles/group/activities', { ...f, instructions: f.instructions || null, capacity: f.capacity ? Number(f.capacity) : null, publish }), publish ? 'Publicada.' : 'Guardada como borrador.'))) setF(null);
  };
  return (
    <div className="space-y-3">
      <PageTitle title={kind === 'coastal' ? 'Jornadas' : 'Actividades'} actions={d.leader ? <Button onClick={() => setF({ ...NEW_ACTIVITY })}>Nueva {name}</Button> : undefined} />
      {d.activities.length === 0 && <EmptyState title="Todavía no hay actividades" />}
      {d.activities.map((a) => <ActivityCard key={a.id} a={a} d={d} onComplete={() => { setAtt(Object.fromEntries(a.participants.map((p) => [p.userId, { attended: true, hours: '' }]))); setDone(a); }} />)}
      <Modal open={!!f} onClose={() => setF(null)} title={`Nueva ${name}`}>
        {f && (
          <>
            <Field label="Título" required><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-x-3"><Field label="Fecha" required><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field><Field label="Hora" required><Input type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></Field></div>
            <Field label={kind === 'coastal' ? 'Lugar de la costa' : 'Lugar'} required><Input value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} /></Field>
            <Field label="Punto de encuentro" required><Input value={f.meetingPoint} onChange={(e) => setF({ ...f, meetingPoint: e.target.value })} /></Field>
            <Field label="Cupos" hint="Vacío = sin límite."><Input type="number" min={1} value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} /></Field>
            <Field label="Indicaciones"><Textarea value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} /></Field>
            <div className="flex gap-2"><Button disabled={busy || !ready} onClick={() => create(true)}>Publicar</Button><Button variant="secondary" disabled={busy || !ready} onClick={() => create(false)}>Guardar borrador</Button></div>
          </>
        )}
      </Modal>
      <Modal open={!!done} onClose={() => setDone(null)} title="Registrar asistencia">
        {done && (
          <>
            <p className="text-sm text-muted mb-2">Queda como declarada hasta que la coordinación la valide.</p>
            {done.participants.length === 0 && <EmptyState title="Nadie se inscribió" />}
            {done.participants.map((p) => (
              <div key={p.userId} className="flex items-center gap-3 py-2 border-b border-line text-sm">
                <label className="flex items-center gap-2 flex-1"><input type="checkbox" className="h-5 w-5 accent-[var(--primary)]" checked={att[p.userId]?.attended ?? false} onChange={(e) => setAtt({ ...att, [p.userId]: { ...att[p.userId], attended: e.target.checked } })} /> {p.alias}</label>
                <Input type="number" min={0} max={24} step="0.5" placeholder="Horas" className="!w-24" aria-label={`Horas de ${p.alias}`} value={att[p.userId]?.hours ?? ''} disabled={!att[p.userId]?.attended} onChange={(e) => setAtt({ ...att, [p.userId]: { ...att[p.userId], hours: e.target.value } })} />
              </div>
            ))}
            <Button className="mt-3" disabled={busy} onClick={async () => { if (await act(() => api.post(`/profiles/group/activities/${done.id}/complete`, { attendance: Object.entries(att).map(([userId, a]) => ({ userId, attended: a.attended, hours: a.attended && a.hours !== '' ? Number(a.hours) : null })) }), 'Asistencia registrada.')) setDone(null); }}>Guardar asistencia</Button>
          </>
        )}
      </Modal>
    </div>
  );
}

const NEW_REPORT = { kind: 'collection' as WasteReport['kind'], category: 'mixed' as WasteReport['category'], quantity: '', unit: 'kg' as 'kg' | 't' | 'm3', place: '', date: '', description: '', activityId: '' };

function Reports({ d }: { d: HomeData }) {
  const { act, busy } = useAct();
  const [f, setF] = useState<typeof NEW_REPORT | null>(null);
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const need = f?.kind === 'collection';
  const ready = f && f.place.length > 1 && f.date && f.description.length > 2 && (!need || (Number(f.quantity) > 0 && photos.length > 0));
  return (
    <div className="space-y-3">
      <PageTitle title="Reportar" subtitle="Observaciones o recolecciones. La coordinación las revisa antes de que cuenten." actions={<Button onClick={() => { setPhotos([]); setF({ ...NEW_REPORT, date: today() }); }}>Nuevo reporte</Button>} />
      {d.reports.length === 0 && <EmptyState title="Todavía no hay reportes" />}
      {d.reports.map((r) => (
        <article key={r.id} className="rounded-xl border border-line p-3 text-sm bg-surface">
          <div className="flex flex-wrap gap-2 items-center"><strong className="font-mono">{r.code}</strong><Badge tone={r.status === 'validated' ? 'ok' : r.status === 'rejected' ? 'bad' : 'info'}>{WASTE_REPORT_STATUS_LABELS[r.status]}</Badge></div>
          <p>{r.kind === 'collection' ? 'Recolección' : 'Observación'} · {WASTE_CATEGORY_LABELS[r.category]} · {r.place} · {r.date}</p>
          <p>{r.description}</p>
          {r.quantity !== null && <p>Declarado: <strong>{val(r.quantity, r.unit === 'm3' ? 'm³' : r.unit!)}</strong>{r.status === 'validated' && r.validatedQuantity !== null ? <> · validado: <strong>{val(r.validatedQuantity, r.unit === 'm3' ? 'm³' : r.unit!)}</strong></> : null}</p>}
          {r.reviewNote && <p className="text-muted">Revisión: {r.reviewNote}</p>}
          {r.photoUrls.length > 0 && <div className="flex gap-2 mt-2">{r.photoUrls.map((u) => <img key={u} src={u} alt="Evidencia" className="h-16 w-16 rounded object-cover" />)}</div>}
        </article>
      ))}
      <Modal open={!!f} onClose={() => setF(null)} title="Nuevo reporte">
        {f && (
          <>
            <Field label="Tipo"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as WasteReport['kind'] })}><option value="collection">Recolección realizada</option><option value="observation">Observación de residuos</option></Select></Field>
            <Field label="Categoría"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as WasteReport['category'] })}>{Object.entries(WASTE_CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            {need && <div className="grid grid-cols-2 gap-x-3"><Field label="Cantidad" required><Input type="number" min={0} step="0.1" inputMode="decimal" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></Field><Field label="Unidad"><Select value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value as 'kg' })}><option value="kg">kg</option><option value="t">t</option><option value="m3">m³</option></Select></Field></div>}
            <Field label="Lugar" required><Input value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} /></Field>
            <Field label="Fecha" required><Input type="date" max={today()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
            <Field label="Actividad relacionada"><Select value={f.activityId} onChange={(e) => setF({ ...f, activityId: e.target.value })}><option value="">Ninguna</option>{d.activities.filter((a) => a.status === 'completed').map((a) => <option key={a.id} value={a.id}>{a.title} ({a.date})</option>)}</Select></Field>
            <Field label="Descripción" required><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
            <PhotoCapture kind="document" label={need ? 'Foto (obligatoria)' : 'Foto (opcional)'} photos={photos} onChange={setPhotos} max={5} withLocation={false} />
            <Button className="mt-3" disabled={busy || !ready} onClick={async () => { if (await act(() => api.post('/profiles/group/reports', { kind: f.kind, activityId: f.activityId || null, category: f.category, quantity: need ? Number(f.quantity) : null, unit: need ? f.unit : null, place: f.place, location: null, date: f.date, description: f.description, photoIds: photos.map((p) => p.id) }), 'Reporte enviado a revisión.')) setF(null); }}>Enviar reporte</Button>
          </>
        )}
      </Modal>
    </div>
  );
}

function Impact() {
  const [f, setF] = useState({ from: '', to: '' });
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const q = useQuery({ queryKey: ['profiles', 'impact', qs], queryFn: () => api.get<ImpactData>(`/profiles/group/impact${qs ? `?${qs}` : ''}`), placeholderData: (p) => p });
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Alert tone="bad">{errorMessage(q.error)}</Alert>;
  const { validated, reported } = q.data.totals;
  const rows: [string, (t: Totals) => string][] = [['Residuos (kg)', (t) => val(t.kg, 'kg')], ['Residuos (t)', (t) => val(t.t, 't')], ['Residuos (m³)', (t) => val(t.m3, 'm³')], ['Actividades', (t) => String(t.activities)], ['Horas de voluntariado', (t) => val(t.hours, 'h')]];
  const series = (['kg', 't', 'm3'] as const).filter((u) => validated[u] !== null);
  return (
    <div>
      <PageTitle title="Impacto" subtitle={q.data.method} />
      <Card>
        <div className="grid grid-cols-2 gap-x-3"><Field label="Desde"><Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field><Field label="Hasta"><Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field></div>
        <table className="table-plain"><thead><tr><th scope="col">Medida</th><th scope="col" className="text-right">Declarado</th><th scope="col" className="text-right">Validado</th></tr></thead><tbody>{rows.map(([l, fn]) => <tr key={l}><td>{l}</td><td className="text-right">{fn(reported)}</td><td className="text-right font-semibold">{fn(validated)}</td></tr>)}</tbody></table>
        <div className="mt-4 space-y-4">{series.map((u) => <HBars key={u} title={`Validado por mes (${u === 'm3' ? 'm³' : u})`} unit={u === 'm3' ? 'm³' : u} rows={q.data!.months.map((m) => ({ label: m.month, value: m[u] }))} />)}</div>
      </Card>
    </div>
  );
}

const MEMBER_STATUS: Record<string, string> = { active: 'Activo', invited: 'Con invitación', requested: 'Pide entrar', left: 'Retirado' };

function Members({ d }: { d: HomeData }) {
  const { act, busy } = useAct();
  const [alias, setAlias] = useState('');
  return (
    <div className="space-y-3 max-w-xl">
      <PageTitle title="Miembros" />
      {d.leader && (
        <Card title="Invitar">
          <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (await act(() => api.post('/profiles/group/members', { alias }), 'Invitación enviada.')) setAlias(''); }}>
            <Input value={alias} placeholder="Alias de la persona" aria-label="Alias de la persona" onChange={(e) => setAlias(e.target.value)} />
            <Button type="submit" disabled={busy || alias.trim().length < 3}>Invitar</Button>
          </form>
        </Card>
      )}
      <Card>
        <ul className="divide-y divide-line">
          {d.members.map((m) => (
            <li key={m.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span><strong>{m.alias}</strong> · {m.role === 'leader' ? 'Lidera' : 'Miembro'} · {MEMBER_STATUS[m.status]}</span>
              {d.leader && m.role !== 'leader' && <span className="flex gap-2">{m.status === 'requested' && <Button size="sm" disabled={busy} onClick={() => act(() => api.post(`/profiles/group/members/${m.id}/approve`), 'Membresía aprobada.')}>Aprobar</Button>}<Button size="sm" variant="ghost" disabled={busy} onClick={() => window.confirm(`¿Retirar a ${m.alias}?`) && act(() => api.post(`/profiles/group/members/${m.id}/remove`), 'Miembro retirado.')}>{m.status === 'requested' ? 'Rechazar' : 'Retirar'}</Button></span>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Profile({ d }: { d: HomeData }) {
  const { act, busy } = useAct();
  const [f, setF] = useState({ region: d.group.region, description: d.group.description, contact: d.group.contact || '' });
  return (
    <div className="max-w-xl">
      <PageTitle title={d.group.name} subtitle="El nombre y el sector los cambia la administración." />
      <Card>
        <Field label="Región"><Input value={f.region} disabled={!d.leader} onChange={(e) => setF({ ...f, region: e.target.value })} /></Field>
        <Field label="Descripción"><Textarea value={f.description} disabled={!d.leader} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        {d.leader && <Field label="Contacto autorizado" hint="Solo lo ve quien lidera y la administración."><Input value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} /></Field>}
        {d.leader && <Button disabled={busy} onClick={() => act(() => api.put('/profiles/group', { ...f, contact: f.contact || null }), 'Datos guardados.')}>Guardar</Button>}
      </Card>
    </div>
  );
}

/** Directorio para pedir membresía o aceptar una invitación. Pedirla no concede permisos. */
export function GroupsDirectory() {
  const q = useQuery({ queryKey: ['profiles', 'groups'], queryFn: () => api.get<{ id: string; kind: GroupKind; name: string; region: string; status: string | null }[]>('/profiles/groups') });
  const { act, busy } = useAct();
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Alert tone="bad">{errorMessage(q.error)}</Alert>;
  return (
    <div className="max-w-xl">
      <PageTitle title="Comunidades y grupos" subtitle="Pide entrar a un grupo. Quien lo lidera aprueba tu solicitud." />
      {q.data.length === 0 ? <EmptyState title="Todavía no hay grupos registrados" /> : (
        <Card>
          <ul className="divide-y divide-line">
            {q.data.map((g) => (
              <li key={g.id} className="py-2.5 flex items-center justify-between gap-2 text-sm">
                <span><strong>{g.name}</strong><span className="block text-xs text-muted">{g.kind === 'coastal' ? 'Grupo costero' : 'Comunidad'} · {g.region}</span></span>
                {g.status === 'active' ? <Badge tone="ok">Eres miembro</Badge> : g.status === 'requested' ? <Badge tone="warn">Solicitud enviada</Badge> : <Button size="sm" disabled={busy} onClick={() => act(() => api.post(`/profiles/groups/${g.id}/join`), g.status === 'invited' ? 'Invitación aceptada. Cambia de rol para entrar al grupo.' : 'Solicitud enviada.')}>{g.status === 'invited' ? 'Aceptar invitación' : 'Pedir entrar'}</Button>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
