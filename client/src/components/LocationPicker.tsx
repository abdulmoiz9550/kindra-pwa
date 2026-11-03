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
}

/** Ubicación por GPS o toque en el mapa, o calle + referencia + sector si no hay coordenadas (5.4). */
export function LocationPicker({ value, onChange }: { value: LocationValue; onChange: (v: LocationValue) => void }) {
  const { data: cfg } = usePublicConfig();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sectors = cfg?.sectors || [];
  const sectorFor = (p: { lat: number; lng: number }) => sectors.find((s) => pointInPolygon(p, s.polygon))?.id ?? null;

  const setPoint = (p: { lat: number; lng: number }) => {
    const sectorId = sectorFor(p);
    onChange({ ...value, location: p, sectorId: sectorId ?? value.sectorId });
    setError(sectorId ? null : 'Ese punto queda fuera de los sectores atendidos. Puedes elegir el sector a mano.');
  };

  const locate = async () => {
    setBusy(true);
    setError(null);
    try {
      const p = await getPosition();
      setPoint({ lat: p.lat, lng: p.lng });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const sectorName = sectors.find((s) => s.id === value.sectorId)?.name;
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        <Button variant="secondary" onClick={locate} disabled={busy}>
          <LocateFixed size={18} /> {busy ? 'Buscando…' : 'Usar mi ubicación'}
        </Button>
        <span className="text-sm text-muted self-center">o toca el mapa en el punto del escombro</span>
      </div>
      <MapView sectors={sectors.map((s) => ({ id: s.id, name: s.name, polygon: s.polygon, authorized: s.authorized }))} points={value.location ? [{ id: 'p', lat: value.location.lat, lng: value.location.lng, color: 'var(--accent)', radius: 10, label: 'Punto del escombro' }] : []} onClick={setPoint} center={value.location ? [value.location.lat, value.location.lng] : undefined} zoom={value.location ? 16 : 14} height={240} />
      {value.location && (
        <p className="text-sm mt-2">
          Punto marcado{sectorName ? ` en ${sectorName}` : ''}. <button type="button" className="underline text-primary" onClick={() => onChange({ ...value, location: null })}>Quitar</button>
        </p>
      )}
      {error && (
        <Alert tone="warn" className="mt-2">
          {error}
        </Alert>
      )}
      <div className="mt-3 grid gap-0 sm:grid-cols-2 sm:gap-3">
        <Field label="Calle" hint="Si no tienes ubicación, indica la calle">
          <Input value={value.street} onChange={(e) => onChange({ ...value, street: e.target.value })} placeholder="Ej. Calle 3" />
        </Field>
        <Field label="Referencia" hint="Algo que la gente de la zona conozca">
          <Input value={value.reference} onChange={(e) => onChange({ ...value, reference: e.target.value })} placeholder="Ej. frente a la bodega" />
        </Field>
      </div>
      <Field label="Sector" required hint={value.location && sectorName ? 'Se detectó por la ubicación' : 'Elige tu sector si no marcaste el punto'}>
        <Select value={value.sectorId || ''} onChange={(e) => onChange({ ...value, sectorId: e.target.value || null })}>
          <option value="">Elige un sector</option>
          {sectors.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.authorized ? '' : ' · zona pendiente de autorización'}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}
