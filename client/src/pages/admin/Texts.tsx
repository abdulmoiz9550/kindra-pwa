import { useState } from 'react';
import type { AuraTextEntry } from '@kindra/shared';
import { Card, Button, Field, Input, Textarea, Modal, Spinner, Alert, Provisional } from '../../components/ui';
import { usePublicConfig } from '../../lib/config';
import { Section, useAdminList, useAdminAction } from './shared';

/** 8.6: todos los textos de AURA y sus variantes viven aquí; ninguno está escrito en código de pantalla. */
export default function Texts() {
  const q = useAdminList<AuraTextEntry>('texts');
  const { data: cfg } = usePublicConfig();
  const { put, busy } = useAdminAction();
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<AuraTextEntry | null>(null);
  const [error] = useState<string | null>(null);
  const list = (q.data || []).filter((t) => !filter || t.label.toLowerCase().includes(filter.toLowerCase()) || t.key.includes(filter.toLowerCase()) || t.variants.some((v) => v.toLowerCase().includes(filter.toLowerCase())));
  const save = async () => {
    if (!editing) return;
    const r = await put<AuraTextEntry>(`texts/${editing.key}`, { variants: editing.variants, label: editing.label }, 'Texto guardado.');
    if (r) setEditing(null);
  };
  return (
    <Section title={<span>Textos de AURA {cfg?.provisionalFlags?.auraTexts && <Provisional>revisión local pendiente</Provisional>}</span>} subtitle="Cada mensaje tiene al menos tres variantes con el mismo contenido y distinta redacción; se rotan para que nunca suene a grabación (8.3). El servidor rechaza expresiones prohibidas.">
      <Field label="Buscar">
        <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Busca por nombre o por contenido" />
      </Field>
      {q.isLoading && <Spinner />}
      <ul className="space-y-2">
        {list.map((t) => (
          <li key={t.key}>
            <Card
              title={t.label}
              subtitle={<span className="font-mono">{t.key}</span>}
              actions={
                <Button variant="ghost" size="sm" onClick={() => setEditing(structuredClone(t))}>
                  Editar
                </Button>
              }
            >
              <ol className="text-sm space-y-1 list-decimal pl-5">
                {t.variants.map((v, i) => (
                  <li key={i} className="text-ink-2">
                    {v}
                  </li>
                ))}
              </ol>
            </Card>
          </li>
        ))}
      </ul>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? `Editar: ${editing.label}` : ''} wide>
        {editing && (
          <div>
            <Field label="Nombre del momento">
              <Input value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} />
            </Field>
            <p className="text-xs text-muted mb-2">Marcadores disponibles según el mensaje: [nombre], [código], [sector], [centro], [motivo], [cantidad], [tipo de obra], [localidad], [enlace], [nivel], [porcentaje], [número], [despejados], [en proceso], [resultado], [principal], [canal], [días], [respuesta], [alias], [texto].</p>
            {editing.variants.map((v, i) => (
              <Field key={i} label={`Variante ${i + 1}`}>
                <div className="flex gap-2 items-start">
                  <Textarea value={v} onChange={(e) => setEditing({ ...editing, variants: editing.variants.map((x, j) => (j === i ? e.target.value : x)) })} />
                  {editing.variants.length > 3 && (
                    <Button variant="ghost" size="sm" onClick={() => setEditing({ ...editing, variants: editing.variants.filter((_, j) => j !== i) })} aria-label={`Quitar variante ${i + 1}`}>
                      Quitar
                    </Button>
                  )}
                </div>
              </Field>
            ))}
            <Button variant="ghost" size="sm" onClick={() => setEditing({ ...editing, variants: [...editing.variants, ''] })}>
              Añadir variante
            </Button>
            {error && (
              <Alert tone="bad" className="mt-3">
                {error}
              </Alert>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button onClick={save} disabled={busy || editing.variants.filter((v) => v.trim()).length < 3}>
                Guardar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Section>
  );
}
