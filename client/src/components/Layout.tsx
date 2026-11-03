import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Home, MessageCircle, FileText, BarChart3, MoreHorizontal, Bell, UserRound, Settings as SettingsIcon, LogOut, BookOpen, ShieldCheck, Wifi, WifiOff } from 'lucide-react';
import type { Role } from '@kindra/shared';
import { ROLE_LABELS, ROLE_HOME } from '@kindra/shared';
import { usePublicConfig } from '../lib/config';
import { useAuth } from '../lib/auth';
import { api, errorMessage } from '../lib/api';
import { useLiveUpdates } from '../lib/live';
import { useNotifications } from '../lib/notifications';
import { useToasts } from '../lib/toast';
import { useQueryClient } from '@tanstack/react-query';
import { pendingReports, onPendingChange } from '../lib/offline';
import { BrandBlock, KindraLine, KINDRA_MARK } from './Brand';

export function Layout({ children }: { children: ReactNode }) {
  const { data: cfg } = usePublicConfig();
  const { connected } = useLiveUpdates();
  const location = useLocation();
  const isPublicPage = location.pathname.startsWith('/publico/') || location.pathname === '/tablero';
  return (
    <div className="min-h-screen flex flex-col">
      <a href="#main" className="sr-only-focusable fixed left-2 top-2 z-[2000] rounded bg-surface px-3 py-2">
        Ir al contenido
      </a>
      {!isPublicPage && <Header connected={connected} />}
      <main id="main" className="flex-1 w-full max-w-5xl mx-auto px-4 pt-4 pb-28 md:pb-10">
        {children}
      </main>
      <Footer />
      {cfg?.simulatedLabel && (
        <div className="simulated-label" aria-live="off">
          {cfg.simulatedLabel}
        </div>
      )}
      {(!isPublicPage || location.pathname === '/tablero') && <BottomNav />}
      <Toasts />
      <OfflineBanner />
    </div>
  );
}

function Header({ connected }: { connected: boolean }) {
  const { data: cfg } = usePublicConfig();
  const user = useAuth((s) => s.user);
  const { unread } = useNotifications();
  return (
    <header className="app-header sticky top-0 z-[1100] no-print">
      <div className="max-w-5xl mx-auto px-4 h-[60px] flex items-center gap-3">
        <Link to="/" className="min-w-0" aria-label="Inicio">
          <BrandBlock light size={38} compact />
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <span title={connected ? 'Actualización en vivo activa' : 'Sin conexión en vivo'} className={`hidden sm:inline-flex items-center gap-1 text-[11px] mr-1 ${connected ? 'text-white/90' : 'text-white/50'}`} aria-label={connected ? 'En vivo' : 'Sin conexión en vivo'}>
            {connected ? <Wifi size={15} /> : <WifiOff size={15} />}
            <span className="hidden md:inline">{connected ? 'en vivo' : 'sin señal'}</span>
          </span>
          {cfg?.demoMode && <RoleSwitcher />}
          <Link to="/notificaciones" className="header-icon relative" aria-label={`Notificaciones${unread ? `, ${unread} sin leer` : ''}`}>
            <Bell size={20} />
            {unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-brand-orange text-white text-[11px] font-bold grid place-items-center px-1">{unread}</span>}
          </Link>
          <Link to={user ? '/perfil' : '/ingresar'} className="header-icon hidden md:inline-flex !w-auto px-2 gap-1" aria-label={user ? 'Mi perfil' : 'Ingresar'}>
            <UserRound size={19} />
            <span className="text-sm">{user ? user.alias : 'Ingresar'}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

/** 19.3: cambio rápido entre usuarios de prueba, uno por rol. Solo en modo demo. */
function RoleSwitcher() {
  const { data: cfg } = usePublicConfig();
  const { user, setSession, logout } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const push = useToasts((s) => s.push);
  const roles = cfg?.demoRoles || [];
  const myRoles = user?.roles || [];
  const onChange = async (value: string) => {
    if (!value) return;
    if (value === 'logout') {
      logout();
      qc.clear();
      navigate('/');
      return;
    }
    const [kind, role] = value.split(':') as ['demo' | 'own', Role];
    setBusy(true);
    try {
      const s = kind === 'own' ? await api.post<{ token: string; user: never }>('/auth/active-role', { role }) : await api.post<{ token: string; user: never }>('/auth/demo-switch', { role });
      setSession(s);
      qc.clear();
      navigate(ROLE_HOME[role] || '/');
    } catch (err) {
      push({ kind: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <label className="inline-flex items-center gap-1 text-xs">
      <span className="sr-only">Cambiar de rol (demostración)</span>
      <ShieldCheck size={16} className="text-white/70 hidden sm:block" aria-hidden />
      <select className="header-select" value="" disabled={busy} onChange={(e) => onChange(e.target.value)} aria-label="Cambiar de rol (demostración)">
        <option value="">{user ? `${ROLE_LABELS[user.activeRole]}` : 'Entrar como…'}</option>
        {myRoles.length > 1 && (
          <optgroup label="Mis roles">
            {myRoles.map((r) => (
              <option key={r} value={`own:${r}`}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label="Usuarios de prueba">
          {roles.map((r) => (
            <option key={r.role} value={`demo:${r.role}`}>
              {ROLE_LABELS[r.role]} ({r.alias})
            </option>
          ))}
        </optgroup>
        {user && <option value="logout">Cerrar sesión</option>}
      </select>
    </label>
  );
}

function BottomNav() {
  const user = useAuth((s) => s.user);
  const [more, setMore] = useState(false);
  const roleHome = user && user.activeRole !== 'citizen' ? ROLE_HOME[user.activeRole] : null;
  const items = [
    { to: '/', label: 'Inicio', icon: Home },
    { to: '/aura', label: 'AURA', icon: MessageCircle },
    { to: roleHome || '/mis-reportes', label: roleHome ? 'Mi panel' : 'Mis reportes', icon: FileText },
    { to: '/tablero', label: 'Tablero', icon: BarChart3 },
  ];
  return (
    <nav className="bottom-nav fixed bottom-0 inset-x-0 z-[1100] md:hidden no-print" aria-label="Navegación principal" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <ul className="grid grid-cols-5">
        {items.map((it) => (
          <li key={it.to}>
            <NavLink to={it.to} end={it.to === '/'} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? 'nav-active' : 'text-muted'}`}>
              <it.icon size={22} />
              {it.label}
            </NavLink>
          </li>
        ))}
        <li>
          <button type="button" className="w-full flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted" onClick={() => setMore(true)} aria-haspopup="dialog">
            <MoreHorizontal size={22} />
            Más
          </button>
        </li>
      </ul>
      {more && (
        <div className="fixed inset-0 z-[1250] bg-black/40" onClick={() => setMore(false)}>
          <div role="dialog" aria-label="Más opciones" className="absolute bottom-0 inset-x-0 rounded-t-2xl bg-surface p-4" onClick={(e) => e.stopPropagation()}>
            <ul className="grid grid-cols-2 gap-2 text-sm">
              <MoreLink to="/aprende" icon={BookOpen} label="Aprende" onClick={() => setMore(false)} />
              <MoreLink to="/consultar" icon={FileText} label="Consultar mi reporte" onClick={() => setMore(false)} />
              <MoreLink to="/notificaciones" icon={Bell} label="Notificaciones" onClick={() => setMore(false)} />
              <MoreLink to={user ? '/perfil' : '/ingresar'} icon={UserRound} label={user ? 'Mi perfil' : 'Ingresar'} onClick={() => setMore(false)} />
              <MoreLink to="/ajustes" icon={SettingsIcon} label="Accesibilidad" onClick={() => setMore(false)} />
              {user && <LogoutButton onDone={() => setMore(false)} />}
            </ul>
          </div>
        </div>
      )}
    </nav>
  );
}

function MoreLink({ to, icon: Icon, label, onClick }: { to: string; icon: typeof Home; label: string; onClick: () => void }) {
  return (
    <li>
      <Link to={to} onClick={onClick} className="flex items-center gap-2 rounded-lg border border-line px-3 py-3">
        <Icon size={18} className="text-primary" /> {label}
      </Link>
    </li>
  );
}

function LogoutButton({ onDone }: { onDone: () => void }) {
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();
  const qc = useQueryClient();
  return (
    <li>
      <button
        type="button"
        className="w-full flex items-center gap-2 rounded-lg border border-line px-3 py-3 text-left"
        onClick={() => {
          logout();
          qc.clear();
          onDone();
          navigate('/');
        }}
      >
        <LogOut size={18} className="text-primary" /> Cerrar sesión
      </button>
    </li>
  );
}

export function Footer() {
  const { data: cfg } = usePublicConfig();
  return (
    <footer className="border-t border-line bg-surface text-xs text-muted pb-20 md:pb-0 no-print">
      <div className="max-w-5xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2">
          <span className="font-semibold text-ink-2">{cfg?.branding.entityName || 'Ente Coordinador'}</span>
          <span aria-hidden>·</span>
          <KindraLine size={16} />
        </span>
        <nav className="flex gap-4" aria-label="Enlaces de pie">
          <Link to="/tablero">Tablero público</Link>
          <Link to="/aprende">Aprende</Link>
          <Link to="/ajustes">Accesibilidad</Link>
        </nav>
      </div>
    </footer>
  );
}

function Toasts() {
  const { toasts, remove } = useToasts();
  if (!toasts.length) return null;
  return (
    <div className="fixed top-16 inset-x-0 z-[1400] flex flex-col items-center gap-2 px-4 pointer-events-none" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`pointer-events-auto max-w-md w-full rounded-lg border px-4 py-3 text-sm shadow-lg ${t.kind === 'error' ? 'bg-bad-soft border-bad text-ink' : t.kind === 'success' ? 'bg-ok-soft border-ok text-ink' : 'bg-info-soft border-info text-ink'}`} role={t.kind === 'error' ? 'alert' : 'status'}>
          <div className="flex items-start gap-2">
            <span className="flex-1">{t.text}</span>
            <button type="button" className="text-muted" onClick={() => remove(t.id)} aria-label="Cerrar aviso">
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const refresh = () => pendingReports().then((l) => setPending(l.length));
    refresh();
    const unsub = onPendingChange(refresh);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      unsub();
    };
  }, []);
  if (online && !pending) return null;
  return (
    <div className="fixed top-14 inset-x-0 z-[1090] bg-warn-soft text-ink text-xs text-center py-1 border-b border-warn" role="status">
      {!online ? 'Sin conexión. Lo que envíes se guarda y se reintenta cuando vuelva la señal.' : `${pending} reporte${pending === 1 ? '' : 's'} guardado${pending === 1 ? '' : 's'} sin conexión, enviando…`}
    </div>
  );
}
