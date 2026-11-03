import { useParams } from 'react-router-dom';
import { usePublicConfig } from '../../lib/config';
import { QRPoster } from '../../components/QRPoster';
import { PublicHeader } from '../../components/PublicHeader';
import { Alert } from '../../components/ui';

const KINDS = ['lote', 'obra', 'ficha', 'sector', 'certificado', 'tablero'] as const;
type Kind = (typeof KINDS)[number];

/** 13.3: página de QR imprimible a tamaño afiche. */
export default function QRPosterPage() {
  const { kind = '', code = '' } = useParams();
  const { data: cfg } = usePublicConfig();
  if (!KINDS.includes(kind as Kind)) return <Alert tone="bad">Tipo de QR desconocido.</Alert>;
  const k = kind as Kind;
  const sectorName = cfg?.sectors.find((s) => s.id === code)?.name;
  const title = { lote: `Lote ${code}`, obra: `Obra ${code}`, ficha: `Reporte ${code}`, sector: sectorName || 'Sector', certificado: `Certificado ${code}`, tablero: 'Tablero público' }[k];
  const subtitle = k === 'certificado' ? 'Escanea para verificar este certificado' : k === 'sector' || k === 'tablero' ? 'Escanea para ver cómo va el retiro de escombros' : 'Escanea para ver el recorrido del material';
  return (
    <div className="max-w-xl mx-auto">
      <div className="no-print">
        <PublicHeader title="QR imprimible" subtitle="Imprime este afiche y colócalo en la obra, el centro o la cartelera del sector." />
      </div>
      <QRPoster kind={k} code={code} title={title} subtitle={subtitle} />
    </div>
  );
}
