import { Link, Navigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, ShieldCheck, ExternalLink } from 'lucide-react';
import type { KindraCard as Card } from '@kindra/shared';
import { ROLE_LABELS } from '@kindra/shared';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useFeature } from '../lib/config';
import { toast } from '../lib/toast';
import { fmtDate } from '../lib/format';
import { Alert, ConfirmButton, PageTitle, Spinner } from '../components/ui';
import { EntityBadge, KINDRA_MARK } from '../components/Brand';

/**
 * Tarjeta Kindra (addendum, parte 1): la misma tarjeta y el mismo QR personal e intransferible
 * para todos los módulos. Los puntos de escombros van al mismo saldo.
 */
export default function KindraCard() {
  const token = useAuth((s) => s.token);
  const on = useFeature('kindra_card');
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['me', 'card', token], queryFn: () => api.get<Card>('/me/card'), enabled: !!token && on });
  if (!token) return <Navigate to="/ingresar?next=/tarjeta" replace />;
  if (!on) return <Alert tone="info">La tarjeta Kindra no está disponible en este momento.</Alert>;
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Alert tone="bad">{q.error ? errorMessage(q.error) : 'No se pudo cargar la tarjeta.'}</Alert>;
  const c = q.data;
  const regenerate = async () => {
    try {
      const next = await api.post<Card>('/me/card/regenerate');
      qc.setQueryData(['me', 'card', token], next);
      toast.success('Tarjeta nueva emitida. El QR anterior ya no vale.');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <div className="max-w-md mx-auto">
      <PageTitle title="Mi tarjeta Kindra" subtitle="Tu QR personal e intransferible. Es el mismo en todos los módulos de Kindra y tus puntos van a un solo saldo." />
      <div
        className="relative overflow-hidden rounded-2xl p-5 text-white shadow-lg"
        style={{ background: 'linear-gradient(135deg, var(--brand-deep) 0%, var(--brand-teal) 70%, var(--brand-green) 140%)' }}
      >
        <span aria-hidden className="absolute -right-10 -top-10 h-40 w-40 rounded-full" style={{ background: 'var(--brand-orange)', opacity: 0.18 }} />
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <img src={KINDRA_MARK} alt="Kindra" className="h-8 w-8 rounded-md" />
            <span className="font-bold tracking-wide">Kindra</span>
          </div>
          <EntityBadge size={30} />
        </div>
        <div className="relative mt-5 grid grid-cols-[1fr_auto] gap-4 items-end">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-widest text-white/70">Titular</p>
            <p className="text-2xl font-bold truncate">{c.alias}</p>
            <p className="mt-2 text-sm">
              {c.levelName} · <strong>{c.points}</strong> puntos
            </p>
            <p className="text-xs text-white/70 mt-1">Desde {fmtDate(c.memberSince)}</p>
            {c.verified && (
              <p className="mt-2 inline-flex items-center gap-1 text-xs bg-white/15 rounded-full px-2 py-0.5">
                <ShieldCheck size={13} /> Identidad verificada
              </p>
            )}
          </div>
          <div className="bg-white rounded-xl p-1.5 w-32 h-32" dangerouslySetInnerHTML={{ __html: c.qrSvg }} role="img" aria-label={`QR personal de la tarjeta ${c.cardCode}`} />
        </div>
        <p className="relative mt-4 font-mono text-sm tracking-[0.2em] text-white/90">{c.cardCode}</p>
      </div>

      <div className="mt-4 space-y-2 text-sm">
        {c.roles.length > 1 && <p>Roles: {c.roles.map((r) => ROLE_LABELS[r]).join(', ')}</p>}
        {c.entityName && <p>Entidad: {c.entityName}</p>}
        {c.spaceName && <p className="text-muted">Espacio: {c.spaceName}</p>}
        <p className="text-muted">Quien escanee el QR solo ve tu alias, tu nivel y si tu identidad está verificada. Nunca tu teléfono ni tu nombre.</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link to={`/publico/tarjeta/${c.cardCode}`} className="btn-secondary">
          <ExternalLink size={16} /> Ver lo que muestra el QR
        </Link>
        <ConfirmButton label="Perdí mi tarjeta" variant="secondary" confirmLabel="Emitir tarjeta nueva" onConfirm={regenerate}>
          Se emite una tarjeta con un código nuevo. El QR anterior deja de funcionar. Tus puntos no cambian.
        </ConfirmButton>
      </div>
      <p className="mt-3 text-xs text-muted inline-flex items-center gap-1">
        <RefreshCw size={12} /> Los puntos se actualizan solos cuando otra persona verifica un hecho de tus reportes.
      </p>
    </div>
  );
}
