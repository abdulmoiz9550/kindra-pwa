import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { DebrisCause, OriginSize, OutputUnit, StructureType } from '@kindra/shared';
import { CAUSE_LABELS, SIZE_LABELS, STRUCTURE_TYPE_LABELS } from '@kindra/shared';
import { api, errorMessage } from '../lib/api';
import { toast } from '../lib/toast';
import { Alert, Button, Card, EmptyState, Field, Input, Select, Spinner } from './ui';
import { LocationPicker, type LocationValue } from './LocationPicker';
import { PhotoCapture, type CapturedPhoto } from './PhotoCapture';
import { OriginRow, useSubmit } from './panels/shared';
import type { OriginView } from './panels/types';

export interface LotValue { material: string; quantity: string; unit: OutputUnit }
export const EMPTY_LOT: LotValue = { material: '', quantity: '', unit: 'm3' };
export const lotBody = (v: LotValue) => ({ material: v.material.trim() || null, quantity: v.quantity ? Number(v.quantity) : null, unit: v.quantity ? v.unit : null });

/** Material, cantidad estimada y unidad. Cada unidad se guarda tal cual; no se convierte. */
export function LotFields({ v, onChange, required }: { v: LotValue; onChange: (v: LotValue) => void; required?: boolean }) {
  return (
    <div className="grid sm:grid-cols-3 gap-x-4">
      <Field label="Material" required={required}><Input value={v.material} maxLength={160} onChange={(e) => onChange({ ...v, material: e.target.value })} /></Field>
      <Field label="Cantidad estimada" required={required}><Input type="number" min={0} step="0.01" inputMode="decimal" value={v.quantity} onChange={(e) => onChange({ ...v, quantity: e.target.value })} /></Field>
      <Field label="Unidad" required={required}><Select value={v.unit} onChange={(e) => onChange({ ...v, unit: e.target.value as OutputUnit })}><option value="m3">Metros cúbicos (m³)</option><option value="t">Toneladas (t)</option></Select></Field>
    </div>
  );
}

/** v4.0, 5.3: la entidad de retiro registra el lote; la coordinación lo valida. */
export function CollectorOrigins() {
  const qc = useQueryClient();
  const { busy, error, run } = useSubmit();
  const q = useQuery({ queryKey: ['removal', 'origins'], queryFn: () => api.get<OriginView[]>('/removal/origins') });
  const [loc, setLoc] = useState<LocationValue>({ location: null, sectorId: null, street: '', reference: '' });
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [lot, setLot] = useState(EMPTY_LOT);
  const [f, setF] = useState({ size: 'large' as OriginSize, structureType: 'house' as StructureType, cause: 'collapse' as DebrisCause, buildingReference: '' });
  const ready = (loc.location || loc.sectorId) && lot.material.trim().length >= 2 && Number(lot.quantity) > 0 && photos.some((p) => p.id);
  const send = () =>
    run(async () => {
      const o = await api.post<OriginView>('/removal/origins', { location: loc.location, street: loc.street || null, reference: loc.reference || null, sectorId: loc.sectorId, ...f, buildingReference: f.buildingReference || null, ...lotBody(lot), photoIds: photos.map((p) => p.id).filter(Boolean) });
      toast.success(`Origen ${o.code} registrado. Espera la validación de la coordinación.`);
      setLot(EMPTY_LOT);
      setPhotos([]);
      qc.invalidateQueries({ queryKey: ['removal'] });
    });
  return (
    <>
      <Card title="Registrar origen o lote" subtitle="Queda sellado con tu entidad y lo valida la coordinación.">
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Field label="Tipo de estructura" required><Select value={f.structureType} onChange={(e) => setF({ ...f, structureType: e.target.value as StructureType })}>{Object.entries(STRUCTURE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="Causa" required><Select value={f.cause} onChange={(e) => setF({ ...f, cause: e.target.value as DebrisCause })}>{Object.entries(CAUSE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="Nombre o referencia del edificio"><Input value={f.buildingReference} onChange={(e) => setF({ ...f, buildingReference: e.target.value })} /></Field>
          <Field label="Tamaño estimado" required><Select value={f.size} onChange={(e) => setF({ ...f, size: e.target.value as OriginSize })}>{Object.entries(SIZE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        </div>
        <LotFields v={lot} onChange={setLot} required />
        <h3 className="label mt-2">Ubicación</h3>
        <LocationPicker value={loc} onChange={setLoc} />
        <h3 className="label mt-2">Evidencia (obligatoria)</h3>
        <PhotoCapture kind="origin" photos={photos} onChange={setPhotos} max={3} />
        {error && <Alert tone="bad" className="mt-3">{error}</Alert>}
        <Button className="mt-3" disabled={busy || !ready} onClick={send}>{busy ? 'Registrando…' : 'Registrar'}</Button>
      </Card>
      <Card title="Registrados por tu entidad">
        {q.isLoading ? <Spinner /> : q.error ? <Alert tone="bad">{errorMessage(q.error)}</Alert> : !q.data?.length ? <EmptyState title="Todavía no hay registros" /> : <div className="space-y-2">{q.data.map((o) => <OriginRow key={o.id} o={o} />)}</div>}
      </Card>
    </>
  );
}
