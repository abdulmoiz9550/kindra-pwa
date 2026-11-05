import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SIZE_LABELS, URGENCY_LABELS, PRIORITY_LABELS, REJECTION_REASON_LABELS, STRUCTURE_TYPE_LABELS, CAUSE_LABELS, SUBCATEGORY_LABELS } from '@kindra/shared';
import type { OriginPriority, RejectionReason, StructureType, DebrisCause, OriginSize, Subcategory } from '@kindra/shared';
import { api, errorMessage } from '../../lib/api';
import { usePublicConfig, useFeature } from '../../lib/config';
import { SectorAnnouncements } from '../../components/panels/SectorAnnouncements';
import { toast } from '../../lib/toast';
import { fmtDateTime, fmtRelative } from '../../lib/format';
import { Card, Button, Field, Input, Select, Textarea, Alert, EmptyState, Modal, PageTitle, Tabs, Spinner, Badge, OriginStateBadge, KeyValue } from '../../components/ui';
import { MapView } from '../../components/MapView';
import { PhotoCapture, type CapturedPhoto } from '../../components/PhotoCapture';
import { LocationPicker, type LocationValue } from '../../components/LocationPicker';
import { OriginRow, MapLegend, stateColor, PriorityBadge, useSubmit } from '../../components/panels/shared';
import type { CoordOverview, OriginView } from '../../components/panels/types';

type Tab = 'inbox' | 'track' | 'map' | 'alerts' | 'disputes' | 'monitor' | 'zones' | 'manual' | 'announcements' | 'new';

export default function Coordinator() {
  const qc = useQueryClient();
  const announcementsOn = useFeature('community_announcements');
  const q = useQuery({ queryKey: ['coord', 'overview'], queryFn: () => api.get<CoordOverview>('/coord/overview') });
  const [tab, setTab] = useState<Tab>('inbox');
  const [openId, setOpenId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const d = q.data;
  const refresh = () => qc.invalidateQueries({ queryKey: ['coord'] });
  const openOrigin = d?.origins.find((o) => o.id === openId) || null;
  const inboxCount = d?.inbox.reduce((s, g) => s + g.items.length, 0) || 0;
  const openAlerts = d?.alerts.filter((a) => !a.resolvedAt) || [];

  if (q.isLoading) return <Spinner label="Cargando el panel…" />;
  if (q.error || !d) return <Alert tone="bad">{errorMessage(q.error)}</Alert>;

  return (
    <div>
      <PageTitle title="Panel de coordinación" subtitle="Reportes por revisar, mapa, alertas, disputas y zonas. Cada acción queda sellada con tu entidad." />
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4 text-center">
        <Stat label="Por revisar" value={d.stats.registered} tone="bad" />
        <Stat label="Validados" value={d.stats.validated} tone="warn" />
        <Stat label="En retiro" value={d.stats.underRemoval} tone="warn" />
        <Stat label="Retirados o más" value={d.stats.removed} tone="ok" />
        <Stat label="Disputas" value={d.stats.disputed} tone="bad" />
        <Stat label="Zona pendiente" value={d.stats.pendingZone} tone="neutral" />
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'inbox', label: 'Bandeja', count: inboxCount },
          { value: 'track', label: 'Seguimiento', count: d.origins.filter((o) => ['validated', 'under_removal', 'removed', 'in_batch', 'in_work', 'disputed'].includes(o.state)).length },
          { value: 'map', label: 'Mapa' },
          { value: 'alerts', label: 'Alertas', count: openAlerts.length },
          { value: 'disputes', label: 'Disputas', count: d.disputes.length },
          { value: 'monitor', label: 'Contralores', count: d.monitorRequests.length },
          { value: 'zones', label: 'Zonas', count: d.sectors.filter((s) => !s.authorized).length },
          { value: 'manual', label: 'Revisión manual', count: d.manualReview.length },
          ...(announcementsOn ? [{ value: 'announcements' as const, label: 'Avisos al sector' }] : []),
          { value: 'new', label: 'Origen institucional' },
        ]}
      />
      <form
        className="mt-3 flex gap-2 max-w-md"
        onSubmit={(e) => {
          e.preventDefault();
          const code = search.trim().toUpperCase();
          const found = d.origins.find((o) => o.code === code);
          if (found) setOpenId(found.id);
          else toast.error(`No hay ningún origen con el código ${code}.`);
        }}
      >
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por código (LG-XXXX)" aria-label="Buscar origen por código" />
        <Button type="submit" variant="secondary">
          Abrir
        </Button>
      </form>
      <div className="mt-3 space-y-4">
        {tab === 'track' && (
          <Card title="Seguimiento de orígenes" subtitle="Validados, en retiro, retirados y en proceso. Abre el detalle para marcar retiros o resolver disputas.">
            <div className="space-y-2">
              {d.origins
                .filter((o) => ['validated', 'under_removal', 'removed', 'in_batch', 'in_work', 'disputed'].includes(o.state))
                .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
                .map((o) => (
                  <OriginRow key={o.id} o={o} onOpen={(x) => setOpenId(x.id)} />
                ))}
            </div>
          </Card>
        )}
        {tab === 'inbox' && (
          <>
            {inboxCount === 0 && <EmptyState title="No hay reportes esperando revisión" text="Cuando llegue uno nuevo aparecerá aquí, agrupado por sector." />}
            {d.inbox.filter((g) => g.items.length).map((g) => (
              <Card key={g.sectorId} title={g.sectorName} subtitle={`${g.items.length} reporte${g.items.length === 1 ? '' : 's'} por revisar${g.authorized ? '' : ' · zona pendiente de autorización'}`}>
                <div className="space-y-2">
                  {g.items.map((o) => (
                    <OriginRow key={o.id} o={o} onOpen={(x) => setOpenId(x.id)} extra={<div className="mt-2 flex flex-wrap gap-2"><QuickActions o={o} onDone={refresh} onOpen={() => setOpenId(o.id)} /></div>} />
                  ))}
                </div>
              </Card>
            ))}
          </>
        )}
        {tab === 'map' && <OriginsMap origins={d.origins} onOpen={(o) => setOpenId(o.id)} />}
        {tab === 'alerts' && (
          <Card title="Alertas de escalamiento" subtitle="Plazos vencidos, disputas, alertas del supervisor y revisiones manuales.">
            {openAlerts.length === 0 ? (
              <EmptyState title="Sin alertas abiertas" />
            ) : (
              <ul className="space-y-2">
                {openAlerts.map((a) => (
                  <li key={a.id} className="rounded-lg border border-line p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="bad">{alertKindLabel(a.kind)}</Badge>
                      {a.objectCode && <span className="font-semibold">{a.objectCode}</span>}
                      {a.sectorName && <span className="text-muted">{a.sectorName}</span>}
                      <span className="text-xs text-muted ml-auto">{fmtRelative(a.createdAt)}</span>
                    </div>
                    <p className="mt-1">{a.text}</p>
                    {a.objectType === 'origin' && (
                      <button type="button" className="text-primary text-xs underline mt-1" onClick={() => setOpenId(a.objectId)}>
                        Abrir origen
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
        {tab === 'disputes' && (
          <Card title="Disputas abiertas" subtitle="El ciudadano dijo que el escombro no fue retirado. Resuelve con evidencia o devuélvelo a retiro.">
            {d.disputes.length === 0 ? <EmptyState title="No hay disputas abiertas" /> : <div className="space-y-2">{d.disputes.map((o) => <OriginRow key={o.id} o={o} onOpen={(x) => setOpenId(x.id)} extra={<DisputeResolver o={o} onDone={refresh} />} />)}</div>}
          </Card>
        )}
        {tab === 'monitor' && <MonitorRequests requests={d.monitorRequests} onDone={refresh} />}
        {tab === 'zones' && <Zones sectors={d.sectors} origins={d.origins} onDone={refresh} onOpen={(o) => setOpenId(o.id)} />}
        {tab === 'manual' && (
          <Card title="Revisión manual" subtitle="Reportes con dos fotos ilegibles: una persona del equipo decide. Ningún reporte desaparece sin motivo registrado (7.12).">
            {d.manualReview.length === 0 ? <EmptyState title="Nada en revisión manual" /> : <div className="space-y-2">{d.manualReview.map((o) => <OriginRow key={o.id} o={o} onOpen={(x) => setOpenId(x.id)} extra={<div className="mt-2 flex flex-wrap gap-2"><QuickActions o={o} onDone={refresh} onOpen={() => setOpenId(o.id)} /></div>} />)}</div>}
          </Card>
        )}
        {tab === 'announcements' && announcementsOn && <SectorAnnouncements />}
        {tab === 'new' && <InstitutionalForm onDone={() => { refresh(); setTab('inbox'); }} />}
      </div>
      <OriginDetail o={openOrigin} onClose={() => setOpenId(null)} onDone={refresh} />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'bad' | 'warn' | 'ok' | 'neutral' }) {
  const cls = { bad: 'text-bad', warn: 'text-warn', ok: 'text-ok', neutral: 'text-ink-2' }[tone];
  return (
    <div className="card !p-2">
      <p className={`text-2xl font-bold ${cls}`}>{value}</p>
      <p className="text-[11px] text-muted leading-tight">{label}</p>
    </div>
  );
}

function alertKindLabel(kind: string): string {
  return (
    {
      origin_no_trip: 'Validado sin camión',
      trip_no_arrival: 'Viaje sin llegada',
      batch_held: 'Lote retenido',
      dispatch_unconfirmed: 'Despacho sin confirmar',
      observation: 'Alerta del supervisor',
      dispute: 'Disputa',
      manual_review: 'Revisión manual',
    } as Record<string, string>
  )[kind] || kind;
}

function OriginsMap({ origins, onOpen }: { origins: OriginView[]; onOpen: (o: OriginView) => void }) {
  const { data: cfg } = usePublicConfig();
  const [filter, setFilter] = useState<'all' | 'pending' | 'progress' | 'done'>('all');
  const pts = origins
    .filter((o) => o.location && !['rejected', 'duplicate'].includes(o.state))
    .filter((o) => {
      const s = o.effectiveState;
      if (filter === 'pending') return ['pending_authorization', 'registered', 'validated'].includes(s);
      if (filter === 'progress') return ['under_removal', 'disputed'].includes(s);
      if (filter === 'done') return ['removed', 'in_batch', 'in_work', 'closed'].includes(s);
      return true;
    })
    .map((o) => ({ id: o.id, lat: o.location!.lat, lng: o.location!.lng, color: stateColor(o.effectiveState), label: `${o.code} · ${o.stateLabel}`, onClick: () => onOpen(o) }));
  return (
    <Card title="Mapa de orígenes por estado" subtitle="Toca un punto para abrir el origen.">
      <div className="flex gap-2 mb-2 flex-wrap">
        {(
          [
            ['all', 'Todos'],
            ['pending', 'Pendientes'],
            ['progress', 'En proceso'],
            ['done', 'Retirados o más'],
          ] as const
        ).map(([v, l]) => (
          <button key={v} type="button" className={`chip ${filter === v ? 'chip-active' : ''}`} onClick={() => setFilter(v)}>
            {l}
          </button>
        ))}
      </div>
      <MapView sectors={(cfg?.sectors || []).map((s) => ({ id: s.id, name: s.name, polygon: s.polygon, authorized: s.authorized }))} points={pts} height={420} />
      <MapLegend />
    </Card>
  );
}

/** Acciones rápidas de la bandeja: validar, rechazar, duplicado, foto ilegible. */
function QuickActions({ o, onDone, onOpen }: { o: OriginView; onDone: () => void; onOpen: () => void }) {
  const { busy, error, run } = useSubmit();
  const [reject, setReject] = useState(false);
  const [dup, setDup] = useState(false);
  const [reason, setReason] = useState<RejectionReason | ''>('');
  const [note, setNote] = useState('');
  const [mainCode, setMainCode] = useState(o.possibleDuplicateCode || '');
  const [priority, setPriority] = useState<OriginPriority | ''>(o.urgency === 'blocks_access' ? 'high' : o.urgency === 'risk' ? 'medium' : 'low');
  const can = (a: string) => o.allowedActions.includes(a);
  return (
    <>
      {can('origin_validated') && (
        <>
          <Select value={priority} onChange={(e) => setPriority(e.target.value as OriginPriority)} className="!w-auto !min-h-[40px] !py-1 text-sm" aria-label="Prioridad">
            {(['high', 'medium', 'low'] as const).map((p) => (
              <option key={p} value={p}>
                Prioridad {PRIORITY_LABELS[p]}
              </option>
            ))}
          </Select>
          <Button size="sm" disabled={busy} onClick={() => run(async () => { await api.post(`/coord/origins/${o.id}/validate`, { priority: priority || null }); toast.success(`Reporte ${o.code} validado. El ciudadano recibió el aviso.`); onDone(); })}>
            Validar
          </Button>
        </>
      )}
      {can('origin_rejected') && (
        <Button size="sm" variant="danger" disabled={busy} onClick={() => setReject(true)}>
          Rechazar
        </Button>
      )}
      {can('origin_marked_duplicate') && (
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => setDup(true)}>
          Es duplicado
        </Button>
      )}
      {o.photos[0] && !o.photos[0].unreadable && o.state === 'registered' && (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(async () => { await api.post(`/coord/origins/${o.id}/unreadable-photo`, { photoId: o.photos[0].id }); toast.info('Se pidió al ciudadano repetir la foto.'); onDone(); })}>
          Foto ilegible
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={onOpen}>
        Detalle
      </Button>
      {error && <Alert tone="bad" className="w-full">{error}</Alert>}
      <Modal open={reject} onClose={() => setReject(false)} title={`Rechazar ${o.code}`}>
        <Field label="Motivo (obligatorio)" required>
          <Select value={reason} onChange={(e) => setReason(e.target.value as RejectionReason)}>
            <option value="">Elige un motivo</option>
            {Object.entries(REJECTION_REASON_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nota (opcional)">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <p className="text-xs text-muted mb-3">Un rechazo por reporte falso o duplicado intencional resta 10 puntos al reportante. Tres rechazos seguidos suspenden la suma de puntos.</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setReject(false)}>Cancelar</Button>
          <Button variant="danger" disabled={!reason || busy} onClick={() => run(async () => { await api.post(`/coord/origins/${o.id}/reject`, { reason, note: note || null }); toast.success(`Reporte ${o.code} rechazado con motivo.`); setReject(false); onDone(); })}>
            Confirmar rechazo
          </Button>
        </div>
      </Modal>
      <Modal open={dup} onClose={() => setDup(false)} title={`Marcar ${o.code} como duplicado`}>
        <Field label="Código del reporte principal" required hint={o.possibleDuplicateCode ? `La plataforma detectó cercanía con ${o.possibleDuplicateCode}.` : 'Ej. LG-4821'}>
          <Input value={mainCode} onChange={(e) => setMainCode(e.target.value.toUpperCase())} />
        </Field>
        <p className="text-xs text-muted mb-3">Los avisos del reportante pasan al reporte principal.</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDup(false)}>Cancelar</Button>
          <Button disabled={!mainCode || busy} onClick={() => run(async () => { const main = await api.get<OriginView>(`/coord/origins/${mainCode.trim()}`); await api.post(`/coord/origins/${o.id}/duplicate`, { mainId: main.id }); toast.success(`${o.code} se sumó a ${main.code}.`); setDup(false); onDone(); })}>
            Confirmar
          </Button>
        </div>
      </Modal>
    </>
  );
}

function DisputeResolver({ o, onDone }: { o: OriginView; onDone: () => void }) {
  const { busy, error, run } = useSubmit();
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Resolver disputa</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Resolver disputa de ${o.code}`}>
        <p className="text-sm text-ink-2 mb-3">Para confirmar que el punto quedó retirado hace falta evidencia: una foto del contralor comunitario o del ente de retiro. Si el escombro sigue ahí, devuélvelo a retiro.</p>
        {o.afterPhotoUrl && (
          <p className="text-sm mb-2">
            Ya existe una foto de “después”: <a href={o.afterPhotoUrl} target="_blank" rel="noreferrer" className="text-primary underline">ver foto</a>
          </p>
        )}
        <PhotoCapture kind="evidence" label="Foto de evidencia" photos={photos} onChange={setPhotos} max={1} />
        <Field label="Nota (opcional)">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && <Alert tone="bad" className="mb-2">{error}</Alert>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => run(async () => { await api.post(`/coord/origins/${o.id}/resolve-dispute`, { result: 'reopened', note: note || null }); toast.success(`${o.code} vuelve a retiro.`); setOpen(false); onDone(); })}>
            Devolver a retiro
          </Button>
          <Button disabled={busy || !photos[0]?.id} onClick={() => run(async () => { await api.post(`/coord/origins/${o.id}/resolve-dispute`, { result: 'removed', evidencePhotoId: photos[0].id, note: note || null }); toast.success(`${o.code} confirmado como retirado con evidencia.`); setOpen(false); onDone(); })}>
            Confirmar retiro con evidencia
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function MonitorRequests({ requests, onDone }: { requests: CoordOverview['monitorRequests']; onDone: () => void }) {
  const { busy, error, run } = useSubmit();
  return (
    <Card title="Solicitudes de contralor comunitario" subtitle="Requieren nivel Contralor comunitario y verificación por selfie antes de aprobar.">
      {error && <Alert tone="bad" className="mb-2">{error}</Alert>}
      {requests.length === 0 ? (
        <EmptyState title="No hay solicitudes pendientes" />
      ) : (
        <ul className="space-y-2">
          {requests.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-3 text-sm">
              <span className="font-semibold">{r.alias}</span>
              <Badge tone={r.verificationStatus === 'verified' ? 'ok' : 'warn'}>{r.verificationStatus === 'verified' ? 'Identidad verificada' : 'Verificación pendiente'}</Badge>
              <span className="text-xs text-muted">{fmtRelative(r.createdAt)}</span>
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(async () => { await api.post(`/coord/monitor/requests/${r.id}/decide`, { status: 'rejected' }); onDone(); })}>Rechazar</Button>
                <Button size="sm" disabled={busy || r.verificationStatus !== 'verified'} onClick={() => run(async () => { await api.post(`/coord/monitor/requests/${r.id}/decide`, { status: 'approved' }); toast.success(`${r.alias} ya es contralor comunitario.`); onDone(); })}>Aprobar</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Zones({ sectors, origins, onDone, onOpen }: { sectors: CoordOverview['sectors']; origins: OriginView[]; onDone: () => void; onOpen: (o: OriginView) => void }) {
  const { busy, error, run } = useSubmit();
  const pending = origins.filter((o) => o.effectiveState === 'pending_authorization');
  return (
    <div className="space-y-4">
      <Card title="Autorización de zonas" subtitle="Mientras una zona no esté liberada por los equipos de rescate, no se registran viajes desde sus orígenes (7.2).">
        {error && <Alert tone="bad" className="mb-2">{error}</Alert>}
        <ul className="space-y-2">
          {sectors.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-3 text-sm">
              <span className="font-semibold">{s.name}</span>
              <Badge tone={s.authorized ? 'ok' : 'bad'}>{s.authorized ? 'Zona autorizada' : 'Zona pendiente'}</Badge>
              {s.pendingOrigins > 0 && <span className="text-xs text-muted">{s.pendingOrigins} origen{s.pendingOrigins === 1 ? '' : 'es'} pendiente{s.pendingOrigins === 1 ? '' : 's'}</span>}
              <div className="ml-auto">
                <Button size="sm" variant={s.authorized ? 'ghost' : 'primary'} disabled={busy} onClick={() => run(async () => { const r = await api.post<{ affected: number }>(`/coord/sectors/${s.id}/authorization`, { authorized: !s.authorized }); toast.success(`${s.name}: ${!s.authorized ? 'autorizada' : 'marcada como pendiente'} (${r.affected} orígenes actualizados).`); onDone(); })}>
                  {s.authorized ? 'Marcar como pendiente' : 'Autorizar zona'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Orígenes en zona pendiente" subtitle="También puedes autorizar un origen puntual.">
        {pending.length === 0 ? <EmptyState title="Ningún origen en zona pendiente" /> : <div className="space-y-2">{pending.map((o) => <OriginRow key={o.id} o={o} onOpen={onOpen} extra={<div className="mt-2"><Button size="sm" variant="secondary" disabled={busy} onClick={() => run(async () => { await api.post(`/coord/origins/${o.id}/zone`, { authorized: true }); onDone(); })}>Autorizar este origen</Button></div>} />)}</div>}
      </Card>
    </div>
  );
}

function InstitutionalForm({ onDone }: { onDone: () => void }) {
  const { busy, error, run } = useSubmit();
  const [loc, setLoc] = useState<LocationValue>({ location: null, sectorId: null, street: '', reference: '' });
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [f, setF] = useState({ size: 'large' as OriginSize, subcategory: '' as Subcategory | '', structureType: 'house' as StructureType, cause: 'collapse' as DebrisCause, buildingReference: '', priority: 'medium' as OriginPriority });
  return (
    <Card title="Registrar origen institucional" subtitle="Nace validado y sellado con tu entidad (6.1).">
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field label="Tipo de estructura" required>
          <Select value={f.structureType} onChange={(e) => setF({ ...f, structureType: e.target.value as StructureType })}>
            {Object.entries(STRUCTURE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Causa" required>
          <Select value={f.cause} onChange={(e) => setF({ ...f, cause: e.target.value as DebrisCause })}>
            {Object.entries(CAUSE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Nombre o referencia del edificio">
          <Input value={f.buildingReference} onChange={(e) => setF({ ...f, buildingReference: e.target.value })} />
        </Field>
        <Field label="Tamaño estimado" required>
          <Select value={f.size} onChange={(e) => setF({ ...f, size: e.target.value as OriginSize })}>
            {Object.entries(SIZE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Subcategoría estimada">
          <Select value={f.subcategory} onChange={(e) => setF({ ...f, subcategory: e.target.value as Subcategory })}>
            <option value="">Sin indicar</option>
            {Object.entries(SUBCATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Prioridad">
          <Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as OriginPriority })}>
            {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
      </div>
      <h3 className="label mt-2">Ubicación</h3>
      <LocationPicker value={loc} onChange={setLoc} />
      <h3 className="label mt-2">Fotos (opcional)</h3>
      <PhotoCapture kind="origin" photos={photos} onChange={setPhotos} max={3} />
      {error && <Alert tone="bad" className="mt-3">{error}</Alert>}
      <div className="mt-4 flex justify-end">
        <Button disabled={busy || (!loc.location && !loc.sectorId)} onClick={() => run(async () => { const o = await api.post<OriginView>('/coord/origins/institutional', { location: loc.location, street: loc.street || null, reference: loc.reference || null, sectorId: loc.sectorId, size: f.size, subcategory: f.subcategory || null, structureType: f.structureType, cause: f.cause, buildingReference: f.buildingReference || null, priority: f.priority, photoIds: photos.map((p) => p.id).filter(Boolean) }); toast.success(`Origen institucional ${o.code} registrado.`); onDone(); })}>
          {busy ? 'Registrando…' : 'Registrar origen'}
        </Button>
      </div>
    </Card>
  );
}

function OriginDetail({ o, onClose, onDone }: { o: OriginView | null; onClose: () => void; onDone: () => void }) {
  const { busy, error, run } = useSubmit();
  const [priority, setPriority] = useState<OriginPriority>('medium');
  const can = (a: string) => !!o && o.allowedActions.includes(a);
  const pts = useMemo(() => (o?.location ? [{ id: o.id, lat: o.location.lat, lng: o.location.lng, color: stateColor(o.effectiveState) }] : []), [o]);
  if (!o) return null;
  return (
    <Modal open onClose={onClose} title={`Origen ${o.code}`} wide>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <OriginStateBadge state={o.effectiveState} />
        <PriorityBadge priority={o.priority} />
        {o.type === 'institutional' && <Badge tone="info" icon={false}>Institucional</Badge>}
        <Link to={`/reporte/${o.code}`} className="ml-auto text-sm text-primary underline">Ver ficha de trazabilidad</Link>
      </div>
      <p className="text-sm text-ink-2 mb-3">{o.status.plain}</p>
      <KeyValue
        items={[
          { k: 'Sector', v: o.sectorName },
          { k: 'Ubicación', v: o.street ? `${o.street}${o.reference ? ` (${o.reference})` : ''}` : o.location ? `${o.location.lat.toFixed(5)}, ${o.location.lng.toFixed(5)}` : '—' },
          { k: 'Fecha', v: fmtDateTime(o.date) },
          { k: 'Tamaño', v: SIZE_LABELS[o.size] },
          { k: 'Urgencia', v: o.urgency ? URGENCY_LABELS[o.urgency] : '—' },
          { k: 'Reportante', v: o.anonymous ? 'Anónimo' : o.reporterAlias || o.reporterName || '—' },
          { k: 'Subcategoría', v: o.subcategory ? SUBCATEGORY_LABELS[o.subcategory] : '—' },
          { k: 'Centro', v: o.lastCenterName || '—' },
          { k: 'Completitud de la ficha', v: `${o.completeness}/7` },
          { k: 'Reportes vinculados', v: o.linkedCodes.length ? o.linkedCodes.join(', ') : '—' },
          ...(o.type === 'institutional' ? [{ k: 'Estructura', v: o.structureType ? STRUCTURE_TYPE_LABELS[o.structureType] : '—' }, { k: 'Causa', v: o.cause ? CAUSE_LABELS[o.cause] : '—' }, { k: 'Referencia', v: o.buildingReference || '—' }] : []),
          ...(o.rejectionReason ? [{ k: 'Motivo de rechazo', v: REJECTION_REASON_LABELS[o.rejectionReason] }] : []),
        ]}
      />
      {o.photos.length > 0 && (
        <div className="flex gap-2 mt-3 flex-wrap">
          {o.photos.map((p) => (
            <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="relative">
              <img src={p.url} alt="Foto del reporte" className="h-24 w-24 rounded-md object-cover border border-line" />
              {p.unreadable && <span className="absolute inset-x-0 bottom-0 bg-bad text-white text-[10px] text-center">ilegible</span>}
              {p.moderation !== 'approved' && <span className="absolute inset-x-0 top-0 bg-black/60 text-white text-[10px] text-center">sin moderar</span>}
            </a>
          ))}
          {o.afterPhotoUrl && <a href={o.afterPhotoUrl} target="_blank" rel="noreferrer"><img src={o.afterPhotoUrl} alt="Foto de después" className="h-24 w-24 rounded-md object-cover border border-ok" /></a>}
          {o.onSitePhotoUrl && <a href={o.onSitePhotoUrl} target="_blank" rel="noreferrer"><img src={o.onSitePhotoUrl} alt="Verificación en sitio" className="h-24 w-24 rounded-md object-cover border border-info" /></a>}
        </div>
      )}
      {o.voiceNoteUrl && <audio controls src={o.voiceNoteUrl} className="mt-3 w-full" aria-label="Nota de voz del reportante" />}
      {pts.length > 0 && <MapView points={pts} center={[pts[0].lat, pts[0].lng]} zoom={16} height={200} className="mt-3" fitSectors={false} />}
      {error && <Alert tone="bad" className="mt-3">{error}</Alert>}
      <div className="mt-4 flex flex-wrap gap-2 items-center">
        <QuickActions o={o} onDone={() => { onDone(); }} onOpen={() => undefined} />
        {can('origin_removed') && (
          <Button size="sm" disabled={busy} onClick={() => run(async () => { await api.post(`/coord/origins/${o.id}/removed`, {}); toast.success(`${o.code} marcado como retirado. Se envió el primer cierre al ciudadano.`); onDone(); onClose(); })}>
            Marcar como retirado
          </Button>
        )}
        {can('dispute_resolved') && <DisputeResolver o={o} onDone={() => { onDone(); onClose(); }} />}
        {!['rejected', 'duplicate', 'closed'].includes(o.state) && (
          <span className="inline-flex items-center gap-1">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as OriginPriority)} className="!w-auto !min-h-[40px] !py-1 text-sm" aria-label="Nueva prioridad">
              {(['high', 'medium', 'low'] as const).map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
            </Select>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(async () => { await api.post(`/coord/origins/${o.id}/priority`, { priority }); onDone(); })}>Cambiar prioridad</Button>
          </span>
        )}
        {!o.zoneAuthorized && !['rejected', 'duplicate', 'closed'].includes(o.state) && (
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(async () => { await api.post(`/coord/origins/${o.id}/zone`, { authorized: true }); onDone(); })}>Autorizar zona de este origen</Button>
        )}
      </div>
    </Modal>
  );
}
