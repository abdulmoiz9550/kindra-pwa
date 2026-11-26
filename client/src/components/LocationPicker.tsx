import { PARISHES } from '@kindra/shared';
import { useState } from 'react';
import { LocateFixed } from 'lucide-react';
import { pointInPolygon } from '@kindra/shared';
import { usePublicConfig } from '../lib/config';
import { getPosition } from '../lib/media';
import { MapView } from './MapView';
import { Button, Field, Input, Select, Alert } from './ui';

export interface LocationValue {
  location: { lat: number; lng: number } | null;
  sectorId: string | null;
  street: string;
  reference: string;
  /** Precisión del GPS en metros (si se usó la ubicación del teléfono). */
  accuracyM?: number | null;
}

/** Ubicación por GPS o toque en el mapa, o calle + referencia + sector si no hay coordenadas (5.4). */
export function LocationPicker({ value, onChange }: { value: LocationValue; onChange: (v: LocationValue) => void }) {
  const { data: cfg } = usePublicConfig();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allSectors = cfg?.sectors || [];
  // Addendum v4.2, sección 7: parroquia y sector de la lista, obligatorios. El punto en el mapa es opcional.
  const [parish, setParish] = useState(() => allSectors.find((s) => s.id === value.sectorId)?.parish ?? '');
  const sectors = parish ? allSectors.filter((s) => s.parish === parish) : allSectors;
  const sectorFor = (p: { lat: number; lng: number }) => sectors.find((s) => pointInPolygon(p, s.polygon))?.id ?? null;

  const setPoint = (p: { lat: number; lng: number }, accuracyM: number | null = null) => {
    const sectorId = sectorFor(p);
    const sp = allSectors.find((s) => s.id === sectorId)?.parish;
    if (sp) setParish(sp);
    onChange({ ...value, location: p, accuracyM, sectorId: sectorId ?? value.sectorId });
    setError(sectorId ? null : 'Ese punto queda fuera de los sectores atendidos. Puedes elegir el sector a mano.');
  };

  const locate = async () => {
    setBusy(true);
    setError(null);
    try {
      const p = await getPosition();
      setPoint({ lat: p.lat, lng: p.lng }, p.accuracy ?? null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const sectorName = sectors.find((s) => s.id === value.sectorId)?.name;
  return (
    <div>
      <div className="grid gap-0 sm:grid-cols-2 sm:gap-3">
        <Field label="Parroquia" required>
          <Select value={parish} onChange={(e) => { setParish(e.target.value); onChange({ ...value, sectorId: null }); }}>
            <option value="">Elige la parroquia</option>
            {PARISHES.map((p) => <option key={p.code} value={p.name}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Sector" required>
          <Select value={value.sectorId || ''} onChange={(e) => onChange({ ...value, sectorId: e.target.value || null })} disabled={!parish}>
            <option value="">{parish && !sectors.length ? 'Aún no hay sectores cargados' : 'Elige el sector'}</option>
            {sectors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.authorized ? '' : ' · zona pendiente de autorización'}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <p className="text-sm text-muted mb-2">Opcional: marca el punto para que el equipo lo encuentre. Solo lo ven la coordinación, el Ente de Retiro y el Contralor del sector.</p>
      <div className="flex flex-wrap gap-2 mb-2">
        <Button variant="secondary" onClick={locate} disabled={busy}>
          <LocateFixed size={18} /> {busy ? 'Buscando…' : 'Usar mi ubicación'}
        </Button>
        <span className="text-sm text-muted self-center">o toca el mapa en el punto del escombro</span>
      </div>
      <MapView sectors={sectors.map((s) => ({ id: s.id, name: s.name, polygon: s.polygon, authorized: s.authorized }))} points={value.location ? [{ id: 'p', lat: value.location.lat, lng: value.location.lng, color: 'var(--accent)', radius: 10, label: 'Punto del escombro' }] : []} onClick={(p) => setPoint(p)} center={value.location ? [value.location.lat, value.location.lng] : undefined} zoom={value.location ? 16 : 14} height={240} />
      {value.location && (
        <p className="text-sm mt-2">
          Punto marcado{sectorName ? ` en ${sectorName}` : ''}{value.accuracyM ? ` (precisión ±${Math.round(value.accuracyM)} m)` : ''}. Puedes tocar el mapa para ajustarlo. <button type="button" className="underline text-primary" onClick={() => onChange({ ...value, location: null })}>Quitar</button>
        </p>
      )}
      {error && (
        <Alert tone="warn" className="mt-2">
          {error}
        </Alert>
      )}
      <div className="mt-3 grid gap-0 sm:grid-cols-2 sm:gap-3">
        <Field label="Calle (opcional)">
          <Input value={value.street} onChange={(e) => onChange({ ...value, street: e.target.value })} placeholder="Ej. Calle 3" />
        </Field>
        <Field label="Punto de referencia (opcional)" hint="Algo que la gente de la zona conozca">
          <Input value={value.reference} onChange={(e) => onChange({ ...value, reference: e.target.value })} placeholder="Ej. frente a la bodega" />
        </Field>
      </div>

    </div>
  );
}
