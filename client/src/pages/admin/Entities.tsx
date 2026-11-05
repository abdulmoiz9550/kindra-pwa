import { useState } from 'react';
import type { Entity, EntityType, PublicationPolicy, PublicationRule, LegalType, Space } from '@kindra/shared';
import { ENTITY_TYPE_LABELS, LEGAL_TYPE_LABELS } from '@kindra/shared';
import { Card, Button, Field, Input, Select, Textarea, Badge, Modal, Spinner } from '../../components/ui';
import { Section, useAdminList, useAdminAction } from './shared';

const DATA_TYPES: { key: keyof PublicationPolicy; label: string }[] = [
  { key: 'officialFigures', label: 'Cifras oficiales' },
  { key: 'discrepancies', label: 'Discrepancias' },
  { key: 'photos', label: 'Fotos' },
  { key: 'observations', label: 'Observaciones' },
];

const EMPTY: Omit<Entity, 'id'> & { id?: string } = {
  name: '',
  type: 'coordinating',
  description: '',
  logoUrl: null,
  active: true,
  publicationPolicy: { officialFigures: { mode: 'public' }, discrepancies: { mode: 'public' }, photos: { mode: 'public' }, observations: { mode: 'public' } },
  legalType: 'public_institution',
  taxId: null,
  spaceId: null,
};

export default function Entities() {
  const q = useAdminList<Entity>('entities');
  const spaces = useAdminList<Space>('spaces');
  const { post, busy } = useAdminAction();
  const [editing, setEditing] = useState<typeof EMPTY | null>(null);
  const save = async () => {
    if (!editing) return;
    const r = await post('entities', editing, 'Entidad guardada.');
    if (r) setEditing(null);
  };
  const setRule = (k: keyof PublicationPolicy, patch: Partial<PublicationRule>) => editing && setEditing({ ...editing, publicationPolicy: { ...editing.publicationPolicy, [k]: { ...editing.publicationPolicy[k], ...patch } } });
  return (
    <Section title="Entidades" subtitle="Personas jurídicas del convenio (instituciones públicas y empresas): nombre, tipo, RIF, espacio, descripción pública, logo y política de publicación por tipo de dato (13.4)." actions={<Button onClick={() => setEditing({ ...EMPTY })}>Nueva entidad</Button>}>
      {q.isLoading && <Spinner />}
      <ul className="grid md:grid-cols-2 gap-3">
        {(q.data || []).map((e) => (
          <li key={e.id}>
            <Card
              title={e.name}
              subtitle={`${ENTITY_TYPE_LABELS[e.type]} · ${LEGAL_TYPE_LABELS[e.legalType || 'public_institution']}${e.taxId ? ` · RIF ${e.taxId}` : ''}`}
              actions={
                <Button variant="ghost" size="sm" onClick={() => setEditing({ ...e })}>
                  Editar
                </Button>
              }
            >
              <p className="text-sm text-ink-2">{e.description}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {!e.active && <Badge tone="neutral">inactiva</Badge>}
                {DATA_TYPES.map((d) => {
                  const r = e.publicationPolicy?.[d.key];
                  return (
                    <Badge key={d.key} tone={r?.mode === 'public' ? 'ok' : r?.mode === 'delayed' ? 'warn' : 'neutral'} icon={false}>
                      {d.label}: {r?.mode === 'public' ? 'público' : r?.mode === 'delayed' ? `con ${r.delayDays ?? 0} días` : 'interno'}
                    </Badge>
                  );
                })}
              </div>
            </Card>
          </li>
        ))}
      </ul>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Editar entidad' : 'Nueva entidad'} wide>
        {editing && (
          <div>
            <Field label="Nombre" required>
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <Field label="Tipo" required>
              <Select value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value as EntityType })}>
                {(Object.keys(ENTITY_TYPE_LABELS) as EntityType[]).map((t) => (
                  <option key={t} value={t}>
                    {ENTITY_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid sm:grid-cols-3 sm:gap-3">
              <Field label="Persona jurídica">
                <Select value={editing.legalType || 'public_institution'} onChange={(e) => setEditing({ ...editing, legalType: e.target.value as LegalType })}>
                  {(Object.keys(LEGAL_TYPE_LABELS) as LegalType[]).map((t) => (
                    <option key={t} value={t}>
                      {LEGAL_TYPE_LABELS[t]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="RIF" hint="Identificador fiscal, si se tiene.">
                <Input value={editing.taxId || ''} onChange={(e) => setEditing({ ...editing, taxId: e.target.value || null })} placeholder="G-00000000-0" />
              </Field>
              <Field label="Espacio (convenio)">
                <Select value={editing.spaceId || ''} onChange={(e) => setEditing({ ...editing, spaceId: e.target.value || null })}>
                  <option value="">Espacio principal</option>
                  {(spaces.data || []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Descripción pública de su papel" required>
              <Textarea value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </Field>
            <Field label="Logo (URL)">
              <Input value={editing.logoUrl || ''} onChange={(e) => setEditing({ ...editing, logoUrl: e.target.value || null })} placeholder="/uploads/… o https://…" />
            </Field>
            <label className="flex items-center gap-2 text-sm mb-4">
              <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> Entidad activa
            </label>
            <fieldset className="mb-4">
              <legend className="label">Política de publicación</legend>
              <p className="text-xs text-muted mb-2">Para cada tipo de dato: público de inmediato, público con retraso de N días, o interno. En la demostración todo es público.</p>
              <div className="space-y-2">
                {DATA_TYPES.map((d) => {
                  const r = editing.publicationPolicy[d.key];
                  return (
                    <div key={d.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 text-sm">
                      <span>{d.label}</span>
                      <select className="input !min-h-[40px] !py-1" value={r.mode} onChange={(e) => setRule(d.key, { mode: e.target.value as PublicationRule['mode'] })} aria-label={`Modo para ${d.label}`}>
                        <option value="public">Público</option>
                        <option value="delayed">Con retraso</option>
                        <option value="internal">Interno</option>
                      </select>
                      <input type="number" min={0} className="input !min-h-[40px] !py-1 w-24" value={r.delayDays ?? 0} disabled={r.mode !== 'delayed'} onChange={(e) => setRule(d.key, { delayDays: Number(e.target.value) })} aria-label={`Días de retraso para ${d.label}`} />
                    </div>
                  );
                })}
              </div>
            </fieldset>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button onClick={save} disabled={busy}>
                Guardar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Section>
  );
}
