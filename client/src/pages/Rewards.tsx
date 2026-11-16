import { Link, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { LevelInfo } from '@kindra/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { usePublicConfig } from '../lib/config';
import { Card, PageTitle, ProgressBar, Spinner } from '../components/ui';
import { CardLink, Achievements, Referrals } from '../components/Loyalty';

/**
 * Recompensas (addendum v1.3, menú de Kindra): tarjeta Kindra, saldo de puntos, niveles comunes de Kindra y
 * logros, incluidos los de escombros. Nada de Kindra Hero, Kindra Gift, Semanas Locas ni publicidad en esta fase.
 */
export default function Rewards() {
  const token = useAuth((s) => s.token);
  const { data: cfg } = usePublicConfig();
  const q = useQuery({ queryKey: ['me', 'profile', token], queryFn: () => api.get<{ points: { points: number; level: LevelInfo } }>('/me/profile'), enabled: !!token });
  if (!token) return <Navigate to="/ingresar?next=/recompensas" replace />;
  if (q.isLoading || !q.data) return <Spinner />;
  const { points, level } = q.data.points;
  const pct = level.next ? ((points - level.threshold) / (level.next.threshold - level.threshold)) * 100 : 100;
  return (
    <div className="max-w-lg mx-auto">
      <PageTitle title="Recompensas" subtitle="Un solo saldo de puntos en todos los módulos de Kindra. Los puntos llegan por hechos verificados por otras personas." />
      <Card className="mb-3" title={`${points} puntos`} subtitle={`Nivel: ${level.name}`}>
        {level.next ? <ProgressBar value={pct} label={`Hacia ${level.next.name} (${level.next.threshold} puntos)`} /> : <p className="text-sm">Alcanzaste el nivel más alto. Puedes solicitar el rol de contralor comunitario desde tu perfil.</p>}
        <ul className="mt-3 text-sm space-y-1">
          {(cfg?.levels || []).map((l) => (
            <li key={l.key} className={l.key === level.key ? 'font-semibold' : 'text-muted'}>{l.name} · desde {l.threshold} puntos</li>
          ))}
        </ul>
        <Link to="/perfil" className="mt-3 inline-block text-sm underline">Detalle de puntos en mi perfil</Link>
      </Card>
      <CardLink />
      <Achievements />
      <Referrals />
    </div>
  );
}
