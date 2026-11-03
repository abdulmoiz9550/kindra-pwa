import { useState } from 'react';
import type { Lesson } from '@kindra/shared';
import { Card, Button, Field, Input, Textarea, Badge, Modal, Spinner, Provisional } from '../../components/ui';
import { Section, useAdminList, useAdminAction } from './shared';

type Draft = Omit<Lesson, 'id' | 'order'> & { id?: string; order?: number };

const EMPTY: Draft = { title: '', content: '', imageUrl: null, question: '', options: ['', ''], correctIndex: 0, validationStatus: 'pending', provisional: true };

/** 10 / 17: lecciones y su estado de validación técnica. */
export default function Lessons() {
  const q = useAdminList<Lesson>('lessons');
  const { post, busy } = useAdminAction();
  const [editing, setEditing] = useState<Draft | null>(null);
  const save = async () => {
    if (!editing) return;
    const r = await post('lessons', editing, 'Lección guardada.');
    if (r) setEditing(null);
  };
  return (
    <Section title="Lecciones" subtitle="Cinco micro-lecciones de menos de un minuto con una pregunta al final. Las lecciones 3 y 4 muestran la etiqueta de validación técnica pendiente hasta que la marques como validada (10.4)." actions={<Button onClick={() => setEditing({ ...EMPTY })}>Nueva lección</Button>}>
      {q.isLoading && <Spinner />}
      <ul className="space-y-3">
        {(q.data || []).map((l) => (
          <li key={l.id}>
            <Card
              title={
                <span>
                  {l.order}. {l.title} {l.provisional && <Provisional>texto provisional</Provisional>}
                </span>
              }
              actions={
                <div className="flex gap-1">
                  {l.validationStatus === 'pending' && (
                    <Button size="sm" disabled={busy} onClick={() => post(`lessons/${l.id}/validate`, {}, 'Lección validada.')}>
                      Marcar validada
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setEditing({ ...l })}>
                    Editar
                  </Button>
                </div>
              }
            >
              <Badge tone={l.validationStatus === 'validated' ? 'ok' : 'warn'}>{l.validationStatus === 'validated' ? 'Validada técnicamente' : 'Pendiente de validación técnica'}</Badge>
              <p className="text-sm text-ink-2 mt-2">{l.content}</p>
              <p className="text-sm mt-2 font-medium">{l.question}</p>
              <ol className="text-sm list-decimal pl-5">
                {l.options.map((o, i) => (
                  <li key={i} className={i === l.correctIndex ? 'font-semibold text-ok' : ''}>
                    {o}
                  </li>
                ))}
              </ol>
            </Card>
          </li>
        ))}
      </ul>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Editar lección' : 'Nueva lección'} wide>
        {editing && (
          <div>
            <Field label="Título" required>
              <Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            </Field>
            <Field label="Contenido (menos de un minuto de lectura)" required>
              <Textarea value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })} className="min-h-[140px]" />
            </Field>
            <Field label="Imagen (URL, opcional)">
              <Input value={editing.imageUrl || ''} onChange={(e) => setEditing({ ...editing, imageUrl: e.target.value || null })} />
            </Field>
            <Field label="Pregunta" required>
              <Input value={editing.question} onChange={(e) => setEditing({ ...editing, question: e.target.value })} />
            </Field>
            <fieldset className="mb-4">
              <legend className="label">Opciones de respuesta (marca la correcta)</legend>
              {editing.options.map((o, i) => (
                <div key={i} className="flex items-center gap-2 mb-2">
                  <input type="radio" name="correct" checked={editing.correctIndex === i} onChange={() => setEditing({ ...editing, correctIndex: i })} aria-label={`Opción ${i + 1} es la correcta`} />
                  <input className="input !min-h-[40px] !py-1 flex-1" value={o} onChange={(e) => setEditing({ ...editing, options: editing.options.map((x, j) => (j === i ? e.target.value : x)) })} aria-label={`Opción ${i + 1}`} />
                  {editing.options.length > 2 && (
                    <Button variant="ghost" size="sm" onClick={() => setEditing({ ...editing, options: editing.options.filter((_, j) => j !== i), correctIndex: Math.min(editing.correctIndex, editing.options.length - 2) })} aria-label={`Quitar opción ${i + 1}`}>
                      Quitar
                    </Button>
                  )}
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={() => setEditing({ ...editing, options: [...editing.options, ''] })}>
                Añadir opción
              </Button>
            </fieldset>
            <div className="flex flex-wrap gap-4 text-sm mb-4">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={editing.validationStatus === 'validated'} onChange={(e) => setEditing({ ...editing, validationStatus: e.target.checked ? 'validated' : 'pending' })} /> Validada técnicamente
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={editing.provisional} onChange={(e) => setEditing({ ...editing, provisional: e.target.checked })} /> Texto provisional
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button onClick={save} disabled={busy || !editing.title || !editing.content || !editing.question || editing.options.some((o) => !o.trim())}>
                Guardar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Section>
  );
}
