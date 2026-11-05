import { useState } from 'react';
import type { Space } from '@kindra/shared';
import { DEFAULT_SPACE_ID } from '@kindra/shared';
import { Card, Button, Field, Input, Textarea, Badge, Modal, Spinner, KeyValue } from '../../components/ui';
import { Section, useAdminList, useAdminAction } from './shared';

type SpaceRow = Space & { usage: { entities: number; users: number; sectors: number; origins: number } };

interface Draft {
  id?: string;
  name: string;
  description: string;
  agreementRef: string;
  active: boolean;
}

const EMPTY: Draft = { name: '', description: '', agreementRef: '', active: true };

/** 27.1: espacios por convenio. Entidades, usuarios, sectores y registros se vinculan a un espacio. */
export default function Spaces() {
  const q = useAdminList<SpaceRow>('spaces');
  const { post, busy } = useAdminAction();
  const [editing, setEditing] = useState<Draft | null>(null);
  const save = async () => {
    if (!editing) return;
    const r = await post('spaces', { ...editing, agreementRef: editing.agreementRef || null }, 'Espacio guardado.');
    if (r) setEditing(null);
  };
  return (
    <Section
      title="Espacios por convenio"
      subtitle="Cada convenio es un espacio. Las entidades, los usuarios, los sectores y los registros quedan vinculados a uno, para sumar convenios nuevos sin rehacer nada. Asigna el espacio desde Entidades, Usuarios y Sectores."
      actions={<Button onClick={() => setEditing({ ...EMPTY })}>Nuevo espacio</Button>}
    >
      {q.isLoading && <Spinner />}
      <ul className="grid md:grid-cols-2 gap-3">
        {(q.data || []).map((s) => (
          <li key={s.id}>
            <Card
              title={
                <span>
                  {s.name} {s.id === DEFAULT_SPACE_ID && <Badge tone="primary" icon={false}>principal</Badge>} {!s.active && <Badge tone="neutral">inactivo</Badge>}
                </span>
              }
              subtitle={s.agreementRef ? `Convenio: ${s.agreementRef}` : 'Sin referencia de convenio'}
              actions={
                <Button variant="ghost" size="sm" onClick={() => setEditing({ id: s.id, name: s.name, description: s.description, agreementRef: s.agreementRef || '', active: s.active })}>
                  Editar
                </Button>
              }
            >
              {s.description && <p className="text-sm text-ink-2 mb-2">{s.description}</p>}
              <KeyValue
                items={[
                  { k: 'Entidades', v: s.usage.entities },
                  { k: 'Usuarios', v: s.usage.users },
                  { k: 'Sectores', v: s.usage.sectors },
                  { k: 'Registros (orígenes)', v: s.usage.origins },
                ]}
              />
            </Card>
          </li>
        ))}
      </ul>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Editar espacio' : 'Nuevo espacio'}>
        {editing && (
          <div>
            <Field label="Nombre" required>
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <Field label="Referencia del convenio" hint="Número o nombre del documento del convenio.">
              <Input value={editing.agreementRef} onChange={(e) => setEditing({ ...editing, agreementRef: e.target.value })} />
            </Field>
            <Field label="Descripción">
              <Textarea value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </Field>
            {editing.id !== DEFAULT_SPACE_ID && (
              <label className="flex items-center gap-2 text-sm mb-4">
                <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> Espacio activo
              </label>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button onClick={save} disabled={busy || editing.name.trim().length < 2}>
                Guardar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Section>
  );
}
