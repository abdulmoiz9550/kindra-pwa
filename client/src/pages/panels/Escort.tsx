import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigation, PauseCircle, PlayCircle } from 'lucide-react';
import { STOP_REASON_LABELS } from '@kindra/shared';
import { api, errorMessage } from '../../lib/api';
import { toast } from '../../lib/toast';
import { fmtTime } from '../../lib/format';
import { bufferPoint, flushPoints, keepAwake, navLinks, pendingPoints, type ActiveTrip, type TrackView } from '../../lib/tracking';
import { MapView, type MapLine } from '../../components/MapView';
import { PhotoCapture, type CapturedPhoto } from '../../components/PhotoCapture';
import { QrScanner } from '../../components/panels/QrScanner';
import { Alert, Button, Card, EmptyState, Field, Modal, PageTitle, Select, Spinner, Textarea } from '../../components/ui';

type MyTrip = ActiveTrip & { view: TrackView };

/**
 * Pantalla del escolta (addendum v1.3): un toque para iniciar, ruta al centro en el mapa, navegación con
 * Google Maps o Waze, un toque para declarar una parada y escaneo del QR de la puerta al llegar.
 * Envía la posición cada 30–60 s, guarda sin señal y sube al volver. El seguimiento se detiene solo al llegar.
 */
export default function Escort() {
  const qc = useQueryClient();
  const trips = useQuery({ queryKey: ['tracking', 'mine'], queryFn: () => api.get<MyTrip[]>('/tracking/my-trips'), refetchInterval: 30_000 });
  const cfg = useQuery({ queryKey: ['tracking', 'config'], queryFn: () => api.get<{ intervalSeconds: number }>('/tracking/config') });
  const [active, setActive] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [stopOpen, setStopOpen] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const watchRef = useRef<number | null>(null);
  const lastSent = useRef(0);
  const lockRef = useRef<{ release: () => void } | null>(null);
  const lastPos = useRef<{ lat: number; lng: number } | null>(null);
  const interval = Math.min(60, Math.max(30, cfg.data?.intervalSeconds ?? 30)) * 1000;

  const stop = () => {
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
    lockRef.current?.release();
    lockRef.current = null;
    setActive(null);
  };

  const start = async (key: string) => {
    if (!('geolocation' in navigator)) return toast.error('Este teléfono no permite compartir la ubicación.');
    setActive(key);
    lockRef.current = await keepAwake();
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        lastPos.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (Date.now() - lastSent.current < interval) return;
        lastSent.current = Date.now();
        void bufferPoint(key, { lat: pos.coords.latitude, lng: pos.coords.longitude, at: new Date(pos.timestamp).toISOString(), accuracy: pos.coords.accuracy ?? null, speedKmh: pos.coords.speed != null ? Math.round(pos.coords.speed * 3.6) : null }).then(async () => {
          try {
            const state = await flushPoints(key);
            if (state && state !== 'in_transit') {
              stop();
              toast.success('Llegada confirmada. El seguimiento se detuvo.');
              qc.invalidateQueries({ queryKey: ['tracking'] });
            }
          } catch {
            /* sin señal: queda guardado */
          }
          setPending(await pendingPoints(key));
        });
      },
      () => toast.error('No pude leer la ubicación. Revisa el permiso de ubicación.'),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    );
  };

  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const on = () => active && void flushPoints(active).then(async () => setPending(await pendingPoints(active))).catch(() => undefined);
    window.addEventListener('online', on);
    return () => window.removeEventListener('online', on);
  }, [active]);
  useEffect(() => {
    if (active && trips.data && !trips.data.some((t) => t.key === active)) stop();
  }, [trips.data, active]);

  if (trips.isLoading) return <Spinner />;
  if (trips.error) return <Alert tone="bad">{errorMessage(trips.error)}</Alert>;
  const list = trips.data || [];
  const cur = list.find((t) => t.key === active) || list[0];

  return (
    <div className="max-w-2xl mx-auto">
      <PageTitle title="Escolta del viaje" subtitle="Inicia el seguimiento cuando el camión salga. Se detiene solo al confirmarse la llegada." />
      {list.length === 0 ? (
        <EmptyState title="No tienes viajes en curso" text="Cuando registres una salida, aparece aquí." />
      ) : (
        cur && (
          <>
            {list.length > 1 && (
              <Field label="Viaje">
                <Select value={cur.key} onChange={(e) => { stop(); setActive(null); qc.setQueryData(['tracking', 'mine'], [...list.filter((t) => t.key === e.target.value), ...list.filter((t) => t.key !== e.target.value)]); }}>
                  {list.map((t) => <option key={t.key} value={t.key}>{t.code} · {t.toLabel}</option>)}
                </Select>
              </Field>
            )}
            <Card className="mb-3" title={`${cur.code} → ${cur.toLabel}`} subtitle={`${cur.vehiclePlate ?? ''}${cur.eta ? ` · llegada estimada ${fmtTime(cur.eta)}` : ''}`}>
              {active === cur.key ? (
                <Alert tone="info" className="mb-3" title="Seguimiento activo">
                  Tu ubicación se comparte con el coordinador, el supervisor y el centro de destino solo mientras dura este viaje. {pending > 0 && `${pending} posiciones esperan señal para subir.`}
                </Alert>
              ) : (
                <p className="text-sm text-muted mb-3">Al iniciar, el teléfono comparte su ubicación solo durante este viaje.</p>
              )}
              <MapView height={260} fitSectors={false} center={cur.view.lastPosition ? [cur.view.lastPosition.lat, cur.view.lastPosition.lng] : cur.view.from ? [cur.view.from.lat, cur.view.from.lng] : null} zoom={13}
                lines={[...(cur.view.planned?.planned ? [{ id: 'p', positions: cur.view.planned.planned, dashed: true, color: '#8a9aa3' } as MapLine] : []), ...cur.view.segments.map((s, i) => ({ id: `s${i}`, positions: s.map((p) => [p[0], p[1]] as [number, number]), color: 'var(--brand-teal)' }))]}
                points={cur.view.to ? [{ id: 'C', lat: cur.view.to.lat, lng: cur.view.to.lng, color: 'var(--brand-deep)', label: cur.toLabel }] : []} />
              <div className="mt-3 flex flex-wrap gap-2">
                {active === cur.key ? (
                  <Button variant="secondary" onClick={stop}><PauseCircle size={18} /> Pausar</Button>
                ) : (
                  <Button onClick={() => start(cur.key)}><PlayCircle size={18} /> Iniciar viaje</Button>
                )}
                {cur.view.to && (
                  <>
                    <a className="btn-secondary" href={navLinks(cur.view.to).google} target="_blank" rel="noreferrer"><Navigation size={16} /> Google Maps</a>
                    <a className="btn-secondary" href={navLinks(cur.view.to).waze} target="_blank" rel="noreferrer"><Navigation size={16} /> Waze</a>
                  </>
                )}
                <Button variant="secondary" onClick={() => setStopOpen(true)}>Declarar parada</Button>
                <Button variant="secondary" onClick={() => setGateOpen(true)}>Escanear QR de la puerta</Button>
                <Link to={`/panel/viaje/${cur.key}`} className="btn-ghost">Ver recorrido</Link>
              </div>
              {!cur.view.to && <p className="text-xs text-muted mt-2">El destino todavía no tiene coordenadas: no hay ruta ni navegación hasta que se carguen.</p>}
            </Card>
            <StopModal open={stopOpen} onClose={() => setStopOpen(false)} tripKey={cur.key} lastPos={lastPos.current} />
            <GateModal open={gateOpen} onClose={() => setGateOpen(false)} tripKey={cur.key} />
          </>
        )
      )}
    </div>
  );
}

function currentPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => resolve(null), { enableHighAccuracy: true, timeout: 15_000 });
  });
}

function StopModal({ open, onClose, tripKey, lastPos }: { open: boolean; onClose: () => void; tripKey: string; lastPos: { lat: number; lng: number } | null }) {
  const [reason, setReason] = useState('traffic');
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const location = lastPos || (await currentPosition());
      await api.post(`/tracking/trips/${tripKey}/stops`, { reason, note: note || null, photoId: photos[0]?.id ?? null, location });
      toast.success('Parada declarada.');
      setNote('');
      setPhotos([]);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Declarar parada">
      <Field label="Motivo">
        <Select value={reason} onChange={(e) => setReason(e.target.value)}>
          {Object.entries(STOP_REASON_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </Field>
      <Field label="Nota (opcional)"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <PhotoCapture kind="evidence" label="Foto (opcional)" photos={photos} onChange={setPhotos} max={1} />
      <div className="flex justify-end gap-2 mt-3">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={save} disabled={busy}>Guardar</Button>
      </div>
    </Modal>
  );
}

function GateModal({ open, onClose, tripKey }: { open: boolean; onClose: () => void; tripKey: string }) {
  const onResult = async (value: string) => {
    const code = value.includes('/puerta/') ? value.split('/puerta/')[1].split(/[?#]/)[0] : value;
    try {
      const location = await currentPosition();
      const r = await api.post<{ gate: string; counts: boolean }>('/tracking/gate-scan', { gateCode: code, tripKey, location });
      if (r.counts) toast.success(`Presencia registrada en ${r.gate}.`);
      else toast.error(`Escaneo fuera del perímetro de ${r.gate}: no cuenta como presencia.`);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="QR de la puerta">
      <p className="text-sm mb-2">Escanéalo si no hay personal en la puerta. Solo cuenta si estás dentro del perímetro.</p>
      {open && <QrScanner onResult={onResult} label="Escanear QR de la puerta" />}
    </Modal>
  );
}
