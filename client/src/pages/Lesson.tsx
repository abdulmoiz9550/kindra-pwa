import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { Download, Copy, ChevronLeft } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { usePublicConfig } from '../lib/config';
import { toast } from '../lib/toast';
import { Alert, Badge, Button, Card, PageTitle, Spinner } from '../components/ui';
import type { LessonItem } from './Learn';

interface CompleteResult {
  correct: boolean;
  alreadyCompleted: boolean;
  correctAnswer: string;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    lines.push(line);
  }
  return lines;
}

/** 10: lección con pregunta final; exportable como imagen (WhatsApp) y texto (radio / cartelera) con QR al tablero (10.3). */
export default function LessonPage() {
  const { id = '' } = useParams();
  const token = useAuth((s) => s.token);
  const user = useAuth((s) => s.user);
  const { data: cfg } = usePublicConfig();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['lessons', token], queryFn: () => api.get<LessonItem[]>('/lessons') });
  const lesson = q.data?.find((l) => l.id === id);
  const [answer, setAnswer] = useState<number | null>(null);
  const [result, setResult] = useState<CompleteResult | null>(null);
  const [busy, setBusy] = useState(false);
  const sectorId = user?.sectorId || null;

  if (q.isLoading) return <Spinner />;
  if (!lesson) return <Alert tone="warn">La lección no existe.</Alert>;

  const submit = async () => {
    if (answer === null) return;
    setBusy(true);
    try {
      const r = await api.post<CompleteResult>(`/lessons/${lesson.id}/complete`, { answerIndex: answer });
      setResult(r);
      qc.invalidateQueries({ queryKey: ['lessons'] });
      qc.invalidateQueries({ queryKey: ['me'] });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const exportImage = async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#f4f3ef';
    ctx.fillRect(0, 0, 1080, 1350);
    ctx.fillStyle = '#1f4e3d';
    ctx.fillRect(0, 0, 1080, 140);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText(cfg?.branding.entityName || 'Ente Coordinador', 60, 85);
    ctx.font = '26px sans-serif';
    ctx.fillText(cfg?.branding.kindraLine || 'con tecnología Kindra', 60, 120);
    ctx.fillStyle = '#1f2a24';
    ctx.font = 'bold 48px sans-serif';
    let y = 230;
    for (const line of wrapText(ctx, `${lesson.order}. ${lesson.title}`, 960)) {
      ctx.fillText(line, 60, y);
      y += 58;
    }
    y += 10;
    ctx.font = '32px sans-serif';
    for (const line of wrapText(ctx, lesson.content, 960)) {
      ctx.fillText(line, 60, y);
      y += 44;
    }
    y += 20;
    ctx.font = 'bold 30px sans-serif';
    for (const line of wrapText(ctx, `Pregunta: ${lesson.question}`, 960)) {
      ctx.fillText(line, 60, y);
      y += 40;
    }
    if (lesson.validationStatus === 'pending') {
      ctx.fillStyle = '#b9811f';
      ctx.font = '26px sans-serif';
      ctx.fillText('Pendiente de validación técnica', 60, y + 20);
      ctx.fillStyle = '#1f2a24';
    }
    const target = `${cfg?.publicBaseUrl || window.location.origin}/tablero${sectorId ? `?sector=${sectorId}` : ''}`;
    const qr = document.createElement('canvas');
    await QRCode.toCanvas(qr, target, { width: 260, margin: 1 });
    ctx.drawImage(qr, 760, 1040, 260, 260);
    ctx.font = '24px sans-serif';
    ctx.fillStyle = '#4c5852';
    ctx.fillText('Cómo va tu sector:', 60, 1180);
    ctx.font = '22px sans-serif';
    ctx.fillText(target, 60, 1215);
    ctx.fillText(cfg?.simulatedLabel || '', 60, 1300);
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `leccion-${lesson.order}.png`;
    a.click();
  };

  const exportText = async () => {
    try {
      const text = await api.text(`/lessons/${lesson.id}/text${sectorId ? `?sector=${sectorId}` : ''}`);
      try {
        await navigator.clipboard.writeText(text);
        toast.success('Texto copiado. También se descarga como archivo.');
      } catch {
        /* sin portapapeles */
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
      a.download = `leccion-${lesson.order}.txt`;
      a.click();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <Link to="/aprende" className="inline-flex items-center gap-1 text-sm text-primary mb-2">
        <ChevronLeft size={16} /> Todas las lecciones
      </Link>
      <PageTitle title={`${lesson.order}. ${lesson.title}`} />
      <div className="mb-3 flex flex-wrap gap-1">
        {lesson.validationStatus === 'pending' && <Badge tone="warn">pendiente de validación técnica</Badge>}
        {lesson.provisional && <Badge tone="neutral" icon={false}>texto provisional</Badge>}
        {lesson.completed && <Badge tone="ok">ya completada</Badge>}
      </div>
      <Card className="mb-3">
        {lesson.imageUrl && <img src={lesson.imageUrl} alt="" className="mb-3 w-full rounded-lg" />}
        <p className="text-base leading-relaxed whitespace-pre-line">{lesson.content}</p>
      </Card>
      <Card title={lesson.question} className="mb-3">
        <div role="radiogroup" className="grid gap-2">
          {lesson.options.map((opt, i) => {
            const picked = answer === i;
            const showCorrect = result && i === lesson.options.indexOf(result.correctAnswer);
            return (
              <button key={i} type="button" role="radio" aria-checked={picked} disabled={!!result} onClick={() => setAnswer(i)} className={`rounded-[10px] border px-4 py-3 text-left ${showCorrect ? 'border-ok bg-ok-soft' : picked ? 'border-primary bg-primary-soft' : 'border-line bg-surface'}`}>
                {i + 1}. {opt}
              </button>
            );
          })}
        </div>
        {!result && (
          <Button className="mt-3" onClick={submit} disabled={answer === null || busy}>
            {busy ? 'Enviando…' : 'Responder'}
          </Button>
        )}
        {result && (
          <Alert tone={result.correct ? 'ok' : 'info'} className="mt-3" title={result.correct ? 'Correcto' : 'No era esa'}>
            {!result.correct && <p>La respuesta correcta es: {result.correctAnswer}.</p>}
            {result.alreadyCompleted ? <p>Esta lección ya la habías completado; no suma puntos otra vez.</p> : token ? <p>Lección completada: sumaste puntos a tu cuenta.</p> : <p>Lección completada. Con una cuenta, cada lección suma puntos.</p>}
          </Alert>
        )}
      </Card>
      <Card title="Compartir esta lección" subtitle="Para WhatsApp, radio comunitaria o cartelera, con QR al tablero del sector.">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={exportImage}>
            <Download size={18} /> Descargar como imagen
          </Button>
          <Button variant="secondary" onClick={exportText}>
            <Copy size={18} /> Copiar texto para radio o cartelera
          </Button>
        </div>
      </Card>
    </div>
  );
}
