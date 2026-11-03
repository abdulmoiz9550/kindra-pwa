import { Link } from 'react-router-dom';
import { BrandBlock } from './Brand';

/** Bloque superior de las páginas públicas (13): identidad del ente operador y "con tecnología Kindra". */
export function PublicHeader({ title, subtitle }: { title?: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <div className="app-header -mx-4 px-4 py-3 mb-5 rounded-b-2xl flex items-center gap-3">
        <BrandBlock light size={36} />
        <Link to="/" className="ml-auto text-xs text-white/85 underline no-print">
          Ir a la plataforma
        </Link>
      </div>
      {title && <h1 className="text-2xl font-bold leading-tight title-mark">{title}</h1>}
      {subtitle && <p className="text-sm text-muted mt-2 max-w-prose">{subtitle}</p>}
    </div>
  );
}
