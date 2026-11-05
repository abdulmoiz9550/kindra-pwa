import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, ShieldX, UserRound } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import { Card, Spinner, Alert, KeyValue } from '../../components/ui';
import { PublicHeader } from '../../components/PublicHeader';

interface PublicCardData {
  cardCode: string;
  alias: string;
  active: boolean;
  levelName: string;
  memberSince: string;
  identityVerified: boolean;
  roles: string[];
  entityName: string | null;
  spaceName: string | null;
}

/** Lo que ve quien escanea el QR personal de una tarjeta Kindra. Sin teléfono, nombre ni foto. */
export default function PublicCard() {
  const { code = '' } = useParams();
  const q = useQuery({ queryKey: ['public', 'tarjeta', code], queryFn: () => api.get<PublicCardData>(`/public/tarjeta/${encodeURIComponent(code)}`), retry: false });
  if (q.isLoading) return <Spinner label="Verificando la tarjeta…" />;
  const notFound = q.error instanceof ApiError && (q.error.status === 404 || q.error.status === 403);
  return (
    <div className="max-w-md mx-auto">
      <PublicHeader title="Tarjeta Kindra" subtitle="Verificación del QR personal e intransferible." />
      {q.error ? (
        <Alert tone="bad" title={notFound ? 'Tarjeta no válida' : 'No se pudo verificar'}>
          <span className="inline-flex items-center gap-2">
            <ShieldX size={16} /> {notFound ? `El código ${code} no corresponde a una tarjeta vigente. Puede haber sido reemplazada.` : 'Inténtalo de nuevo en un momento.'}
          </span>
        </Alert>
      ) : (
        q.data && (
          <>
            <Alert tone={q.data.active ? 'ok' : 'warn'} title={q.data.active ? 'Tarjeta vigente' : 'Cuenta inactiva'}>
              <span className="inline-flex items-center gap-2">
                <ShieldCheck size={16} /> Código {q.data.cardCode}
              </span>
            </Alert>
            <Card className="mt-4">
              <div className="flex items-center gap-3 mb-3">
                <span className="grid place-items-center h-12 w-12 rounded-full bg-surface-2">
                  <UserRound size={24} />
                </span>
                <div>
                  <p className="text-xl font-bold">{q.data.alias}</p>
                  <p className="text-sm text-muted">{q.data.levelName}</p>
                </div>
              </div>
              <KeyValue
                items={[
                  { k: 'Identidad', v: q.data.identityVerified ? 'Verificada por selfie' : 'Sin verificación (no la necesita para reportar)' },
                  { k: 'Roles', v: q.data.roles.join(', ') },
                  ...(q.data.entityName ? [{ k: 'Entidad', v: q.data.entityName }] : []),
                  ...(q.data.spaceName ? [{ k: 'Espacio', v: q.data.spaceName }] : []),
                  { k: 'Desde', v: fmtDate(q.data.memberSince) },
                ]}
              />
              <p className="mt-3 text-xs text-muted">La tarjeta es personal e intransferible. Esta página nunca muestra datos de contacto.</p>
            </Card>
          </>
        )
      )}
    </div>
  );
}
