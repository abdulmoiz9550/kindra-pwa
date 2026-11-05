import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Download, LogOut, ShieldCheck } from 'lucide-react';
import type { PublicUser, Role, LevelInfo } from '@kindra/shared';
import { ROLE_LABELS, ROLE_HOME } from '@kindra/shared';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { usePublicConfig } from '../lib/config';
import { toast } from '../lib/toast';
import { fmtDate, fmtDateTime } from '../lib/format';
import { Alert, Button, Card, KeyValue, PageTitle, ProgressBar, Spinner } from '../components/ui';
import { CardLink, Achievements, Referrals } from '../components/Loyalty';

interface ProfileData {
  user: PublicUser;
  points: { points: number; level: LevelInfo; consecutiveRejections: number; suspendedUntil: string | null; history: { at: string; delta: number; reason: string; applied: boolean }[]; closedReports: number; validatedReports: number; confirmedRemovals: number; lessonsCompleted: number; onSiteVerifications: number; validatedReferrals?: number };
  certificate: { code: string; alias: string; levelName: string; closedReports: number; issuedAt: string; verifyUrl: string } | null;
  monitorRequestPending: boolean;
  canRequestMonitor: boolean;
  sectorName: string | null;
}

/** 16.12 Perfil ciudadano: alias, nivel, puntos, progreso, certificado. Sin rachas ni rankings (9.4). */
export default function Profile() {
  const { token, user, setSession, setUser, logout } = useAuth();
  const { data: cfg } = usePublicConfig();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showHistory, setShowHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ['me', 'profile', token], queryFn: () => api.get<ProfileData>('/me/profile'), enabled: !!token });
  if (!token || !user) return <Navigate to="/ingresar?next=/perfil" replace />;
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Alert tone="bad">{q.error ? errorMessage(q.error) : 'No se pudo cargar el perfil.'}</Alert>;
  const p = q.data;
  if (p.user.alias !== user.alias) setUser(p.user);
  const lvl = p.points.level;
  const pct = lvl.next ? ((p.points.points - lvl.threshold) / (lvl.next.threshold - lvl.threshold)) * 100 : 100;
  const needsVerification = p.user.verificationStatus !== 'verified' && p.user.roles.some((r) => r !== 'citizen');

  const requestMonitor = async () => {
    setBusy(true);
    try {
      await api.post('/monitor/request');
      toast.success('Solicitud enviada. El equipo de coordinación la revisa.');
      qc.invalidateQueries({ queryKey: ['me'] });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const switchRole = async (role: Role) => {
    try {
      const s = await api.post<{ token: string; user: PublicUser }>('/auth/active-role', { role });
      setSession(s);
      qc.clear();
      navigate(ROLE_HOME[role]);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const downloadCertificate = () => {
    if (!p.certificate) return;
    const c = p.certificate;
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 800;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#f4f3ef';
    ctx.fillRect(0, 0, 1200, 800);
    ctx.strokeStyle = '#1f4e3d';
    ctx.lineWidth = 10;
    ctx.strokeRect(30, 30, 1140, 740);
    ctx.fillStyle = '#1f4e3d';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Certificado de participación', 600, 150);
    ctx.fillStyle = '#1f2a24';
    ctx.font = '30px sans-serif';
    ctx.fillText(cfg?.branding.entityName || 'Ente Coordinador', 600, 210);
    ctx.font = 'bold 60px sans-serif';
    ctx.fillText(c.alias, 600, 330);
    ctx.font = '34px sans-serif';
    ctx.fillText(`alcanzó el nivel ${c.levelName}`, 600, 390);
    ctx.fillText(`con ${c.closedReports} reporte${c.closedReports === 1 ? '' : 's'} cerrado${c.closedReports === 1 ? '' : 's'}`, 600, 440);
    ctx.font = '26px sans-serif';
    ctx.fillStyle = '#4c5852';
    ctx.fillText(`Código verificable: ${c.code}`, 600, 540);
    ctx.fillText(c.verifyUrl, 600, 580);
    ctx.fillText(`${fmtDate(c.issuedAt)} · muestra sin firma institucional`, 600, 640);
    ctx.fillText(cfg?.branding.kindraLine || 'con tecnología Kindra', 600, 720);
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `certificado-${c.code}.png`;
    a.click();
  };

  return (
    <div className="max-w-lg mx-auto">
      <PageTitle title={p.user.alias} subtitle={p.sectorName ? `Sector: ${p.sectorName}` : 'Sin sector de residencia registrado'} />
      <Card className="mb-3" title={`Nivel: ${lvl.name}`} subtitle={`${p.points.points} puntos por hechos verificados`}>
        {lvl.next ? <ProgressBar value={pct} label={`Hacia ${lvl.next.name} (${lvl.next.threshold} puntos)`} /> : <p className="text-sm text-muted">Alcanzaste el nivel más alto.</p>}
        {p.points.suspendedUntil && (
          <Alert tone="warn" className="mt-3">
            La suma de puntos está en pausa hasta {fmtDateTime(p.points.suspendedUntil)} por rechazos consecutivos. Puedes seguir reportando con normalidad.
          </Alert>
        )}
        <div className="mt-3">
          <KeyValue
            items={[
              { k: 'Reportes validados', v: p.points.validatedReports },
              { k: 'Retiros confirmados', v: p.points.confirmedRemovals },
              { k: 'Reportes cerrados', v: p.points.closedReports },
              { k: 'Lecciones completadas', v: p.points.lessonsCompleted },
              ...(p.points.validatedReferrals ? [{ k: 'Invitados con reporte validado', v: p.points.validatedReferrals }] : []),
            ]}
          />
        </div>
        <button type="button" className="mt-3 text-sm text-primary inline-flex items-center gap-1" onClick={() => setShowHistory((s) => !s)} aria-expanded={showHistory}>
          <ChevronDown size={16} className={showHistory ? 'rotate-180' : ''} /> {showHistory ? 'Ocultar' : 'Ver'} detalle de puntos
        </button>
        {showHistory && (
          <ul className="mt-2 divide-y divide-line text-sm">
            {p.points.history.length === 0 && <li className="py-2 text-muted">Todavía no hay movimientos. Los puntos llegan cuando otra persona verifica un hecho de tus reportes.</li>}
            {p.points.history.map((h, i) => (
              <li key={i} className="flex justify-between py-2 gap-2">
                <span>
                  {h.reason}
                  <span className="block text-xs text-muted">{fmtDateTime(h.at)}</span>
                </span>
                <span className={`font-semibold ${!h.applied ? 'text-muted line-through' : h.delta < 0 ? 'text-bad' : 'text-ok'}`}>
                  {h.delta > 0 ? '+' : ''}
                  {h.delta}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <CardLink />
      <Achievements />
      <Referrals />

      {p.certificate && (
        <Card className="mb-3" title="Certificado de participación" subtitle="Muestra sin firma institucional.">
          <KeyValue items={[{ k: 'Nivel', v: p.certificate.levelName }, { k: 'Reportes cerrados', v: p.certificate.closedReports }, { k: 'Código verificable', v: <span className="font-mono">{p.certificate.code}</span> }, { k: 'Emitido', v: fmtDate(p.certificate.issuedAt) }]} />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={downloadCertificate}>
              <Download size={18} /> Descargar
            </Button>
            <Link to={`/publico/certificado/${p.certificate.code}`} className="btn-ghost">
              Página de verificación
            </Link>
          </div>
        </Card>
      )}

      <Card className="mb-3" title="Contralor comunitario">
        {p.user.roles.includes('monitor') ? (
          <p className="text-sm">Tienes el rol de contralor comunitario activado. Puedes verificar en sitio orígenes de tu sector y confirmar despejes con foto.</p>
        ) : p.monitorRequestPending ? (
          <p className="text-sm">Tu solicitud está en revisión por el equipo de coordinación.</p>
        ) : p.canRequestMonitor ? (
          <>
            <p className="text-sm mb-2">Alcanzaste el nivel Contralor comunitario. Puedes pedir el rol: hace falta la verificación por selfie y la aprobación del coordinador.</p>
            <Button onClick={requestMonitor} disabled={busy}>
              <ShieldCheck size={18} /> Solicitar el rol
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted">Se habilita al llegar al nivel Contralor comunitario (300 puntos).</p>
        )}
      </Card>

      {needsVerification && (
        <Alert tone="info" className="mb-3" title="Verificación de identidad">
          Para usar tus roles institucionales o de contralor necesitas la verificación por selfie.{' '}
          <Link to="/verificacion" className="underline">
            Ir a la verificación
          </Link>
        </Alert>
      )}

      {p.user.roles.length > 1 && (
        <Card className="mb-3" title="Mis roles" subtitle={`Activo: ${ROLE_LABELS[p.user.activeRole]}`}>
          <div className="flex flex-wrap gap-2">
            {p.user.roles.map((r) => (
              <Button key={r} size="sm" variant={r === p.user.activeRole ? 'primary' : 'secondary'} onClick={() => switchRole(r)} disabled={r === p.user.activeRole}>
                {ROLE_LABELS[r]}
              </Button>
            ))}
          </div>
        </Card>
      )}

      <Button
        variant="ghost"
        onClick={() => {
          logout();
          qc.clear();
          navigate('/');
        }}
      >
        <LogOut size={18} /> Cerrar sesión
      </Button>
    </div>
  );
}
