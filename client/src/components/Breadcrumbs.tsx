import { Link, useLocation } from 'react-router-dom';
import { ROLE_HOME } from '@kindra/shared';
import { useAuth } from '../lib/auth';
import { commonMenu, isNavActive, menuFor } from '../lib/nav';

const DETAIL: [RegExp, string][] = [[/^\/panel\/viaje\//, 'Viaje'], [/^\/reporte\//, 'Registro'], [/^\/aprende\/./, 'Guía'], [/^\/perfil/, 'Perfil'], [/^\/tarjeta/, 'Tarjeta'], [/^\/noticias/, 'Noticias'], [/^\/ayuda/, 'Ayuda'], [/^\/solicitar-informacion/, 'Solicitar información']];

/** Ruta de regreso en las páginas internas. */
export function Breadcrumbs() {
  const user = useAuth((s) => s.user);
  const { pathname, search } = useLocation();
  const home = user ? ROLE_HOME[user.activeRole] || '/' : '/';
  if (pathname === '/' || (pathname === home && !search)) return null;
  const item = [...menuFor(user?.activeRole ?? null), ...commonMenu].find((m) => m.to !== home && isNavActive(m, pathname, search));
  const detail = DETAIL.find(([re]) => re.test(pathname))?.[1];
  const trail: { label: string; to: string | null }[] = [];
  if (item) trail.push({ label: item.label, to: item.to });
  if (detail && detail !== item?.label) trail.push({ label: detail, to: null });
  if (!trail.length) return null;
  return (
    <nav aria-label="Ruta de navegación" className="text-xs text-muted mb-2 no-print">
      <Link className="underline" to={home}>Inicio</Link>
      {trail.map((x, n) => <span key={x.label}> › {x.to && n < trail.length - 1 ? <Link className="underline" to={x.to}>{x.label}</Link> : <span aria-current="page">{x.label}</span>}</span>)}
    </nav>
  );
}
