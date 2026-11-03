import { useQuery } from '@tanstack/react-query';
import { Printer, Download } from 'lucide-react';
import { api } from '../lib/api';
import { usePublicConfig } from '../lib/config';
import { Button } from './ui';
import { EntityBadge, KINDRA_ICON } from './Brand';

/** 13.3: QR imprimible a tamaño afiche con el logo del ente operador y la línea "con tecnología Kindra". */
export function QRPoster({ kind, code, title, subtitle }: { kind: 'lote' | 'obra' | 'ficha' | 'sector' | 'certificado' | 'tablero'; code: string; title: string; subtitle?: string }) {
  const { data: cfg } = usePublicConfig();
  const svg = useQuery({ queryKey: ['qr', kind, code], queryFn: () => api.text(`/public/qr/${kind}/${code}`) });
  const target = useQuery({ queryKey: ['qr-target', kind, code], queryFn: () => api.get<{ url: string }>(`/public/qr-target/${kind}/${code}`) });
  const download = () => {
    if (!svg.data) return;
    const blob = new Blob([svg.data], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `qr-${kind}-${code}.svg`;
    a.click();
  };
  return (
    <div className="card print:border-0 print:shadow-none">
      <div className="text-center mx-auto max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-3">
          <EntityBadge size={40} />
          <span className="font-bold">{cfg?.branding.entityName}</span>
        </div>
        <h2 className="text-xl font-bold">{title}</h2>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        <div className="my-4 mx-auto w-full max-w-[320px] aspect-square [&_svg]:w-full [&_svg]:h-full" dangerouslySetInnerHTML={{ __html: svg.data || '' }} aria-label={`Código QR para ${title}`} role="img" />
        <p className="text-xs text-muted break-all">{target.data?.url}</p>
        <p className="mt-3 flex items-center justify-center gap-2 text-sm font-semibold">
          <img src={KINDRA_ICON} alt="" className="h-8 w-8 rounded-lg" /> {cfg?.branding.kindraLine || 'con tecnología Kindra'}
        </p>
      </div>
      <div className="mt-4 flex gap-2 justify-center no-print">
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer size={18} /> Imprimir afiche
        </Button>
        <Button variant="ghost" onClick={download} disabled={!svg.data}>
          <Download size={18} /> Descargar SVG
        </Button>
      </div>
    </div>
  );
}
