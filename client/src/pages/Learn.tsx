import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, ChevronRight, Download } from 'lucide-react';
import type { Lesson } from '@kindra/shared';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { toast } from '../lib/toast';
import { Alert, Badge, Button, Card, PageTitle, ProgressBar, Spinner } from '../components/ui';

export type LessonItem = Lesson & { completed: boolean; correct: boolean | null; completedAt: string | null };
export interface CourseItem { id: string; title: string; description: string; validationStatus: 'pending' | 'validated'; quiz: { question: string; options: string[] }[]; lessonIds: string[]; lessonCount: number; completedLessons: number; state: 'available' | 'in_progress' | 'completed' }

const STATE: Record<CourseItem['state'], { label: string; tone: 'neutral' | 'warn' | 'ok' }> = { available: { label: 'Disponible', tone: 'neutral' }, in_progress: { label: 'En curso', tone: 'warn' }, completed: { label: 'Completado', tone: 'ok' } };
const OFFLINE_KEY = 'kindra.training.offline';

/** Lecciones y cursos guardados en el teléfono para usarlos sin conexión (addendum v4.2, 3.2). */
export function offlineTraining(): { lessons: LessonItem[]; courses: CourseItem[]; savedAt: string } | null {
  try {
    const raw = localStorage.getItem(OFFLINE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function useTraining() {
  const token = useAuth((s) => s.token);
  const role = useAuth((s) => s.user?.activeRole);
  const lessons = useQuery({ queryKey: ['lessons', token], queryFn: () => api.get<LessonItem[]>('/lessons').catch((e) => { const o = offlineTraining(); if (o) return o.lessons; throw e; }) });
  const courses = useQuery({ queryKey: ['courses', token, role], queryFn: () => api.get<CourseItem[]>('/courses').catch((e) => { const o = offlineTraining(); if (o) return o.courses; throw e; }) });
  return { lessons, courses };
}

/** Training (addendum v4.2, 3.2): cursos cortos con lecciones de 2 a 3 minutos y cuestionario final. */
export default function Learn() {
  const token = useAuth((s) => s.token);
  const { lessons, courses } = useTraining();
  const [saved, setSaved] = useState(() => offlineTraining()?.savedAt ?? null);
  if (lessons.isLoading || courses.isLoading) return <Spinner />;
  if (!courses.data || !lessons.data) return <Alert tone="bad">{errorMessage(courses.error || lessons.error)}</Alert>;
  const byId = new Map(lessons.data.map((l) => [l.id, l]));
  const save = () => {
    try {
      const savedAt = new Date().toISOString();
      localStorage.setItem(OFFLINE_KEY, JSON.stringify({ lessons: lessons.data, courses: courses.data, savedAt }));
      setSaved(savedAt);
      toast.success('Training guardado en este teléfono.');
    } catch {
      toast.error('No se pudo guardar en este teléfono.');
    }
  };
  return (
    <div className="max-w-lg mx-auto">
      <PageTitle title="Training" subtitle="Qué pasa con el escombro, cómo reportarlo con seguridad y por qué importa seguirlo." />
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Button size="sm" variant="secondary" onClick={save}><Download size={16} /> Descargar para usar sin conexión</Button>
        {saved && <span className="text-xs text-muted">Guardado en el teléfono</span>}
      </div>
      {!token && <p className="text-xs text-muted mb-3">Con una cuenta, cada lección y curso completado suma Raíces.</p>}
      <div className="space-y-4">
        {courses.data.map((c) => (
          <Card key={c.id} title={c.title} subtitle={c.description} actions={<Badge tone={STATE[c.state].tone}>{STATE[c.state].label}</Badge>}>
            <ProgressBar value={c.lessonCount ? (c.completedLessons / c.lessonCount) * 100 : 0} label={`${c.completedLessons} de ${c.lessonCount} lecciones`} tone="ok" />
            {c.validationStatus === 'pending' && <p className="text-xs text-muted mt-1">Texto pendiente de aprobación del equipo Kindra.</p>}
            <ol className="space-y-2 mt-3">
              {c.lessonIds.map((id) => byId.get(id)).filter((l): l is LessonItem => !!l).map((l) => (
                <li key={l.id}>
                  <Link to={`/aprende/${l.id}`} className="flex items-center gap-3 rounded border border-line p-2 hover:border-primary">
                    {l.completed ? <CheckCircle2 size={20} className="text-ok shrink-0" aria-label="Completada" /> : <Circle size={20} className="text-muted shrink-0" aria-label="Pendiente" />}
                    <span className="min-w-0 flex-1 text-sm font-medium">{l.title}</span>
                    <ChevronRight size={16} className="text-muted shrink-0" />
                  </Link>
                </li>
              ))}
            </ol>
            {c.quiz.length > 0 && <CourseQuiz c={c} />}
          </Card>
        ))}
      </div>
    </div>
  );
}

function CourseQuiz({ c }: { c: CourseItem }) {
  const token = useAuth((s) => s.token);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState<number[]>(() => c.quiz.map(() => -1));
  const [result, setResult] = useState<{ passed: boolean; correct: boolean[] } | null>(null);
  const [busy, setBusy] = useState(false);
  if (c.state === 'completed') return <p className="text-sm mt-3">Cuestionario aprobado.</p>;
  const ready = c.completedLessons === c.lessonCount;
  if (!open) return <Button size="sm" className="mt-3" disabled={!ready || !token} onClick={() => setOpen(true)}>{!token ? 'Ingresa para hacer el cuestionario' : ready ? 'Cuestionario final' : 'Cuestionario final (completa las lecciones)'}</Button>;
  const send = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ passed: boolean; correct: boolean[] }>(`/courses/${c.id}/quiz`, { answers });
      setResult(r);
      if (r.passed) {
        toast.success('Curso completado.');
        qc.invalidateQueries({ queryKey: ['courses'] });
        qc.invalidateQueries({ queryKey: ['me'] });
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-3 space-y-3">
      {c.quiz.map((q, i) => (
        <fieldset key={i}>
          <legend className="text-sm font-semibold mb-1">{q.question}</legend>
          {q.options.map((o, j) => (
            <label key={j} className="flex items-center gap-2 text-sm py-0.5"><input type="radio" name={`${c.id}-${i}`} checked={answers[i] === j} onChange={() => setAnswers(answers.map((a, k) => (k === i ? j : a)))} /> {o}</label>
          ))}
          {result && <p className={`text-xs ${result.correct[i] ? 'text-ok' : 'text-bad'}`}>{result.correct[i] ? 'Correcta' : 'Revisa esta respuesta'}</p>}
        </fieldset>
      ))}
      <Button size="sm" disabled={busy || answers.some((a) => a < 0)} onClick={send}>Enviar respuestas</Button>
    </div>
  );
}
