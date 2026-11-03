import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SUBCATEGORY_LABELS } from '@kindra/shared';
import type { Subcategory, OutputUnit } from '@kindra/shared';
import { api, errorMessage } from '../../lib/api';
import { toast } from '../../lib/toast';
import { fmtNum, fmtDate, unitLabel, fmtDateTime } from '../../lib/format';
import { Card, Button, Field, Input, Select, Textarea, Alert, EmptyState, Modal, PageTitle, Tabs, Spinner, Badge, DispatchStateBadge, KeyValue } from '../../components/ui';
import { PhotoCapture, type CapturedPhoto } from '../../components/PhotoCapture';
import { QrScanner } from '../../components/panels/QrScanner';
import { TripRow, CompositionBars, BatchHeader, OutputsSummary, useSubmit } from '../../components/panels/shared';
import type { CenterOverview, TripView, BatchView } from '../../components/panels/types';

type Tab = 'trips' | 'batch' | 'batches' | 'dispatches' | 'daily' | 'jobs';

export default function Center() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['center', 'overview'], queryFn: () => api.get<CenterOverview>('/center/overview') });
  const [tab, setTab] = useState<Tab>('trips');
  const [arrive, setArrive] = useState<TripView | null>(null);
  const [openBatchId, setOpenBatchId] = useState<string | null>(null);
  const d = q.data;
  const refresh = () => qc.invalidateQueries({ queryKey: ['center'] });
  if (q.isLoading) return <Spinner label="Cargando el panel…" />;
  if (q.error || !d) return <Alert tone="bad">{errorMessage(q.error)}</Alert>;
  const diff = d.today.departed - d.today.confirmed;
  const detail = d.batches.find((b) => b.id === openBatchId) || null;

  return (
    <div>
      <PageTitle title={`Panel del ${d.center.name}`} subtitle={`${d.center.type === 'CDT' ? 'Centro de disposición temporal' : 'Centro de disposición final'} · ${d.center.entityName || ''}. Solo operas sobre tu centro asignado.`} />
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="card !p-2 text-center"><p className="text-2xl font-bold text-warn">{d.inTransit.length}</p><p className="text-[11px] text-muted">En tránsito hacia aquí</p></div>
        <div className="card !p-2 text-center"><p className="text-2xl font-bold">{d.today.confirmed}<span className="text-sm text-muted"> / {d.today.departed}</span></p><p className="text-[11px] text-muted">Hoy: confirmados / salidos</p></div>
        <div className="card !p-2 text-center"><p className={`text-2xl font-bold ${diff > 0 ? 'text-bad' : 'text-ok'}`}>{diff}</p><p className="text-[11px] text-muted">Discrepancia de conteo hoy</p></div>
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'trips', label: 'Llegadas', count: d.inTransit.length + d.noArrival.length },
          { value: 'batch', label: 'Lote abierto', count: d.openBatch ? d.openBatch.unclassified + d.openBatch.pendingHazard : 0 },
          { value: 'batches', label: 'Lotes', count: d.batches.length },
          { value: 'dispatches', label: 'Despachos', count: d.dispatches.length },
          { value: 'daily', label: 'Resumen diario' },
          { value: 'jobs', label: 'Empleos' },
        ]}
      />
      <div className="mt-3 space-y-4">
        {tab === 'trips' && (
          <>
            <Card title="Viajes en tránsito hacia este centro" subtitle="Escanea el QR del vehículo al llegar y toma la foto. Nadie puede recibir lo que reportó.">
              {d.inTransit.length === 0 ? <EmptyState title="No hay viajes en camino" /> : <div className="space-y-2">{d.inTransit.map((t) => <TripRow key={t.id} t={t} actions={<Button size="sm" onClick={() => setArrive(t)}>Confirmar llegada</Button>} />)}</div>}
            </Card>
            {d.noArrival.length > 0 && (
              <Card title="Viajes sin llegada (plazo vencido)" subtitle="Figuran como discrepancia. Si el camión llega, confírmalo y la discrepancia queda resuelta en el historial.">
                <div className="space-y-2">{d.noArrival.map((t) => <TripRow key={t.id} t={t} actions={<Button size="sm" variant="secondary" onClick={() => setArrive(t)}>Confirmar llegada tardía</Button>} />)}</div>
              </Card>
            )}
            <Card title="Últimas recepciones">
              {d.received.length === 0 ? <EmptyState title="Sin recepciones todavía" /> : <div className="space-y-2">{d.received.slice(0, 10).map((t) => <TripRow key={t.id} t={t} />)}</div>}
            </Card>
          </>
        )}
        {tab === 'batch' && (d.openBatch ? <BatchPanel b={d.openBatch} works={d.works} onDone={refresh} /> : <EmptyState title="No hay un lote abierto" text="Se abre automáticamente con la primera llegada del periodo." />)}
        {tab === 'batches' && (
          <Card title="Lotes del centro" subtitle="Toca un lote para ver su detalle, salidas, verificación y despachos.">
            {d.batches.length === 0 ? (
              <EmptyState title="Todavía no hay lotes" />
            ) : (
              <ul className="space-y-2">
                {d.batches.map((b) => (
                  <li key={b.id} className="rounded-lg border border-line p-3">
                    <BatchHeader b={b} />
                    <p className="text-xs text-muted mt-1">Periodo {fmtDate(b.periodStart)} – {fmtDate(b.periodEnd)} · {b.receptionIds.length} recepciones{b.outputs ? ` · agregado ${fmtNum(b.outputs.aggregate)} ${unitLabel(b.outputs.unit)}` : ''}</p>
                    <Button size="sm" variant="ghost" className="mt-1" onClick={() => setOpenBatchId(b.id)}>Abrir lote</Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
        {tab === 'dispatches' && (
          <Card title="Despachos a obras">
            {d.dispatches.length === 0 ? (
              <EmptyState title="No hay despachos" text="Se despacha desde un lote con verificación de calidad aprobada." />
            ) : (
              <table className="table-plain">
                <thead><tr><th>Despacho</th><th>Lote</th><th>Obra</th><th>Cantidad</th><th>Recibido</th><th>Estado</th></tr></thead>
                <tbody>
                  {d.dispatches.map((x) => (
                    <tr key={x.id}><td>{x.code}</td><td>{x.batchCode}</td><td>{x.workCode} · {x.workName}</td><td>{fmtNum(x.quantity)} {unitLabel(x.unit)}</td><td>{x.quantityReceived == null ? '—' : `${fmtNum(x.quantityReceived)} ${unitLabel(x.unit)}`}</td><td><DispatchStateBadge state={x.state} /></td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        )}
        {tab === 'daily' && <DailySummary d={d} onDone={refresh} />}
        {tab === 'jobs' && <Jobs d={d} onDone={refresh} />}
      </div>
      <ArrivalModal t={arrive} onClose={() => setArrive(null)} onDone={() => { setArrive(null); refresh(); }} />
      {detail && (
        <Modal open onClose={() => setOpenBatchId(null)} title={`Lote ${detail.code}`} wide>
          <BatchPanel b={detail} works={d.works} onDone={refresh} embedded />
        </Modal>
      )}
    </div>
  );
}

function ArrivalModal({ t, onClose, onDone }: { t: TripView | null; onClose: () => void; onDone: () => void }) {
  const { busy, error, run } = useSubmit();
  const [qr, setQr] = useState<string | null>(null);
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  if (!t) return null;
  return (
    <Modal open onClose={onClose} title={`Confirmar llegada · ${t.code}`}>
      <p className="text-sm text-ink-2 mb-2">Vehículo {t.vehiclePlate} con material de {t.originCodes.join(', ')}.</p>
      <QrScanner onResult={(v) => { setQr(v); toast.info('QR leído. Si no coincide con el vehículo del viaje, el servidor lo rechaza.'); }} label="Escanear QR del vehículo" />
      {qr && <p className="text-sm mt-1"><Badge tone="ok">QR leído: {qr}</Badge></p>}
      <h3 className="label mt-3">Foto de llegada (obligatoria)</h3>
      <PhotoCapture kind="trip_arrival" label="Foto del camión al llegar" photos={photos} onChange={setPhotos} max={1} />
      {error && <Alert tone="bad" className="mt-2">{error}</Alert>}
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button disabled={busy || !photos[0]?.id} onClick={() => run(async () => { const r = await api.post<{ batch: BatchView }>(`/center/trips/${t.id}/arrive`, { photoId: photos[0].id, vehicleQr: qr, location: photos[0].location }); toast.success(`Llegada de ${t.code} confirmada. Entró al lote ${r.batch.code}; clasifica la recepción.`); onDone(); })}>
          {busy ? 'Confirmando…' : 'Confirmar llegada'}
        </Button>
      </div>
    </Modal>
  );
}

function BatchPanel({ b, works, onDone, embedded }: { b: BatchView; works: CenterOverview['works']; onDone: () => void; embedded?: boolean }) {
  const { busy, error, run, setError } = useSubmit();
  const [outputs, setOutputs] = useState({ unit: 't' as OutputUnit, aggregate: '', metal: '', specialDisposal: '', rejects: '' });
  const [dispatch, setDispatch] = useState({ workId: works[0]?.id || '', quantity: '' });
  const canClose = b.state === 'open';
  const canOutputs = b.state === 'closed';
  const canDispatch = ['approved', 'partially_dispatched'].includes(b.state);
  const available = (b.outputs?.aggregate || 0) - b.dispatchedQuantity;
  const body = (
    <div className="space-y-4">
      {!embedded && <BatchHeader b={b} />}
      <p className="text-xs text-muted">Periodo {fmtDate(b.periodStart)} – {fmtDate(b.periodEnd)} · {b.receptionIds.length} recepciones</p>
      {b.state === 'held' && <Alert tone="bad" title="Lote retenido">Hay material con posible presencia de sustancias peligrosas. El evaluador técnico debe decidir antes de procesarlo (7.3).</Alert>}
      <section>
        <h3 className="label">Recepciones</h3>
        {b.receptions.length === 0 ? <p className="text-sm text-muted">Sin recepciones.</p> : (
          <ul className="space-y-2">{b.receptions.map((r) => <ReceptionItem key={r.id} r={r} batch={b} onDone={onDone} />)}</ul>
        )}
      </section>
      <section>
        <h3 className="label">Composición por sector (balance de masas, 7.5)</h3>
        <CompositionBars composition={b.composition} />
      </section>
      {b.outputs && (
        <section>
          <h3 className="label">Salidas registradas</h3>
          <OutputsSummary b={b} />
          {b.dispatchIds.length > 0 && <p className="text-sm mt-1">Despachado: {fmtNum(b.dispatchedQuantity)} {unitLabel(b.outputs.unit)} · disponible: {fmtNum(available)} {unitLabel(b.outputs.unit)}</p>}
        </section>
      )}
      {b.qualityVerification && (
        <section>
          <h3 className="label">Verificación de calidad</h3>
          <KeyValue items={[{ k: 'Resultado', v: b.qualityVerification.result === 'approved' ? 'Aprobado' : 'Rechazado' }, { k: 'Fecha', v: fmtDateTime(b.qualityVerification.createdAt) }, { k: 'Justificación', v: b.qualityVerification.justification }]} />
        </section>
      )}
      {b.hazardDecisions.length > 0 && (
        <section>
          <h3 className="label">Decisiones sobre material peligroso</h3>
          <ul className="text-sm space-y-1">{b.hazardDecisions.map((h) => <li key={h.id}>{h.decision === 'release' ? 'Liberado' : 'Desviado a disposición especial'} · {h.receptionIds.length} recepción(es) · {h.justification}</li>)}</ul>
        </section>
      )}
      {error && <Alert tone="bad">{error}</Alert>}
      {canClose && (
        <Button variant="secondary" disabled={busy} onClick={() => run(async () => { await api.post(`/center/batches/${b.id}/close`, {}); toast.success(`Lote ${b.code} cerrado. Registra sus salidas.`); onDone(); })}>
          Cerrar lote
        </Button>
      )}
      {canOutputs && (
        <section className="rounded-lg border border-line p-3">
          <h3 className="font-semibold mb-2">Registrar salidas del lote</h3>
          <div className="grid sm:grid-cols-2 gap-x-4">
            <Field label="Unidad" required>
              <Select value={outputs.unit} onChange={(e) => setOutputs({ ...outputs, unit: e.target.value as OutputUnit })}>
                <option value="t">Toneladas (t)</option>
                <option value="m3">Metros cúbicos (m³)</option>
              </Select>
            </Field>
            <Field label="Agregado producido" required><Input type="number" min={0} step="0.1" inputMode="decimal" value={outputs.aggregate} onChange={(e) => setOutputs({ ...outputs, aggregate: e.target.value })} /></Field>
            <Field label="Metal entregado al Estado" required><Input type="number" min={0} step="0.1" inputMode="decimal" value={outputs.metal} onChange={(e) => setOutputs({ ...outputs, metal: e.target.value })} /></Field>
            <Field label="Material a disposición especial" required><Input type="number" min={0} step="0.1" inputMode="decimal" value={outputs.specialDisposal} onChange={(e) => setOutputs({ ...outputs, specialDisposal: e.target.value })} /></Field>
            <Field label="Rechazos al CDF" required><Input type="number" min={0} step="0.1" inputMode="decimal" value={outputs.rejects} onChange={(e) => setOutputs({ ...outputs, rejects: e.target.value })} /></Field>
          </div>
          <Button disabled={busy || [outputs.aggregate, outputs.metal, outputs.specialDisposal, outputs.rejects].some((v) => v === '')} onClick={() => run(async () => { await api.post(`/center/batches/${b.id}/outputs`, { unit: outputs.unit, aggregate: Number(outputs.aggregate), metal: Number(outputs.metal), specialDisposal: Number(outputs.specialDisposal), rejects: Number(outputs.rejects) }); toast.success(`Salidas de ${b.code} registradas. Pasa a verificación de calidad.`); onDone(); })}>
            {busy ? 'Guardando…' : 'Guardar salidas'}
          </Button>
        </section>
      )}
      {(canDispatch || b.state === 'under_verification' || b.state === 'rejected') && (
        <section className="rounded-lg border border-line p-3">
          <h3 className="font-semibold mb-2">Despachar a una obra</h3>
          {b.state === 'under_verification' && <Alert tone="warn">Espera la verificación de calidad aprobada para despachar (7.4).</Alert>}
          {b.state === 'rejected' && <Alert tone="bad">Lote rechazado: no se puede despachar. Su agregado se registra como rechazo al CDF o se reprocesa en un lote nuevo.</Alert>}
          {canDispatch && (
            <>
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field label="Obra" required>
                  <Select value={dispatch.workId} onChange={(e) => setDispatch({ ...dispatch, workId: e.target.value })}>
                    <option value="">Elige una obra</option>
                    {works.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name} ({w.locality})</option>)}
                  </Select>
                </Field>
                <Field label={`Cantidad (${unitLabel(b.outputs?.unit)})`} required hint={`Disponible: ${fmtNum(available)} ${unitLabel(b.outputs?.unit)}`}>
                  <Input type="number" min={0} step="0.1" inputMode="decimal" value={dispatch.quantity} onChange={(e) => setDispatch({ ...dispatch, quantity: e.target.value })} />
                </Field>
              </div>
              <Button disabled={busy || !dispatch.workId || !(Number(dispatch.quantity) > 0)} onClick={() => run(async () => { if (Number(dispatch.quantity) > available + 1e-9) { setError(`La cantidad supera lo disponible (${fmtNum(available)}).`); return; } const r = await api.post<{ dispatch: { code: string } }>(`/center/batches/${b.id}/dispatch`, { workId: dispatch.workId, quantity: Number(dispatch.quantity) }); toast.success(`Despacho ${r.dispatch.code} creado. La obra fue avisada.`); setDispatch({ ...dispatch, quantity: '' }); onDone(); })}>
                {busy ? 'Despachando…' : 'Crear despacho'}
              </Button>
            </>
          )}
        </section>
      )}
    </div>
  );
  return embedded ? body : <Card title={<BatchHeader b={b} />}>{body}</Card>;
}

function ReceptionItem({ r, batch, onDone }: { r: BatchView['receptions'][number]; batch: BatchView; onDone: () => void }) {
  const { busy, error, run } = useSubmit();
  const [sub, setSub] = useState<Subcategory | ''>(r.subcategory || '');
  const [note, setNote] = useState(r.note || '');
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const locked = ['processed', 'under_verification', 'approved', 'rejected', 'partially_dispatched', 'fully_dispatched'].includes(batch.state);
  return (
    <li className="rounded-lg border border-line p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">Viaje {r.tripCode}</span>
        <span className="text-muted">{r.originCodes.join(', ')} · {r.sectorNames.join(', ')}</span>
        {r.subcategory ? <Badge tone={r.subcategory === 'possible_hazardous' ? 'bad' : 'ok'}>{SUBCATEGORY_LABELS[r.subcategory]}</Badge> : <Badge tone="warn">Sin clasificar</Badge>}
        {r.hazardDecision && <Badge tone="info" icon={false}>{r.hazardDecision === 'release' ? 'Liberada por el evaluador' : 'A disposición especial'}</Badge>}
      </div>
      {r.note && <p className="text-xs text-muted mt-1">{r.note}</p>}
      {!locked && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <Select value={sub} onChange={(e) => setSub(e.target.value as Subcategory)} className="!w-auto" aria-label="Subcategoría">
            <option value="">Clasificar como…</option>
            {Object.entries(SUBCATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Input placeholder="Nota (opcional)" value={note} onChange={(e) => setNote(e.target.value)} className="!w-auto flex-1 min-w-[160px]" aria-label="Nota" />
          <PhotoCapture kind="reception" label="Foto" photos={photos} onChange={setPhotos} max={1} withLocation={false} />
          <Button size="sm" disabled={busy || !sub} onClick={() => run(async () => { const res = await api.post<{ batch: BatchView }>(`/center/receptions/${r.id}/classify`, { subcategory: sub, note: note || null, photoId: photos[0]?.id || null }); toast.success(sub === 'possible_hazardous' ? `Recepción marcada como posible material peligroso: el lote ${res.batch.code} queda retenido y el evaluador fue avisado.` : 'Recepción clasificada.'); onDone(); })}>
            Guardar
          </Button>
        </div>
      )}
      {error && <Alert tone="bad" className="mt-2">{error}</Alert>}
    </li>
  );
}

function DailySummary({ d, onDone }: { d: CenterOverview; onDone: () => void }) {
  const { busy, error, run } = useSubmit();
  const [f, setF] = useState({ date: d.today.date, tripsReceived: String(d.today.confirmed), officialTonnes: '' });
  return (
    <div className="space-y-4">
      <Card title="Resumen diario del centro" subtitle="Viajes recibidos y toneladas oficiales. En el tablero se muestran junto al volumen estimado de los viajes (7.8).">
        <div className="grid sm:grid-cols-3 gap-x-4">
          <Field label="Fecha" required><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Viajes recibidos" required><Input type="number" min={0} inputMode="numeric" value={f.tripsReceived} onChange={(e) => setF({ ...f, tripsReceived: e.target.value })} /></Field>
          <Field label="Toneladas oficiales (opcional)"><Input type="number" min={0} step="0.1" inputMode="decimal" value={f.officialTonnes} onChange={(e) => setF({ ...f, officialTonnes: e.target.value })} /></Field>
        </div>
        {error && <Alert tone="bad" className="mb-2">{error}</Alert>}
        <Button disabled={busy || !f.date || f.tripsReceived === ''} onClick={() => run(async () => { await api.post('/center/daily-summary', { date: f.date, tripsReceived: Number(f.tripsReceived), officialTonnes: f.officialTonnes === '' ? null : Number(f.officialTonnes) }); toast.success('Resumen diario registrado.'); onDone(); })}>Guardar resumen</Button>
      </Card>
      <Card title="Resúmenes anteriores">
        {d.dailySummaries.length === 0 ? <EmptyState title="Sin resúmenes" /> : (
          <table className="table-plain"><thead><tr><th>Fecha</th><th>Viajes</th><th>Toneladas oficiales</th></tr></thead><tbody>{d.dailySummaries.map((s) => <tr key={s.id}><td>{s.date}</td><td>{s.tripsReceived}</td><td>{s.officialTonnes == null ? '—' : fmtNum(s.officialTonnes)}</td></tr>)}</tbody></table>
        )}
      </Card>
    </div>
  );
}

function Jobs({ d, onDone }: { d: CenterOverview; onDone: () => void }) {
  const { busy, error, run } = useSubmit();
  const [f, setF] = useState({ positions: '', type: 'direct' as 'direct' | 'indirect', date: d.today.date });
  return (
    <div className="space-y-4">
      <Card title="Empleos del centro" subtitle="Puestos de trabajo directos o indirectos que se muestran en el tablero público.">
        <div className="grid sm:grid-cols-3 gap-x-4">
          <Field label="Número de puestos" required><Input type="number" min={1} inputMode="numeric" value={f.positions} onChange={(e) => setF({ ...f, positions: e.target.value })} /></Field>
          <Field label="Tipo" required><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as 'direct' | 'indirect' })}><option value="direct">Directos</option><option value="indirect">Indirectos</option></Select></Field>
          <Field label="Fecha" required><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        </div>
        {error && <Alert tone="bad" className="mb-2">{error}</Alert>}
        <Button disabled={busy || !(Number(f.positions) > 0) || !f.date} onClick={() => run(async () => { await api.post('/center/jobs', { positions: Number(f.positions), type: f.type, date: f.date }); toast.success('Empleos registrados.'); setF({ ...f, positions: '' }); onDone(); })}>Registrar empleos</Button>
      </Card>
      <Card title="Registros anteriores">
        {d.jobs.length === 0 ? <EmptyState title="Sin registros" /> : (
          <table className="table-plain"><thead><tr><th>Fecha</th><th>Puestos</th><th>Tipo</th></tr></thead><tbody>{d.jobs.map((j) => <tr key={j.id}><td>{j.date}</td><td>{j.positions}</td><td>{j.type === 'direct' ? 'Directos' : 'Indirectos'}</td></tr>)}</tbody></table>
        )}
      </Card>
    </div>
  );
}
