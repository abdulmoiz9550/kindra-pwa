import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { PublicUser, Role } from '@kindra/shared';
import { ROLE_HOME, ROLE_LABELS } from '@kindra/shared';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { usePublicConfig, useFeature } from '../../lib/config';
import { Alert, Button, Card, Field, Input, PageTitle, Tabs } from '../../components/ui';

type Mode = 'password' | 'code';

/** Cuenta única con roles activables (3.6) + pre-registro por código para personas sin teléfono (18.4). */
export default function Login() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const setSession = useAuth((s) => s.setSession);
  const { data: cfg } = usePublicConfig();
  // Addendum: el pre-registro por código queda oculto en esta fase (se enciende desde Funciones).
  const preregOn = useFeature('preregistration');
  const [modeState, setMode] = useState<Mode>('password');
  const mode: Mode = preregOn ? modeState : 'password';
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const done = (s: { token: string; user: PublicUser }) => {
    setSession(s);
    qc.clear();
    const next = params.get('next');
    navigate(next && next.startsWith('/') ? next : ROLE_HOME[s.user.activeRole] || '/');
  };
  const run = async (fn: () => Promise<{ token: string; user: PublicUser }>) => {
    setBusy(true);
    setError(null);
    try {
      done(await fn());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <PageTitle title="Ingresar" subtitle="Para avisar de un escombro no hace falta cuenta. La cuenta sirve para sumar puntos, disputar un retiro y usar roles institucionales." />
      {preregOn && (
        <Tabs
          value={mode}
          onChange={setMode}
          items={[
            { value: 'password', label: 'Alias y contraseña' },
            { value: 'code', label: 'Código de pre-registro' },
          ]}
        />
      )}
      <Card className="mt-2">
        {mode === 'password' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(() => api.post('/auth/login', { identifier, password }));
            }}
          >
            <Field label="Alias o teléfono" required>
              <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required />
            </Field>
            <Field label="Contraseña" required>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </Field>
            {error && (
              <Alert tone="bad" className="mb-3">
                {error}
              </Alert>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(() => api.post('/auth/prereg', { code }));
            }}
          >
            <p className="text-sm text-ink-2 mb-3">Si te pre-registraron en una jornada comunitaria, entra con el código que te entregaron. No hace falta teléfono.</p>
            <Field label="Código de pre-registro" required>
              <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="PR-XXXXXX" className="font-mono tracking-widest" required />
            </Field>
            {error && (
              <Alert tone="bad" className="mb-3">
                {error}
              </Alert>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Entrando…' : 'Entrar con el código'}
            </Button>
          </form>
        )}
        <p className="mt-4 text-sm text-center">
          ¿Sin cuenta?{' '}
          <Link to="/registro" className="underline text-primary">
            Crear una cuenta ciudadana
          </Link>
        </p>
      </Card>

      {cfg?.demoMode && cfg.demoRoles.length > 0 && (
        <Card className="mt-4" title="Usuarios de prueba (demostración)" subtitle="Contraseña para todos: demo1234. Un toque entra directo.">
          <div className="grid grid-cols-2 gap-2">
            {cfg.demoRoles.map((r) => (
              <Button key={r.role} variant="secondary" size="sm" disabled={busy} onClick={() => run(() => api.post('/auth/demo-switch', { role: r.role as Role }))}>
                {ROLE_LABELS[r.role]}
                <span className="block text-xs text-muted font-normal">{r.alias}</span>
              </Button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
