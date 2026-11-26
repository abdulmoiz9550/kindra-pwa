import { useState } from 'react';
import type { Course, Lesson, Role } from '@kindra/shared';
import { ROLE_LABELS } from '@kindra/shared';
import { Select } from '../../components/ui';
import { Card, Button, Field, Input, Textarea, Badge, Modal, Spinner, Provisional } from '../../components/ui';
import { Section, useAdminList, useAdminAction } from './shared';

type Draft = Omit<Lesson, 'id' | 'order'> & { id?: string; order?: number };

const EMPTY: Draft = { title: '', content: '', imageUrl: null, question: '', options: ['', ''], correctIndex: 0, validationStatus: 'pending', provisional: true };

/** 10 / 17: lecciones y su estado de validación técnica. */
export default function Lessons() {
  return (
    <>
      <Courses />
      <LessonList />
    </>
  );
}

const COURSE_ROLES: Role[] = ['citizen', 'monitor', 'coordinator', 'removal', 'driver', 'center', 'processing', 'evaluator', 'supervisor', 'destination', 'entity_admin'];

/** Addendum v4.2, 3.2: cursos de Training con su cuestionario final. Separados de las noticias. */
function Courses() {
  const q = useAdminList<Course>('courses');
  const { post, busy } = useAdminAction();
  const [c, setC] = useState<Course | null>(null);
  const set = (p: Partial<Course>) => setC((x) => ({ ...x!, ...p }));
  return (
    <Section title="Cursos de Training" subtitle="Cada curso agrupa lecciones de 2 a 3 minutos y termina con un cuestionario. Los textos finales los aprueba el equipo Kindra." actions={<Button onClick={() => setC({ id: '', order: (q.data?.length ?? 0) + 1, title: '', description: '', roles: [], quiz: [], validationStatus: 'pending', published: false })}>Nuevo curso</Button>}>
      {q.isLoading && <Spinner />}
      <ul className="space-y-2 mb-6">
        {(q.data || []).map((x) => (
          <li key={x.id}><Card title={`${x.order}. ${x.title}`} subtitle={`${x.roles.length ? x.roles.map((r) => ROLE_LABELS[r]).join(', ') : 'Para todas las personas'} · ${x.quiz.length} preguntas`} actions={<div className="flex gap-1 items-center"><Badge tone={x.validationStatus === 'validated' ? 'ok' : 'warn'}>{x.validationStatus === 'validated' ? 'Aprobado' : 'Pendiente de aprobación'}</Badge>{!x.published && <Badge tone="neutral">Oculto</Badge>}<Button size="sm" variant="ghost" onClick={() => setC(structuredClone(x))}>Editar</Button></div>}><p className="text-sm">{x.description}</p></Card></li>
        ))}
      </ul>
      <Modal open={!!c} onClose={() => setC(null)} title={c?.title || 'Curso'} wide>
        {c && (
          <div>
            <Field label="Identificador (minúsculas, sin espacios)" required><Input value={c.id} disabled={!!q.data?.some((x) => x.id === c.id)} onChange={(e) => set({ id: e.target.value })} /></Field>
            <Field label="Título" required><Input value={c.title} onChange={(e) => set({ title: e.target.value })} /></Field>
            <Field label="Descripción"><Textarea value={c.description} onChange={(e) => set({ description: e.target.value })} /></Field>
            <fieldset className="mb-3"><legend className="label">Para quién (vacío = todas las personas)</legend><div className="flex flex-wrap gap-2">{COURSE_ROLES.map((r) => <button key={r} type="button" aria-pressed={c.roles.includes(r)} className={`chip ${c.roles.includes(r) ? 'chip-active' : ''}`} onClick={() => set({ roles: c.roles.includes(r) ? c.roles.filter((x) => x !== r) : [...c.roles, r] })}>{ROLE_LABELS[r]}</button>)}</div></fieldset>
            <fieldset className="mb-3"><legend className="label">Cuestionario final</legend>
              {c.quiz.map((qq, i) => (
                <div key={i} className="border border-line rounded p-2 mb-2">
                  <Input value={qq.question} placeholder="Pregunta" onChange={(e) => set({ quiz: c.quiz.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)) })} />
                  <Textarea className="mt-1" value={qq.options.join('\n')} placeholder="Una opción por línea" onChange={(e) => set({ quiz: c.quiz.map((x, j) => (j === i ? { ...x, options: e.target.value.split('\n') } : x)) })} />
                  <Field label="Opción correcta (número)"><Input type="number" min={1} value={qq.correctIndex + 1} onChange={(e) => set({ quiz: c.quiz.map((x, j) => (j === i ? { ...x, correctIndex: Math.max(0, Number(e.target.value) - 1) } : x)) })} /></Field>
                  <Button size="sm" variant="ghost" onClick={() => set({ quiz: c.quiz.filter((_, j) => j !== i) })}>Quitar pregunta</Button>
                </div>
              ))}
              <Button size="sm" variant="ghost" onClick={() => set({ quiz: [...c.quiz, { question: '', options: ['', ''], correctIndex: 0 }] })}>Añadir pregunta</Button>
            </fieldset>
            <div className="flex flex-wrap gap-4 text-sm mb-4">
              <label className="flex items-center gap-2"><input type="checkbox" checked={c.validationStatus === 'validated'} onChange={(e) => set({ validationStatus: e.target.checked ? 'validated' : 'pending' })} /> Aprobado por el equipo Kindra</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={c.published} onChange={(e) => set({ published: e.target.checked })} /> Visible</label>
            </div>
            <Button disabled={busy || !/^[a-z0-9_]{3,40}$/.test(c.id) || c.title.trim().length < 3} onClick={async () => { if (await post('courses', { ...c, quiz: c.quiz.map((x) => ({ ...x, options: x.options.map((o) => o.trim()).filter(Boolean) })) }, 'Curso guardado.')) setC(null); }}>Guardar</Button>
          </div>
        )}
      </Modal>
    </Section>
  );
}

function LessonList() {
  const q = useAdminList<Lesson>('lessons');
  const courses = useAdminList<Course>('courses');
  const { post, busy } = useAdminAction();
  const [editing, setEditing] = useState<Draft | null>(null);
  const save = async () => {
    if (!editing) return;
    const r = await post('lessons', editing, 'Lección guardada.');
    if (r) setEditing(null);
  };
  return (
    <Section title="Lecciones" subtitle="Lecciones cortas (2 a 3 minutos) con una pregunta al final. Cada una pertenece a un curso." actions={<Button onClick={() => setEditing({ ...EMPTY })}>Nueva lección</Button>}>
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
            <Field label="Curso">
              <Select value={editing.courseId ?? ''} onChange={(e) => setEditing({ ...editing, courseId: e.target.value || null })}><option value="">Sin curso</option>{(courses.data || []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select>
            </Field>
            <Field label="Video corto (URL, opcional)">
              <Input value={editing.videoUrl || ''} onChange={(e) => setEditing({ ...editing, videoUrl: e.target.value || null })} />
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
