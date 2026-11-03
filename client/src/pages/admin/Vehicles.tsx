import { useState } from 'react';
import type { Vehicle, VehicleType, Entity } from '@kindra/shared';
import { Card, Button, Field, Input, Select, Badge, Modal, Spinner, Provisional, Tabs, ConfirmButton } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { toast } from '../../lib/toast';
import { Section, useAdminList, useAdminAction } from './shared';

type VehicleRow = Vehicle & { typeName?: string | null; entityName?: string | null };

export default function Vehicles() {
  const [tab, setTab] = useState<'vehicles' | 'types'>('vehicles');
  return (
    <Section title="Vehículos y tipos" subtitle="Tipos con capacidad nominal (valores provisionales hasta recibir los reales) y vehículos con su código QR generado por la plataforma.">
      <Tabs value={tab} onChange={setTab} items={[{ value: 'vehicles', label: 'Vehículos' }, { value: 'types', label: 'Tipos de vehículo' }]} />
      <div className="mt-3">{tab === 'vehicles' ? <VehicleList /> : <TypeList />}</div>
    </Section>
  );
}

function TypeList() {
  const q = useAdminList<VehicleType>('vehicle-types');
  const { post, del, busy } = useAdminAction();
  const [editing, setEditing] = useState<{ id?: string; name: string; capacityM3: number; provisional: boolean } | null>(null);
  const save = async () => {
    if (!editing) return;
    const r = await post('vehicle-types', editing, 'Tipo guardado.');
    if (r) setEditing(null);
  };
  return (
    <div>
      <div className="mb-3">
        <Button onClick={() => setEditing({ name: '', capacityM3: 6, provisional: true })}>Nuevo tipo</Button>
      </div>
      {q.isLoading && <Spinner />}
      <ul className="grid md:grid-cols-3 gap-3">
        {(q.data || []).map((t) => (
          <li key={t.id}>
            <Card title={<span>{t.name} {t.provisional && <Provisional />}</span>} actions={<Button variant="ghost" size="sm" onClick={() => setEditing({ ...t })}>Editar</Button>}>
              <p className="text-2xl font-bold">
                {t.capacityM3} <span className="text-base font-normal text-muted">m³ nominales</span>
              </p>
              <div className="mt-2">
                <ConfirmButton label="Eliminar" variant="secondary" onConfirm={async () => {
                    await del(`vehicle-types/${t.id}`, 'Tipo eliminado.');
                  }}>
                  Se eliminará el tipo {t.name}. Los vehículos que lo usan quedarán sin capacidad conocida.
                </ConfirmButton>
              </div>
            </Card>
          </li>
        ))}
      </ul>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Editar tipo' : 'Nuevo tipo'}>
        {editing && (
          <div>
            <Field label="Nombre" required>
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <Field label="Capacidad nominal (m³)" required>
              <Input type="number" min={0.1} step={0.1} value={editing.capacityM3} onChange={(e) => setEditing({ ...editing, capacityM3: Number(e.target.value) })} />
            </Field>
            <label className="flex items-center gap-2 text-sm mb-4">
              <input type="checkbox" checked={editing.provisional} onChange={(e) => setEditing({ ...editing, provisional: e.target.checked })} /> Valor provisional
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button onClick={save} disabled={busy || !editing.name}>
                Guardar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function VehicleList() {
  const q = useAdminList<VehicleRow>('vehicles');
  const types = useAdminList<VehicleType>('vehicle-types');
  const entities = useAdminList<Entity>('entities');
  const { post, busy } = useAdminAction();
  const [editing, setEditing] = useState<{ id?: string; plate: string; typeId: string; entityId: string; active: boolean } | null>(null);
  const [qr, setQr] = useState<{ v: VehicleRow; svg: string } | null>(null);
  const save = async () => {
    if (!editing) return;
    const r = await post('vehicles', editing, 'Vehículo guardado.');
    if (r) setEditing(null);
  };
  const showQr = async (v: VehicleRow) => {
    try {
      setQr({ v, svg: await api.text(`/admin/vehicles/${v.id}/qr.svg`) });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const download = () => {
    if (!qr) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([qr.svg], { type: 'image/svg+xml' }));
    a.download = `qr-vehiculo-${qr.v.plate}.svg`;
    a.click();
  };
  return (
    <div>
      <div className="mb-3">
        <Button onClick={() => setEditing({ plate: '', typeId: types.data?.[0]?.id || '', entityId: entities.data?.find((e) => e.type === 'removal')?.id || '', active: true })}>Nuevo vehículo</Button>
      </div>
      {q.isLoading && <Spinner />}
      <table className="table-plain">
        <thead>
          <tr>
            <th scope="col">Placa</th>
            <th scope="col">Tipo</th>
            <th scope="col">Entidad o contratista</th>
            <th scope="col">QR</th>
            <th scope="col"></th>
          </tr>
        </thead>
        <tbody>
          {(q.data || []).map((v) => (
            <tr key={v.id}>
              <td className="font-semibold">
                {v.plate} {!v.active && <Badge tone="neutral">inactivo</Badge>}
              </td>
              <td>{v.typeName}</td>
              <td>{v.entityName}</td>
              <td>
                <button type="button" className="text-primary underline text-sm" onClick={() => showQr(v)}>
                  {v.qrCode}
                </button>
              </td>
              <td className="text-right">
                <Button variant="ghost" size="sm" onClick={() => setEditing({ id: v.id, plate: v.plate, typeId: v.typeId, entityId: v.entityId, active: v.active })}>
                  Editar
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Editar vehículo' : 'Nuevo vehículo'}>
        {editing && (
          <div>
            <Field label="Placa" required>
              <Input value={editing.plate} onChange={(e) => setEditing({ ...editing, plate: e.target.value.toUpperCase() })} />
            </Field>
            <Field label="Tipo" required>
              <Select value={editing.typeId} onChange={(e) => setEditing({ ...editing, typeId: e.target.value })}>
                <option value="">Elige un tipo</option>
                {(types.data || []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.capacityM3} m³
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Entidad o contratista" required>
              <Select value={editing.entityId} onChange={(e) => setEditing({ ...editing, entityId: e.target.value })}>
                <option value="">Elige una entidad</option>
                {(entities.data || []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-sm mb-4">
              <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> Vehículo activo
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button onClick={save} disabled={busy || !editing.plate || !editing.typeId || !editing.entityId}>
                Guardar
              </Button>
            </div>
          </div>
        )}
      </Modal>
      <Modal open={!!qr} onClose={() => setQr(null)} title={qr ? `QR del vehículo ${qr.v.plate}` : ''}>
        {qr && (
          <div className="text-center">
            <div className="mx-auto w-64 [&_svg]:w-full [&_svg]:h-full" dangerouslySetInnerHTML={{ __html: qr.svg }} role="img" aria-label={`Código QR ${qr.v.qrCode}`} />
            <p className="font-mono text-sm mt-2">{qr.v.qrCode}</p>
            <p className="text-xs text-muted">Pégalo en el vehículo: el ente de retiro lo escanea al salir y el centro al llegar.</p>
            <div className="mt-3 flex justify-center gap-2">
              <Button variant="secondary" onClick={download}>
                Descargar SVG
              </Button>
              <Button variant="ghost" onClick={() => window.print()}>
                Imprimir
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
