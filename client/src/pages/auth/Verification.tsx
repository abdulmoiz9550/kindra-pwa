import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, Clock } from 'lucide-react';
import type { PublicUser } from '@kindra/shared';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { toast } from '../../lib/toast';
import { PhotoCapture, type CapturedPhoto } from '../../components/PhotoCapture';
import { Alert, Button, Card, PageTitle } from '../../components/ui';

/** 3.6: verificación de identidad por selfie y pantalla de progreso de verificación. */
export default function Verification() {
  const { user, setUser } = useAuth();
  const qc = useQueryClient();
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  if (!user) return <Navigate to="/ingresar?next=/verificacion" replace />;
  const status = user.verificationStatus;
  const steps = [
    { label: 'Cuenta creada', done: true },
    { label: 'Selfie enviada', done: status === 'pending' || status === 'verified' || status === 'rejected' },
    { label: 'Revisión del administrador', done: status === 'verified' || status === 'rejected', current: status === 'pending' },
    { label: 'Verificado', done: status === 'verified' },
  ];

  const submit = async () => {
    if (!photos[0]?.id) return;
    setBusy(true);
    try {
      const r = await api.post<{ user: PublicUser }>('/auth/selfie', { photoId: photos[0].id });
      setUser(r.user);
      qc.invalidateQueries({ queryKey: ['me'] });
      toast.success('Selfie enviada. Queda en revisión.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <PageTitle title="Verificación de identidad" subtitle="Solo se pide para roles institucionales y para contralores comunitarios. Reportar no la requiere." />
      <Card className="mb-3" title="Progreso">
        <ol className="space-y-2">
          {steps.map((s, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              {s.done ? <CheckCircle2 size={20} className="text-ok" aria-label="Listo" /> : s.current ? <Clock size={20} className="text-warn" aria-label="En curso" /> : <Circle size={20} className="text-muted" aria-label="Pendiente" />}
              <span className={s.done ? 'font-semibold' : ''}>
                {i + 1}. {s.label}
              </span>
            </li>
          ))}
        </ol>
      </Card>

      {status === 'verified' && <Alert tone="ok" title="Identidad verificada">Ya puedes activar tus roles desde el perfil o el selector de la parte superior.</Alert>}
      {status === 'pending' && <Alert tone="info" title="En revisión">Tu selfie fue enviada. Un administrador la revisa y te avisamos cuando quede verificada.</Alert>}
      {status === 'rejected' && (
        <Alert tone="warn" title="No se pudo verificar">
          La selfie no fue aceptada. Toma otra con buena luz, de frente y sin lentes oscuros, y vuelve a enviarla.
        </Alert>
      )}
      {(status === 'not_required' || status === 'rejected') && (
        <Card className="mt-3" title="Tomar la selfie" subtitle="De frente, con buena luz. La foto solo la ve el administrador.">
          <PhotoCapture kind="selfie" photos={photos} onChange={setPhotos} max={1} withLocation={false} label="Tomar selfie" />
          <Button className="mt-3" onClick={submit} disabled={!photos[0]?.id || busy}>
            {busy ? 'Enviando…' : 'Enviar para revisión'}
          </Button>
        </Card>
      )}
    </div>
  );
}
