import { useState } from 'react';
import { MUTABLE_NOTIFICATIONS } from '@kindra/shared';
import type { PublicUser } from '@kindra/shared';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { toast } from '../lib/toast';
import { Alert, Button, Card, Field, Input } from './ui';
import { PhotoCapture, type CapturedPhoto } from './PhotoCapture';
import { SupportContact } from './News';

/** v4.0, 17.5 y 24: datos propios, avisos, disponibilidad y contraseña. Los datos verificados no se cambian aquí. */
export function AccountSettings() {
  const { user, setUser } = useAuth();
  const [f, setF] = useState({ name: user?.name || '', phone: user?.phone || '', email: user?.email || '', address: user?.preferences?.address || '', muted: user?.preferences?.mutedKinds || [], available: user?.preferences?.available ?? true });
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [pw, setPw] = useState({ current: '', next: '', again: '' });
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  const locked = user.verificationStatus === 'verified';
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const save = () =>
    run(async () => {
      const r = await api.put<{ user: PublicUser }>('/profiles/account', { ...(locked ? {} : { name: f.name || null }), phone: f.phone || null, email: f.email || null, ...(photos[0]?.id ? { profilePhotoId: photos[0].id } : {}), preferences: { mutedKinds: f.muted, available: f.available, address: f.address || null } });
      setUser(r.user);
    }, 'Datos guardados.');
  return (
    <>
      <Card className="mb-3" title="Mis datos" subtitle={`Cuenta ${user.active ? 'activa' : 'suspendida'}${user.entityName ? ` · ${user.entityName}` : ''}`}>
        <Field label="Nombre" hint={locked ? 'Está verificado: lo cambia la administración.' : undefined}><Input value={f.name} disabled={locked} maxLength={80} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Teléfono"><Input type="tel" value={f.phone} maxLength={30} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Correo" hint="Sirve para ingresar. No es público."><Input type="email" value={f.email} maxLength={160} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        {user.roles.includes('driver') && (
          <div className="mb-3 text-sm">
            {user.profilePhotoUrl && !photos.length && <img src={user.profilePhotoUrl} alt="Foto de perfil" className="h-20 w-20 rounded-full object-cover mb-2" />}
            <PhotoCapture kind="other" label="Foto de perfil" photos={photos} onChange={setPhotos} max={1} withLocation={false} />
            <p className="mt-2">Vehículo asignado: <strong>{user.vehiclePlate || 'sin asignar'}</strong></p>
            <p>Área operativa: <strong>{user.operationalArea || 'sin asignar'}</strong></p>
            <p>Soporte: <SupportContact /></p>
          </div>
        )}
        {['householder', 'business'].includes(user.activeRole) && <Field label="Dirección guardada" hint="Confidencial. Se usa para llenar tus solicitudes."><Input value={f.address} maxLength={200} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>}
        {user.roles.includes('driver') && <label className="flex items-center gap-2 text-sm mb-3"><input type="checkbox" className="h-5 w-5 accent-[var(--primary)]" checked={f.available} onChange={(e) => setF({ ...f, available: e.target.checked })} /> Disponible para nuevas solicitudes</label>}
        <fieldset className="mb-3">
          <legend className="label">Avisos que quiero recibir</legend>
          {MUTABLE_NOTIFICATIONS.map((m) => <label key={m.kind} className="flex items-center gap-2 text-sm py-1"><input type="checkbox" className="h-5 w-5 accent-[var(--primary)]" checked={!f.muted.includes(m.kind)} onChange={(e) => setF({ ...f, muted: e.target.checked ? f.muted.filter((k) => k !== m.kind) : [...f.muted, m.kind] })} /> {m.label}</label>)}
          <p className="text-xs text-muted">Los avisos operativos y de seguridad siempre llegan.</p>
        </fieldset>
        <Button disabled={busy} onClick={save}>Guardar</Button>
      </Card>
      <Card className="mb-3" title="Contraseña">
        <Field label="Contraseña actual" required><Input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
        <Field label="Contraseña nueva" required hint="Al menos 8 caracteres."><Input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
        <Field label="Repite la contraseña nueva" required><Input type="password" autoComplete="new-password" value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} /></Field>
        {pw.again && pw.again !== pw.next && <Alert tone="warn" className="mb-2">Las contraseñas no coinciden.</Alert>}
        <Button variant="secondary" disabled={busy || !pw.current || pw.next.length < 8 || pw.next !== pw.again} onClick={async () => { if (await run(() => api.post('/profiles/password', { current: pw.current, next: pw.next }), 'Contraseña actualizada.')) setPw({ current: '', next: '', again: '' }); }}>Cambiar contraseña</Button>
      </Card>
    </>
  );
}
