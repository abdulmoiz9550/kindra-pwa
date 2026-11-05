import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import type { PublicUser } from '@kindra/shared';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Alert, Button, Card, Field, Input, Spinner } from '../../components/ui';

interface Status {
  enabled: boolean;
  required: boolean;
  sessionVerified: boolean;
  pendingSetup: boolean;
  demoCode: string | null;
}

interface Setup {
  secret: string;
  otpauthUrl: string;
  qrSvg: string;
  demoCode: string | null;
}

/**
 * Addendum, parte 3: la administración principal exige verificación en dos pasos.
 * Si falta configurarla, guía el alta con una aplicación de autenticación; si ya está, pide el código.
 */
export function TwoFactorGate({ children }: { children: ReactNode }) {
  const token = useAuth((s) => s.token);
  const setSession = useAuth((s) => s.setSession);
  const qc = useQueryClient();
  // En demostración el código de prueba cambia cada 30 segundos: se refresca mientras la puerta está visible.
  const status = useQuery({ queryKey: ['2fa', token], queryFn: () => api.get<Status>('/auth/2fa/status'), enabled: !!token, refetchInterval: (q) => (q.state.data && !q.state.data.sessionVerified && q.state.data.demoCode ? 20_000 : false) });
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status.isLoading || !status.data) return <Spinner label="Comprobando la verificación en dos pasos…" />;
  const s = status.data;
  if (s.sessionVerified) return <>{children}</>;

  const finish = (session: { token: string; user: PublicUser }) => {
    setSession(session);
    setCode('');
    qc.invalidateQueries({ queryKey: ['2fa'] });
    qc.invalidateQueries({ queryKey: ['admin'] });
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const startSetup = () => run(async () => setSetup(await api.post<Setup>('/auth/2fa/setup')));
  const enable = () => run(async () => finish(await api.post<{ token: string; user: PublicUser }>('/auth/2fa/enable', { code })));
  const verify = () => run(async () => finish(await api.post<{ token: string; user: PublicUser }>('/auth/2fa/verify', { code })));
  const demoCode = setup?.demoCode || s.demoCode;

  return (
    <div className="max-w-md mx-auto">
      <Card
        title={
          <span className="inline-flex items-center gap-2">
            <ShieldCheck size={20} /> Verificación en dos pasos
          </span>
        }
        subtitle="La administración principal de Kindra solo se abre con la contraseña y un código de tu aplicación de autenticación."
      >
        {error && (
          <Alert tone="bad" className="mb-3">
            {error}
          </Alert>
        )}
        {s.enabled ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              verify();
            }}
          >
            <Field label="Código de 6 dígitos" hint="Ábrelo en Google Authenticator, Microsoft Authenticator u otra aplicación similar.">
              <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
            </Field>
            {demoCode && <DemoHint code={demoCode} onUse={() => setCode(demoCode)} />}
            <Button type="submit" disabled={busy || code.length !== 6}>
              Confirmar
            </Button>
          </form>
        ) : !setup ? (
          <>
            <p className="text-sm mb-3">Todavía no configuraste la verificación en dos pasos. Necesitas una aplicación de autenticación en tu teléfono.</p>
            <Button onClick={startSetup} disabled={busy}>
              Configurar ahora
            </Button>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              enable();
            }}
          >
            <ol className="text-sm list-decimal pl-5 space-y-1 mb-3">
              <li>Abre tu aplicación de autenticación y elige "agregar cuenta".</li>
              <li>Escanea este código QR o escribe la clave a mano.</li>
              <li>Escribe el código de 6 dígitos que aparece.</li>
            </ol>
            <div className="mx-auto w-48 bg-white p-2 rounded-lg border border-line mb-2" dangerouslySetInnerHTML={{ __html: setup.qrSvg }} aria-label="Código QR para la aplicación de autenticación" role="img" />
            <p className="text-xs text-center text-muted mb-3 break-all">
              Clave: <span className="font-mono">{setup.secret}</span>
            </p>
            <Field label="Código de 6 dígitos">
              <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
            </Field>
            {demoCode && <DemoHint code={demoCode} onUse={() => setCode(demoCode)} />}
            <Button type="submit" disabled={busy || code.length !== 6}>
              Activar y continuar
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}

function DemoHint({ code, onUse }: { code: string; onUse: () => void }) {
  return (
    <Alert tone="info" className="mb-3" title="Modo demostración">
      Usuario de prueba: el código vigente es <span className="font-mono font-semibold">{code}</span>.{' '}
      <button type="button" className="underline" onClick={onUse}>
        Usarlo
      </button>
      . Con usuarios reales este aviso no aparece.
    </Alert>
  );
}
