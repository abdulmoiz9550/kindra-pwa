import { useState } from 'react';
import type { Center, Entity, Sector } from '@kindra/shared';
import { Card, Button, Field, Input, Select, Badge, Modal, Spinner } from '../../components/ui';
import { MapView } from '../../components/MapView';
import { Section, useAdminList, useAdminAction } from './shared';

interface Draft {
  id?: string;
  name: string;
  shortCode: string;
  type: 'CDT' | 'CDF';
  sectorId: string;
  entityId: string;
  location: { lat: number; lng: number } | null;
}

const EMPTY: Draft = { name: '', shortCode: '', type: 'CDT', sectorId: '', entityId: '', location: null };

export default function Centers() {
  const q = useAdminList<Center>('centers');
  const entities = useAdminList<Entity>('entities');
  const sectors = useAdminList<Sector>('sectors');
  const { post, busy } = useAdminAction();
  const [editing, setEditing] = useState<Draft | null>(null);
  const save = async () => {
    if (!editing) return;
    const r = await post('centers', { ...editing, shortCode: editing.shortCode || undefined }, 'Centro guardado.');
    if (r) setEditing(null);
  };
  return (
    <Section title="Centros de disposición" subtitle="Centros temporales (CDT) y finales (CDF), su sector y la entidad responsable." actions={<Button onClick={() => setEditing({ ...EMPTY })}>Nuevo centro</Button>}>
      {q.isLoading && <Spinner />}
      <ul className="grid md:grid-cols-2 gap-3">
        {(q.data || []).map((c) => (
          <li key={c.id}>
            <Card
              title={c.name}
              subtitle={`Código corto ${c.shortCode} · ${entities.data?.find((e) => e.id === c.entityId)?.name || ''}`}
              actions={
                <Button variant="ghost" size="sm" onClick={() => setEditing({ id: c.id, name: c.name, shortCode: c.shortCode, type: c.type, sectorId: c.sectorId, entityId: c.entityId, location: c.location ?? null })}>
                  Editar
                </Button>
              }
            >
              <div className="flex flex-wrap gap-1 text-xs">
                <Badge tone={c.type === 'CDT' ? 'primary' : 'neutral'} icon={false}>
                  {c.type === 'CDT' ? 'Disposición temporal' : 'Disposición final'}
                </Badge>
                <span className="text-muted self-center">{sectors.data?.find((s) => s.id === c.sectorId)?.name}</span>
              </div>
            </Card>
          </li>
        ))}
      </ul>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Editar centro' : 'Nuevo centro'} wide>
        {editing && (
          <div>
            <div className="grid sm:grid-cols-2 sm:gap-3">
              <Field label="Nombre genérico" required>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </Field>
              <Field label="Código corto (para el código de lote)" hint="Ej. NORTE">
                <Input value={editing.shortCode} onChange={(e) => setEditing({ ...editing, shortCode: e.target.value.toUpperCase() })} />
              </Field>
              <Field label="Tipo" required>
                <Select value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value as 'CDT' | 'CDF' })}>
                  <option value="CDT">CDT · disposición temporal</option>
                  <option value="CDF">CDF · disposición final</option>
                </Select>
              </Field>
              <Field label="Sector" required>
                <Select value={editing.sectorId} onChange={(e) => setEditing({ ...editing, sectorId: e.target.value })}>
                  <option value="">Elige un sector</option>
                  {(sectors.data || []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Entidad responsable" required>
                <Select value={editing.entityId} onChange={(e) => setEditing({ ...editing, entityId: e.target.value })}>
                  <option value="">Elige una entidad</option>
                  {(entities.data || []).map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <p className="text-xs text-muted mb-2">Toca el mapa para fijar la ubicación del centro.</p>
            <MapView sectors={(sectors.data || []).map((s) => ({ id: s.id, name: s.name, polygon: s.polygon }))} points={editing.location ? [{ id: 'c', lat: editing.location.lat, lng: editing.location.lng, color: 'var(--accent)', label: editing.name || 'Centro' }] : []} onClick={(p) => setEditing({ ...editing, location: p })} height={220} />
            <div className="flex justify-end gap-2 mt-3">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button onClick={save} disabled={busy || !editing.name || !editing.sectorId || !editing.entityId}>
                Guardar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Section>
  );
}
