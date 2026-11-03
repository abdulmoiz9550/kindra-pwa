import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Send, Camera, MapPin, Mic, RotateCcw } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { saveCode } from '../lib/storage';
import { compressImage, uploadPhoto, getPosition, listenOnce, speechRecognitionAvailable } from '../lib/media';
import { toast } from '../lib/toast';
import { VoiceNoteRecorder } from '../components/VoiceNoteRecorder';
import { Button, Spinner } from '../components/ui';

interface Bubble {
  role: 'user' | 'aura';
  text: string;
  link?: string | null;
  photoUrl?: string | null;
  at: string;
}
interface QuickReply {
  label: string;
  value: string;
}
interface AuraResponse {
  session: { id: string; step: string; contextCode: string | null };
  messages: { text: string; link?: string | null }[];
  quickReplies: QuickReply[];
  originCode?: string | null;
}

const SESSION_KEY = 'kindra.auraSession';

/** 8. AURA dentro de la PWA: conversación, no menú telefónico. */
export default function Aura() {
  const navigate = useNavigate();
  const [sessionId, setSessionId] = useState<string | null>(() => localStorage.getItem(SESSION_KEY));
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [quick, setQuick] = useState<QuickReply[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showVoice, setShowVoice] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const send = async (payload: { text?: string; option?: string; photoId?: string; location?: { lat: number; lng: number }; voiceNoteId?: string }, shown?: Bubble) => {
    if (shown) setBubbles((b) => [...b, shown]);
    setBusy(true);
    try {
      const r = await api.post<AuraResponse>('/aura/message', { sessionId, ...payload });
      if (r.session.id !== sessionId) {
        setSessionId(r.session.id);
        localStorage.setItem(SESSION_KEY, r.session.id);
      }
      setBubbles((b) => [...b, ...r.messages.map((m) => ({ role: 'aura' as const, text: m.text, link: m.link, at: new Date().toISOString() }))]);
      setQuick(r.quickReplies || []);
      if (r.originCode) saveCode(r.originCode);
    } catch (err) {
      setBubbles((b) => [...b, { role: 'aura', text: `No pude procesar eso ahora: ${errorMessage(err)}`, at: new Date().toISOString() }]);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    (async () => {
      const sid = localStorage.getItem(SESSION_KEY);
      if (sid) {
        try {
          const s = await api.get<{ id: string; history: Bubble[] }>(`/aura/session/${sid}`);
          setBubbles(s.history.map((h) => ({ ...h })));
          setLoading(false);
          if (!s.history.length) await send({});
          return;
        } catch {
          localStorage.removeItem(SESSION_KEY);
          setSessionId(null);
        }
      }
      setLoading(false);
      await send({});
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [bubbles, quick]);

  const submitText = () => {
    const t = text.trim();
    if (!t || busy) return;
    setText('');
    send({ text: t }, { role: 'user', text: t, at: new Date().toISOString() });
  };

  const onQuick = (q: QuickReply) => {
    if (q.value.startsWith('/')) {
      navigate(q.value);
      return;
    }
    setQuick([]);
    send({ option: q.value, text: q.label }, { role: 'user', text: q.label, at: new Date().toISOString() });
  };

  const onPhoto = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await compressImage(file);
      let location: { lat: number; lng: number } | null = null;
      try {
        const p = await getPosition(5000);
        location = { lat: p.lat, lng: p.lng };
      } catch {
        location = null;
      }
      const up = await uploadPhoto(dataUrl, 'origin', location);
      await send({ photoId: up.id }, { role: 'user', text: '[foto]', photoUrl: dataUrl, at: new Date().toISOString() });
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const shareLocation = async () => {
    setBusy(true);
    try {
      const p = await getPosition();
      await send({ location: { lat: p.lat, lng: p.lng } }, { role: 'user', text: '[ubicación compartida]', at: new Date().toISOString() });
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  };

  const dictate = async () => {
    try {
      const t = await listenOnce();
      setText(t);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const sendVoiceNote = async () => {
    if (!voiceNote) return;
    setBusy(true);
    try {
      const v = await api.post<{ id: string }>('/photos', { dataUrl: voiceNote, kind: 'voice' });
      setVoiceNote(null);
      setShowVoice(false);
      await send({ voiceNoteId: v.id, text: '[nota de voz]' }, { role: 'user', text: '[nota de voz]', at: new Date().toISOString() });
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  };

  const reset = async () => {
    localStorage.removeItem(SESSION_KEY);
    setSessionId(null);
    setBubbles([]);
    setQuick([]);
    await send({});
  };

  return (
    <div className="max-w-lg mx-auto flex flex-col" style={{ minHeight: 'calc(100vh - 180px)' }}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-xl font-bold">AURA</h1>
          <p className="text-xs text-muted">Asistente virtual del retiro de escombros</p>
        </div>
        <Button variant="ghost" size="sm" onClick={reset} aria-label="Empezar conversación nueva">
          <RotateCcw size={16} /> Nueva
        </Button>
      </div>

      <div className="flex-1 space-y-2 py-2" aria-live="polite" aria-label="Conversación con AURA">
        {loading && <Spinner label="Conectando con AURA…" />}
        {bubbles.map((b, i) => (
          <div key={i} className={`flex ${b.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={b.role === 'user' ? 'aura-bubble-user' : 'aura-bubble-aura'}>
              {b.photoUrl && <img src={b.photoUrl} alt="Foto enviada" className="mb-2 max-h-40 rounded-lg" />}
              <span>{b.text}</span>
              {b.link && (
                <Link to={b.link} className="mt-1 block text-sm underline">
                  {b.link.startsWith('/reporte/') ? 'Ver la ficha de este reporte' : b.link.startsWith('/tablero') ? 'Ver el tablero del sector' : 'Abrir enlace'}
                </Link>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="aura-bubble-aura text-muted">…</div>
          </div>
        )}
        {quick.length > 0 && !busy && (
          <div className="flex flex-wrap gap-2 pt-1" role="group" aria-label="Respuestas rápidas">
            {quick.map((q) => (
              <button key={q.value + q.label} type="button" className="chip" onClick={() => onQuick(q)}>
                {q.label}
              </button>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {showVoice && (
        <div className="card mb-2">
          <VoiceNoteRecorder value={voiceNote} onChange={setVoiceNote} />
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={sendVoiceNote} disabled={!voiceNote || busy}>
              Enviar nota de voz
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowVoice(false)}>
              Cerrar
            </Button>
          </div>
        </div>
      )}

      <form
        className="sticky bottom-[72px] md:bottom-2 bg-paper pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          submitText();
        }}
      >
        <div className="flex items-end gap-2">
          <input className="input flex-1" value={text} onChange={(e) => setText(e.target.value)} placeholder="Escribe aquí…" aria-label="Mensaje para AURA" disabled={busy} />
          <Button type="submit" aria-label="Enviar" disabled={busy || !text.trim()}>
            <Send size={18} />
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-sm">
          <button type="button" className="chip" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Camera size={16} className="mr-1" /> Foto
          </button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} aria-label="Enviar foto" />
          <button type="button" className="chip" onClick={shareLocation} disabled={busy}>
            <MapPin size={16} className="mr-1" /> Ubicación
          </button>
          {speechRecognitionAvailable() && (
            <button type="button" className="chip" onClick={dictate} disabled={busy}>
              <Mic size={16} className="mr-1" /> Dictar
            </button>
          )}
          <button type="button" className="chip" onClick={() => setShowVoice((v) => !v)} disabled={busy}>
            <Mic size={16} className="mr-1" /> Nota de voz
          </button>
        </div>
      </form>
    </div>
  );
}
