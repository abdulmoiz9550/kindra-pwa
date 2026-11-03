import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Truck } from 'lucide-react';
import type { FillLevel } from '@kindra/shared';
import { api, errorMessage } from '../../lib/api';
import { usePublicConfig } from '../../lib/config';
import { toast } from '../../lib/toast';
import { fmtNum } from '../../lib/format';
import { Card, Button, Field, Select, Alert, EmptyState, Modal, PageTitle, Tabs, Spinner, Badge } from '../../components/ui';
import { MapView } from '../../components/MapView';
import { PhotoCapture, type CapturedPhoto } from '../../components/PhotoCapture';
import { QrScanner } from '../../components/panels/QrScanner';
import { OriginRow, TripRow, MapLegend, stateColor, useSubmit } from '../../components/panels/shared';
import type { RemovalOverview, OriginView, TripView } from '../../components/panels/types';

type Tab = 'origins' | 'map' | 'trips' | 'zones';

export default function Removal() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['removal', 'overview'], queryFn: () => api.get<RemovalOverview>('/removal/overview') });
  const [tab, setTab] = useState<Tab>('origins');
  const [selected, setSelected] = useState<string[]>([]);
  const [departure, setDeparture] = useState(false);
  const [beforeAfter, setBeforeAfter] = useState<OriginView | null>(null);
  const d = q.data;
  const refresh = () => qc.invalidateQueries({ queryKey: ['removal'] });
  if (q.isLoading) return <Spinner label="Cargando el panel…" />;
  if (q.error || !d) return <Alert tone="bad">{errorMessage(q.error)}</Alert>;
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const inTransit = d.trips.filter((t) => t.state === 'in_transit').length;

  return (
    <div>
      <PageTitle
        title="Panel de retiro"
        subtitle="Orígenes validados y priorizados listos para retirar. Registra cada salida con el QR del vehículo."
        actions={
          <Button onClick={() => setDeparture(true)}>
            <Truck size={18} /> Registrar salida{selected.length ? ` (${selected.length})` : ''}
          </Button>
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'origins', label: 'Por retirar', count: d.origins.length },
          { value: 'map', label: 'Mapa' },
          { value: 'trips', label: 'Mis viajes', count: inTransit },
          { value: 'zones', label: 'Zona pendiente', count: d.pendingZone.length },
        ]}
      />
      <div className="mt-3 space-y-4">
        {tab === 'origins' && (
          <Card title="Orígenes validados por prioridad" subtitle="Marca uno o más y registra la salida. Los de zona pendiente no aparecen aquí (7.2).">
            {d.origins.length === 0 ? (
              <EmptyState title="No hay orígenes esperando retiro" />
            ) : (
              <div className="space-y-2">
                {d.origins.map((o) => (
                  <OriginRow key={o.id} o={o} selectable selected={selected.includes(o.id)} onToggle={() => toggle(o.id)} extra={<div className="mt-2"><Button size="sm" variant="ghost" onClick={() => setBeforeAfter(o)}>Fotos antes y después</Button></div>} />
                ))}
              </div>
            )}
          </Card>
        )}
        {tab === 'map' && <RemovalMap origins={d.origins} selected={selected} onToggle={toggle} />}
        {tab === 'trips' && (
          <Card title="Mis viajes" subtitle="Salidas registradas por tu entidad. La llegada la confirma el centro.">
            {d.trips.length === 0 ? <EmptyState title="Todavía no registraste viajes" /> : <div className="space-y-2">{d.trips.map((t: TripView) => <TripRow key={t.id} t={t} />)}</div>}
          </Card>
        )}
        {tab === 'zones' && (
          <Card title="Orígenes en zona pendiente de autorización" subtitle="No se puede registrar un viaje desde estos puntos hasta que el coordinador autorice la zona.">
            {d.pendingZone.length === 0 ? <EmptyState title="Ninguno" /> : <div className="space-y-2">{d.pendingZone.map((o) => <OriginRow key={o.id} o={o} />)}</div>}
          </Card>
        )}
      </div>
      <DepartureModal open={departure} onClose={() => setDeparture(false)} data={d} initialSelected={selected} onDone={() => { setSelected([]); setDeparture(false); refresh(); }} />
      <BeforeAfterModal o={beforeAfter} onClose={() => setBeforeAfter(null)} onDone={refresh} />
    </div>
  );
}

function RemovalMap({ origins, selected, onToggle }: { origins: OriginView[]; selected: string[]; onToggle: (id: string) => void }) {
  const { data: cfg } = usePublicConfig();
  const pts = origins.filter((o) => o.location).map((o) => ({ id: o.id, lat: o.location!.lat, lng: o.location!.lng, color: selected.includes(o.id) ? 'var(--accent)' : stateColor(o.effectiveState), radius: selected.includes(o.id) ? 11 : 8, label: `${o.code} · ${o.priority ? `prioridad ${o.priority}` : 'sin prioridad'} (toca para seleccionar)`, onClick: () => onToggle(o.id) }));
  return (
    <Card title="Mapa de orígenes por retirar" subtitle="Toca un punto para incluirlo en la salida.">
      <MapView sectors={(cfg?.sectors || []).map((s) => ({ id: s.id, name: s.name, polygon: s.polygon, authorized: s.authorized }))} points={pts} height={420} />
      <MapLegend />
      <p className="text-xs text-muted mt-1">Los puntos en naranja están seleccionados para la salida.</p>
    </Card>
  );
}

function DepartureModal({ open, onClose, data, initialSelected, onDone }: { open: boolean; onClose: () => void; data: RemovalOverview; initialSelected: string[]; onDone: () => void }) {
  const { busy, error, run } = useSubmit();
  const [vehicleId, setVehicleId] = useState<string>('');
  const [qrChecked, setQrChecked] = useState<string | null>(null);
  const [originIds, setOriginIds] = useState<string[]>(initialSelected);
  const [centerId, setCenterId] = useState(data.centers[0]?.id || '');
  const [fill, setFill] = useState<FillLevel | ''>('');
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const vehicle = data.vehicles.find((v) => v.id === vehicleId);
  const estimated = useMemo(() => (vehicle?.capacityM3 ? vehicle.capacityM3 * (fill === 'half' ? 0.5 : 1) : null), [vehicle, fill]);
  const onQr = async (value: string) => {
    try {
      const v = await api.get<{ id: string; plate: string; typeName: string | null }>(`/removal/vehicles/qr/${encodeURIComponent(value)}`);
      setVehicleId(v.id);
      setQrChecked(value);
      toast.success(`Vehículo ${v.plate} (${v.typeName}) identificado por QR.`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const candidates = data.origins;
  if (!open) return null;
  return (
    <Modal open onClose={onClose} title="Registrar salida de viaje" wide>
      <div className="space-y-4">
        <section>
          <h3 className="label">1. Vehículo</h3>
          <QrScanner onResult={onQr} label="Escanear QR del vehículo" hint="Escanea el QR pegado en el vehículo o elígelo de la lista." />
          <Field label="O elige de la lista">
            <Select value={vehicleId} onChange={(e) => { setVehicleId(e.target.value); setQrChecked(null); }}>
              <option value="">Elige un vehículo</option>
              {data.vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate} · {v.typeName} · {v.capacityM3} m³
                </option>
              ))}
            </Select>
          </Field>
          {vehicle && (
            <p className="text-sm">
              <Badge tone={qrChecked ? 'ok' : 'info'}>{qrChecked ? 'QR verificado' : 'Elegido de la lista'}</Badge> {vehicle.plate} · {vehicle.typeName} · capacidad nominal {vehicle.capacityM3} m³ <span className="badge bg-warn-soft text-warn">provisional</span>
            </p>
          )}
        </section>
        <section>
          <h3 className="label">2. Orígenes que van en este viaje</h3>
          {candidates.length === 0 ? (
            <p className="text-sm text-muted">No hay orígenes validados disponibles.</p>
          ) : (
            <ul className="max-h-56 overflow-y-auto space-y-1 rounded-lg border border-line p-2">
              {candidates.map((o) => (
                <li key={o.id}>
                  <label className="flex items-center gap-2 text-sm py-1">
                    <input type="checkbox" className="h-5 w-5 accent-[var(--primary)]" checked={originIds.includes(o.id)} onChange={() => setOriginIds((s) => (s.includes(o.id) ? s.filter((x) => x !== o.id) : [...s, o.id]))} />
                    <span className="font-semibold">{o.code}</span> <span className="text-muted">{o.sectorName}{o.street ? ` · ${o.street}` : ''}{o.priority ? ` · prioridad ${o.priority}` : ''}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="grid sm:grid-cols-2 gap-x-4">
          <Field label="3. Centro de destino" required>
            <Select value={centerId} onChange={(e) => setCenterId(e.target.value)}>
              {data.centers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.type})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nivel de llenado (opcional)" hint={estimated !== null ? `Volumen estimado: ${fmtNum(estimated)} m³ (estimado, no medido)` : undefined}>
            <Select value={fill} onChange={(e) => setFill(e.target.value as FillLevel | '')}>
              <option value="">Sin indicar (se asume lleno)</option>
              <option value="full">Lleno</option>
              <option value="half">Medio</option>
            </Select>
          </Field>
        </section>
        <section>
          <h3 className="label">4. Foto de salida (obligatoria)</h3>
          <PhotoCapture kind="trip_departure" label="Foto del camión cargado" photos={photos} onChange={setPhotos} max={1} />
        </section>
        {error && <Alert tone="bad">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={busy || !vehicleId || !originIds.length || !centerId || !photos[0]?.id}
            onClick={() =>
              run(async () => {
                const t = await api.post<TripView>('/removal/trips', { vehicleId, vehicleQr: qrChecked, originIds, centerId, photoId: photos[0].id, location: photos[0].location, fillLevel: fill || null });
                toast.success(`Viaje ${t.code} registrado hacia ${t.centerName}. El centro fue avisado.`);
                onDone();
              })
            }
          >
            {busy ? 'Registrando…' : 'Registrar salida'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function BeforeAfterModal({ o, onClose, onDone }: { o: OriginView | null; onClose: () => void; onDone: () => void }) {
  const { busy, error, run } = useSubmit();
  const [after, setAfter] = useState<CapturedPhoto[]>([]);
  const [before, setBefore] = useState<CapturedPhoto[]>([]);
  if (!o) return null;
  return (
    <Modal open onClose={onClose} title={`Antes y después · ${o.code}`}>
      <p className="text-sm text-ink-2 mb-3">La foto de “antes” es opcional (si no la subes se usa la del reporte). La de “después” es la evidencia del punto despejado y se muestra en el tablero cuando el administrador la modera.</p>
      <h3 className="label">Antes (opcional)</h3>
      <PhotoCapture kind="before" label="Foto de antes" photos={before} onChange={setBefore} max={1} />
      <h3 className="label mt-3">Después (obligatoria)</h3>
      <PhotoCapture kind="after" label="Foto de después" photos={after} onChange={setAfter} max={1} />
      {error && <Alert tone="bad" className="mt-2">{error}</Alert>}
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button disabled={busy || !after[0]?.id} onClick={() => run(async () => { await api.post(`/removal/origins/${o.id}/before-after`, { afterPhotoId: after[0].id, beforePhotoId: before[0]?.id || null }); toast.success('Fotos registradas.'); onDone(); onClose(); })}>
          Guardar
        </Button>
      </div>
    </Modal>
  );
}
