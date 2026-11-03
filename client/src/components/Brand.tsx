import { usePublicConfig } from '../lib/config';

export const KINDRA_MARK = '/brand/kindra-mark.png';
export const KINDRA_ICON = '/brand/kindra-icon.png';

/** Logo del ente operador (configurable en Administración). Mientras no exista, una inicial sobre fondo teal. */
export function EntityBadge({ size = 36, className = '' }: { size?: number; className?: string }) {
  const { data: cfg } = usePublicConfig();
  const name = cfg?.branding.entityName || 'Ente Coordinador';
  if (cfg?.branding.logoUrl) return <img src={cfg.branding.logoUrl} alt={name} style={{ width: size, height: size }} className={`rounded-lg object-contain bg-white ${className}`} />;
  return (
    <span aria-hidden style={{ width: size, height: size, fontSize: size * 0.5 }} className={`entity-initial grid place-items-center rounded-lg font-bold ${className}`}>
      {name.trim()[0] || 'E'}
    </span>
  );
}

/** Línea "con tecnología Kindra" con la marca Kindra (3.7). */
export function KindraLine({ size = 18, className = '', tone = 'muted' }: { size?: number; className?: string; tone?: 'muted' | 'light' }) {
  const { data: cfg } = usePublicConfig();
  return (
    <span className={`inline-flex items-center gap-1.5 ${tone === 'light' ? 'text-white/80' : 'text-muted'} ${className}`}>
      <img src={KINDRA_MARK} alt="Kindra" style={{ width: size, height: size }} className="rounded-[4px]" />
      <span className="text-[11px] tracking-wide whitespace-nowrap">{cfg?.branding.kindraLine || 'con tecnología Kindra'}</span>
    </span>
  );
}

/** Bloque de identidad: ente operador + línea Kindra. */
export function BrandBlock({ light = false, size = 36, compact = false }: { light?: boolean; size?: number; compact?: boolean }) {
  const { data: cfg } = usePublicConfig();
  return (
    <span className="flex items-center gap-2.5 min-w-0">
      <EntityBadge size={size} />
      {compact && <img src={KINDRA_MARK} alt="Kindra" style={{ width: size - 6, height: size - 6 }} className="rounded-md sm:hidden" />}
      <span className={`min-w-0 ${compact ? 'hidden sm:block' : ''}`}>
        <span className={`block text-sm font-bold leading-tight truncate ${light ? 'text-white' : ''}`}>{cfg?.branding.entityName || 'Ente Coordinador'}</span>
        <KindraLine size={14} tone={light ? 'light' : 'muted'} />
      </span>
    </span>
  );
}
