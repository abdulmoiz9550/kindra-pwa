import { useState } from 'react';
import type { Sector } from '@kindra/shared';
import { Card, Button, Field, Input, Badge, Modal, Spinner, Provisional } from '../../components/ui';
import { MapView } from '../../components/MapView';
import { Section, useAdminList, useAdminAction } from './shared';

interface Draft {
  id?: string;
  name: string;
  parish: string;
  polygon: [number, number][];
  authorized: boolean;
  provisional: boolean;
}

const EMPTY: Draft = { name: '', parish: '', polygon: [], authorized: true, provisional: false };

export default function Sectors() {
  const q = useAdminList<Sector>('sectors');
  const { post, busy } = useAdminAction();
  const [editing, setEditing] = useState<Draft | null>(null);
  const save = async () => {
    if (!editing) return;
    const r = await post('sectors', editing, 'Sector guardado.');
    if (r) setEditing(null);
  };
  const setPoint = (i: number, k: 0 | 1, v: string) => {
    if (!editing) return;
    const poly = editing.polygon.map((p, j) => (j === i ? ((k === 0 ? [Number(v), p[1]] : [p[0], Number(v)]) as [number, number]) : p));
    setEditing({ ...editing, polygon: poly });
  };
  return (
    <Section title="Sectores y límites" subtitle="Los límites definen a qué sector pertenece cada reporte. También se controla aquí la autorización de zona (los equipos de rescate liberan la zona)." actions={<Button onClick={() => setEditing({ ...EMPTY })}>Nuevo sector</Button>}>
      {q.isLoading && <Spinner />}
      {q.data && <MapView sectors={q.data.map((s) => ({ id: s.id, name: s.name, polygon: s.polygon, authorized: s.authorized, label: `${s.name}${s.authorized ? '' : ' · zona pendiente'}` }))} height={260} className="mb-4" />}
      <ul className="grid md:grid-cols-2 gap-3">
        {(q.data || []).map((s) => (
          <li key={s.id}>
            <Card
              title={
                <span>
                  {s.name} {s.provisional && <Provisional />}
                </span>
              }
              subtitle={s.parish}
              actions={
                <Button variant="ghost" size="sm" onClick={() => setEditing({ id: s.id, name: s.name, parish: s.parish, polygon: s.polygon, authorized: s.authorized, provisional: !!s.provisional })}>
                  Editar
                </Button>
              }
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={s.authorized ? 'ok' : 'bad'}>{s.authorized ? 'Zona autorizada' : 'Zona pendiente de autorización'}</Badge>
                <span className="text-xs text-muted">{s.polygon.length} vértices</span>
              </div>
            </Card>
          </li>
        ))}
      </ul>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Editar sector' : 'Nuevo sector'} wide>
        {editing && (
          <div>
            <div className="grid sm:grid-cols-2 sm:gap-3">
              <Field label="Nombre" required>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </Field>
              <Field label="Parroquia">
                <Input value={editing.parish} onChange={(e) => setEditing({ ...editing, parish: e.target.value })} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-4 mb-3 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={editing.authorized} onChange={(e) => setEditing({ ...editing, authorized: e.target.checked })} /> Zona autorizada por los equipos de rescate
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={editing.provisional} onChange={(e) => setEditing({ ...editing, provisional: e.target.checked })} /> Límite provisional
              </label>
            </div>
            <p className="text-xs text-muted mb-2">Toca el mapa para añadir vértices del polígono (mínimo tres), o edita las coordenadas en la tabla.</p>
            <MapView sectors={editing.polygon.length >= 3 ? [{ id: 'draft', name: editing.name || 'Nuevo sector', polygon: editing.polygon, color: 'var(--accent)' }] : []} points={editing.polygon.map((p, i) => ({ id: `v${i}`, lat: p[0], lng: p[1], radius: 5, color: 'var(--accent)', label: `Vértice ${i + 1}` }))} onClick={(p) => setEditing({ ...editing, polygon: [...editing.polygon, [p.lat, p.lng]] })} height={240} fitSectors={editing.polygon.length >= 3} />
            <table className="table-plain mt-3">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Latitud</th>
                  <th scope="col">Longitud</th>
                  <th scope="col"></th>
                </tr>
              </thead>
              <tbody>
                {editing.polygon.map((p, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>
                      <input className="input !min-h-[36px] !py-1" type="number" step="0.00001" value={p[0]} onChange={(e) => setPoint(i, 0, e.target.value)} aria-label={`Latitud del vértice ${i + 1}`} />
                    </td>
                    <td>
                      <input className="input !min-h-[36px] !py-1" type="number" step="0.00001" value={p[1]} onChange={(e) => setPoint(i, 1, e.target.value)} aria-label={`Longitud del vértice ${i + 1}`} />
                    </td>
                    <td>
                      <Button variant="ghost" size="sm" onClick={() => setEditing({ ...editing, polygon: editing.polygon.filter((_, j) => j !== i) })} aria-label={`Quitar vértice ${i + 1}`}>
                        Quitar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-end gap-2 mt-3">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button onClick={save} disabled={busy || editing.polygon.length < 3 || !editing.name}>
                Guardar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Section>
  );
}
