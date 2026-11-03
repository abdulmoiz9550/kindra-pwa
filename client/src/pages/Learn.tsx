import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Circle, ChevronRight } from 'lucide-react';
import type { Lesson } from '@kindra/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Badge, PageTitle, ProgressBar, Spinner } from '../components/ui';

export type LessonItem = Lesson & { completed: boolean; correct: boolean | null; completedAt: string | null };

/** 10 / 16.11 Sección "Aprende": cinco lecciones de menos de un minuto, con progreso. */
export default function Learn() {
  const token = useAuth((s) => s.token);
  const q = useQuery({ queryKey: ['lessons', token], queryFn: () => api.get<LessonItem[]>('/lessons') });
  const lessons = q.data || [];
  const done = lessons.filter((l) => l.completed).length;
  return (
    <div className="max-w-lg mx-auto">
      <PageTitle title="Aprende" subtitle="Cinco lecciones cortas sobre qué pasa con el escombro. Cada una toma menos de un minuto." />
      {q.isLoading && <Spinner />}
      {lessons.length > 0 && (
        <div className="mb-4">
          <ProgressBar value={(done / lessons.length) * 100} label={`${done} de ${lessons.length} completadas`} tone="ok" />
          {!token && <p className="text-xs text-muted mt-1">Con una cuenta, cada lección completada suma puntos.</p>}
        </div>
      )}
      <ol className="space-y-3">
        {lessons.map((l) => (
          <li key={l.id}>
            <Link to={`/aprende/${l.id}`} className="card flex items-center gap-3 hover:border-primary">
              {l.completed ? <CheckCircle2 size={22} className="text-ok shrink-0" aria-label="Completada" /> : <Circle size={22} className="text-muted shrink-0" aria-label="Pendiente" />}
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {l.order}. {l.title}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {l.validationStatus === 'pending' && <Badge tone="warn">pendiente de validación técnica</Badge>}
                  {l.provisional && <Badge tone="neutral" icon={false}>texto provisional</Badge>}
                </div>
              </div>
              <ChevronRight size={18} className="text-muted shrink-0" />
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
