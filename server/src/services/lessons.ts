import type { Lesson, LessonCompletion } from '@kindra/shared';
import { db } from '../core/db';
import { appendEvent, type Actor } from '../core/events';
import { newId, nowIso } from '../core/ids';
import { badRequest, notFound } from '../core/errors';
import { refreshRecognition } from './points';
import { env } from '../config/env';

export function listLessons(userId?: string | null): (Lesson & { completed: boolean; correct: boolean | null; completedAt: string | null })[] {
  const store = db();
  const completions = userId ? store.filter('lessonCompletions', (c) => c.userId === userId) : [];
  return store
    .list('lessons')
    .sort((a, b) => a.order - b.order)
    .map((l) => {
      const c = completions.find((x) => x.lessonId === l.id);
      return { ...l, completed: !!c, correct: c ? c.correct : null, completedAt: c?.completedAt ?? null };
    });
}

/** Completar una lección: una sola vez por usuario suma puntos (9.1). */
export function completeLesson(lessonId: string, actor: Actor, answerIndex: number): { lesson: Lesson; correct: boolean; alreadyCompleted: boolean; correctAnswer: string } {
  const store = db();
  const lesson = store.get('lessons', lessonId);
  if (!lesson) throw notFound('La lección no existe.');
  if (typeof answerIndex !== 'number' || answerIndex < 0 || answerIndex >= lesson.options.length) throw badRequest('Elige una de las opciones.');
  const correct = answerIndex === lesson.correctIndex;
  const correctAnswer = lesson.options[lesson.correctIndex];
  if (!actor.id) return { lesson, correct, alreadyCompleted: false, correctAnswer };
  const already = store.find('lessonCompletions', (c) => c.userId === actor.id && c.lessonId === lesson.id);
  if (already) return { lesson, correct, alreadyCompleted: true, correctAnswer };
  const completion: LessonCompletion = { id: newId('lc'), userId: actor.id, lessonId: lesson.id, correct, completedAt: nowIso() };
  appendEvent({ type: 'lesson_completed', objectType: 'user', objectId: actor.id, actor, data: { lessonId: lesson.id, correct, completion } });
  refreshRecognition(actor.id);
  return { lesson, correct, alreadyCompleted: false, correctAnswer };
}

/** 10.3 versión de texto corto para radio comunitaria o cartelera, con enlace al tablero del sector. */
export function lessonAsText(lesson: Lesson, sectorId?: string | null): string {
  const link = sectorId ? `${env.publicBaseUrl}/tablero?sector=${sectorId}` : `${env.publicBaseUrl}/tablero`;
  return [
    `${lesson.title.toUpperCase()}`,
    '',
    lesson.content,
    '',
    `Pregunta: ${lesson.question}`,
    ...lesson.options.map((o, i) => `  ${i + 1}. ${o}`),
    `Respuesta: ${lesson.correctIndex + 1}`,
    '',
    lesson.validationStatus === 'pending' ? 'Pendiente de validación técnica.' : '',
    `Cómo va tu sector: ${link}`,
  ]
    .filter((l) => l !== undefined)
    .join('\n');
}
