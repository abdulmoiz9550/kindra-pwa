import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { PublicUser } from '@kindra/shared';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { usePublicConfig } from '../../lib/config';
import { Alert, Button, Card, Field, Input, PageTitle, Select } from '../../components/ui';

/** Cuenta ciudadana opcional. */
export default function Register() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const setSession = useAuth((s) => s.setSession);
  const { data: cfg } = usePublicConfig();
  const [form, setForm] = useState({ alias: '', password: '', phone: '', name: '', sectorId: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const s = await api.post<{ token: string; user: PublicUser }>('/auth/register', { alias: form.alias, password: form.password, phone: form.phone || undefined, name: form.name || undefined, sectorId: form.sectorId || null });
      setSession(s);
      qc.clear();
      navigate('/mis-reportes');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <PageTitle title="Crear una cuenta" subtitle="La cuenta es opcional. Con ella sumas puntos por hechos verificados, puedes disputar un retiro y ves tu historial desde cualquier teléfono." />
      <Card>
        <form onSubmit={submit}>
          <Field label="Alias público" required hint="Es lo único que se muestra de ti, junto con tu nivel.">
            <Input value={form.alias} onChange={set('alias')} minLength={3} required autoComplete="username" />
          </Field>
          <Field label="Contraseña" required hint="Mínimo 6 caracteres.">
            <Input type="password" value={form.password} onChange={set('password')} minLength={6} required autoComplete="new-password" />
          </Field>
          <Field label="Teléfono" hint="Opcional. Sirve para entrar con él.">
            <Input type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" />
          </Field>
          <Field label="Nombre" hint="Opcional. Solo para llamarte así en los avisos.">
            <Input value={form.name} onChange={set('name')} autoComplete="name" />
          </Field>
          <Field label="Sector donde vives" hint="Opcional. Ayuda a mostrarte cómo va tu sector.">
            <Select value={form.sectorId} onChange={set('sectorId')}>
              <option value="">Prefiero no indicarlo</option>
              {cfg?.sectors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          {error && (
            <Alert tone="bad" className="mb-3">
              {error}
            </Alert>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Creando…' : 'Crear cuenta'}
          </Button>
        </form>
        <p className="mt-4 text-sm text-center">
          ¿Ya tienes cuenta?{' '}
          <Link to="/ingresar" className="underline text-primary">
            Ingresar
          </Link>
        </p>
      </Card>
      <p className="mt-3 text-xs text-muted">Ningún dato personal es público. En las páginas públicas solo aparecen tu alias y tu nivel.</p>
    </div>
  );
}
