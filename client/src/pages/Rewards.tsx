import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { LevelInfo } from '@kindra/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { usePublicConfig } from '../lib/config';
import { Badge, Card, PageTitle, ProgressBar, Spinner } from '../components/ui';
import { fmtDateTime } from '../lib/format';
import { Achievements } from '../components/Loyalty';

interface LedgerEntry { at: string; module: string; action: string; label: string; code: string | null; points: number; status: 'applied' | 'reversed' | 'capped'; reason?: string | null }

const HOW: [string, string, string][] = [
  ['Ciudadano', 'Reporte validado', 'reportValidated'],
  ['Ciudadano', 'Cierre confirmado', 'closureConfirmed'],
  ['Ciudadano', 'Tu reporte llega a Destino Final', 'reportFinalDestination'],
  ['Ciudadano', 'Disputa con razón', 'disputeValid'],
  ['Contralor Comunitario', 'Verificación en campo', 'fieldVerification'],
  ['Contralor Comunitario', 'Disputa resuelta', 'disputeResolved'],
  ['Contralor Comunitario', 'Acreditación aprobada', 'accreditation'],
  ['Ente de Retiro', 'Viaje recibido sin diferencias', 'tripNoDiscrepancy'],
  ['Centro de Disposición', 'Recepción completa en 24 h', 'receptionWithin24h'],
  ['Centro de Disposición', 'Balance de masa cerrado', 'massBalanceClosed'],
  ['Evaluador Técnico', 'Ensayo registrado y validado', 'testValidated'],
  ['Destino Final', 'Recepción en destino registrada', 'destinationReceipt'],
  ['Todos los roles', 'Lección de Training completada', 'lessonCompleted'],
  ['Todos los roles', 'Curso de Training completado', 'courseCompleted'],
  ['Todos los roles', 'Semana activa consecutiva', 'weeklyStreak'],
];

/**
 * Reward (addendum v4.2, 3.1): la página de Raíces de cada persona. Saldo, nivel, insignias e historial completo.
 * Las Raíces no son dinero: aquí no hay montos, billeteras ni retiros, y no hay clasificaciones públicas.
 */
export default function Rewards() {
  const token = useAuth((s) => s.token);
  const { data: cfg } = usePublicConfig();
  const q = useQuery({ queryKey: ['me', 'profile', token], queryFn: () => api.get<{ points: { points: number; level: LevelInfo; ledger: LedgerEntry[] } }>('/me/profile'), enabled: !!token });
  if (!token) return <Navigate to="/ingresar?next=/recompensas" replace />;
  if (q.isLoading || !q.data) return <Spinner />;
  const { points, level, ledger = [] } = q.data.points;
  const pct = level.next ? ((points - level.threshold) / (level.next.threshold - level.threshold)) * 100 : 100;
  const values = cfg?.raices?.values as Record<string, number> | undefined;
  const cap = cfg?.raices?.dailyCaps?.reportValidated;
  return (
    <div className="max-w-lg mx-auto">
      <PageTitle title="Reward" subtitle="Tus Raíces: un solo saldo en todos los módulos de Kindra. Llegan cuando otra persona valida lo que hiciste." />
      <Card className="mb-3" title={`${points} Raíces`} subtitle={`Nivel: ${level.name}`}>
        {level.next ? <ProgressBar value={pct} label={`Hacia ${level.next.name} (${level.next.threshold} Raíces)`} /> : <p className="text-sm">Alcanzaste el nivel más alto.</p>}
        <ul className="mt-3 text-sm space-y-1">
          {(cfg?.levels || []).map((l) => (
            <li key={l.key} className={l.key === level.key ? 'font-semibold' : 'text-muted'}>{l.name} · desde {l.threshold} Raíces</li>
          ))}
        </ul>
      </Card>
      <Achievements />
      <Card className="mb-3" title="Historial">
        {ledger.length === 0 ? <p className="text-sm text-muted">Todavía no hay movimientos. Enviar un reporte no suma; que lo validen, sí.</p> : (
          <ul className="divide-y divide-line text-sm">
            {[...ledger].reverse().map((h, n) => (
              <li key={n} className="py-1.5 flex justify-between gap-2">
                <span>{h.label}{h.code ? ` · ${h.code}` : ''}<span className="block text-xs text-muted">{fmtDateTime(h.at)}{h.reason ? ` · ${h.points < 0 ? 'revertido: ' : ''}${h.reason}` : ''}</span></span>
                <span className="text-right">{h.status === 'capped' ? <Badge tone="neutral">Tope diario</Badge> : <strong>{h.points > 0 ? `+${h.points}` : h.points}</strong>}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {values && (
        <Card className="mb-3" title="Cómo ganar Raíces" subtitle={`Solo cuenta lo que valida otra persona; nadie gana por lo que valida él mismo. Si un registro se rechaza, se marca duplicado o se disputa con razón, sus Raíces se revierten.${cap ? ` Tope: ${cap} reportes validados por día.` : ''}`}>
          <table className="table-plain"><thead><tr><th scope="col">Rol</th><th scope="col">Hecho validado</th><th scope="col" className="text-right">Raíces</th></tr></thead><tbody>
            {HOW.map(([r, a, k]) => <tr key={k}><td>{r}</td><td>{a}</td><td className="text-right">+{values[k] ?? 0}</td></tr>)}
          </tbody></table>
        </Card>
      )}
      <Card className="mb-3" title="Canjear Raíces">
        <p className="text-sm">{cfg?.raices?.catalogApproved ? 'El catálogo de premios se publica en Noticias.' : 'Próximamente'}</p>
      </Card>
    </div>
  );
}
