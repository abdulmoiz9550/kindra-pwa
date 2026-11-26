import type { Course, Lesson, LessonCompletion, Role } from '@kindra/shared';
import { db } from '../core/db';
import { appendEvent, type Actor } from '../core/events';
import { newId, nowIso } from '../core/ids';
import { badRequest, conflict, notFound } from '../core/errors';
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
    lesson.title,
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

export type CourseState = 'available' | 'in_progress' | 'completed';

/** Curso completado: todas sus lecciones y el cuestionario final aprobado. Queda en la bitácora una sola vez. */
export function courseCompleted(userId: string, courseId: string): boolean {
  return db().allEvents().some((e) => e.type === 'lesson_completed' && e.objectId === userId && (e.data as { course?: boolean; courseKey?: string }).course === true && (e.data as { courseKey?: string }).courseKey === courseId);
}

/** Addendum v4.2, 3.2: cursos visibles para el rol activo, con su avance (Disponible, En curso, Completado). */
export function listCourses(userId: string | null, role: Role | null) {
  const store = db();
  const done = new Set(userId ? store.filter('lessonCompletions', (c) => c.userId === userId).map((c) => c.lessonId) : []);
  return store
    .filter('courses', (c) => c.published && (!c.roles.length || (!!role && c.roles.includes(role)) || (!role && c.roles.includes('citizen'))))
    .sort((a, b) => a.order - b.order)
    .map((c) => {
      const lessons = store.filter('lessons', (l) => l.courseId === c.id).sort((a, b) => a.order - b.order);
      const completedLessons = lessons.filter((l) => done.has(l.id)).length;
      const completed = !!userId && courseCompleted(userId, c.id);
      const state: CourseState = completed ? 'completed' : completedLessons > 0 ? 'in_progress' : 'available';
      return { ...c, quiz: c.quiz.map((q) => ({ question: q.question, options: q.options })), lessonIds: lessons.map((l) => l.id), lessonCount: lessons.length, completedLessons, state };
    });
}

/** Cuestionario final: exige todas las lecciones del curso y todas las respuestas correctas. */
export function submitCourseQuiz(courseId: string, actor: Actor, answers: number[]): { passed: boolean; alreadyCompleted: boolean; correct: boolean[] } {
  const store = db();
  const c = store.get('courses', courseId);
  if (!c || !c.published) throw notFound('El curso no existe.');
  if (!actor.id) throw badRequest('Ingresa con tu cuenta para completar el curso.');
  const lessons = store.filter('lessons', (l) => l.courseId === c.id);
  const done = new Set(store.filter('lessonCompletions', (x) => x.userId === actor.id).map((x) => x.lessonId));
  if (lessons.some((l) => !done.has(l.id))) throw conflict('Completa primero todas las lecciones del curso.', 'lessons_pending');
  if (!Array.isArray(answers) || answers.length !== c.quiz.length) throw badRequest('Responde todas las preguntas.');
  const correct = c.quiz.map((q, i) => answers[i] === q.correctIndex);
  const passed = correct.every(Boolean);
  if (courseCompleted(actor.id, c.id)) return { passed, alreadyCompleted: true, correct };
  if (passed) {
    appendEvent({ type: 'lesson_completed', objectType: 'user', objectId: actor.id, actor, data: { course: true, courseKey: c.id, courseTitle: c.title } });
    refreshRecognition(actor.id);
  }
  return { passed, alreadyCompleted: false, correct };
}

export function upsertCourse(input: Omit<Course, 'order'> & { order?: number }): Course {
  const store = db();
  const existing = store.get('courses', input.id);
  const course: Course = { ...input, order: input.order ?? existing?.order ?? store.count('courses') + 1 };
  return store.put('courses', course);
}
