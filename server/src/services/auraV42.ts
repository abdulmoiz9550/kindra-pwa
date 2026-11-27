import type { Origin, Sector } from '@kindra/shared';
import { PARISHES, PUBLIC_LOT_STATES } from '@kindra/shared';
import { db, type AuraProfile, type AuraSession } from '../core/db';
import { appendEvent, SYSTEM_ACTOR, type Actor } from '../core/events';
import { newId, nowIso } from '../core/ids';
import { HttpError } from '../core/errors';
import { env } from '../config/env';
import { getConfig } from './config';
import { notifyRole, pickText } from './notifications';
import { createCitizenReport, getOriginByCode, publicLotStage, reportStatus, respondRemovalClosure } from './origins';
import { computePoints } from './points';
import { sectorProgressAll } from './portal';
import { decryptField, encryptField, pseudonym } from './secureField';
import { handleMessage, type AuraInput, type AuraReply, type AuraResponse, type QuickReply } from './aura';

/**
 * AURA v4.2 (addendum, sección 10). Conversa en lugar de recitar menús, reconoce a la persona por su nombre y la
 * recuerda (perfil por número de WhatsApp o por cuenta de la PWA), pide consentimiento antes de guardar nada y nunca
 * inventa datos: estados, códigos, fechas y cifras salen del backend. Lo que no cubre este módulo (lecciones,
 * seguridad, a dónde va el escombro, encuesta final) sigue en el motor anterior con la misma sesión.
 */

export interface Channel {
  kind: 'pwa' | 'whatsapp';
  waId?: string | null;
  profileName?: string | null;
  voice?: boolean;
}

const CONSENT_VERSION = 'v4.2-1';
const CODE_RE = /\b(R|LG)[\s-]?([A-Z]{2})[\s-]?(\d{1,6})\b|\b(LG)[\s-]?([A-Z0-9]{4})\b/i;

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

function codeIn(text: string): string | null {
  const m = CODE_RE.exec(text.toUpperCase());
  if (!m) return null;
  if (m[1]) return `${m[1].toUpperCase()}-${m[2].toUpperCase()}-${m[3].padStart(6, '0')}`;
  return `LG-${m[5].toUpperCase()}`;
}

/** Nombre de perfil inutilizable: solo emoji o signos, iniciales, un punto, o un nombre de negocio. */
export function usableName(n: string | null | undefined): boolean {
  const t = (n || '').trim();
  if (!t) return false;
  if (!/\p{L}{2,}/u.test(t)) return false;
  if (/^(\p{L}\.?\s?){1,3}$/u.test(t) && t.replace(/[^\p{L}]/gu, '').length <= 3) return false;
  return !/(c\.?\s?a\.?$|s\.?\s?a\.?$|tienda|bodega|ferreter|comercial|inversiones|servicios|store|shop|market)/i.test(t);
}
const firstName = (n: string | null) => (n || '').trim().split(/\s+/)[0] || '';

type V42Intent = 'menu' | 'human' | 'privacy' | 'erase' | 'is_human' | 'emergency' | 'rename' | 'report' | 'status' | 'progress' | 'closure' | 'confirm' | 'dispute' | 'off_topic' | 'greeting' | 'yes' | 'no' | 'legacy' | 'unknown';

const RULES: { intent: V42Intent; re: RegExp }[] = [
  { intent: 'menu', re: /^(men[uú]|opciones|ayuda)\s*[.!?]*$/i },
  { intent: 'erase', re: /(s[ií],? borra|borra(r)? (mis|todos mis) datos|elimina(r)? mis datos)/i },
  { intent: 'is_human', re: /(eres (una )?(persona|humano|real|robot|bot|m[aá]quina)|hablo con (una )?(persona|m[aá]quina|robot|bot)|eres de verdad)/i },
  { intent: 'human', re: /(hablar con (una )?persona|con alguien del equipo|con un humano|operador|quiero una persona|p[aá]same con alguien)/i },
  { intent: 'privacy', re: /(privacidad|mis datos|qu[eé] guardas|protecci[oó]n de datos)/i },
  { intent: 'emergency', re: /(se (va a|puede) caer|se est[aá] cayendo|derrumbe|emergencia|herid[oa]s?|atrapad[oa]|inestable|a punto de caer)/i },
  { intent: 'rename', re: /^(dime|ll[aá]mame|me llamo|mi nombre es|puedes llamarme)\s+(\p{L}[\p{L} ]{0,30})$/iu },
  { intent: 'dispute', re: /(no se llevaron nada|no se lo llevaron|sigue ah[ií]|no lo retiraron|qued[oó] incompleto|no vinieron|todav[ií]a est[aá])/i },
  { intent: 'confirm', re: /(ya se lo llevaron|ya lo retiraron|qued[oó] (limpio|despejado)|ya no est[aá]|confirmo)/i },
  { intent: 'closure', re: /(confirmar|disputar|cierre)/i },
  { intent: 'progress', re: /(avance|c[oó]mo va (mi|el) sector|sem[aá]foro|c[oó]mo va (la|mi) parroquia)/i },
  { intent: 'status', re: /(c[oó]mo va (lo m[ií]o|mi reporte|el reporte)|mi c[oó]digo|consultar|qu[eé] pas[oó] con|estado de|revisar (un|mi) reporte|novedad)/i },
  { intent: 'report', re: /(escombro|reportar|quiero avisar|hay (un )?(mont[oó]n|pila|basura de obra))/i },
  { intent: 'legacy', re: /(lecci[oó]n|aprender|qu[eé] pasa con el escombro|a ?d[oó]nde (va|llevan)|en qu[eé] se convierte|es peligroso|polvo|t[oó]xico|asbesto)/i },
  { intent: 'greeting', re: /^(hola|buenas|buenos d[ií]as|buenas tardes|buenas noches|epa|saludos|hey)[\s!.,]*$/i },
  { intent: 'off_topic', re: /(?<!\p{L})(luz|electricidad|agua potable|tuber[ií]a|pago|dinero|bono|c[eé]dula|pasaporte|gas dom[eé]stico|internet|f[uú]tbol|pol[ií]tica|receta)(?!\p{L})/iu },
];
const EMOTION_RE = /(enferm|preocupad|preocupa|miedo|asustad|angusti|molest|rabia|harta|harto|cansad[oa] de|triste|desesperad|no aguanto)/i;
const ANON_RE = /(sin mis datos|an[oó]nim[oa]|reportar sin (dar )?(mi )?nombre)/i;
const LIFE_RE = /(atrapad[oa]s?|herid[oa]s?|lesionad[oa]s?|incendio|fuego|humo|olor a gas|fuga de gas|se (cay[oó]|derrumb[oó])|derrumbe|colaps[oó]|aplastad)/i;
const UNSTABLE_RE = /(inestable|se (va a|puede) caer|a punto de caer|grieta|agrietad|asbesto|fibrocemento|qu[ií]mic|t[oó]xic|olor raro|envases? de qu[ií]micos|material peligroso)/i;
const YES_RE = /^\s*(s[ií]|dale|ok|okey|claro|va|de acuerdo|est[aá] bien|me parece|acepto|1)(?!\p{L})/iu;
const NO_RE = /^\s*(no|nop|para nada|no acepto|prefiero que no|2)(?!\p{L})/iu;

function classify(text: string): V42Intent {
  const t = text.trim();
  if (!t) return 'unknown';
  if (codeIn(t) && t.length < 30) return 'status';
  for (const r of RULES) if (r.re.test(t)) return r.intent;
  if (YES_RE.test(t) && t.length < 20) return 'yes';
  if (NO_RE.test(t) && t.length < 20) return 'no';
  return 'unknown';
}

const MENU_INTENTS: V42Intent[] = ['report', 'status', 'progress', 'closure', 'human', 'privacy'];

function parishIn(text: string): string | null {
  const t = norm(text);
  return PARISHES.find((p) => t.includes(norm(p.name)))?.name ?? null;
}
function sectorIn(text: string, parish?: string | null): Sector | undefined {
  const t = norm(text);
  return db()
    .list('sectors')
    .filter((s) => !parish || s.parish === parish)
    .find((s) => {
      const base = norm(s.name.replace(/\(.*?\)/g, '').split(',')[0]);
      return base.length >= 3 && t.includes(base);
    });
}

// ---------------------------------------------------------------- perfiles

export function profileForWhatsApp(waId: string): AuraProfile | undefined {
  return db().get('auraProfiles', `wa_${pseudonym(waId)}`);
}

function profileForUser(userId: string): AuraProfile | undefined {
  return db().find('auraProfiles', (p) => p.userId === userId);
}

/** Si el número de WhatsApp coincide con una cuenta verificada de la PWA, los dos perfiles son la misma persona. */
function linkVerifiedAccount(p: AuraProfile, waId: string): AuraProfile {
  const store = db();
  const digits = waId.replace(/\D/g, '');
  const user = store.find('users', (u) => u.active && u.verificationStatus === 'verified' && !!u.phone && u.phone.replace(/\D/g, '').slice(-10) === digits.slice(-10));
  if (!user || p.userId === user.id) return p;
  const other = store.find('auraProfiles', (x) => x.userId === user.id && x.id !== p.id);
  const merged: Partial<AuraProfile> = { userId: user.id };
  if (other) {
    merged.usualSectorIds = [...new Set([...p.usualSectorIds, ...other.usualSectorIds])];
    merged.parish = p.parish ?? other.parish ?? null;
    merged.preferredNameEnc = p.preferredNameEnc ?? other.preferredNameEnc ?? null;
    store.remove('auraProfiles', other.id);
  }
  return store.update('auraProfiles', p.id, merged);
}

function nameOf(p: AuraProfile | undefined, channel: Channel, userName: string | null): string | null {
  const preferred = decryptField(p?.preferredNameEnc);
  if (preferred) return preferred;
  if (channel.kind === 'whatsapp') return usableName(channel.profileName) ? firstName(channel.profileName!) : null;
  return userName ? firstName(userName) : null;
}

/** Borra la memoria y los datos personales; los casos quedan anonimizados para la trazabilidad (10.4, flujo 6). */
export function erasePersonalData(p: AuraProfile, actor: Actor): void {
  const store = db();
  const owned = store.filter('origins', (o) => o.channelProfileId === p.id || (!!p.userId && o.reporterId === p.userId));
  const photoIds = new Set<string>();
  for (const o of owned) {
    store.update('origins', o.id, { reporterName: null, reporterPhone: null, channelProfileId: null });
    for (const id of o.photoIds) photoIds.add(id);
  }
  // Las fotos donde aparecen personas se revisan a mano en Moderación de fotos antes de borrarse.
  for (const id of photoIds) {
    const ph = store.get('photos', id);
    if (ph && ph.moderation !== 'rejected') store.update('photos', id, { moderation: 'pending', erasureReview: true } as never);
  }
  for (const s of store.filter('auraSessions', (s) => (s as AuraSession & { profileId?: string }).profileId === p.id)) store.remove('auraSessions', s.id);
  for (const t of store.filter('supportTickets', (t) => t.profileId === p.id)) store.update('supportTickets', t.id, { nameEnc: null });
  store.remove('auraProfiles', p.id);
  appendEvent({ type: 'personal_data_erased', objectType: 'system', objectId: 'aura', actor, data: { profile: p.id, reports: owned.length, photosForReview: photoIds.size }, silent: true });
}

// ---------------------------------------------------------------- conversación

export async function auraTurn(input: AuraInput, actor: Actor, channel: Channel): Promise<AuraResponse> {
  const store = db();
  const cfg = getConfig();
  const user = actor.id ? store.get('users', actor.id) : undefined;
  const text = (input.option || input.text || '').trim();

  // Sesión: una por número de WhatsApp; en la PWA la de siempre.
  const sessionId = channel.kind === 'whatsapp' ? `as_wa_${pseudonym(channel.waId!)}` : input.sessionId || null;
  let session = sessionId ? store.get('auraSessions', sessionId) : undefined;
  if (!session) {
    session = { id: sessionId || newId('as'), userId: actor.id, step: 'idle', draft: {}, contextCode: null, name: null, createdAt: nowIso(), updatedAt: nowIso(), lastVariant: {}, history: [] };
  }
  const rk = session.id;
  const T = (key: string, vars: Record<string, string | number | null | undefined> = {}) => pickText(key, vars, rk);
  const messages: AuraReply[] = [];
  let quickReplies: QuickReply[] = [];
  let originCode: string | null = null;
  const say = (t: string, link?: string | null, photoUrl?: string | null) => messages.push({ text: t, link: link ?? null, photoUrl: photoUrl ?? null });

  // Perfil (memoria).
  let profile: AuraProfile | undefined = channel.kind === 'whatsapp' ? profileForWhatsApp(channel.waId!) : user ? profileForUser(user.id) : undefined;
  if (profile?.blocked) {
    say(T('v42_blocked'));
    return out(false);
  }
  const consented = !!session.draft.anon || (channel.kind === 'whatsapp' || user ? !!profile?.consent : !!session.draft.consent);
  let name = nameOf(profile, channel, user?.name || user?.alias || null);
  const nm = () => name || 'vecino';
  const pid = profile?.id ?? (channel.kind === 'whatsapp' ? `wa_${pseudonym(channel.waId!)}` : user ? `user_${user.id}` : session.id);

  function persist(): void {
    const s = session!;
    for (const m of messages) s.history.push({ role: 'aura', text: m.text, at: nowIso() });
    s.history = s.history.slice(-200);
    s.updatedAt = nowIso();
    (s as AuraSession & { profileId?: string }).profileId = profile?.id ?? null as never;
    store.put('auraSessions', s);
  }

  function out(store_ = true): AuraResponse {
    if (store_) persist();
    // Auditoría (10.6): cada mensaje entra y sale con seudónimo, sin texto ni contenido de fotos.
    appendEvent({ type: 'aura_message', objectType: 'system', objectId: 'aura', actor: SYSTEM_ACTOR, data: { who: pseudonym(pid), channel: channel.kind, in: text ? text.length : input.photoId ? 'foto' : input.location ? 'ubicación' : channel.voice ? 'audio' : 0, out: messages.length, step: session!.step }, silent: true });
    return { session: { id: session!.id, step: session!.step, contextCode: session!.contextCode ?? null }, messages, quickReplies, originCode, intent: 'unknown' };
  }

  if (text || input.photoId || input.location) session.history.push({ role: 'user', text: text || (input.photoId ? '[foto]' : '[ubicación]'), at: nowIso() });

  // ---- 10.2 primer contacto y consentimiento ----
  if (!consented) {
    // Reportar sin mis datos: sin nombre ni memoria (no hace falta guardar nada de la persona).
    if (ANON_RE.test(text) || input.option === 'anon') {
      session.draft = { anon: true, consent: { at: nowIso(), version: 'anon' } };
      session.step = 'v42_r_start';
      session.history = [];
      store.put('auraSessions', { ...session, history: [] });
      say(T('v42_anon_start'));
      return reportFlowAnon();
    }
    // Un sí o un no claro cuenta aunque el servidor haya perdido el paso (por ejemplo, tras un reinicio).
    if (text && (session.step === 'v42_consent' || input.option === 'sí' || input.option === 'no')) {
      if (input.option === 'sí' || YES_RE.test(text) || /^s[ií](?!\p{L})/iu.test(text)) {
        const now = nowIso();
        profile = channel.kind === 'whatsapp' || user
          ? store.put('auraProfiles', { id: pid, userId: user?.id ?? null, channel: channel.kind, waIdEnc: channel.kind === 'whatsapp' ? encryptField(channel.waId) : null, profileNameEnc: encryptField(channel.profileName ?? null), preferredNameEnc: null, parish: null, usualSectorIds: [], consent: { at: now, version: CONSENT_VERSION }, lastConversationAt: now, conversations: 1, createdAt: now })
          : undefined;
        if (profile && channel.kind === 'whatsapp') profile = linkVerifiedAccount(profile, channel.waId!);
        if (!profile) session.draft = { ...session.draft, consent: { at: now, version: CONSENT_VERSION } };
        appendEvent({ type: 'consent_recorded', objectType: 'system', objectId: 'aura', actor: SYSTEM_ACTOR, data: { who: pseudonym(pid), channel: channel.kind, version: CONSENT_VERSION, at: now }, silent: true });
        session.step = 'idle';
        if (!name && !profile?.askedName) {
          if (profile) store.update('auraProfiles', profile.id, { askedName: true });
          say(T('v42_ask_name'));
          session.step = 'v42_name';
          return out();
        }
        say(T('v42_open'));
        quickReplies = menuReplies();
        return out();
      }
      if (input.option === 'no' || NO_RE.test(text)) {
        // No se guarda nada, ni el nombre.
        if (store.get('auraSessions', session.id)) store.remove('auraSessions', session.id);
        session.history = [];
        say(T('v42_consent_no', { enlace: `${env.publicBaseUrl}/tablero` }), '/tablero');
        return out(false);
      }
    }
    say(name ? T('v42_greet_new', { nombre: name }) : T('v42_greet_new', { nombre: '' }).replace('¡Hola, !', '¡Hola!').replace('¡Qué tal, !', '¡Qué tal!'));
    say(T(channel.kind === 'whatsapp' ? 'v42_consent_whatsapp' : 'v42_consent_pwa'));
    quickReplies = [{ label: 'Sí, me parece bien', value: 'sí' }, { label: 'No', value: 'no' }, { label: 'Reportar sin mis datos', value: 'anon' }];
    // Antes del sí solo se guarda el paso de la conversación, sin nombre ni mensajes.
    session.step = 'v42_consent';
    session.history = [];
    session.userId = actor.id;
    store.put('auraSessions', { ...session, history: [] });
    return out(false);
  }

  // Recuerda la última conversación (10.1).
  const newConversation = !session.updatedAt || Date.now() - Date.parse(session.updatedAt) > 6 * 3_600_000;
  if (profile && newConversation) profile = store.update('auraProfiles', profile.id, { lastConversationAt: nowIso(), conversations: (profile.conversations || 0) + 1 });
  if (profile && channel.kind === 'whatsapp' && channel.profileName && decryptField(profile.profileNameEnc) !== channel.profileName) profile = store.update('auraProfiles', profile.id, { profileNameEnc: encryptField(channel.profileName) });

  // ---- nombre ----
  if (session.step === 'v42_name' && text) {
    const n = text.replace(/^(me llamo|soy|dime|ll[aá]mame)\s+/i, '').trim().slice(0, 30);
    if (usableName(n)) {
      name = firstName(n);
      if (profile) store.update('auraProfiles', profile.id, { preferredNameEnc: encryptField(name) });
      else session.draft = { ...session.draft, name };
      say(T('v42_name_saved', { nombre: name }));
      say(T('v42_open'));
      session.step = 'idle';
      quickReplies = menuReplies();
      return out();
    }
    session.step = 'idle';
  }
  if (!profile && session.draft.name) name = String(session.draft.name);

  // ---- notas de voz (no se transcriben en esta fase) ----
  if (channel.voice || input.voiceNoteId) {
    if (session.step.startsWith('v42_r_') && input.voiceNoteId) {
      session.draft = { ...session.draft, r: { ...((session.draft.r as object) || {}), voiceNoteId: input.voiceNoteId } };
      say(T('v42_voice_attached'));
      return reportFlow();
    }
    say(T('v42_voice'));
    if (input.voiceNoteId) {
      session.draft = { ...session.draft, voiceNoteId: input.voiceNoteId };
      return handoff('Nota de voz para que la escuche una persona');
    }
    quickReplies = [{ label: 'Hablar con una persona', value: 'hablar con una persona' }];
    return out();
  }

  let intent: V42Intent = text ? classify(text) : input.photoId || input.location ? 'report' : 'unknown';
  // En el menú numerado, el número elige la opción.
  if (/^[1-6]$/.test(text) && (session.step === 'v42_menu' || session.step === 'idle')) intent = MENU_INTENTS[Number(text) - 1];
  if (/^menu:/.test(text)) intent = text.slice(5) as V42Intent;

  // ---- emoción y riesgo: primero se reconoce ----
  const distressed = EMOTION_RE.test(text);
  if (distressed) {
    say(T('v42_emotion', { nombre: nm() }));
    session.draft = { ...session.draft, upset: Number(session.draft.upset || 0) + 1 };
  }
  const nums = { life: cfg.emergencyNumbers?.life?.trim() || '911', civil: cfg.emergencyNumbers?.civil?.trim() || '166' };
  if (LIFE_RE.test(text)) {
    // Peligro para la vida: el número de emergencias va antes que cualquier otra cosa.
    messages.unshift({ text: T('v42_emergency_life', { número: nums.life }), link: null, photoUrl: null });
    return handoff('Peligro para la vida reportado en la conversación', true);
  }
  if (UNSTABLE_RE.test(text) || intent === 'emergency') {
    say(T('v42_emergency_civil', { número: nums.civil }));
    session.draft = { ...session.draft, hazard: true };
    if (!session.step.startsWith('v42_r_')) {
      session.draft = { ...session.draft, r: { ...((session.draft.r as object) || {}) }, hazard: true };
      session.step = 'v42_r_start';
    }
    return reportFlow();
  }
  if (distressed && Number(session.draft.upset) >= 2) return handoff('Persona molesta en varias respuestas', true);

  // ---- pasos en curso ----
  const step = session.step;
  if (step.startsWith('v42_r_') && !['menu', 'human', 'privacy', 'erase', 'is_human', 'status', 'progress'].includes(intent)) return reportFlow();
  if (step === 'v42_closure_answer') {
    if (text === '1' || intent === 'confirm' || intent === 'yes') return doConfirm(session.contextCode!);
    if (text === '2' || intent === 'dispute' || intent === 'no') {
      session.step = 'v42_dispute_photo';
      say(T('v42_dispute_photo'));
      quickReplies = [{ label: 'Sin foto', value: 'sin foto' }];
      return out();
    }
  }
  if (step === 'v42_dispute_photo') {
    if (input.photoId || /sin foto/i.test(text) || text) return doDispute(session.contextCode!, input.photoId ?? null, input.photoId ? null : /sin foto/i.test(text) ? null : text);
  }
  if (step === 'v42_pick_code' && codeIn(text)) intent = session.draft.pendingIntent === 'closure' ? 'closure' : 'status';
  if (step === 'v42_privacy' && (intent === 'yes' || /borrar/i.test(text))) intent = 'erase';

  // ---- intenciones ----
  switch (intent) {
    case 'menu':
      return showMenu();
    case 'is_human':
      say(T('v42_is_human'));
      quickReplies = [{ label: 'Hablar con una persona', value: 'hablar con una persona' }];
      return reset();
    case 'human':
      return handoff('La persona pidió hablar con alguien del equipo');
    case 'privacy':
      say(T('v42_privacy'));
      quickReplies = [{ label: 'Sí, borrar mis datos', value: 'sí, borrar' }, { label: 'No, gracias', value: 'no' }];
      session.step = 'v42_privacy';
      return out();
    case 'erase': {
      if (profile) erasePersonalData(profile, { id: actor.id, role: 'citizen', entityId: null });
      else if (store.get('auraSessions', session.id)) store.remove('auraSessions', session.id);
      say(T('v42_erased'));
      session.history = [];
      return out(false);
    }
    case 'rename': {
      const m = /^(?:dime|ll[aá]mame|me llamo|mi nombre es|puedes llamarme)\s+(.+)$/i.exec(text);
      const n = firstName(m?.[1] ?? '');
      if (usableName(n)) {
        name = n;
        if (profile) store.update('auraProfiles', profile.id, { preferredNameEnc: encryptField(n) });
        else session.draft = { ...session.draft, name: n };
        say(T('v42_name_saved', { nombre: n }));
        return reset();
      }
      break;
    }
    case 'off_topic':
      say(T('v42_off_topic'));
      return reset();
    case 'report':
      session.draft = { r: {} };
      session.step = 'v42_r_start';
      return reportFlow();
    case 'status':
      return doStatus();
    case 'progress':
      return doProgress();
    case 'closure':
    case 'confirm':
    case 'dispute':
      return doClosure(intent);
    case 'greeting':
      return greetBack();
    case 'legacy':
      return legacy();
    default:
      break;
  }
  // Pasos y respuestas que maneja el motor anterior (lecciones, seguridad, encuesta final).
  if (['lesson_offer', 'lesson_pick', 'lesson_answer', 'await_satisfaction', 'await_sector'].includes(step)) return legacy();
  return notUnderstood();

  // ---------------------------------------------------------------- acciones

  function menuReplies(): QuickReply[] {
    return [
      { label: 'Reportar escombro', value: 'menu:report' },
      { label: 'Consultar mi código', value: 'menu:status' },
      { label: 'Ver el avance de mi sector', value: 'menu:progress' },
      { label: 'Confirmar o disputar un cierre', value: 'menu:closure' },
      { label: 'Hablar con una persona', value: 'menu:human' },
      { label: 'Privacidad y borrar mis datos', value: 'menu:privacy' },
    ];
  }

  function reset(): AuraResponse {
    session!.step = 'idle';
    session!.draft = { ...(profile ? {} : { consent: session!.draft.consent, name: session!.draft.name }), fails: 0 };
    quickReplies = quickReplies.length ? quickReplies : menuReplies();
    return out();
  }

  function showMenu(): AuraResponse {
    say(T('v42_menu'));
    quickReplies = menuReplies();
    session!.step = 'v42_menu';
    session!.draft = { ...session!.draft, fails: 0 };
    return out();
  }

  function notUnderstood(): AuraResponse {
    const fails = Number(session!.draft.fails || 0) + 1;
    session!.draft = { ...session!.draft, fails };
    // A la segunda vez seguida: menú numerado y opción de hablar con una persona.
    if (fails >= 2) return showMenu();
    say(T('v42_not_understood'));
    quickReplies = menuReplies();
    return out();
  }

  /** Lecciones, seguridad, a dónde va el escombro y encuesta final siguen en el motor anterior, con la misma sesión. */
  function legacy(): AuraResponse {
    persist();
    return LEGACY;
  }

  function greetBack(): AuraResponse {
    const mine = myReports();
    const pendingClosure = mine.find((o) => reportStatus(o).key === 'closure_proposed');
    const moving = mine.find((o) => publicLotStage(o) > 0);
    const usual = profile?.usualSectorIds?.[0] ? store.get('sectors', profile.usualSectorIds[0])?.name : null;
    const pendiente = pendingClosure ? `Tienes por confirmar el cierre de ${pendingClosure.code}.` : moving ? `Lo de ${moving.code} va en «${PUBLIC_LOT_STATES[publicLotStage(moving) - 1]}».` : '';
    if (name && (usual || pendiente)) say(T('v42_greet_back', { nombre: name, sector: usual || 'tu zona', pendiente }));
    else say(name ? `¡Hola, ${name}! ${T('v42_open')}` : T('v42_open'));
    quickReplies = menuReplies();
    return reset();
  }

  function myReports(): Origin[] {
    return store
      .filter('origins', (o) => (!!profile && o.channelProfileId === profile.id) || (!!user && o.reporterId === user.id))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  function reportFlowAnon(): AuraResponse {
    return reportFlow();
  }

  function reportFlow(): AuraResponse {
    const r = { ...((session!.draft.r as Record<string, any>) || {}) };
    const s = session!.step;
    // Lo que la persona ya dijo no se vuelve a preguntar (10.1).
    if (text && !/^(no|sin foto|sí|si)$/i.test(text)) {
      r.parish = r.parish || parishIn(text);
      const sec = !r.sectorId ? sectorIn(text, r.parish) : undefined;
      if (sec) {
        r.sectorId = sec.id;
        r.parish = r.parish || sec.parish;
      }
    }
    if (input.photoId) r.photoIds = [...(r.photoIds || []), input.photoId];
    if (input.location) r.location = input.location;
    if (s === 'v42_r_parish_suggest') {
      if (YES_RE.test(text)) r.parish = r.suggestedParish;
      delete r.suggestedParish;
    }
    if (s === 'v42_r_sector_suggest') {
      if (YES_RE.test(text)) r.sectorId = r.suggestedSector;
      delete r.suggestedSector;
    }
    if (s === 'v42_r_sector' && !r.sectorId && text) {
      const sec = sectorIn(text, r.parish);
      if (sec) r.sectorId = sec.id;
      else r.reference = r.reference || text.slice(0, 200);
    }
    if (s === 'v42_r_photo' && /sin foto/i.test(text)) r.noPhoto = true;
    if (s === 'v42_r_size') {
      const v = input.option && ['small', 'medium', 'large'].includes(input.option) ? input.option : /peque|carretilla|poco|^1$/i.test(text) ? 'small' : /grande|cami[oó]n|mucho|^3$/i.test(text) ? 'large' : /median|camioneta|regular|^2$/i.test(text) ? 'medium' : null;
      if (v) r.size = v;
    }
    if (s === 'v42_r_ref') {
      r.refAsked = true;
      if (text && !/^(no|nada|ninguna|sin referencia)$/i.test(text)) r.reference = text.slice(0, 200);
    }
    if (s === 'v42_r_start' && text && !r.sectorId && !r.parish && text.length > 25) r.reference = r.reference || null;
    session!.draft = { ...session!.draft, r };

    if (!r.parish) {
      const usual = profile?.parish;
      if (usual && s !== 'v42_r_parish_suggest' && s !== 'v42_r_parish') {
        r.suggestedParish = usual;
        session!.draft = { ...session!.draft, r };
        say(T('v42_suggest_parish', { parroquia: usual }));
        quickReplies = [{ label: 'Sí', value: 'sí' }, ...PARISHES.filter((p) => p.name !== usual).map((p) => ({ label: p.name, value: p.name }))];
        session!.step = 'v42_r_parish_suggest';
        return out();
      }
      say(T('v42_ask_parish'));
      quickReplies = PARISHES.map((p) => ({ label: p.name, value: p.name }));
      session!.step = 'v42_r_parish';
      return out();
    }
    if (!r.sectorId) {
      const usualId = profile?.usualSectorIds?.find((id) => store.get('sectors', id)?.parish === r.parish);
      if (usualId && s !== 'v42_r_sector_suggest' && s !== 'v42_r_sector') {
        r.suggestedSector = usualId;
        session!.draft = { ...session!.draft, r };
        say(T('v42_suggest_sector', { sector: store.get('sectors', usualId)!.name }));
        quickReplies = [{ label: 'Sí', value: 'sí' }, { label: 'No, es otro', value: 'no' }];
        session!.step = 'v42_r_sector_suggest';
        return out();
      }
      say(T('v42_ask_sector'));
      quickReplies = store.filter('sectors', (x) => x.parish === r.parish).slice(0, 10).map((x) => ({ label: x.name, value: x.name }));
      session!.step = 'v42_r_sector';
      return out();
    }
    if (!r.photoIds?.length && !r.noPhoto) {
      say(T('v42_ask_photo'));
      quickReplies = [{ label: 'Sin foto', value: 'sin foto' }];
      session!.step = 'v42_r_photo';
      return out();
    }
    if (!r.size) {
      say(T('v42_ask_size'));
      quickReplies = [{ label: 'Pequeño (una carretilla)', value: 'small' }, { label: 'Mediano (una camioneta)', value: 'medium' }, { label: 'Grande (un camión o más)', value: 'large' }];
      session!.step = 'v42_r_size';
      return out();
    }
    if (!r.refAsked && !r.reference) {
      say(T('v42_ask_reference'));
      quickReplies = [{ label: 'No', value: 'no' }];
      session!.step = 'v42_r_ref';
      return out();
    }
    return submit(r);
  }

  function submit(r: Record<string, any>): AuraResponse {
    const anon = !!session!.draft.anon;
    try {
      const res = createCitizenReport(
        {
          photoIds: r.photoIds || [],
          location: r.location ?? null,
          reference: r.reference ?? null,
          sectorId: r.sectorId,
          size: r.size || 'medium',
          subcategory: session!.draft.hazard ? 'possible_hazardous' : null,
          voiceNoteId: r.voiceNoteId ?? null,
          reporterName: anon ? null : name,
          anonymous: anon || (!user && !profile),
          source: channel.kind === 'whatsapp' ? 'whatsapp' : 'aura',
          deviceTime: input.deviceTime,
          offlineQueuedAt: input.offlineQueuedAt,
          clientKey: channel.kind === 'whatsapp' ? pseudonym(channel.waId!) : input.clientKey ?? null,
          channelProfileId: anon ? null : profile?.id ?? null,
          phone: anon ? null : channel.kind === 'whatsapp' ? channel.waId : null,
        },
        user && !anon ? actor : { id: null, role: 'citizen', entityId: null },
      );
      originCode = res.origin.code;
      if (profile && !anon) {
        const sectors = [r.sectorId, ...profile.usualSectorIds.filter((x) => x !== r.sectorId)].slice(0, 3);
        profile = store.update('auraProfiles', profile.id, { parish: r.parish, usualSectorIds: sectors });
      }
      say(anon ? T('v42_report_done_anon', { código: res.origin.code }) : T('v42_report_done', { nombre: nm(), código: res.origin.code }), `/reporte/${res.origin.code}`);
      if (session!.draft.hazard) say(T('v42_hazard_flagged'));
      if (res.possibleDuplicate) say(T('v42_grouped'));
      if (!r.photoIds?.length) say(T('v42_no_photo'));
      // Sugerencia de lección: como mucho una cada tres conversaciones y nunca si la persona está angustiada.
      const conv = profile?.conversations ?? 1;
      if (!distressed && (!profile?.lastTipAt || conv - profile.lastTipAt >= 3)) {
        say(T('v42_learn_tip', { enlace: `${env.publicBaseUrl}/aprende` }), '/aprende');
        if (profile) store.update('auraProfiles', profile.id, { lastTipAt: conv });
      }
      session!.contextCode = res.origin.code;
      if (anon) {
        if (store.get('auraSessions', session!.id)) store.remove('auraSessions', session!.id);
        session!.history = [];
        session!.step = 'idle';
        return out(false);
      }
      return reset();
    } catch (err) {
      const e = err as HttpError;
      if (e.code === 'daily_limit') {
        say(T('v42_daily_limit'));
        quickReplies = [{ label: 'Hablar con una persona', value: 'hablar con una persona' }];
        return reset();
      }
      say(e instanceof HttpError ? e.message : 'Algo falló al registrar eso. ¿Me lo repites?');
      return reset();
    }
  }

  function doStatus(): AuraResponse {
    const code = codeIn(text) || (step === 'v42_pick_code' ? codeIn(text) : null);
    const mine = myReports();
    const o = code ? getOriginByCode(code) : mine.length === 1 ? mine[0] : undefined;
    if (!o) {
      if (mine.length > 1) {
        say(T('v42_which_code'));
        quickReplies = mine.slice(0, 6).map((x) => ({ label: x.code, value: x.code }));
        session!.step = 'v42_pick_code';
        session!.draft = { ...session!.draft, pendingIntent: 'status' };
        return out();
      }
      say(code ? pickText('code_not_found', { código: code }, rk) : T('v42_ask_code'));
      session!.step = 'v42_pick_code';
      return out();
    }
    originCode = o.code;
    session!.contextCode = o.code;
    const st = o.type === 'citizen' ? reportStatus(o) : null;
    const stage = publicLotStage(o);
    const last = store.eventsOfChain(`origin:${o.id}`).slice(-1)[0]?.serverTime || o.createdAt;
    const fecha = new Date(last).toLocaleDateString('es-VE', { timeZone: 'America/Caracas', day: 'numeric', month: 'long' });
    const lote = stage ? ` Estado del lote: ${stage}. ${PUBLIC_LOT_STATES[stage - 1]}.` : '';
    say(T('v42_status', { código: o.code, estado: st?.label ?? (stage ? PUBLIC_LOT_STATES[stage - 1] : 'Registrado'), fecha, lote }), `/reporte/${o.code}`);
    if (st && ['received', 'validated'].includes(st.key)) say(T('v42_status_delay'));
    if (st?.key === 'closure_proposed') return askClosure(o);
    return reset();
  }

  function doProgress(): AuraResponse {
    const sectorId = profile?.usualSectorIds?.[0] || user?.sectorId || (session!.contextCode ? getOriginByCode(session!.contextCode)?.sectorId : null) || sectorIn(text)?.id;
    const sector = sectorId ? store.get('sectors', sectorId) : undefined;
    if (!sector) {
      say(T('v42_ask_sector'));
      quickReplies = store.list('sectors').slice(0, 10).map((x) => ({ label: x.name, value: `${x.name} avance` }));
      return out();
    }
    const p = sectorProgressAll(sector.parish).sectors.find((x) => x.id === sector.id);
    if (p && !p.published) {
      say(`${sector.name} todavía tiene menos de 5 reportes, así que su avance no se publica. Si reportaste algo ahí, pídeme tu código y te digo cómo va.`);
      return reset();
    }
    const code = PARISHES.find((x) => x.name === sector.parish)?.code;
    const link = code ? `${env.publicBaseUrl}/tablero/parroquia/${code}` : `${env.publicBaseUrl}/tablero`;
    const fecha = new Date().toLocaleDateString('es-VE', { timeZone: 'America/Caracas', day: 'numeric', month: 'long' });
    say(T('v42_progress', { sector: sector.name, semáforo: p?.lightLabel ?? 'Gris: sin datos', cerrados: p?.closed ?? 0, pendientes: p ? (p.received ?? 0) - (p.closed ?? 0) : 0, fecha, enlace: link }), code ? `/tablero/parroquia/${code}` : '/tablero');
    return reset();
  }

  function askClosure(o: Origin): AuraResponse {
    const after = o.afterPhotoId || o.disputeEvidencePhotoId;
    const url = after ? store.get('photos', after)?.url ?? null : null;
    say(T('v42_confirm_ask', { código: o.code }), null, url);
    quickReplies = [{ label: '1 Confirmo que se retiró', value: '1' }, { label: '2 No se retiró o quedó incompleto', value: '2' }];
    session!.step = 'v42_closure_answer';
    session!.contextCode = o.code;
    return out();
  }

  function doClosure(i: V42Intent): AuraResponse {
    const code = codeIn(text);
    const pending = myReports().filter((o) => reportStatus(o).key === 'closure_proposed');
    const o = code ? getOriginByCode(code) : pending.length === 1 ? pending[0] : session!.contextCode ? getOriginByCode(session!.contextCode) : undefined;
    if (!o || reportStatus(o).key !== 'closure_proposed') {
      if (pending.length > 1) {
        say(T('v42_which_code'));
        quickReplies = pending.map((x) => ({ label: x.code, value: x.code }));
        session!.step = 'v42_pick_code';
        session!.draft = { ...session!.draft, pendingIntent: 'closure' };
        return out();
      }
      say(T('v42_nothing_pending'));
      return reset();
    }
    if (i === 'confirm') return doConfirm(o.code);
    if (i === 'dispute') {
      session!.contextCode = o.code;
      session!.step = 'v42_dispute_photo';
      say(T('v42_dispute_photo'));
      quickReplies = [{ label: 'Sin foto', value: 'sin foto' }];
      return out();
    }
    return askClosure(o);
  }

  function doConfirm(code: string): AuraResponse {
    try {
      respondRemovalClosure(code, 'confirmed', { userId: user?.id ?? null, byCode: !user, profileId: profile?.id ?? null }, null, input.deviceTime);
      // Raíces como reconocimiento, nunca como presión.
      const n = user ? computePoints(user.id).confirmedRemovals : 0;
      say(T('v42_confirmed', { nombre: nm(), raíces: n > 1 ? ` Con este ya llevas ${n} confirmados.` : '' }));
    } catch (err) {
      say(err instanceof HttpError ? err.message : 'No pude registrar la confirmación.');
    }
    return reset();
  }

  function doDispute(code: string, photoId: string | null, comment: string | null): AuraResponse {
    try {
      const o = getOriginByCode(code);
      if (o && photoId) store.update('origins', o.id, { disputeEvidencePhotoId: photoId });
      respondRemovalClosure(code, 'disputed', { userId: user?.id ?? null, byCode: !user, profileId: profile?.id ?? null }, comment, input.deviceTime);
      say(T('v42_disputed'));
    } catch (err) {
      say(err instanceof HttpError ? err.message : 'No pude registrar la disputa.');
    }
    return reset();
  }

  function handoff(reason: string, urgent = false): AuraResponse {
    const ticket = store.put('supportTickets', {
      id: newId('st'),
      profileId: profile?.id ?? null,
      userId: user?.id ?? null,
      sessionId: session!.id,
      channel: channel.kind,
      nameEnc: encryptField(name),
      reason,
      history: session!.history.slice(-30).map((h) => ({ role: h.role, text: h.text, at: h.at })),
      status: 'open',
      createdAt: nowIso(),
    });
    appendEvent({ type: 'support_ticket', objectType: 'system', objectId: 'aura', actor: SYSTEM_ACTOR, data: { ticket: ticket.id, who: pseudonym(pid), urgent }, silent: true });
    for (const role of ['admin'] as const) notifyRole(role, 'support_ticket', `${urgent ? 'Urgente: ' : ''}una persona pidió hablar con el equipo desde AURA.`, { link: '/admin/conversaciones' });
    const horario = supportHoursText();
    say(T('v42_handoff', { horario }).trim());
    session!.step = 'idle';
    return out();
  }
}

const LEGACY = { legacy: true } as unknown as AuraResponse;

/** Punto de entrada de la PWA y de WhatsApp. */
export async function auraReply(input: AuraInput, actor: Actor, channel: Channel): Promise<AuraResponse> {
  const r = await auraTurn(input, actor, channel);
  if (r !== LEGACY) return r;
  const sessionId = channel.kind === 'whatsapp' ? `as_wa_${pseudonym(channel.waId!)}` : input.sessionId;
  return handleMessage({ ...input, sessionId }, actor);
}

/** Horario de atención (configurable). Fuera de horario, AURA dice cuándo responden. */
export function supportHoursText(now = new Date()): string {
  const cfg = getConfig();
  const sch = cfg.supportSchedule ?? { days: [1, 2, 3, 4, 5], from: '08:00', to: '17:00' };
  const hours = cfg.supportHours?.trim() || 'de lunes a viernes, de 8:00 a 17:00 (hora de Caracas)';
  const local = new Date(now.toLocaleString('en-US', { timeZone: 'America/Caracas' }));
  const hm = `${String(local.getHours()).padStart(2, '0')}:${String(local.getMinutes()).padStart(2, '0')}`;
  const open = sch.days.includes(local.getDay()) && hm >= sch.from && hm < sch.to;
  return open ? `El equipo atiende ${hours}; te responden pronto.` : `Ahora estamos fuera de horario. El equipo atiende ${hours} y te responde en cuanto abra.`;
}
