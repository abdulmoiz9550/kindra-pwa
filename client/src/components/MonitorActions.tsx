import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Camera } from 'lucide-react';
import type { Origin } from '@kindra/shared';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { toast } from '../lib/toast';
import { PhotoCapture, type CapturedPhoto } from './PhotoCapture';
import { Button, Card, Alert } from './ui';

/** Acciones del contralor comunitario sobre un origen de su sector (4): verificar en sitio y confirmar despeje con foto de después. */
export function MonitorActions({ origin }: { origin: Origin }) {
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const [onSite, setOnSite] = useState<CapturedPhoto[]>([]);
  const [after, setAfter] = useState<CapturedPhoto[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  if (!user || user.activeRole !== 'monitor') return null;
  if (origin.reporterId === user.id) return null;
  const refresh = () => qc.invalidateQueries({ queryKey: ['origins', origin.code] });
  const send = async (kind: 'on-site' | 'after-photo', photoId: string) => {
    setBusy(kind);
    try {
      await api.post(`/origins/${origin.code}/${kind}`, kind === 'on-site' ? { photoId } : { afterPhotoId: photoId });
      toast.success(kind === 'on-site' ? 'Origen marcado como verificado en sitio.' : 'Foto de después registrada.');
      setOnSite([]);
      setAfter([]);
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card title="Contralor comunitario" subtitle="Tus verificaciones en sitio ayudan a confirmar lo que reportan tus vecinos." className="mb-3">
      {origin.verifiedOnSiteAt ? (
        <Alert tone="ok">Este origen ya fue verificado en sitio.</Alert>
      ) : (
        <div className="mb-4">
          <p className="text-sm font-semibold mb-2 flex items-center gap-1">
            <ShieldCheck size={16} /> Verificar en sitio con foto
          </p>
          <PhotoCapture kind="on_site" label="Foto desde el sitio" photos={onSite} onChange={setOnSite} max={1} />
          <Button className="mt-2" disabled={!onSite[0]?.id || busy === 'on-site'} onClick={() => send('on-site', onSite[0].id)}>
            {busy === 'on-site' ? 'Enviando…' : 'Marcar como verificado en sitio'}
          </Button>
        </div>
      )}
      <div>
        <p className="text-sm font-semibold mb-2 flex items-center gap-1">
          <Camera size={16} /> Confirmar despeje con foto de después
        </p>
        <PhotoCapture kind="after" label="Foto de después" photos={after} onChange={setAfter} max={1} />
        <Button variant="secondary" className="mt-2" disabled={!after[0]?.id || busy === 'after-photo'} onClick={() => send('after-photo', after[0].id)}>
          {busy === 'after-photo' ? 'Enviando…' : 'Registrar foto de después'}
        </Button>
      </div>
    </Card>
  );
}
