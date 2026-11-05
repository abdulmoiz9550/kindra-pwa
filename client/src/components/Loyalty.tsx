import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Award, Users, Share2, Copy, CreditCard, CheckCircle2, Circle } from 'lucide-react';
import type { Achievement, ReferralSummary } from '@kindra/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useFeature } from '../lib/config';
import { toast } from '../lib/toast';
import { fmtDate } from '../lib/format';
import { Button, Card, KeyValue, ProgressBar, Spinner } from './ui';

/** Acceso a la tarjeta Kindra desde el perfil. */
export function CardLink() {
  const on = useFeature('kindra_card');
  if (!on) return null;
  return (
    <Link to="/tarjeta" className="card card-accent mb-3 flex items-center gap-3 p-4 hover:bg-surface-2">
      <CreditCard size={22} className="text-primary shrink-0" />
      <span className="min-w-0">
        <span className="block font-semibold">Mi tarjeta Kindra</span>
        <span className="block text-sm text-muted">QR personal e intransferible. Un solo saldo de puntos en todos los módulos.</span>
      </span>
    </Link>
  );
}

function AchievementItem({ a }: { a: Achievement }) {
  const pct = a.progress ? (a.progress.current / Math.max(1, a.progress.target)) * 100 : a.earned ? 100 : 0;
  return (
    <li className={`rounded-xl border p-3 ${a.earned ? 'border-[var(--brand-green)] bg-ok-soft' : 'border-line'}`}>
      <div className="flex items-start gap-2">
        {a.earned ? <CheckCircle2 size={18} className="text-ok shrink-0 mt-0.5" /> : <Circle size={18} className="text-muted shrink-0 mt-0.5" />}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm">{a.name}</p>
          <p className="text-xs text-muted">{a.description}</p>
          {a.earned && a.earnedAt && <p className="text-xs text-ok mt-1">Logrado el {fmtDate(a.earnedAt)}</p>}
          {!a.earned && a.progress && a.progress.target > 1 && (
            <div className="mt-2">
              <ProgressBar value={pct} label={`${a.progress.current} de ${a.progress.target}${a.key === 'sector_half' ? ' %' : ''}`} />
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

/** Logros en dos capas (addendum, parte 1): personales y comunitarios del sector. */
export function Achievements() {
  const token = useAuth((s) => s.token);
  const on = useFeature('achievements');
  const q = useQuery({ queryKey: ['me', 'achievements', token], queryFn: () => api.get<{ personal: Achievement[]; community: Achievement[]; sectorName: string | null }>('/me/achievements'), enabled: !!token && on });
  if (!on) return null;
  if (q.isLoading) return <Spinner />;
  if (!q.data) return null;
  const earned = q.data.personal.filter((a) => a.earned).length;
  return (
    <Card
      className="mb-3"
      title={
        <span className="inline-flex items-center gap-2">
          <Award size={18} /> Logros
        </span>
      }
      subtitle="Se ganan con hechos verificados por otras personas. No hay rachas ni premios por cantidad de reportes."
    >
      <h3 className="label">
        Personales · {earned} de {q.data.personal.length}
      </h3>
      <ul className="grid sm:grid-cols-2 gap-2 mb-4">
        {q.data.personal.map((a) => (
          <AchievementItem key={a.key} a={a} />
        ))}
      </ul>
      <h3 className="label">De tu comunidad{q.data.sectorName ? ` · ${q.data.sectorName}` : ''}</h3>
      {q.data.community.length ? (
        <ul className="grid sm:grid-cols-2 gap-2">
          {q.data.community.map((a) => (
            <AchievementItem key={a.key} a={a} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Indica tu sector de residencia en tu cuenta para ver los logros de tu comunidad.</p>
      )}
    </Card>
  );
}

/** Referidos (addendum, parte 2): suman solo cuando el primer reporte de la persona invitada se valida. */
export function Referrals() {
  const token = useAuth((s) => s.token);
  const on = useFeature('referrals');
  const q = useQuery({ queryKey: ['me', 'referrals', token], queryFn: () => api.get<ReferralSummary>('/me/referrals'), enabled: !!token && on });
  if (!on || !q.data) return null;
  const r = q.data;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(r.shareUrl);
      toast.success('Enlace copiado.');
    } catch {
      toast.error('No se pudo copiar. Mantén presionado el enlace para copiarlo.');
    }
  };
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Kindra', text: 'Avisa dónde hay escombro en tu sector y sigue su recorrido hasta una obra pública.', url: r.shareUrl });
      } catch {
        /* cancelado */
      }
    } else copy();
  };
  return (
    <Card
      className="mb-3"
      title={
        <span className="inline-flex items-center gap-2">
          <Users size={18} /> Invita a tus vecinos
        </span>
      }
      subtitle="Sumas puntos cuando el primer reporte de la persona que invitaste es validado. Registrarse solo no da puntos."
    >
      <p className="font-mono text-lg tracking-wider mb-1">{r.referralCode}</p>
      <p className="text-xs text-muted break-all mb-3">{r.shareUrl}</p>
      <KeyValue
        items={[
          { k: 'Personas invitadas', v: r.invited },
          { k: 'Con primer reporte validado', v: r.validated },
          { k: 'Puntos por referidos', v: r.pointsEarned },
        ]}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={share}>
          <Share2 size={16} /> Compartir
        </Button>
        <Button variant="ghost" size="sm" onClick={copy}>
          <Copy size={16} /> Copiar enlace
        </Button>
      </div>
    </Card>
  );
}
