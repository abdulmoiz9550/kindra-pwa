import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import type { OriginEffectiveState } from '@kindra/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useSavedCodes } from '../lib/notifications';
import { fmtRelative } from '../lib/format';
import { Badge, Button, EmptyState, OriginStateBadge, PageTitle, Spinner } from '../components/ui';

export interface CitizenOrigin {
  code: string;
  sectorName: string | null;
  effectiveState: OriginEffectiveState;
  stateLabel: string;
  plain: string;
  createdAt: string;
  priority: string | null;
  completeness: number;
  pendingRemovalConfirmation: boolean;
  pendingSatisfaction: boolean;
  photoRetakeRequested: boolean;
  manualReview: boolean;
  anonymous: boolean;
  duplicateOfCode: string | null;
  photoUrl: string | null;
}

/** 16.3 Mis reportes: cuenta + códigos guardados en este teléfono. */
export default function MyReports() {
  const token = useAuth((s) => s.token);
  const codes = useSavedCodes();
  const mine = useQuery({ queryKey: ['me', 'origins', token], queryFn: () => api.get<CitizenOrigin[]>('/me/origins'), enabled: !!token });
  const saved = useQuery({ queryKey: ['origins', 'lookup', codes.join(',')], queryFn: () => api.post<CitizenOrigin[]>('/origins/lookup', { codes }), enabled: codes.length > 0 });
  const loading = (token && mine.isLoading) || (codes.length > 0 && saved.isLoading);
  const map = new Map<string, CitizenOrigin>();
  for (const o of [...(mine.data || []), ...(saved.data || [])]) map.set(o.code, o);
  const list = [...map.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return (
    <div className="max-w-lg mx-auto">
      <PageTitle
        title="Mis reportes"
        subtitle={token ? 'Reportes de tu cuenta y códigos guardados en este teléfono.' : 'Códigos guardados en este teléfono. Con una cuenta también verías tus reportes desde otro dispositivo.'}
        actions={
          <Link to="/avisar">
            <Button size="sm">Avisar de un escombro</Button>
          </Link>
        }
      />
      {loading && <Spinner />}
      {!loading && list.length === 0 && (
        <EmptyState
          title="Todavía no tienes reportes aquí"
          text="Cuando avises de un escombro, aparecerá en esta lista con su código y su estado."
          action={
            <Link to="/avisar">
              <Button>Avisar de un escombro</Button>
            </Link>
          }
        />
      )}
      <ul className="space-y-3">
        {list.map((o) => {
          const pending = o.pendingRemovalConfirmation || o.pendingSatisfaction || o.photoRetakeRequested;
          return (
            <li key={o.code}>
              <Link to={`/reporte/${o.code}`} className="card block hover:border-primary">
                <div className="flex items-start gap-3">
                  {o.photoUrl ? <img src={o.photoUrl} alt="" className="h-16 w-16 rounded-lg object-cover shrink-0" /> : <div className="h-16 w-16 rounded-lg bg-surface-2 shrink-0" aria-hidden />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-bold">{o.code}</span>
                      <ChevronRight size={18} className="text-muted shrink-0" />
                    </div>
                    <p className="text-xs text-muted">
                      {o.sectorName || 'Sector'} · {fmtRelative(o.createdAt)}
                    </p>
                    <div className="mt-1">
                      <OriginStateBadge state={o.effectiveState} />
                    </div>
                    <p className="mt-1 text-sm text-ink-2">{o.plain}</p>
                    {pending && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {o.pendingRemovalConfirmation && <Badge tone="info">Confirma si quedó despejado</Badge>}
                        {o.pendingSatisfaction && <Badge tone="info">Responde la pregunta final</Badge>}
                        {o.photoRetakeRequested && <Badge tone="warn">Hace falta otra foto</Badge>}
                      </div>
                    )}
                    {o.duplicateOfCode && <p className="text-xs text-muted mt-1">Sumado al reporte {o.duplicateOfCode}</p>}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
