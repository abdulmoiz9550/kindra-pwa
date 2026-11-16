import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MOVEMENT_LEG_LABELS, MOVEMENT_OUTPUT_LABELS, GEOFENCE_LABELS } from '@kindra/shared';
import { api, errorMessage } from '../../lib/api';
import { toast } from '../../lib/toast';
import { fmtNum, fmtRelative, fmtTime } from '../../lib/format';
import type { ActiveTrip } from '../../lib/tracking';
import { PhotoCapture, type CapturedPhoto } from '../../components/PhotoCapture';
import { QrScanner } from '../../components/panels/QrScanner';
import { useAuth } from '../../lib/auth';
import { sendOrQueue } from '../../lib/offlineActions';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, PageTitle, Select, Spinner, Tabs } from '../../components/ui';

type Leg = 'cdt_cdf' | 'cdt_work' | 'cdt_state';
interface MovementRow { id: string; code: string; leg: Leg; state: string; quantity: number; unit: string; outputType: 'aggregate' | 'rejects' | 'metal'; destination: { name: string }; vehiclePlate: string | null; batchCode: string | null; departure: { serverTime: string }; arrivalCheck: string | null; verified: boolean }
interface Data {
  role: string;
  incoming: ActiveTrip[];
  outgoing: MovementRow[];
  batches: { id: string; code: string; state: string; qualityResult: string | null; outputs: { unit: string; aggregate: number; metal: number; specialDisposal: number; rejects: number } | null }[];
  cdfCenters: { id: string; name: string }[];
  works: { id: string; code: string; name: string }[];
}
interface OpenScan { vehicle: { id: string; plate: string }; open: { key: string; kind: 'trip' | 'movement'; code: string; toLabel: string } | null }

const currentPosition = (): Promise<{ lat: number; lng: number } | null> =>
  new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => resolve(null), { enableHighAccuracy: true, timeout: 15_000 });
  });

/**
 * Puntos de control QR en cada tramo (addendum v1.3). En la puerta, el personal escanea el QR del vehículo:
 * a la salida registra qué sale y hacia dónde; a la llegada confirma con foto. El chofer no necesita la app.
 */
export default function Checkpoint() {
  const role = useAuth((s) => s.user?.activeRole);
  const q = useQuery({ queryKey: ['tracking', 'checkpoint'], queryFn: () => api.get<Data>('/tracking/checkpoint'), refetchInterval: 20_000 });
  const [tab, setTab] = useState<'arrive' | 'depart' | 'outgoing'>('arrive');
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Alert tone="bad">{q.error ? errorMessage(q.error) : 'No se pudo cargar.'}</Alert>;
  const d = q.data;
  return (
    <div>
      <PageTitle title="Punto de control" subtitle="Cada movimiento de material es un viaje con dos escaneos: donde sale y donde llega." />
      <Tabs value={tab} onChange={setTab} items={[{ value: 'arrive', label: 'Llegadas', count: d.incoming.length }, ...(role === 'center' ? [{ value: 'depart' as const, label: 'Registrar salida' }, { value: 'outgoing' as const, label: 'Salidas', count: d.outgoing.length }] : [])]} />
      <div className="mt-3">
        {tab === 'arrive' && <Arrivals d={d} />}
        {tab === 'depart' && <Departure d={d} onDone={() => setTab('outgoing')} />}
        {tab === 'outgoing' && <Outgoing rows={d.outgoing} />}
      </div>
    </div>
  );
}

function Arrivals({ d }: { d: Data }) {
  const qc = useQueryClient();
  const role = useAuth((s) => s.user?.activeRole);
  const [scan, setScan] = useState<(OpenScan & { qr: string }) | null>(null);
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const onQr = async (qr: string) => {
    const code = qr.trim();
    if (!navigator.onLine) {
      // Sin señal: se confirma solo con el QR; el servidor resuelve el viaje abierto al subir.
      setScan({ vehicle: { id: '', plate: code }, open: { key: '', kind: 'trip', code: 'pendiente', toLabel: 'se verifica al volver la señal' }, qr: code });
      return;
    }
    try {
      setScan({ ...(await api.get<OpenScan>(`/tracking/vehicles/${encodeURIComponent(code)}/open`)), qr: code });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const confirm = async () => {
    if (!scan?.open || !photos[0]) return;
    setBusy(true);
    try {
      const location = await currentPosition();
      if (scan.open.kind === 'trip' && scan.open.key && role !== 'center') throw new Error('Los viajes desde un origen los confirma el centro de destino.');
      const r = await sendOrQueue('/tracking/arrive-by-qr', { vehicleQr: scan.qr, location }, `Llegada del vehículo ${scan.qr}`, { dataUrl: photos[0].preview, kind: 'trip_arrival', location: photos[0].location });
      if (r) toast.success(`Llegada de ${scan.open.code} confirmada.`);
      setScan(null);
      setPhotos([]);
      qc.invalidateQueries({ queryKey: ['tracking'] });
      qc.invalidateQueries({ queryKey: ['center'] });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid md:grid-cols-2 gap-3">
      <Card title="Confirmar llegada" subtitle="Escanea el QR del vehículo en la puerta y toma la foto de llegada. Si el camión estaba declarado hacia otro destino, se avisa al coordinador y al supervisor.">
        <QrScanner onResult={onQr} label="Escanear QR del vehículo" />
        <Field label="O escribe el código del QR"><Input placeholder="KV-XXXXXX" onKeyDown={(e) => e.key === 'Enter' && onQr((e.target as HTMLInputElement).value)} /></Field>
        {scan && (
          scan.open ? (
            <div className="mt-2">
              <p className="text-sm mb-2"><strong>{scan.vehicle.plate}</strong> · viaje {scan.open.code} hacia {scan.open.toLabel}</p>
              <PhotoCapture kind="trip_arrival" label="Foto de llegada" photos={photos} onChange={setPhotos} max={1} deferUpload />
              <Button className="mt-2" onClick={confirm} disabled={busy || !photos[0]}>Confirmar llegada</Button>
            </div>
          ) : (
            <Alert tone="warn" className="mt-2">{scan.vehicle.plate} no tiene un viaje abierto.</Alert>
          )
        )}
      </Card>
      <Card title="Camiones en camino" subtitle="Con la llegada estimada.">
        {d.incoming.length === 0 ? (
          <EmptyState title="Nada en camino" />
        ) : (
          <ul className="divide-y divide-line text-sm">
            {d.incoming.map((t) => (
              <li key={t.key} className="py-2 flex justify-between gap-2">
                <span>
                  <strong>{t.code}</strong> · {t.vehiclePlate} · desde {t.fromLabel}
                  <span className="block text-xs text-muted">Salió {fmtRelative(t.departureAt)} · {t.eta ? `llega ~${fmtTime(t.eta)}` : 'sin estimación'}</span>
                </span>
                <Link to={`/panel/viaje/${t.key}`} className="btn-ghost btn-sm">Recorrido</Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Departure({ d, onDone }: { d: Data; onDone: () => void }) {
  const qc = useQueryClient();
  const [leg, setLeg] = useState<Leg>('cdt_work');
  const [batchId, setBatchId] = useState(d.batches[0]?.id || '');
  const [quantity, setQuantity] = useState('');
  const [dest, setDest] = useState('');
  const [qr, setQr] = useState('');
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const output = leg === 'cdt_work' ? 'aggregate' : leg === 'cdt_cdf' ? 'rejects' : 'metal';
  const batch = d.batches.find((b) => b.id === batchId);
  const save = async () => {
    setBusy(true);
    try {
      const location = await currentPosition();
      const r = await sendOrQueue('/tracking/movements', { leg, batchId, quantity: Number(quantity), vehicleQr: qr, destCenterId: leg === 'cdt_cdf' ? dest : null, workId: leg === 'cdt_work' ? dest : null, location }, `Salida del vehículo ${qr}`, { dataUrl: photos[0].preview, kind: 'trip_departure', location: photos[0].location });
      if (r) toast.success('Salida registrada. El destino confirma la llegada escaneando el mismo QR.');
      qc.invalidateQueries({ queryKey: ['tracking'] });
      onDone();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  if (!d.batches.length) return <EmptyState title="Ningún lote tiene salidas registradas todavía" />;
  return (
    <Card title="Salida de material desde el centro" subtitle="Escanea el QR del vehículo, elige qué sale y hacia dónde, con la foto del camión cargado y su placa visible.">
      <Field label="Tramo">
        <Select value={leg} onChange={(e) => { setLeg(e.target.value as Leg); setDest(''); }}>
          {(Object.keys(MOVEMENT_LEG_LABELS) as Leg[]).map((k) => <option key={k} value={k}>{MOVEMENT_LEG_LABELS[k]}</option>)}
        </Select>
      </Field>
      <div className="grid sm:grid-cols-2 sm:gap-3">
        <Field label="Lote">
          <Select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            {d.batches.map((b) => <option key={b.id} value={b.id}>{b.code}{b.qualityResult === 'approved' ? ' · aprobado' : ''}</option>)}
          </Select>
        </Field>
        <Field label={`Cantidad estimada de ${MOVEMENT_OUTPUT_LABELS[output].toLowerCase()} (${batch?.outputs?.unit ?? ''})`} hint={batch?.outputs ? `Producido: ${fmtNum(batch.outputs[output])}` : undefined}>
          <Input type="number" min={0} step="0.1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </Field>
      </div>
      {leg === 'cdt_work' && batch?.qualityResult !== 'approved' && <Alert tone="warn" className="mb-3">Este lote no tiene verificación de calidad aprobada: no puede salir hacia una obra (regla 7.4).</Alert>}
      {leg !== 'cdt_state' && (
        <Field label="Destino declarado">
          <Select value={dest} onChange={(e) => setDest(e.target.value)}>
            <option value="">Elige el destino</option>
            {(leg === 'cdt_cdf' ? d.cdfCenters.map((c) => ({ id: c.id, label: c.name })) : d.works.map((w) => ({ id: w.id, label: `${w.code} · ${w.name}` }))).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </Select>
        </Field>
      )}
      <QrScanner onResult={(v) => setQr(v.trim())} label="Escanear QR del vehículo" />
      <Field label="QR del vehículo"><Input value={qr} onChange={(e) => setQr(e.target.value)} placeholder="KV-XXXXXX" /></Field>
      <PhotoCapture kind="trip_departure" label="Foto del camión cargado (placa visible)" photos={photos} onChange={setPhotos} max={1} deferUpload />
      <Button className="mt-3" onClick={save} disabled={busy || !qr || !photos[0] || !(Number(quantity) > 0) || (leg !== 'cdt_state' && !dest)}>Registrar salida</Button>
    </Card>
  );
}

function Outgoing({ rows }: { rows: MovementRow[] }) {
  if (!rows.length) return <EmptyState title="Sin salidas registradas" />;
  return (
    <Card>
      <ul className="divide-y divide-line text-sm">
        {rows.map((m) => (
          <li key={m.id} className="py-2 flex flex-wrap justify-between gap-2">
            <span>
              <strong>{m.code}</strong> · {m.quantity} {m.unit} de {MOVEMENT_OUTPUT_LABELS[m.outputType].toLowerCase()} · lote {m.batchCode} → {m.destination.name}
              <span className="block text-xs text-muted">{m.vehiclePlate} · salió {fmtRelative(m.departure.serverTime)}{m.arrivalCheck ? ` · ${GEOFENCE_LABELS[m.arrivalCheck as keyof typeof GEOFENCE_LABELS]}` : ''}</span>
            </span>
            <span className="flex items-center gap-2">
              <Badge tone={m.state === 'received' ? (m.verified ? 'ok' : 'warn') : m.state === 'no_arrival' ? 'bad' : 'info'}>{m.state === 'received' ? (m.verified ? 'Llegada verificada' : 'Llegada sin verificar') : m.state === 'no_arrival' ? 'Sin llegada' : 'En camino'}</Badge>
              <Link to={`/panel/viaje/${m.id}`} className="btn-ghost btn-sm">Recorrido</Link>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
