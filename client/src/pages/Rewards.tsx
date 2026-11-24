import { Link, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { LevelInfo } from '@kindra/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { usePublicConfig } from '../lib/config';
import { Alert, Card, PageTitle, ProgressBar, Spinner } from '../components/ui';
import { fmtDateTime } from '../lib/format';
import { CardLink, Achievements, Referrals } from '../components/Loyalty';

/**
 * Recompensas (addendum v1.3, menú de Kindra): tarjeta Kindra, saldo de puntos, niveles comunes de Kindra y
 * logros, incluidos los de escombros. Nada de Kindra Hero, Kindra Gift, Semanas Locas ni publicidad en esta fase.
 */
export default function Rewards() {
  const token = useAuth((s) => s.token);
  const { data: cfg } = usePublicConfig();
  const q = useQuery({ queryKey: ['me', 'profile', token], queryFn: () => api.get<{ points: { points: number; level: LevelInfo; history: { at: string; delta: number; reason: string; applied: boolean }[] } }>('/me/profile'), enabled: !!token });
  if (!token) return <Navigate to="/ingresar?next=/recompensas" replace />;
  if (q.isLoading || !q.data) return <Spinner />;
  const { points, level, history } = q.data.points;
  const pct = level.next ? ((points - level.threshold) / (level.next.threshold - level.threshold)) * 100 : 100;
  return (
    <div className="max-w-lg mx-auto">
      <PageTitle title="Recompensas" subtitle="Un solo saldo de puntos en todos los módulos de Kindra. Los puntos llegan por hechos verificados por otras personas." />
      {cfg?.incentives?.status !== 'approved' && <Alert tone="warn" className="mb-3" title="Esquema pendiente de aprobación">Los puntos y niveles se muestran como referencia. No dan derecho a premios ni canjes.</Alert>}
      <Card className="mb-3" title={`${points} puntos`} subtitle={`Nivel: ${level.name}`}>
        {level.next ? <ProgressBar value={pct} label={`Hacia ${level.next.name} (${level.next.threshold} puntos)`} /> : <p className="text-sm">Alcanzaste el nivel más alto. Puedes solicitar el rol de contralor comunitario desde tu perfil.</p>}
        <ul className="mt-3 text-sm space-y-1">
          {(cfg?.levels || []).map((l) => (
            <li key={l.key} className={l.key === level.key ? 'font-semibold' : 'text-muted'}>{l.name} · desde {l.threshold} puntos</li>
          ))}
        </ul>
        <Link to="/perfil" className="mt-3 inline-block text-sm underline">Detalle de puntos en mi perfil</Link>
      </Card>
      {cfg?.points && (
        <Card className="mb-3" title="Cómo se ganan" subtitle="Cada punto sale de un registro verificado por otra persona. Los puntos no vencen y no se canjean.">
          <table className="table-plain"><thead><tr><th scope="col">Hecho</th><th scope="col">Quién lo verifica</th><th scope="col" className="text-right">Puntos</th></tr></thead><tbody>
            {([['Reporte validado', 'Coordinación', cfg.points.reportValidated], ['Retiro confirmado', 'Quien reportó', cfg.points.removalConfirmed], ['Cierre final del reporte', 'Plataforma, al usarse el material', cfg.points.finalClosure], ['Lección completada', 'Respuesta correcta', cfg.points.lessonCompleted], ['Verificación en sitio', 'Contralor comunitario', cfg.points.onSiteVerification], ['Primer reporte validado de alguien que invitaste', 'Coordinación', cfg.points.referralValidated], ['Reporte falso o duplicado a propósito', 'Coordinación', -cfg.points.rejectionPenalty]] as [string, string, number][]).map(([a, b, n]) => <tr key={a}><td>{a}</td><td>{b}</td><td className="text-right">{n > 0 ? `+${n}` : n}</td></tr>)}
          </tbody></table>
        </Card>
      )}
      <Card className="mb-3" title="Movimientos">
        {history.length === 0 ? <p className="text-sm text-muted">Todavía no hay movimientos.</p> : <ul className="divide-y divide-line text-sm">{[...history].reverse().slice(0, 50).map((h, n) => <li key={n} className="py-1.5 flex justify-between gap-2"><span>{h.reason}<span className="block text-xs text-muted">{fmtDateTime(h.at)}{h.applied ? '' : ' · no aplicado'}</span></span><strong>{h.delta > 0 ? `+${h.delta}` : h.delta}</strong></li>)}</ul>}
      </Card>
      <CardLink />
      <Achievements />
      <Referrals />
    </div>
  );
}
