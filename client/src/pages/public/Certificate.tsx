import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, ShieldX } from 'lucide-react';
import { api } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import { Card, Spinner, Alert } from '../../components/ui';
import { PublicHeader } from '../../components/PublicHeader';

type CertData = { valid: false } | { valid: true; code: string; alias: string; levelName: string; closedReports: number; issuedAt: string; sample: boolean; branding: { entityName: string; logoUrl: string | null; tagline: string } };

/** 9.7: verificación pública del certificado de participación. Muestra sin firma institucional. */
export default function Certificate() {
  const { code = '' } = useParams();
  const q = useQuery({ queryKey: ['public', 'certificado', code], queryFn: () => api.get<CertData>(`/public/certificados/${encodeURIComponent(code)}`) });
  if (q.isLoading) return <Spinner label="Verificando el certificado…" />;
  if (q.error) return <Alert tone="bad">No se pudo verificar el certificado en este momento.</Alert>;
  const c = q.data!;
  return (
    <div className="max-w-xl mx-auto">
      <PublicHeader title="Verificación de certificado" subtitle="Los certificados de participación se ganan con hechos verificados por otras personas, nunca por la cantidad de reportes." />
      {!c.valid ? (
        <Alert tone="bad" title="Certificado no encontrado">
          <span className="inline-flex items-center gap-2">
            <ShieldX size={16} /> El código {code} no corresponde a ningún certificado emitido.
          </span>
        </Alert>
      ) : (
        <>
          <Alert tone="ok" title="Certificado válido">
            <span className="inline-flex items-center gap-2">
              <ShieldCheck size={16} /> Emitido por la plataforma el {fmtDate(c.issuedAt)}.
            </span>
          </Alert>
          <Card className="mt-4 text-center border-2 border-primary">
            <p className="text-xs uppercase tracking-widest text-muted">{c.branding.entityName} · con tecnología Kindra</p>
            <h2 className="mt-3 text-xl font-bold">Certificado de participación</h2>
            <p className="mt-2 text-sm text-muted">Se reconoce a</p>
            <p className="text-2xl font-bold">{c.alias}</p>
            <p className="mt-2 text-sm">
              por alcanzar el nivel <strong>{c.levelName}</strong>
            </p>
            <p className="text-sm text-muted">
              con {c.closedReports} {c.closedReports === 1 ? 'reporte cerrado y verificado' : 'reportes cerrados y verificados'}
            </p>
            <p className="mt-4 font-mono text-sm">{c.code}</p>
            <p className="text-xs text-muted">{fmtDate(c.issuedAt)}</p>
            {c.sample && <p className="mt-4 text-xs text-warn font-semibold">Muestra sin firma institucional</p>}
          </Card>
        </>
      )}
    </div>
  );
}
