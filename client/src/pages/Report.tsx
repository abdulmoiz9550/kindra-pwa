import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Copy, Share2, ChevronLeft } from 'lucide-react';
import { SIZE_LABELS, URGENCY_LABELS } from '@kindra/shared';
import type { OriginSize, OriginUrgency } from '@kindra/shared';
import { api, ApiError, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { saveCode } from '../lib/storage';
import { enqueueReport } from '../lib/offline';
import { toast } from '../lib/toast';
import { uploadPhoto } from '../lib/media';
import { PhotoCapture, type CapturedPhoto } from '../components/PhotoCapture';
import { LocationPicker, type LocationValue } from '../components/LocationPicker';
import { VoiceNoteRecorder } from '../components/VoiceNoteRecorder';
import { Alert, Button, Card, Field, Input, PageTitle } from '../components/ui';

type Step = 'safety' | 'photo' | 'location' | 'size' | 'urgency' | 'extra' | 'done';
const STEPS: Step[] = ['safety', 'photo', 'location', 'size', 'urgency', 'extra'];

interface Result {
  code: string;
  sectorName: string;
  zonePending: boolean;
  possibleDuplicate: string | null;
  photoUnreadable: boolean;
  queued?: boolean;
}

/** 16.2 Reporte ciudadano en la PWA: mismos pasos que AURA. */
export default function Report() {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('safety');
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [loc, setLoc] = useState<LocationValue>({ location: null, sectorId: null, street: '', reference: '' });
  const [size, setSize] = useState<OriginSize | ''>('');
  const [urgency, setUrgency] = useState<OriginUrgency | ''>('');
  const [voice, setVoice] = useState<string | null>(null);
  const [name, setName] = useState(user?.name || '');
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [retake, setRetake] = useState<CapturedPhoto[]>([]);
  const [retakeText, setRetakeText] = useState<string | null>(null);

  const idx = STEPS.indexOf(step);
  const canNext = step === 'safety' || (step === 'photo' && photos.length > 0) || (step === 'location' && (!!loc.sectorId || !!loc.location) && (!!loc.location || !!loc.street.trim() || !!loc.reference.trim())) || (step === 'size' && !!size) || (step === 'urgency' && !!urgency) || step === 'extra';

  const body = () => ({
    location: loc.location,
    street: loc.street.trim() || null,
    reference: loc.reference.trim() || null,
    sectorId: loc.sectorId,
    size,
    urgency: urgency || null,
    reporterName: name.trim() || null,
    anonymous: user ? anonymous : true,
  });

  const submit = async () => {
    setBusy(true);
    setError(null);
    const queue = async () => {
      await enqueueReport({ photos: photos.map((p) => ({ dataUrl: p.preview, kind: 'origin', location: p.location, takenAt: new Date().toISOString() })), voiceNote: voice, body: body() });
      setResult({ code: '', sectorName: '', zonePending: false, possibleDuplicate: null, photoUnreadable: false, queued: true });
      setStep('done');
    };
    try {
      if (!navigator.onLine) {
        await queue();
        return;
      }
      const photoIds: string[] = [];
      for (const p of photos) {
        const up = await uploadPhoto(p.preview, 'origin', p.location);
        photoIds.push(up.id);
      }
      let voiceNoteId: string | null = null;
      if (voice) voiceNoteId = (await api.post<{ id: string }>('/photos', { dataUrl: voice, kind: 'voice' })).id;
      const r = await api.post<{ code: string; sector: { id: string; name: string }; zonePending: boolean; possibleDuplicate: string | null; photoUnreadable: boolean }>('/origins', { ...body(), photoIds, voiceNoteId });
      saveCode(r.code, r.sector?.name);
      setResult({ code: r.code, sectorName: r.sector?.name || '', zonePending: r.zonePending, possibleDuplicate: r.possibleDuplicate, photoUnreadable: r.photoUnreadable });
      setStep('done');
    } catch (err) {
      if (err instanceof ApiError && err.isNetwork) {
        await queue();
        return;
      }
      if (err instanceof ApiError && err.code === 'daily_limit') setError('Por hoy ya registraste varios puntos, gracias por estar tan pendiente. Si hay otro urgente, cuéntaselo a AURA y lo pasa directo al equipo de coordinación.');
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const sendRetake = async () => {
    if (!result || !retake.length) return;
    setBusy(true);
    try {
      const up = await uploadPhoto(retake[0].preview, 'origin', retake[0].location);
      const r = await api.post<{ text: string; manualReview: boolean }>(`/origins/${result.code}/photo-retake`, { photoId: up.id });
      setRetakeText(r.text);
      setResult({ ...result, photoUnreadable: false });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (!result?.code) return;
    const text = `Mi reporte de escombro en Kindra tiene el código ${result.code}. Puedes consultarlo en ${window.location.origin}/consultar`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(result.code);
        toast.success('Código copiado.');
      }
    } catch {
      /* cancelado */
    }
  };

  if (step === 'done' && result) {
    return (
      <div className="max-w-lg mx-auto">
        <PageTitle title={result.queued ? 'Guardado sin conexión' : 'Reporte registrado'} />
        {result.queued ? (
          <Alert tone="info" title="Se enviará cuando vuelva la señal">
            No hay conexión ahora mismo. Tu reporte quedó guardado en este teléfono y se envía solo en cuanto regrese la conexión. Te avisamos con el código cuando eso pase.
          </Alert>
        ) : (
          <>
            <Card className="text-center">
              <p className="text-sm text-muted">Tu código de reporte</p>
              <p className="my-3 text-5xl font-bold tracking-widest font-mono select-all" aria-live="polite">
                {result.code}
              </p>
              <p className="text-sm text-ink-2">Guárdalo. Con él puedes preguntar cuando quieras cómo va. Ahora lo revisa el equipo de coordinación y te avisamos apenas haya novedad.</p>
              <div className="mt-4 flex gap-2 justify-center">
                <Button
                  variant="secondary"
                  onClick={async () => {
                    await navigator.clipboard.writeText(result.code);
                    toast.success('Código copiado.');
                  }}
                >
                  <Copy size={18} /> Copiar
                </Button>
                <Button variant="secondary" onClick={share}>
                  <Share2 size={18} /> Compartir
                </Button>
              </div>
            </Card>
            {result.zonePending && (
              <Alert tone="warn" className="mt-3" title="Zona pendiente de autorización">
                Esa zona todavía no ha sido liberada por los equipos de rescate, así que por ahora no se puede retirar nada ahí. Tu reporte queda guardado y se activa apenas den el visto bueno. Mientras tanto, mejor mantenerse alejados.
              </Alert>
            )}
            {result.possibleDuplicate && (
              <Alert tone="info" className="mt-3" title="Puede que ya esté reportado">
                Parece que alguien ya reportó ese mismo punto hace poco. El equipo de coordinación va a revisar si se trata del mismo escombro; si es así, tu aviso se suma a ese reporte para darle más peso. Te mantenemos al tanto con el código {result.code}.
              </Alert>
            )}
            {result.photoUnreadable && (
              <Card className="mt-3" title="No se ve bien el escombro en la foto">
                <p className="text-sm text-ink-2 mb-3">Puede que esté oscura o muy de cerca. ¿Nos mandas otra un poco más abierta?</p>
                <PhotoCapture kind="origin" photos={retake} onChange={setRetake} max={1} deferUpload label="Tomar otra foto" />
                <div className="mt-3">
                  <Button onClick={sendRetake} disabled={!retake.length || busy}>
                    {busy ? 'Enviando…' : 'Enviar la nueva foto'}
                  </Button>
                </div>
              </Card>
            )}
            {retakeText && (
              <Alert tone="info" className="mt-3">
                {retakeText}
              </Alert>
            )}
          </>
        )}
        <div className="mt-4 grid gap-2">
          {!result.queued && (
            <Link to={`/reporte/${result.code}`} className="btn-primary">
              Ver mi ficha de trazabilidad
            </Link>
          )}
          <Link to="/aprende" className="btn-secondary">
            Mientras se atiende: qué pasa con el escombro en el centro
          </Link>
          <Link to="/" className="btn-ghost">
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <PageTitle title="Avisar de un escombro" subtitle={`Paso ${idx + 1} de ${STEPS.length}`} />
      <div className="h-1.5 w-full rounded-full bg-surface-2 mb-4" aria-hidden>
        <div className="h-1.5 rounded-full bg-primary" style={{ width: `${((idx + 1) / STEPS.length) * 100}%` }} />
      </div>

      {step === 'safety' && (
        <Card title="Antes de empezar, algo importante">
          <p className="text-base leading-relaxed">Toma la foto desde una distancia segura y no muevas nada, que puede haber partes inestables. No dejes que los niños se acerquen y evita el polvo.</p>
          <p className="mt-2 text-sm text-muted">Si ves láminas que parecen fibrocemento, envases de químicos o algo con olor raro, no te acerques: avísalo igual y el centro lo revisará aparte.</p>
        </Card>
      )}
      {step === 'photo' && (
        <Card title="Foto del escombro" subtitle="Al menos una. Desde lejos, sin mover nada.">
          <PhotoCapture kind="origin" photos={photos} onChange={setPhotos} max={3} deferUpload />
        </Card>
      )}
      {step === 'location' && (
        <Card title="¿Dónde está?" subtitle="Comparte la ubicación, o dinos la calle y una referencia que la gente de la zona conozca.">
          <LocationPicker value={loc} onChange={setLoc} />
        </Card>
      )}
      {step === 'size' && (
        <Card title="¿Más o menos qué tanto es?">
          <ChoiceList options={Object.entries(SIZE_LABELS)} value={size} onChange={(v) => setSize(v as OriginSize)} />
        </Card>
      )}
      {step === 'urgency' && (
        <Card title="¿Está tapando la entrada de alguna casa o es un riesgo para quien pasa?">
          <ChoiceList options={Object.entries(URGENCY_LABELS)} value={urgency} onChange={(v) => setUrgency(v as OriginUrgency)} />
        </Card>
      )}
      {step === 'extra' && (
        <Card title="Para terminar (opcional)">
          <div className="mb-4">
            <span className="label">Nota de voz</span>
            <VoiceNoteRecorder value={voice} onChange={setVoice} />
          </div>
          <Field label="Tu nombre" hint="Solo para llamarte así en los avisos. Puedes dejarlo vacío.">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Opcional" disabled={anonymous} />
          </Field>
          {user && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="h-5 w-5" />
              Enviar como anónimo (no suma puntos y no permite disputar el retiro)
            </label>
          )}
          {!user && <p className="text-xs text-muted mt-2">Estás reportando sin cuenta: recibirás avisos por el código. Los reportes sin cuenta no suman puntos ni permiten disputar el retiro.</p>}
        </Card>
      )}

      {error && (
        <Alert tone="bad" className="mt-3">
          {error}
        </Alert>
      )}

      <div className="mt-4 flex gap-2">
        {idx > 0 && (
          <Button variant="ghost" onClick={() => setStep(STEPS[idx - 1])} disabled={busy}>
            <ChevronLeft size={18} /> Atrás
          </Button>
        )}
        {step !== 'extra' ? (
          <Button className="flex-1" onClick={() => setStep(STEPS[idx + 1])} disabled={!canNext}>
            {step === 'safety' ? 'Entendido, empezar' : 'Siguiente'}
          </Button>
        ) : (
          <Button className="flex-1" onClick={submit} disabled={busy}>
            {busy ? 'Enviando…' : 'Enviar reporte'}
          </Button>
        )}
      </div>
      {idx === 0 && (
        <Button variant="ghost" className="mt-2 w-full" onClick={() => navigate('/aura')}>
          Prefiero contárselo a AURA
        </Button>
      )}
    </div>
  );
}

function ChoiceList({ options, value, onChange }: { options: [string, string][]; value: string; onChange: (v: string) => void }) {
  return (
    <div role="radiogroup" className="grid gap-2">
      {options.map(([k, label]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} onClick={() => onChange(k)} className={`rounded-[10px] border px-4 py-3 text-left text-base ${value === k ? 'border-primary bg-primary-soft font-semibold' : 'border-line bg-surface'}`}>
          {label}
        </button>
      ))}
    </div>
  );
}
