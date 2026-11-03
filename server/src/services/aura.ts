import Anthropic from '@anthropic-ai/sdk';
import type { GeoPoint, Lesson, OriginSize, OriginUrgency, SatisfactionAnswer, Sector } from '@kindra/shared';
import { SIZE_LABELS, URGENCY_LABELS } from '@kindra/shared';
import { db, type AuraSession } from '../core/db';
import { env } from '../config/env';
import { newId, nowIso } from '../core/ids';
import { HttpError } from '../core/errors';
import type { Actor } from '../core/events';
import { pickText } from './notifications';
import { createCitizenReport, getOriginByCode, originStatusView, respondRemovalClosure, answerSatisfaction, addRetakePhoto, listOriginsForReporter, deriveSector } from './origins';
import { valorizationRate } from './batches';
import { sectorProgress } from './dashboard';
import { listLessons, completeLesson } from './lessons';
import { getConfig } from './config';

/**
 * AURA (sección 8). Sin base de datos propia: todo pasa por los mismos servicios que la PWA (3.8).
 * Intención híbrida: reglas por palabras clave (Plan B, siempre activo) y, si hay clave, un modelo
 * de lenguaje que SOLO devuelve la etiqueta de intención. Nunca redacta datos: cada cifra, código,
 * centro o estado se lee de la base y se inserta en los textos editables (8.2).
 */

export type Intent = 'report' | 'status' | 'confirm' | 'dispute' | 'where' | 'safety' | 'learn' | 'progress' | 'greeting' | 'cancel' | 'yes' | 'no' | 'out_of_scope' | 'unknown';

export interface AuraInput {
  sessionId?: string | null;
  text?: string | null;
  photoId?: string | null;
  location?: GeoPoint | null;
  sectorId?: string | null;
  option?: string | null;
  voiceNoteId?: string | null;
  deviceTime?: string | null;
  offlineQueuedAt?: string | null;
  clientKey?: string | null;
}

export interface AuraReply {
  text: string;
  link?: string | null;
  photoUrl?: string | null;
}

export interface QuickReply {
  label: string;
  value: string;
}

export interface AuraResponse {
  session: { id: string; step: string; contextCode: string | null };
  messages: AuraReply[];
  quickReplies: QuickReply[];
  originCode?: string | null;
  intent?: Intent;
}

const CODE_RE = /\b(LG)[\s-]?([A-Z0-9]{4})\b/i;

const RULES: { intent: Intent; re: RegExp }[] = [
  { intent: 'cancel', re: /(?<!\p{L})(cancela|cancelar|olv[ií]dalo|d[eé]jalo as[ií]|mejor no)(?!\p{L})/iu },
  { intent: 'dispute', re: /(sigue ah[ií]|todav[ií]a est[aá]|a[uú]n est[aá]|no lo (han )?retir|no se lo (han )?llev|dijeron que lo retiraron|no lo recogieron|no vinieron)/i },
  { intent: 'confirm', re: /(ya se lo llevaron|ya lo retiraron|lo retiraron|ya lo recogieron|qued[oó] despejado|ya no est[aá]|se lo llevaron|ya pasaron|ya vinieron)/i },
  { intent: 'where', re: /(a ?d[oó]nde (llevan|va|se lleva)|d[oó]nde (termina|queda)|qu[eé] hacen con|en qu[eé] se convierte|qu[eé] pasa con (el|los) escombro|para qu[eé] sirve)/i },
  { intent: 'safety', re: /(peligro|riesgo|seguro|t[oó]xico|asbesto|polvo|me puedo acercar|es malo)/i },
  { intent: 'progress', re: /(c[oó]mo va (mi|el) sector|avance del sector|cu[aá]ntos (puntos|reportes)|mapa)/i },
  { intent: 'learn', re: /(lecci[oó]n|aprender|cu[eé]ntame|expl[ií]came|ense[ñn]ame|quiero saber m[aá]s)/i },
  { intent: 'status', re: /(qu[eé] pas[oó] con|c[oó]mo va|estado de|mi reporte|consultar|revisar|novedad|seguimiento|en qu[eé] est[aá])/i },
  { intent: 'report', re: /(hay (un )?(mont[oó]n|escombro|pila)|escombro[s]? (frente|en|al)|quiero (reportar|avisar)|reportar|avisar|denunciar|hay escombro|tengo escombro|un escombro)/i },
  { intent: 'greeting', re: /^(hola|buenas|buenos d[ií]as|buenas tardes|buenas noches|hey|epa|saludos)[\s!.,]*$/i },
  { intent: 'out_of_scope', re: /(?<!\p{L})(luz|electricidad|agua potable|tuber[ií]a|basura dom[eé]stica|pago|dinero|bono|cedula|c[eé]dula|pasaporte|gas|internet)(?!\p{L})/iu },
];

const SIZE_RULES: { value: OriginSize; re: RegExp }[] = [
  { value: 'small', re: /(carretilla|peque|poco|chico|1)/i },
  { value: 'large', re: /(m[aá]s que eso|grande|mucho|enorme|cami[oó]n|3)/i },
  { value: 'medium', re: /(camioneta|mediano|regular|2)/i },
];
const URGENCY_RULES: { value: OriginUrgency; re: RegExp }[] = [
  { value: 'blocks_access', re: /(tapa|entrada|bloquea|no (podemos|puedo) (salir|entrar)|1)/i },
  { value: 'risk', re: /(riesgo|peligro|pasa gente|ni[ñn]os|2)/i },
  { value: 'can_wait', re: /(esperar|no es urgente|tranquilo|3)/i },
];
const SATISFACTION_RULES: { value: SatisfactionAnswer; re: RegExp }[] = [
  { value: 'somewhat', re: /(m[aá]s o menos|regular|a medias|2)/i },
  { value: 'no', re: /^\s*(no|nada|3)\b/i },
  { value: 'yes', re: /^\s*(s[ií]|claro|por supuesto|1)\b/i },
];

export function detectIntentByRules(text: string): Intent {
  const t = text.trim();
  if (!t) return 'unknown';
  if (/^[1-5]$/.test(t)) return (['report', 'status', 'where', 'learn', 'safety'] as Intent[])[Number(t) - 1];
  if (CODE_RE.test(t) && t.replace(CODE_RE, '').trim().length < 12) return 'status';
  if (/^\s*(s[ií]|dale|ok|claro|va|de acuerdo)(?!\p{L})/iu.test(t) && t.length < 12) return 'yes';
  if (/^\s*(no|ahora no|luego|despu[eé]s|ninguna)(?!\p{L})/iu.test(t) && t.length < 12) return 'no';
  for (const r of RULES) if (r.re.test(t)) return r.intent;
  return 'unknown';
}

let anthropic: Anthropic | null = null;
function llm(): Anthropic | null {
  if (!env.anthropicApiKey) return null;
  if (!anthropic) anthropic = new Anthropic({ apiKey: env.anthropicApiKey });
  return anthropic;
}

const INTENTS: Intent[] = ['report', 'status', 'confirm', 'dispute', 'where', 'safety', 'learn', 'progress', 'greeting', 'cancel', 'yes', 'no', 'out_of_scope', 'unknown'];

/** Clasificación de intención con modelo de lenguaje. Devuelve solo una etiqueta; si falla, Plan B. */
async function detectIntent(text: string, step: string): Promise<Intent> {
  const ruleIntent = detectIntentByRules(text);
  const client = llm();
  if (!client || ruleIntent !== 'unknown') return ruleIntent;
  try {
    const response = await client.messages.create({
      model: env.auraModel,
      max_tokens: 64,
      output_config: { effort: 'low' },
      system:
        'Clasificas mensajes en español de ciudadanos de La Guaira (Venezuela) que hablan con la asistente del retiro de escombros tras un terremoto. ' +
        'Responde únicamente con una de estas etiquetas, sin explicación: ' + INTENTS.join(', ') + '. ' +
        'report = quiere avisar de escombro; status = pregunta cómo va un reporte; confirm = dice que ya lo retiraron; dispute = dice que no lo retiraron; ' +
        'where = pregunta a dónde va o en qué se convierte; safety = pregunta si es peligroso; learn = quiere aprender; progress = pregunta por el avance del sector; ' +
        'greeting = saludo; cancel = quiere cancelar; yes/no = respuestas cortas; out_of_scope = otro servicio público; unknown = no está claro.',
      messages: [{ role: 'user', content: `Paso actual de la conversación: ${step}\nMensaje: ${text}` }],
    });
    if (response.stop_reason === 'refusal') return ruleIntent;
    const out = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join(' ')
      .trim()
      .toLowerCase();
    const found = INTENTS.find((i) => out === i || out.startsWith(i));
    return found || ruleIntent;
  } catch (err) {
    if (err instanceof Anthropic.APIError) console.warn('[aura] clasificación por modelo no disponible:', err.status, err.message);
    else console.warn('[aura] clasificación por modelo falló:', (err as Error).message);
    return ruleIntent;
  }
}

// ---------------------------------------------------------------- sesión

export function getOrCreateSession(id: string | null | undefined, userId: string | null): { session: AuraSession; created: boolean } {
  const store = db();
  const existing = id ? store.get('auraSessions', id) : undefined;
  if (existing) {
    if (userId && !existing.userId) store.update('auraSessions', existing.id, { userId });
    return { session: store.get('auraSessions', existing.id)!, created: false };
  }
  const session: AuraSession = { id: newId('as'), userId, step: 'idle', draft: {}, contextCode: null, name: null, createdAt: nowIso(), updatedAt: nowIso(), lastVariant: {}, history: [] };
  store.put('auraSessions', session);
  return { session, created: true };
}

function save(session: AuraSession, patch: Partial<AuraSession>): AuraSession {
  return db().update('auraSessions', session.id, { ...patch, updatedAt: nowIso() });
}

const sizeReplies: QuickReply[] = [
  { label: 'Cabe en una carretilla', value: 'small' },
  { label: 'Llenaría una camioneta', value: 'medium' },
  { label: 'Más que eso', value: 'large' },
];
const urgencyReplies: QuickReply[] = [
  { label: 'Tapa la entrada de una casa', value: 'blocks_access' },
  { label: 'Es un riesgo para quien pasa', value: 'risk' },
  { label: 'Puede esperar', value: 'can_wait' },
];
const yesNo: QuickReply[] = [
  { label: 'Sí', value: 'sí' },
  { label: 'Ahora no', value: 'no' },
];
const satisfactionReplies: QuickReply[] = [
  { label: 'Sí', value: 'yes' },
  { label: 'Más o menos', value: 'somewhat' },
  { label: 'No', value: 'no' },
];
const mainMenu: QuickReply[] = [
  { label: '1. Avisar de un escombro', value: '1' },
  { label: '2. Cómo va mi reporte', value: '2' },
  { label: '3. A dónde va el escombro', value: '3' },
  { label: '4. Aprender', value: '4' },
  { label: '5. Seguridad', value: '5' },
];

function sectorReplies(): QuickReply[] {
  return db().list('sectors').map((s) => ({ label: s.name, value: `sector:${s.id}` }));
}

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchSectorByName(text: string): Sector | undefined {
  const t = ` ${normalizeText(text)} `;
  return db().find('sectors', (s) => {
    const full = normalizeText(s.name);
    const short = full.replace(/^sector\s+/, '');
    return (full.length >= 2 && t.includes(` ${full} `)) || (short.length >= 2 && t.includes(` sector ${short} `));
  });
}

function centerForSector(sectorId: string) {
  const store = db();
  const counts = new Map<string, number>();
  for (const t of store.list('trips')) {
    if (t.originIds.some((id) => store.get('origins', id)?.sectorId === sectorId)) counts.set(t.centerId, (counts.get(t.centerId) || 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return (best && store.get('centers', best)) || store.find('centers', (c) => c.sectorId === sectorId) || store.find('centers', (c) => c.type === 'CDT');
}

// ---------------------------------------------------------------- motor

export async function handleMessage(input: AuraInput, actor: Actor): Promise<AuraResponse> {
  const store = db();
  const { session: s0, created } = getOrCreateSession(input.sessionId, actor.id);
  let session = s0;
  const rk = session.id;
  const text = (input.text || '').trim();
  const option = (input.option || '').trim();
  const effectiveText = option || text;
  const messages: AuraReply[] = [];
  let quickReplies: QuickReply[] = [];
  let originCode: string | null | undefined;
  let intent: Intent = 'unknown';
  const say = (t: string, link?: string | null) => messages.push({ text: t, link: link ?? null });
  const T = (key: string, vars: Record<string, string | number | null | undefined> = {}) => pickText(key, vars, rk);
  const user = actor.id ? store.get('users', actor.id) : undefined;

  if (text || input.photoId || input.location) {
    session.history.push({ role: 'user', text: text || (input.photoId ? '[foto]' : '[ubicación]'), at: nowIso(), photoUrl: input.photoId ? store.get('photos', input.photoId)?.url ?? null : null });
  }

  const finish = (patch: Partial<AuraSession> = {}): AuraResponse => {
    for (const m of messages) session.history.push({ role: 'aura', text: m.text, at: nowIso() });
    session = save(session, { ...patch, history: session.history.slice(-200) });
    return { session: { id: session.id, step: session.step, contextCode: session.contextCode ?? null }, messages, quickReplies, originCode, intent };
  };

  // Primer contacto (8.5): se identifica como asistente virtual.
  if (created && !effectiveText && !input.photoId && !input.location) {
    say(T('first_contact'));
    quickReplies = mainMenu;
    return finish();
  }

  // ---- pasos de captura de reporte (16.2: mismos pasos que la PWA) ----
  const step = session.step;
  if (step.startsWith('report_') || step === 'await_retake_photo') {
    const cancelIntent = effectiveText ? detectIntentByRules(effectiveText) : 'unknown';
    if (cancelIntent === 'cancel') {
      say(T('report_cancelled'));
      quickReplies = mainMenu;
      return finish({ step: 'idle', draft: {} });
    }
    const draft = { ...session.draft } as Record<string, any>;
    if (input.voiceNoteId) draft.voiceNoteId = input.voiceNoteId;

    if (step === 'report_photo') {
      if (!input.photoId) {
        say(T('need_photo'));
        return finish({ draft });
      }
      draft.photoIds = [...(draft.photoIds || []), input.photoId];
      say(T('after_photo'));
      quickReplies = sectorReplies();
      return finish({ step: 'report_location', draft });
    }
    if (step === 'report_location') {
      if (input.photoId) draft.photoIds = [...(draft.photoIds || []), input.photoId];
      let sector: Sector | undefined;
      if (input.location) {
        sector = deriveSector(input.location);
        if (sector) {
          draft.location = input.location;
          draft.sectorId = sector.id;
        }
      } else if (option.startsWith('sector:')) {
        sector = store.get('sectors', option.slice(7));
        if (sector) draft.sectorId = sector.id;
      } else if (text) {
        sector = (input.sectorId && store.get('sectors', input.sectorId)) || matchSectorByName(text);
        if (sector) {
          draft.sectorId = sector.id;
          draft.street = text;
        } else if (draft.sectorId) {
          draft.street = text;
          sector = store.get('sectors', draft.sectorId);
        }
      }
      if (!sector) {
        say(T('ask_location_again'));
        quickReplies = sectorReplies();
        return finish({ draft });
      }
      if (!draft.location && !draft.street) {
        // eligió sector de la lista: pedir referencia
        say(T('after_photo'));
        return finish({ step: 'report_location', draft });
      }
      say(T('ask_size'));
      quickReplies = sizeReplies;
      return finish({ step: 'report_size', draft });
    }
    if (step === 'report_size') {
      const size = (['small', 'medium', 'large'].includes(option) ? option : SIZE_RULES.find((r) => r.re.test(text))?.value) as OriginSize | undefined;
      if (!size) {
        say(T('ask_size'));
        quickReplies = sizeReplies;
        return finish({ draft });
      }
      draft.size = size;
      say(T('ask_urgency'));
      quickReplies = urgencyReplies;
      return finish({ step: 'report_urgency', draft });
    }
    if (step === 'report_urgency') {
      const urgency = (['blocks_access', 'risk', 'can_wait'].includes(option) ? option : URGENCY_RULES.find((r) => r.re.test(text))?.value) as OriginUrgency | undefined;
      if (!urgency) {
        say(T('ask_urgency'));
        quickReplies = urgencyReplies;
        return finish({ draft });
      }
      draft.urgency = urgency;
      if (user) {
        draft.reporterName = user.name || user.alias;
        return submitReport(draft);
      }
      say(T('ask_name'));
      quickReplies = [{ label: 'Sin nombre', value: 'sin nombre' }];
      return finish({ step: 'report_name', draft });
    }
    if (step === 'report_name') {
      const noName = /sin nombre|an[oó]nimo|prefiero no/i.test(effectiveText);
      draft.reporterName = noName ? null : effectiveText.slice(0, 60);
      return submitReport(draft);
    }
    if (step === 'await_retake_photo') {
      if (!input.photoId) {
        say(T('unreadable_photo'));
        return finish();
      }
      try {
        const r = addRetakePhoto(session.contextCode!, input.photoId, { userId: actor.id });
        if (r.origin.photoRetakeRequested) {
          say(r.text);
          return finish();
        }
        if (r.manualReview) say(r.text);
        else say(T('noted'));
      } catch (err) {
        say((err as Error).message);
      }
      say(T('lesson_invitation'));
      quickReplies = yesNo;
      return finish({ step: 'lesson_offer' });
    }
  }

  // ---- pasos de espera de datos cortos ----
  if (step === 'await_code' || step === 'await_confirm_code' || step === 'await_dispute_code') {
    const m = CODE_RE.exec(effectiveText);
    if (!m) {
      const i = detectIntentByRules(effectiveText);
      if (i !== 'unknown' && i !== 'status') return dispatch(i);
      say(T('ask_code'));
      return finish();
    }
    const code = `LG-${m[2].toUpperCase()}`;
    if (step === 'await_confirm_code') return doConfirm(code);
    if (step === 'await_dispute_code') return doDispute(code);
    return doStatus(code);
  }
  if (step === 'await_removal_answer') {
    const i = detectIntentByRules(effectiveText);
    if (i === 'yes' || i === 'confirm' || option === 'confirmed') return doConfirm(session.contextCode!);
    if (i === 'no' || i === 'dispute' || option === 'disputed') return doDispute(session.contextCode!);
    if (i !== 'unknown') return dispatch(i);
    say(T('first_closure', { código: session.contextCode, centro: contextCenter() }));
    quickReplies = removalReplies();
    return finish();
  }
  if (step === 'await_satisfaction') {
    const ans = (['yes', 'somewhat', 'no'].includes(option) ? option : SATISFACTION_RULES.find((r) => r.re.test(text))?.value) as SatisfactionAnswer | undefined;
    if (!ans) {
      const i = detectIntentByRules(effectiveText);
      if (i !== 'unknown' && i !== 'yes' && i !== 'no') return dispatch(i);
      say(T('satisfaction_question'));
      quickReplies = satisfactionReplies;
      return finish();
    }
    try {
      const r = answerSatisfaction(session.contextCode!, ans, { userId: actor.id }, null, input.deviceTime);
      say(r.text);
    } catch (err) {
      say(errText(err));
    }
    quickReplies = mainMenu;
    return finish({ step: 'idle' });
  }
  if (step === 'lesson_offer') {
    const i = detectIntentByRules(effectiveText);
    if (i === 'yes') return presentLesson(store.list('lessons').sort((a, b) => a.order - b.order)[1]?.id || 'lec_2');
    if (i === 'no') {
      say(T('noted'));
      quickReplies = mainMenu;
      return finish({ step: 'idle' });
    }
    return dispatch(i);
  }
  if (step === 'lesson_pick') {
    const lessons = store.list('lessons').sort((a, b) => a.order - b.order);
    const n = Number(effectiveText.replace(/\D/g, ''));
    if (/ninguna|no/i.test(effectiveText) && !n) {
      say(T('noted'));
      quickReplies = mainMenu;
      return finish({ step: 'idle' });
    }
    const l = lessons[n - 1] || lessons.find((x) => effectiveText.toLowerCase().includes(x.title.toLowerCase().slice(0, 12)));
    if (!l) {
      say(T('lesson_offer_list'));
      quickReplies = lessons.map((x, i) => ({ label: `${i + 1}. ${x.title}`, value: String(i + 1) }));
      return finish();
    }
    return presentLesson(l.id);
  }
  if (step === 'lesson_answer') {
    const lesson = store.get('lessons', session.draft.lessonId as string);
    const n = Number(effectiveText.replace(/\D/g, ''));
    if (!lesson || !n || n < 1 || n > lesson.options.length) {
      const i = detectIntentByRules(effectiveText);
      if (i !== 'unknown' && i !== 'yes' && i !== 'no') return dispatch(i);
      if (lesson) {
        say(lesson.question);
        quickReplies = lesson.options.map((o, i2) => ({ label: `${i2 + 1}. ${o}`, value: String(i2 + 1) }));
      }
      return finish();
    }
    const r = completeLesson(lesson.id, actor, n - 1);
    if (r.alreadyCompleted) say(T('lesson_done_already'));
    else say(r.correct ? T(actor.id ? 'lesson_correct' : 'lesson_correct_nopoints') : T('lesson_incorrect', { respuesta: r.correctAnswer }));
    quickReplies = mainMenu;
    return finish({ step: 'idle', draft: {} });
  }
  if (step === 'await_sector') {
    const sector = option.startsWith('sector:') ? store.get('sectors', option.slice(7)) : matchSectorByName(effectiveText);
    if (!sector) {
      say(T('which_sector'));
      quickReplies = sectorReplies();
      return finish();
    }
    const pending = (session.draft.pendingIntent as Intent) || 'where';
    session = save(session, { step: 'idle', draft: {} });
    return pending === 'progress' ? doProgress(sector) : doWhere(sector);
  }

  // ---- idle: detectar intención ----
  if (input.photoId && !effectiveText) {
    // foto suelta: iniciar reporte con esa foto
    say(T('report_start'));
    say(T('after_photo'));
    quickReplies = sectorReplies();
    return finish({ step: 'report_location', draft: { photoIds: [input.photoId] } });
  }
  intent = await detectIntent(effectiveText, step);
  return dispatch(intent);

  // ---------------------------------------------------------------- acciones

  function dispatch(i: Intent): AuraResponse {
    intent = i;
    switch (i) {
      case 'report':
        say(T('report_start'));
        return finish({ step: 'report_photo', draft: {} });
      case 'status': {
        const m = CODE_RE.exec(effectiveText);
        if (m) return doStatus(`LG-${m[2].toUpperCase()}`);
        if (session.contextCode) return doStatus(session.contextCode);
        if (user) {
          const mine = listOriginsForReporter(user.id);
          if (mine.length === 1) return doStatus(mine[0].code);
          if (mine.length > 1) {
            say(T('ask_code'));
            quickReplies = mine.slice(0, 5).map((o) => ({ label: o.code, value: o.code }));
            return finish({ step: 'await_code' });
          }
        }
        say(T('ask_code'));
        return finish({ step: 'await_code' });
      }
      case 'confirm': {
        const m = CODE_RE.exec(effectiveText);
        if (m) return doConfirm(`LG-${m[2].toUpperCase()}`);
        if (session.contextCode) return doConfirm(session.contextCode);
        say(T('confirm_removal_which'));
        return finish({ step: 'await_confirm_code' });
      }
      case 'dispute': {
        const m = CODE_RE.exec(effectiveText);
        if (m) return doDispute(`LG-${m[2].toUpperCase()}`);
        if (session.contextCode) return doDispute(session.contextCode);
        say(T('ask_code'));
        return finish({ step: 'await_dispute_code' });
      }
      case 'where':
      case 'progress': {
        const sector = resolveSector();
        if (!sector) {
          say(T('which_sector'));
          quickReplies = sectorReplies();
          return finish({ step: 'await_sector', draft: { pendingIntent: i } });
        }
        return i === 'where' ? doWhere(sector) : doProgress(sector);
      }
      case 'safety':
        say(T('safety'));
        quickReplies = mainMenu;
        return finish({ step: 'idle' });
      case 'learn': {
        const lessons = store.list('lessons').sort((a, b) => a.order - b.order);
        say(T('lesson_offer_list'));
        quickReplies = lessons.map((x, idx) => ({ label: `${idx + 1}. ${x.title}`, value: String(idx + 1) }));
        return finish({ step: 'lesson_pick' });
      }
      case 'greeting':
        say(T(created ? 'first_contact' : 'menu_hint'));
        quickReplies = mainMenu;
        return finish({ step: 'idle' });
      case 'cancel':
        say(T('report_cancelled'));
        quickReplies = mainMenu;
        return finish({ step: 'idle', draft: {} });
      case 'yes':
      case 'no':
        say(T('menu_hint'));
        quickReplies = mainMenu;
        return finish({ step: 'idle' });
      case 'out_of_scope': {
        const canal = getConfig().complaintChannelUrl || 'el canal oficial de atención de tu municipio';
        say(T('out_of_scope', { canal }));
        quickReplies = mainMenu;
        return finish({ step: 'idle' });
      }
      default:
        say(T('not_understood'));
        quickReplies = mainMenu;
        return finish({ step: 'idle' });
    }
  }

  function resolveSector(): Sector | undefined {
    const byName = matchSectorByName(effectiveText);
    if (byName) return byName;
    if (input.sectorId) return store.get('sectors', input.sectorId);
    if (session.contextCode) {
      const o = getOriginByCode(session.contextCode);
      if (o) return store.get('sectors', o.sectorId);
    }
    if (user?.sectorId) return store.get('sectors', user.sectorId);
    return undefined;
  }

  function contextCenter(): string {
    const o = session.contextCode ? getOriginByCode(session.contextCode) : undefined;
    return o ? originStatusView(o).center : 'centro de disposición';
  }

  function removalReplies(): QuickReply[] {
    return [
      { label: 'Sí, quedó despejado', value: 'confirmed' },
      { label: 'No, sigue ahí', value: 'disputed' },
    ];
  }

  function submitReport(draft: Record<string, any>): AuraResponse {
    try {
      const r = createCitizenReport(
        {
          photoIds: draft.photoIds || [],
          location: draft.location ?? null,
          street: draft.street ?? null,
          sectorId: draft.sectorId ?? null,
          size: draft.size,
          urgency: draft.urgency ?? null,
          voiceNoteId: draft.voiceNoteId ?? null,
          reporterName: draft.reporterName ?? null,
          anonymous: !actor.id,
          source: 'aura',
          deviceTime: input.deviceTime,
          offlineQueuedAt: input.offlineQueuedAt,
          clientKey: input.clientKey ?? null,
        },
        actor,
      );
      originCode = r.origin.code;
      const nombre = draft.reporterName || 'vecino';
      say(T('report_confirmed', { nombre, código: r.origin.code }), `/reporte/${r.origin.code}`);
      if (r.zonePending) say(T('zone_not_cleared'));
      if (r.possibleDuplicate) say(T('possible_duplicate', { código: r.origin.code }));
      if (r.photoUnreadable) {
        say(T('unreadable_photo'));
        return finish({ step: 'await_retake_photo', draft: {}, contextCode: r.origin.code, name: draft.reporterName ?? null });
      }
      say(T('lesson_invitation'));
      quickReplies = yesNo;
      return finish({ step: 'lesson_offer', draft: {}, contextCode: r.origin.code, name: draft.reporterName ?? null });
    } catch (err) {
      const e = err as HttpError;
      if (e.code === 'daily_limit') say(T('daily_limit'));
      else if (e.code === 'sector_unknown' || e.code === 'need_location') {
        say(T('ask_location_again'));
        quickReplies = sectorReplies();
        return finish({ step: 'report_location', draft });
      } else if (e.code === 'need_photo') {
        say(T('need_photo'));
        return finish({ step: 'report_photo', draft });
      } else say(errText(err));
      quickReplies = mainMenu;
      return finish({ step: 'idle', draft: {} });
    }
  }

  function doStatus(code: string): AuraResponse {
    const o = getOriginByCode(code);
    if (!o) {
      say(T('code_not_found', { código: code }));
      return finish({ step: 'idle' });
    }
    originCode = o.code;
    const v = originStatusView(o);
    say(T(v.auraKey, v.vars), `/reporte/${o.code}`);
    if (v.pendingRemovalConfirmation) {
      say(T('first_closure', { código: o.code, centro: v.center }));
      quickReplies = removalReplies();
      return finish({ step: 'await_removal_answer', contextCode: o.code });
    }
    if (v.pendingSatisfaction) {
      say(T('satisfaction_question'));
      quickReplies = satisfactionReplies;
      return finish({ step: 'await_satisfaction', contextCode: o.code });
    }
    quickReplies = mainMenu;
    return finish({ step: 'idle', contextCode: o.code });
  }

  function doConfirm(code: string): AuraResponse {
    const o = getOriginByCode(code);
    if (!o) {
      say(T('code_not_found', { código: code }));
      return finish({ step: 'idle' });
    }
    originCode = o.code;
    try {
      const r = respondRemovalClosure(o.code, 'confirmed', { userId: actor.id, byCode: !actor.id }, null, input.deviceTime);
      say(r.text);
    } catch (err) {
      const e = err as HttpError;
      if (e.code === 'nothing_to_confirm') say(T('nothing_to_confirm', { código: o.code }));
      else say(errText(err));
    }
    quickReplies = mainMenu;
    return finish({ step: 'idle', contextCode: o.code });
  }

  function doDispute(code: string): AuraResponse {
    const o = getOriginByCode(code);
    if (!o) {
      say(T('code_not_found', { código: code }));
      return finish({ step: 'idle' });
    }
    originCode = o.code;
    try {
      const r = respondRemovalClosure(o.code, 'disputed', { userId: actor.id, byCode: !actor.id }, text && text !== option ? text : null, input.deviceTime);
      say(r.text);
    } catch (err) {
      const e = err as HttpError;
      if (e.code === 'anonymous_cannot_dispute') say(T('anonymous_cannot_dispute', { código: o.code }));
      else if (e.code === 'nothing_to_confirm') say(T('nothing_to_confirm', { código: o.code }));
      else say(errText(err));
    }
    quickReplies = mainMenu;
    return finish({ step: 'idle', contextCode: o.code });
  }

  function doWhere(sector: Sector): AuraResponse {
    const center = centerForSector(sector.id);
    if (!center) {
      say(T('where_debris_goes_no_data', { sector: sector.name, centro: 'centro de disposición' }));
      return finish({ step: 'idle' });
    }
    const batches = store.filter('batches', (b) => b.centerId === center.id && !!b.outputs);
    const v = valorizationRate(batches);
    if (v.rate === null) say(T('where_debris_goes_no_data', { sector: sector.name, centro: center.name }));
    else say(T('where_debris_goes', { sector: sector.name, centro: center.name, porcentaje: `${Math.round(v.rate * 100)} %` }), `/tablero?sector=${sector.id}`);
    quickReplies = mainMenu;
    return finish({ step: 'idle' });
  }

  function doProgress(sector: Sector): AuraResponse {
    const p = sectorProgress(sector.id);
    if (!p) {
      say(T('which_sector'));
      quickReplies = sectorReplies();
      return finish({ step: 'await_sector', draft: { pendingIntent: 'progress' } });
    }
    say(T('sector_progress', { sector: sector.name, número: p.total, despejados: p.done, 'en proceso': p.inProgress }), `/tablero?sector=${sector.id}`);
    quickReplies = [{ label: 'Ver el mapa del sector', value: `/tablero?sector=${sector.id}` }, ...mainMenu];
    return finish({ step: 'idle' });
  }

  function presentLesson(lessonId: string): AuraResponse {
    const lesson: Lesson | undefined = store.get('lessons', lessonId);
    if (!lesson) {
      say(T('noted'));
      return finish({ step: 'idle' });
    }
    say(`${lesson.title}${lesson.validationStatus === 'pending' ? ' (pendiente de validación técnica)' : ''}`);
    say(lesson.content);
    say(lesson.question);
    quickReplies = lesson.options.map((o, i) => ({ label: `${i + 1}. ${o}`, value: String(i + 1) }));
    return finish({ step: 'lesson_answer', draft: { lessonId: lesson.id } });
  }
}

function errText(err: unknown): string {
  return err instanceof HttpError ? err.message : 'Algo falló al registrar eso. ¿Me lo repites?';
}

export function sessionView(id: string) {
  const s = db().get('auraSessions', id);
  if (!s) return null;
  return { id: s.id, step: s.step, contextCode: s.contextCode ?? null, history: s.history };
}

export { SIZE_LABELS, URGENCY_LABELS };
