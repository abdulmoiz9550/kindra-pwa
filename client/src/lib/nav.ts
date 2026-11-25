import { Home, MessageCircle, FileText, BarChart3, BookOpen, Award, Truck, ScanLine, Navigation, ClipboardList, Users, Building2, Settings, ShieldCheck, Package, Factory, FlaskConical, MapPin, Bell, UserRound, AlertTriangle, History, Leaf, CalendarDays, Store, Waves, Search, Layers, Database, Map as MapIcon, Inbox, HelpCircle, type LucideIcon } from 'lucide-react';
import type { Role } from '@kindra/shared';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Coincidencia exacta de la ruta. */
  end?: boolean;
  /** Solo si esta función está encendida. */
  feature?: string;
}

/**
 * v4.0, secciones 5, 6, 25 y 27: menú propio de cada rol. Los primeros cuatro van a la barra inferior en el
 * teléfono; el resto queda en «Más». En tableta y escritorio se ve completo a la izquierda, con los mismos nombres.
 */
const i = (to: string, label: string, icon: LucideIcon, extra: Partial<NavItem> = {}): NavItem => ({ to, label, icon, ...extra });

const citizen: NavItem[] = [
  i('/', 'Inicio', Home, { end: true }),
  i('/aura', 'AURA', MessageCircle),
  i('/mis-reportes', 'Mis reportes', FileText),
  i('/tablero', 'Tablero', BarChart3),
  i('/avisar', 'Avisar de un escombro', AlertTriangle),
  i('/consultar', 'Consultar un reporte', Search),
  i('/aprende', 'Formación', BookOpen),
];

const MENUS: Record<Role, NavItem[]> = {
  citizen: [...citizen, i('/recompensas', 'Recompensas', Award), i('/grupos', 'Comunidades y grupos', Users, { feature: 'community_groups' })],
  monitor: [
    i('/', 'Inicio', Home, { end: true }),
    i('/tablero', 'Avance por sector', BarChart3),
    i('/mis-reportes', 'Mis reportes', FileText),
    i('/consultar', 'Consultar un reporte', Search),
    i('/avisar', 'Avisar de un escombro', AlertTriangle),
    i('/aura', 'AURA', MessageCircle),
    i('/aprende', 'Guías y formación', BookOpen),
    i('/recompensas', 'Recompensas', Award),
    i('/grupos', 'Comunidades y grupos', Users, { feature: 'community_groups' }),
  ],
  householder: [
    i('/hogar', 'Inicio', Home, { end: true }),
    i('/hogar/solicitar', 'Solicitar', Package),
    i('/hogar/solicitudes', 'Mis solicitudes', ClipboardList),
    i('/hogar/impacto', 'Mi impacto', Leaf),
    i('/aprende', 'Consejos y educación', BookOpen),
    i('/recompensas', 'Puntos', Award),
    i('/aura', 'AURA', MessageCircle),
  ],
  business: [
    i('/comercio', 'Inicio', Home, { end: true }),
    i('/comercio/agenda', 'Agenda', CalendarDays),
    i('/comercio/punto', 'Punto de acopio', MapPin),
    i('/comercio/historial', 'Historial', History),
    i('/comercio/solicitar', 'Solicitar recolección', Package),
    i('/comercio/impacto', 'Impacto y reportes', Leaf),
    i('/aprende', 'Consejos y educación', BookOpen),
    i('/comercio/datos', 'Datos del comercio', Store),
  ],
  community: [
    i('/comunidad', 'Inicio', Home, { end: true }),
    i('/comunidad/actividades', 'Actividades', CalendarDays),
    i('/comunidad/reportes', 'Reportar', AlertTriangle),
    i('/comunidad/impacto', 'Impacto', Leaf),
    i('/comunidad/miembros', 'Miembros', Users),
    i('/aprende', 'Aprendizaje', BookOpen),
    i('/recompensas', 'Puntos', Award),
    i('/comunidad/datos', 'Datos de la comunidad', Settings),
  ],
  coastal: [
    i('/costero', 'Inicio', Home, { end: true }),
    i('/costero/actividades', 'Jornadas', Waves),
    i('/costero/reportes', 'Reportar', AlertTriangle),
    i('/costero/impacto', 'Impacto', Leaf),
    i('/costero/miembros', 'Miembros', Users),
    i('/aprende', 'Educación y campañas', BookOpen),
    i('/recompensas', 'Puntos', Award),
    i('/costero/datos', 'Datos del grupo', Settings),
  ],
  driver: [
    i('/conductor', 'Inicio', Home, { end: true }),
    i('/conductor/solicitudes', 'Solicitudes', ClipboardList),
    i('/conductor/actividad', 'Actividad', History),
    i('/conductor/impacto', 'Impacto', Leaf),
    i('/panel/escolta', 'Mi ruta', Navigation),
    i('/aprende', 'Formación y seguridad', BookOpen),
  ],
  removal: [
    i('/panel/retiro', 'Por retirar', Package, { end: true }),
    i('/panel/retiro?tab=trips', 'Mis viajes', Truck),
    i('/panel/solicitudes', 'Solicitudes', ClipboardList),
    i('/panel/escolta', 'Escolta', Navigation),
    i('/panel/retiro?tab=map', 'Mapa', MapIcon),
    i('/panel/retiro?tab=zones', 'Zona pendiente', MapPin),
  ],
  center: [
    i('/panel/centro', 'Llegadas', Truck, { end: true }),
    i('/panel/control', 'Control', ScanLine),
    i('/panel/centro?tab=batch', 'Lote abierto', Package),
    i('/panel/reportes', 'Reportes', ClipboardList),
    i('/panel/centro?tab=batches', 'Lotes', Layers),
    i('/panel/centro?tab=dispatches', 'Despachos', Navigation),
    i('/panel/centro?tab=daily', 'Resumen diario', CalendarDays),
    i('/panel/centro?tab=jobs', 'Empleos', Users),
    i('/panel/solicitudes', 'Solicitudes', Inbox),
    i('/panel/seguimiento', 'Seguimiento', MapIcon),
    i('/panel/escolta', 'Escolta', Navigation),
  ],
  processing: [
    i('/panel/procesamiento', 'Inicio', Home, { end: true }),
    i('/panel/procesamiento?tab=queue', 'Por procesar', Factory),
    i('/panel/procesamiento?tab=balance', 'Balance', BarChart3),
    i('/panel/procesamiento?tab=history', 'Historial', History),
  ],
  evaluator: [
    i('/panel/evaluador', 'Retenidos', AlertTriangle, { end: true }),
    i('/panel/evaluador?tab=verification', 'Por verificar', FlaskConical),
    i('/panel/evaluador?tab=decided', 'Decididos', History),
    i('/tablero', 'Tablero', BarChart3),
  ],
  destination: [
    i('/panel/destino', 'Por confirmar', Inbox, { end: true }),
    i('/panel/destino?tab=works', 'Obras', Building2),
    i('/panel/control', 'Control', ScanLine),
    i('/panel/destino?tab=new', 'Registrar obra', FileText),
  ],
  supervisor: [
    i('/panel/supervisor', 'Trazabilidad', Search, { end: true }),
    i('/panel/reportes', 'Reportes', ClipboardList),
    i('/panel/supervisor?tab=alerts', 'Alertas', AlertTriangle),
    i('/panel/supervisor?tab=citizen', 'Reportes ciudadanos', FileText),
    i('/panel/supervisor?tab=batches', 'Lotes', Layers),
    i('/panel/supervisor?tab=discrepancies', 'Discrepancias', BarChart3),
    i('/panel/supervisor?tab=audit', 'Cambios y aprobaciones', History),
    i('/panel/supervisor?tab=observations', 'Observaciones', MessageCircle),
    i('/panel/seguimiento', 'Seguimiento', MapIcon),
  ],
  coordinator: [
    i('/panel/coordinador', 'Bandeja', Inbox, { end: true }),
    i('/panel/solicitudes', 'Solicitudes', ClipboardList),
    i('/panel/coordinador?tab=alerts', 'Alertas', AlertTriangle),
    i('/panel/reportes', 'Reportes', BarChart3),
    i('/panel/coordinador?tab=track', 'Seguimiento de orígenes', Search),
    i('/panel/coordinador?tab=map', 'Mapa', MapIcon),
    i('/panel/coordinador?tab=disputes', 'Disputas', MessageCircle),
    i('/panel/coordinador?tab=zones', 'Zonas', MapPin),
    i('/panel/coordinador?tab=monitor', 'Contralores', ShieldCheck),
    i('/panel/coordinador?tab=manual', 'Revisión manual', FileText),
    i('/panel/coordinador?tab=new', 'Origen institucional', Building2),
    i('/panel/grupos', 'Comunidades y grupos', Users, { feature: 'community_groups' }),
    i('/panel/control', 'Control', ScanLine),
    i('/panel/seguimiento', 'Seguimiento de camiones', Truck),
  ],
  entity_admin: [
    i('/panel/entidad', 'Inicio', Home, { end: true }),
    i('/panel/entidad?tab=users', 'Usuarios', Users),
    i('/panel/solicitudes', 'Solicitudes', ClipboardList),
    i('/panel/reportes', 'Reportes', BarChart3),
    i('/panel/entidad?tab=vehicles', 'Vehículos', Truck),
    i('/panel/entidad?tab=documents', 'Documentos y evidencias', FileText),
  ],
  admin: [
    i('/admin', 'Resumen', Home, { end: true }),
    i('/admin/usuarios', 'Usuarios', Users),
    i('/panel/reportes', 'Reportes', BarChart3),
    i('/admin/gobierno', 'Gobierno de datos', ShieldCheck),
    i('/admin/entidades', 'Organizaciones', Building2),
    i('/admin/modulos', 'Módulos', Layers),
    i('/admin/centros', 'Centros (CDT)', MapPin),
    i('/admin/operadores', 'Operadores', Factory),
    i('/panel/solicitudes', 'Solicitudes', ClipboardList),
    i('/panel/seguimiento', 'Seguimiento', Truck),
    i('/admin/participacion', 'Comercios', Store),
    i('/admin/funciones', 'Funciones', Settings),
    i('/admin/espacios', 'Espacios', Layers),
    i('/admin/sectores', 'Sectores', MapIcon),
    i('/admin/vehiculos', 'Vehículos', Truck),
    i('/admin/puertas', 'Puertas y rastreo', ScanLine),
    i('/admin/configuracion', 'Configuración', Settings),
    i('/admin/estados', 'Estados', Database),
    i('/admin/textos', 'Textos de AURA', MessageCircle),
    i('/admin/lecciones', 'Lecciones', BookOpen),
    i('/admin/fotos', 'Moderación de fotos', FileText),
    i('/admin/preregistro', 'Pre-registro', UserRound, { feature: 'preregistration' }),
    i('/admin/bitacora', 'Bitácora de administración', History),
    i('/admin/demo', 'Datos de demostración', HelpCircle),
  ],
};

const COMMON: NavItem[] = [i('/notificaciones', 'Notificaciones', Bell), i('/ajustes', 'Accesibilidad', Settings)];

export function menuFor(role: Role | null): NavItem[] {
  return role ? MENUS[role] : citizen;
}
export const commonMenu = COMMON;

/** Coincide por ruta y, si el enlace trae pestaña, también por pestaña. */
export function isNavActive(item: NavItem, pathname: string, search: string): boolean {
  const [path, query] = item.to.split('?');
  if (query) return pathname === path && new URLSearchParams(search).get('tab') === new URLSearchParams(query).get('tab');
  if (item.end) return pathname === path && !new URLSearchParams(search).get('tab');
  return pathname === path || pathname.startsWith(`${path}/`);
}
