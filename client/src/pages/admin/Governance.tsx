import { useState } from 'react';
import { INFO_CLASSIFICATION_HELP, INFO_CLASSIFICATION_LABELS, INFO_REQUEST_STATUS_LABELS, ROLE_LABELS } from '@kindra/shared';
import type { InfoClassification, InfoRequest, PublicUser, RiskEntry, Role, SecurityIncident } from '@kindra/shared';
import { fmtDate, fmtDateTime } from '../../lib/format';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, Select, Spinner, Tabs, Textarea } from '../../components/ui';
import { useTab } from '../../lib/useTab';
import { DataQuality, Retention, Reviews } from './Operations';
import { Section, useAdminAction, useAdminGet, useAdminList } from './shared';

type Tab = 'quality' | 'reviews' | 'requests' | 'security' | 'recovery' | 'risks' | 'incidents' | 'backups' | 'classification';

/** v4.0, secciones 9 a 11: gobierno de datos y seguridad. */
export default function Governance() {
  const [tab, setTab] = useTab<Tab>('requests');
  return (
    <Section title="Gobierno de datos y seguridad" subtitle="Solicitudes de información, accesos, riesgos, incidentes y copias. La plataforma registra; las decisiones las toma una persona autorizada.">
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'requests', label: 'Solicitudes de información' },
          { value: 'security', label: 'Accesos y exportaciones' },
          { value: 'recovery', label: 'Recuperación de acceso' },
          { value: 'risks', label: 'Riesgos' },
          { value: 'incidents', label: 'Incidentes' },
          { value: 'backups', label: 'Copias' },
          { value: 'quality', label: 'Calidad de datos' },
          { value: 'reviews', label: 'Revisiones' },
          { value: 'classification', label: 'Clasificación y conservación' },
        ]}
      />
      <div className="mt-3">
        {tab === 'requests' && <Requests />}
        {tab === 'security' && <Security />}
        {tab === 'recovery' && <Recovery />}
        {tab === 'risks' && <Risks />}
        {tab === 'incidents' && <Incidents />}
        {tab === 'backups' && <Backups />}
        {tab === 'quality' && <DataQuality />}
        {tab === 'reviews' && <Reviews />}
        {tab === 'classification' && <><Classification /><Retention /></>}
      </div>
    </Section>
  );
}

type InfoRow = InfoRequest & { reviewerAlias: string | null; approvedByAlias: string | null };

function Requests() {
  const q = useAdminList<InfoRow>('info-requests');
  const [open, setOpen] = useState<string | null>(null);
  if (q.isLoading) return <Spinner />;
  const rows = q.data || [];
  const cur = rows.find((r) => r.id === open);
  if (!rows.length) return <EmptyState title="Sin solicitudes" text="Las solicitudes llegan desde el enlace “Solicitar información” al pie de la aplicación." />;
  return (
    <Card>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.id} className="py-2.5 text-sm flex flex-wrap items-center justify-between gap-2">
            <span>
              <strong>{r.code}</strong> · {r.subject}
              <span className="block text-xs text-muted">{fmtDateTime(r.createdAt)}{r.reviewerAlias ? ` · revisa ${r.reviewerAlias}` : ' · sin persona asignada'}</span>
            </span>
            <span className="flex items-center gap-2">
              {r.classification && <Badge tone="neutral" icon={false}>{INFO_CLASSIFICATION_LABELS[r.classification]}</Badge>}
              <Badge tone={r.status === 'submitted' ? 'warn' : r.status === 'under_review' ? 'info' : 'ok'} icon={false}>{INFO_REQUEST_STATUS_LABELS[r.status]}</Badge>
              <Button size="sm" variant="secondary" onClick={() => setOpen(r.id)}>Abrir</Button>
            </span>
          </li>
        ))}
      </ul>
      {cur && <RequestModal r={cur} onClose={() => setOpen(null)} />}
    </Card>
  );
}

function RequestModal({ r, onClose }: { r: InfoRow; onClose: () => void }) {
  const users = useAdminList<PublicUser>('users');
  const { post, busy } = useAdminAction();
  const [note, setNote] = useState('');
  const [items, setItems] = useState('');
  const [redactions, setRedactions] = useState('');
  const act = (body: Record<string, unknown>, ok: string) => post(`info-requests/${r.id}/action`, body, ok);
  const decided = !['submitted', 'under_review'].includes(r.status);
  const released = items.split('\n').map((s) => s.trim()).filter(Boolean);
  return (
    <Modal open onClose={onClose} title={`Solicitud ${r.code}`} wide>
      <p className="font-semibold">{r.subject}</p>
      <p className="text-sm whitespace-pre-wrap">{r.description}</p>
      <p className="text-xs text-muted mt-1">Confidencial · {r.requesterName || 'sin nombre'} · {r.requesterContact || 'sin contacto'}</p>
      <div className="grid sm:grid-cols-2 gap-x-3 mt-3">
        <Field label="Clasificación">
          <Select value={r.classification || ''} disabled={busy || decided} onChange={(e) => e.target.value && act({ action: 'classify', classification: e.target.value }, 'Clasificación guardada.')}>
            <option value="">Sin clasificar</option>
            {Object.entries(INFO_CLASSIFICATION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Persona revisora">
          <Select value={r.reviewerId || ''} disabled={busy || decided} onChange={(e) => e.target.value && act({ action: 'assign', reviewerId: e.target.value }, 'Persona asignada.')}>
            <option value="">Sin asignar</option>
            {(users.data || []).filter((u) => u.active && u.roles.some((x) => ['admin', 'supervisor', 'entity_admin'].includes(x))).map((u) => <option key={u.id} value={u.id}>{u.alias}</option>)}
          </Select>
        </Field>
      </div>
      {!decided && (
        <>
          {r.status === 'submitted' && <Button size="sm" variant="secondary" disabled={busy} onClick={() => act({ action: 'start_review' }, 'En revisión.')}>Empezar revisión</Button>}
          <Field label="Fundamento de la decisión" required><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <Field label="Qué se entrega exactamente" hint="Un elemento por línea."><Textarea value={items} onChange={(e) => setItems(e.target.value)} /></Field>
          <Field label="Qué se tacha o se retiene" hint="Obligatorio si se entrega en parte."><Textarea value={redactions} onChange={(e) => setRedactions(e.target.value)} /></Field>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || !note.trim() || !released.length} onClick={() => act({ action: 'release', note, releasedItems: released }, 'Decisión registrada.')}>Entregar</Button>
            <Button variant="secondary" disabled={busy || !note.trim() || !released.length || !redactions.trim()} onClick={() => act({ action: 'partial_release', note, releasedItems: released, redactions }, 'Decisión registrada.')}>Entregar en parte</Button>
            <Button variant="danger" disabled={busy || !note.trim()} onClick={() => act({ action: 'deny', note }, 'Decisión registrada.')}>No entregar</Button>
          </div>
        </>
      )}
      {decided && (
        <div className="text-sm mt-2 space-y-1">
          <p><strong>{INFO_REQUEST_STATUS_LABELS[r.status]}</strong> · {r.approvedByAlias}</p>
          <p>{r.decisionNote}</p>
          {r.releasedItems.length > 0 && <p>Entregado: {r.releasedItems.join('; ')}</p>}
          {r.redactions && <p>Tachado: {r.redactions}</p>}
          {r.status !== 'closed' && <Button size="sm" variant="secondary" disabled={busy} onClick={() => act({ action: 'close' }, 'Solicitud cerrada.')}>Cerrar solicitud</Button>}
        </div>
      )}
      <h3 className="label mt-4">Historial</h3>
      <ul className="text-xs text-muted">{r.history.map((h, i) => <li key={i}>{fmtDateTime(h.at)} · {h.action}{h.note ? ` · ${h.note}` : ''}</li>)}</ul>
    </Modal>
  );
}

interface SecRow {
  id: string;
  seq: number;
  type: string;
  serverTime: string;
  userAlias: string | null;
  actorRole: string | null;
  data: Record<string, unknown>;
  hash: string;
}
const ACTION_LABELS: Record<string, string> = {
  sign_in: 'Inicio de sesión',
  sign_in_failed: 'Inicio de sesión fallido',
  access_denied: 'Acceso denegado',
  role_change: 'Cambio de roles',
  account_suspended: 'Cuenta suspendida',
  account_reactivated: 'Cuenta reactivada',
  password_reset: 'Contraseña restablecida',
  recovery_requested: 'Recuperación solicitada',
  recovery_resolved: 'Recuperación atendida',
};
const FILTERS = { '': 'Todo', sign_in_failed: 'Inicios fallidos', access_denied: 'Accesos denegados', role_change: 'Cambios de rol', data_exported: 'Exportaciones', info_request_action: 'Solicitudes de información', governance_action: 'Riesgos e incidentes' };

function Security() {
  const q = useAdminGet<{ failedSignIns24h: number; events: SecRow[] }>('security');
  const [filter, setFilter] = useState('');
  if (q.isLoading || !q.data) return <Spinner />;
  const rows = q.data.events.filter((e) => !filter || e.type === filter || e.data.action === filter);
  const describe = (e: SecRow) => {
    const d = e.data as Record<string, any>;
    if (e.type === 'data_exported') return `Exportación: ${d.what} · ${d.rows} filas`;
    if (e.type === 'info_request_action') return `Solicitud ${d.code}: ${d.action}`;
    if (e.type === 'report_snapshot_imported') return `Reporte importado · ${d.source}`;
    if (e.type === 'governance_action') return String(d.action).replace(/_/g, ' ');
    const extra = d.action === 'access_denied' ? ` · ${d.method} ${d.path}` : d.action === 'role_change' ? ` · ${d.before || 'nueva cuenta'} → ${d.after}` : d.ip ? ` · ${d.ip}` : '';
    return `${ACTION_LABELS[d.action] || d.action}${extra}`;
  };
  return (
    <>
      <Alert tone={q.data.failedSignIns24h >= 10 ? 'warn' : 'info'} className="mb-3">Inicios de sesión fallidos en las últimas 24 horas: {q.data.failedSignIns24h}.</Alert>
      <Field label="Mostrar">
        <Select value={filter} onChange={(e) => setFilter(e.target.value)}>{Object.entries(FILTERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
      </Field>
      {rows.length === 0 ? <EmptyState title="Sin registros" /> : (
        <Card>
          <ul className="divide-y divide-line">
            {rows.map((e) => (
              <li key={e.id} className="py-2 text-sm">
                {describe(e)}
                <span className="block text-xs text-muted">{fmtDateTime(e.serverTime)} · {e.userAlias || 'sin cuenta'}{e.actorRole ? ` · ${ROLE_LABELS[e.actorRole as Role] || e.actorRole}` : ''} · sello {e.hash.slice(0, 12)}…</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function Recovery() {
  const q = useAdminList<{ id: string; alias: string | null; name: string | null; createdAt: string; status: 'pending' | 'done' }>('recovery');
  const { post, busy } = useAdminAction();
  if (q.isLoading) return <Spinner />;
  return (
    <>
      <Alert tone="info" className="mb-3">Verifica la identidad de la persona por un canal conocido, asígnale una contraseña nueva en Usuarios y marca la solicitud como atendida.</Alert>
      {!(q.data || []).length ? <EmptyState title="Sin solicitudes de recuperación" /> : (
        <Card>
          <ul className="divide-y divide-line">
            {q.data!.map((r) => (
              <li key={r.id} className="py-2 text-sm flex justify-between gap-2">
                <span>{r.alias} {r.name ? `· ${r.name}` : ''}<span className="block text-xs text-muted">{fmtDateTime(r.createdAt)}</span></span>
                {r.status === 'pending' ? <Button size="sm" disabled={busy} onClick={() => post(`recovery/${r.id}/resolve`, {}, 'Marcada como atendida.')}>Marcar atendida</Button> : <Badge tone="ok">Atendida</Badge>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

type RiskDraft = Omit<RiskEntry, 'id' | 'score' | 'createdAt' | 'updatedAt'> & { id?: string };
const NEW_RISK: RiskDraft = { description: '', affected: '', likelihood: 3, impact: 3, mitigation: '', owner: '', reviewDate: '', status: 'open', controlTestedAt: null, controlTestNote: null };
const RISK_STATUS = { open: 'Abierto', in_progress: 'En tratamiento', resolved: 'Resuelto (control probado)' };

function Risks() {
  const q = useAdminList<RiskEntry>('risks');
  const { post, busy } = useAdminAction();
  const [d, setD] = useState<RiskDraft | null>(null);
  if (q.isLoading) return <Spinner />;
  const set = (p: Partial<RiskDraft>) => setD((x) => ({ ...x!, ...p }));
  return (
    <>
      <div className="mb-3 flex justify-end"><Button onClick={() => setD({ ...NEW_RISK })}>Nuevo riesgo</Button></div>
      {!(q.data || []).length ? <EmptyState title="El registro está vacío" text="Agrega cada riesgo con su responsable, mitigación y fecha de revisión." /> : (
        <Card>
          <div className="overflow-x-auto">
            <table className="table-plain">
              <thead><tr><th>Riesgo</th><th>Afecta a</th><th>Prob. × impacto</th><th>Responsable</th><th>Revisión</th><th>Estado</th><th /></tr></thead>
              <tbody>{q.data!.map((r) => <tr key={r.id}><td>{r.description}<span className="block text-xs text-muted">{r.mitigation}</span></td><td>{r.affected}</td><td>{r.likelihood} × {r.impact} = <strong>{r.score}</strong></td><td>{r.owner}</td><td>{fmtDate(r.reviewDate)}</td><td>{RISK_STATUS[r.status]}</td><td><Button size="sm" variant="ghost" onClick={() => { const { score: _s, createdAt: _c, updatedAt: _u, ...rest } = r; setD(rest); }}>Editar</Button></td></tr>)}</tbody>
            </table>
          </div>
        </Card>
      )}
      <Modal open={!!d} onClose={() => setD(null)} title={d?.id ? 'Editar riesgo' : 'Nuevo riesgo'} wide>
        {d && (
          <>
            <Field label="Descripción del riesgo" required><Textarea value={d.description} onChange={(e) => set({ description: e.target.value })} /></Field>
            <Field label="Proceso o dato afectado" required><Input value={d.affected} onChange={(e) => set({ affected: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-x-3">
              {(['likelihood', 'impact'] as const).map((k) => <Field key={k} label={k === 'likelihood' ? 'Probabilidad (1 a 5)' : 'Impacto (1 a 5)'}><Select value={d[k]} onChange={(e) => set({ [k]: Number(e.target.value) })}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</Select></Field>)}
              <Field label="Responsable" required><Input value={d.owner} onChange={(e) => set({ owner: e.target.value })} /></Field>
              <Field label="Fecha de revisión" required><Input type="date" value={d.reviewDate} onChange={(e) => set({ reviewDate: e.target.value })} /></Field>
            </div>
            <Field label="Mitigación" required><Textarea value={d.mitigation} onChange={(e) => set({ mitigation: e.target.value })} /></Field>
            <Field label="Estado"><Select value={d.status} onChange={(e) => set({ status: e.target.value as RiskDraft['status'] })}>{Object.entries(RISK_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <div className="grid sm:grid-cols-2 gap-x-3">
              <Field label="Fecha de prueba del control" hint="Necesaria para darlo por resuelto."><Input type="date" value={d.controlTestedAt || ''} onChange={(e) => set({ controlTestedAt: e.target.value || null })} /></Field>
              <Field label="Resultado de la prueba"><Input value={d.controlTestNote || ''} onChange={(e) => set({ controlTestNote: e.target.value || null })} /></Field>
            </div>
            <Button disabled={busy || d.description.length < 5 || !d.affected || !d.owner || !d.mitigation || !d.reviewDate} onClick={async () => { if (await post('risks', d, 'Riesgo guardado.')) setD(null); }}>Guardar</Button>
          </>
        )}
      </Modal>
    </>
  );
}

const SEVERITY = { low: 'Baja', medium: 'Media', high: 'Alta', critical: 'Crítica' };
const INC_STATUS = { open: 'Abierto', contained: 'Contenido', investigating: 'En investigación', escalated: 'Escalado', closed: 'Cerrado' };

function Incidents() {
  const q = useAdminList<SecurityIncident>('incidents');
  const { post, busy } = useAdminAction();
  const [d, setD] = useState<{ title: string; description: string; severity: SecurityIncident['severity'] } | null>(null);
  const [upd, setUpd] = useState<{ id: string; status: string; note: string } | null>(null);
  if (q.isLoading) return <Spinner />;
  return (
    <>
      <div className="mb-3 flex justify-end"><Button onClick={() => setD({ title: '', description: '', severity: 'medium' })}>Registrar incidente</Button></div>
      {!(q.data || []).length ? <EmptyState title="Sin incidentes registrados" /> : q.data!.map((i) => (
        <Card key={i.id} className="mb-3" title={i.title} subtitle={`${fmtDateTime(i.createdAt)} · gravedad ${SEVERITY[i.severity].toLowerCase()}`} actions={i.status !== 'closed' && <Button size="sm" variant="secondary" onClick={() => setUpd({ id: i.id, status: 'contained', note: '' })}>Actualizar</Button>}>
          <p className="text-sm">{i.description}</p>
          <Badge tone={i.status === 'closed' ? 'ok' : 'warn'}>{INC_STATUS[i.status]}</Badge>
          <ul className="text-xs text-muted mt-2">{i.history.map((h, n) => <li key={n}>{fmtDateTime(h.at)} · {INC_STATUS[h.status as keyof typeof INC_STATUS]} · {h.note}</li>)}</ul>
        </Card>
      ))}
      <Modal open={!!d} onClose={() => setD(null)} title="Registrar incidente">
        {d && (
          <>
            <Field label="Título" required><Input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} /></Field>
            <Field label="Qué pasó" required><Textarea value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} /></Field>
            <Field label="Gravedad"><Select value={d.severity} onChange={(e) => setD({ ...d, severity: e.target.value as SecurityIncident['severity'] })}>{Object.entries(SEVERITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Button disabled={busy || d.title.length < 3 || d.description.length < 5} onClick={async () => { if (await post('incidents', d, 'Incidente registrado.')) setD(null); }}>Registrar</Button>
          </>
        )}
      </Modal>
      <Modal open={!!upd} onClose={() => setUpd(null)} title="Actualizar incidente">
        {upd && (
          <>
            <Field label="Estado"><Select value={upd.status} onChange={(e) => setUpd({ ...upd, status: e.target.value })}>{Object.entries(INC_STATUS).filter(([k]) => k !== 'open').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="Qué se hizo" required><Textarea value={upd.note} onChange={(e) => setUpd({ ...upd, note: e.target.value })} /></Field>
            <Button disabled={busy || upd.note.trim().length < 3} onClick={async () => { if (await post(`incidents/${upd.id}/status`, { status: upd.status, note: upd.note }, 'Incidente actualizado.')) setUpd(null); }}>Guardar</Button>
          </>
        )}
      </Modal>
    </>
  );
}

function Backups() {
  const q = useAdminList<{ file: string; size: number; createdAt: string; remote?: boolean }>('backups');
  const { post, busy } = useAdminAction();
  const [result, setResult] = useState<{ file: string; ok: boolean; events: number; documents: number; chains: number; testedAt: string } | null>(null);
  const lastTest = useAdminGet<{ at: string; ok: boolean; file: string } | null>('backups/last-test');
  if (q.isLoading) return <Spinner />;
  return (
    <>
      <Alert tone="info" className="mb-3">Las copias contienen información crítica: quedan en el servidor y no se descargan desde aquí. “Probar restauración” carga la copia en una base temporal y comprueba todos los sellos, sin tocar los datos reales.</Alert>
      <p className="text-sm mb-2">Las copias se guardan cifradas. Prueba de restauración mensual automática: {lastTest.data ? `${lastTest.data.ok ? 'correcta' : 'con fallas'} el ${fmtDateTime(lastTest.data.at)}` : 'todavía no se ha hecho'}.</p>
      <div className="mb-3 flex justify-end"><Button disabled={busy} onClick={() => post('backups', {}, 'Copia creada.')}>Crear copia ahora</Button></div>
      {result && <Alert tone={result.ok ? 'ok' : 'bad'} className="mb-3" title={result.ok ? 'Restauración probada' : 'La restauración falló'}>{result.file}: {result.events} eventos, {result.documents} documentos y {result.chains} cadenas revisadas el {fmtDateTime(result.testedAt)}.</Alert>}
      {!(q.data || []).length ? <EmptyState title="Todavía no hay copias en este servidor" /> : (
        <Card>
          <ul className="divide-y divide-line">
            {q.data!.map((b) => (
              <li key={b.file} className="py-2 text-sm flex flex-wrap justify-between gap-2">
                <span>{fmtDateTime(b.createdAt)}<span className="block text-xs text-muted font-mono">{b.file} · {Math.round(b.size / 1024)} KB{b.remote ? ' · guardada en Supabase' : ' · solo en el servidor'}</span></span>
                <Button size="sm" variant="secondary" disabled={busy} onClick={async () => setResult(await post('backups/verify', { file: b.file }))}>Probar restauración</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function Classification() {
  return (
    <Card title="Niveles de clasificación" subtitle="Los plazos de conservación y las causales legales de entrega están pendientes de aprobación por el dueño del proyecto y sus asesores; la plataforma no aplica ninguno por su cuenta.">
      <dl className="space-y-3 text-sm">
        {(Object.keys(INFO_CLASSIFICATION_LABELS) as InfoClassification[]).map((k) => (
          <div key={k}>
            <dt className="font-semibold">{INFO_CLASSIFICATION_LABELS[k]}</dt>
            <dd className="text-ink-2">{INFO_CLASSIFICATION_HELP[k]}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
