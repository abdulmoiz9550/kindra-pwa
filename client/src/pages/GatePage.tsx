import { useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { errorMessage } from '../lib/api';
import { sendOrQueue } from '../lib/offlineActions';
import { useAuth } from '../lib/auth';
import { Alert, Button, Card, PageTitle } from '../components/ui';

/** QR fijo impreso en la puerta de un centro u obra: el escolta registra su presencia cuando no hay personal (addendum v1.3). */
export default function GatePage() {
  const { code = '' } = useParams();
  const token = useAuth((s) => s.token);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  if (!token) return <Navigate to={`/ingresar?next=/puerta/${code}`} replace />;
  const register = async () => {
    setBusy(true);
    try {
      const location = await new Promise<{ lat: number; lng: number } | null>((resolve) =>
        navigator.geolocation ? navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => resolve(null), { enableHighAccuracy: true, timeout: 15_000 }) : resolve(null),
      );
      const r = await sendOrQueue<{ gate: string; counts: boolean; closed: boolean }>('/tracking/gate-scan', { gateCode: code, location }, `Escaneo de la puerta ${code}`);
      if (!r) setResult({ ok: true, text: 'Sin señal: el escaneo quedó guardado con su hora y ubicación y se enviará al volver la conexión.' });
      else setResult({ ok: r.counts, text: r.closed ? `Llegada a ${r.gate} cerrada.` : r.counts ? `Presencia registrada en ${r.gate}.` : `Estás fuera del perímetro de ${r.gate}: el escaneo no cuenta como presencia. Se avisó al coordinador.` });
    } catch (err) {
      setResult({ ok: false, text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="max-w-md mx-auto">
      <PageTitle title="Puerta" subtitle={`Código ${code}`} />
      <Card>
        <p className="text-sm mb-3">Registra que el camión de tu viaje está en esta puerta. Se usa la ubicación del teléfono para comprobar que estás dentro del perímetro.</p>
        <Button onClick={register} disabled={busy}><MapPin size={18} /> Registrar presencia</Button>
        {result && <Alert tone={result.ok ? 'ok' : 'warn'} className="mt-3">{result.text}</Alert>}
      </Card>
    </div>
  );
}
