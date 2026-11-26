import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { useEffect } from 'react';
import { PARISHES } from '@kindra/shared';
import { api } from '../../lib/api';
import { fmtDateTime, fmtNum } from '../../lib/format';
import { Alert, Button, Card, Select, Spinner } from '../../components/ui';
import { MapView } from '../../components/MapView';
import { PublicHeader } from '../../components/PublicHeader';

type Light = 'red' | 'yellow' | 'green' | 'grey';
interface SectorRow { id: string; name: string; parish: string; polygon: [number, number][]; received: number; validated: number; closed: number; confirmed: number; lotsByState: { label: string; count: number }[]; tonnesWeighed: number; tonnesEstimated: number; m3: number; light: Light; lightLabel: string }
interface Facility { id: string; name: string; type: 'CDT' | 'CDF'; location: { lat: number; lng: number }; unloadingPoint: { lat: number; lng: number } | null; operators: string[] }
interface PortalData { cutoff: string; source: string; sectors: SectorRow[]; facilities: Facility[] }

/** Color siempre con texto e ícono (accesibilidad). */
const LIGHT: Record<Light, { color: string; icon: string; text: string }> = {
  red: { color: 'var(--bad)', icon: '●', text: 'Rojo' },
  yellow: { color: 'var(--warn)', icon: '◐', text: 'Amarillo' },
  green: { color: 'var(--ok)', icon: '✓', text: 'Verde' },
  grey: { color: 'var(--muted)', icon: '○', text: 'Gris' },
};

export function usePortal(parish?: string | null) {
  return useQuery({ queryKey: ['public', 'portal', parish ?? ''], queryFn: () => api.get<PortalData>(`/public/portal${parish ? `?parroquia=${encodeURIComponent(parish)}` : ''}`), refetchInterval: 60_000 });
}

/** Addendum v4.2, sección 9: semáforo y avance por sector, con fecha de corte. */
export function SectorLights({ data }: { data: PortalData }) {
  return (
    <Card title="Semáforo por sector" subtitle={`Corte: ${fmtDateTime(data.cutoff)} · Fuente: ${data.source}`}>
      <ul className="text-xs flex flex-wrap gap-3 mb-3" aria-label="Leyenda">
        {(['red', 'yellow', 'green', 'grey'] as Light[]).map((l) => <li key={l} className="flex items-center gap-1"><span style={{ color: LIGHT[l].color }} aria-hidden>{LIGHT[l].icon}</span>{data.sectors.find((s) => s.light === l)?.lightLabel ?? { red: 'Rojo: reportes validados sin lote asignado', yellow: 'Amarillo: lotes en curso', green: 'Verde: puntos cerrados y confirmados', grey: 'Gris: sin datos' }[l]}</li>)}
      </ul>
      <div className="overflow-x-auto">
        <table className="table-plain text-sm">
          <thead><tr><th scope="col">Sector</th><th scope="col">Semáforo</th><th scope="col" className="text-right">Recibidos</th><th scope="col" className="text-right">Validados</th><th scope="col" className="text-right">Cerrados</th><th scope="col">Lotes por estado</th><th scope="col" className="text-right">t pesadas</th><th scope="col" className="text-right">t estimadas</th><th scope="col" className="text-right">m³</th></tr></thead>
          <tbody>
            {data.sectors.map((s) => (
              <tr key={s.id}>
                <td>{s.name}<span className="block text-xs text-muted">{s.parish}</span></td>
                <td><span className="inline-flex items-center gap-1 font-semibold" style={{ color: LIGHT[s.light].color }}><span aria-hidden>{LIGHT[s.light].icon}</span>{LIGHT[s.light].text}</span></td>
                <td className="text-right">{s.received}</td>
                <td className="text-right">{s.validated}</td>
                <td className="text-right">{s.closed}</td>
                <td className="text-xs">{s.lotsByState.map((l) => `${l.label}: ${l.count}`).join(' · ')}</td>
                <td className="text-right">{fmtNum(s.tonnesWeighed)}</td>
                <td className="text-right">{fmtNum(s.tonnesEstimated)}</td>
                <td className="text-right">{fmtNum(s.m3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted mt-2">Las toneladas pesadas en báscula y las estimadas se muestran por separado; los m³ no se convierten.</p>
    </Card>
  );
}

/** Mapa público: CDT y CDF en sus coordenadas, sectores por semáforo. Sin vehículos ni ubicaciones de reportes. */
export function FacilitiesMap({ data }: { data: PortalData }) {
  const operators = [...new Set(data.facilities.flatMap((f) => f.operators))].sort();
  const [op, setOp] = useState('');
  const shown = data.facilities.filter((f) => !op || f.operators.includes(op));
  return (
    <Card title="Mapa de centros y sectores" subtitle="Centros de Disposición Temporal (CDT) y Final (CDF). Nunca se publica la posición de los vehículos.">
      {operators.length > 1 && (
        <label className="text-sm flex items-center gap-2 mb-2">Operador
          <Select className="!w-auto" value={op} onChange={(e) => setOp(e.target.value)}><option value="">Todos</option>{operators.map((o) => <option key={o} value={o}>{o}</option>)}</Select>
        </label>
      )}
      <MapView
        sectors={data.sectors.filter((s) => s.polygon.length >= 3).map((s) => ({ id: s.id, name: s.name, label: `${s.name}: ${LIGHT[s.light].text}`, polygon: s.polygon, color: LIGHT[s.light].color, fillOpacity: s.light === 'grey' ? 0.06 : 0.25 }))}
        points={shown.map((f) => ({ id: f.id, lat: f.location.lat, lng: f.location.lng, color: f.type === 'CDF' ? 'var(--accent)' : 'var(--primary)', radius: f.type === 'CDF' ? 12 : 9, label: `${f.type} ${f.name}${f.operators.length ? ` · ${f.operators.join(', ')}` : ''}` }))}
        height={320}
      />
      <ul className="text-xs mt-2 flex flex-wrap gap-3">
        <li className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full" style={{ background: 'var(--primary)' }} aria-hidden /> CDT (Centro de Disposición Temporal)</li>
        <li className="flex items-center gap-1"><span className="inline-block h-4 w-4 rounded-full" style={{ background: 'var(--accent)' }} aria-hidden /> CDF (Centro de Disposición Final)</li>
      </ul>
      <ul className="text-sm mt-2 space-y-1">{shown.map((f) => <li key={f.id}><strong>{f.type}</strong> {f.name} · {f.location.lat.toFixed(5)}, {f.location.lng.toFixed(5)}{f.operators.length ? ` · ${f.operators.join(', ')}` : ''}</li>)}</ul>
    </Card>
  );
}

export function OpenDataCard() {
  const q = useQuery({ queryKey: ['public', 'open-data'], queryFn: () => api.get<{ title: string; cutoff: string; license: string; dictionary: { field: string; description: string }[]; rows: number }>('/public/datos-abiertos') });
  return (
    <Card title="Datos abiertos" subtitle="Indicadores agregados por sector. Nunca incluyen datos personales.">
      <div className="flex flex-wrap gap-2 mb-2">
        <a className="btn-secondary btn-sm" href="/api/public/datos-abiertos.csv">Descargar CSV</a>
        <a className="btn-secondary btn-sm" href="/api/public/datos-abiertos.json">Descargar JSON</a>
      </div>
      {q.data && (
        <>
          <p className="text-xs text-muted">Corte: {fmtDateTime(q.data.cutoff)} · Licencia: {q.data.license}</p>
          <details className="mt-2 text-sm"><summary className="cursor-pointer">Diccionario de datos</summary><ul className="mt-1 space-y-0.5">{q.data.dictionary.map((d) => <li key={d.field}><code>{d.field}</code>: {d.description}</li>)}</ul></details>
        </>
      )}
      <p className="text-sm mt-3">Página de cada parroquia (con QR para la cartelera): {PARISHES.map((p, i) => <span key={p.code}>{i ? ' · ' : ''}<Link className="underline text-primary" to={`/tablero/parroquia/${p.code}`}>{p.name}</Link></span>)}</p>
    </Card>
  );
}

/** Página pública de una parroquia: el QR de su cartelera abre aquí. Tiene vista para imprimir. */
export default function ParishPage() {
  const { code = '' } = useParams();
  const q = useQuery({ queryKey: ['public', 'parish', code], queryFn: () => api.get<{ parish: string; code: string; url: string }>(`/public/parroquias/${code}`) });
  const portal = usePortal(q.data?.parish ?? null);
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    if (q.data?.url) QRCode.toDataURL(q.data.url, { width: 480, margin: 1 }).then(setQr).catch(() => setQr(null));
  }, [q.data?.url]);
  if (q.isLoading || portal.isLoading) return <Spinner />;
  if (!q.data || !portal.data) return <Alert tone="warn">La parroquia no existe.</Alert>;
  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="no-print"><PublicHeader /></div>
      <Card title={`Escombros en ${q.data.parish}`} subtitle="Módulo 1 — Escombros · Kindra" actions={<Button size="sm" className="no-print" onClick={() => window.print()}>Imprimir cartelera</Button>}>
        <div className="flex flex-wrap items-center gap-4">
          {qr && <img src={qr} alt={`Código QR de la página de ${q.data.parish}`} className="h-44 w-44" />}
          <div className="text-sm">
            <p>Escanea el código para ver el avance de tu parroquia y consultar tu reporte.</p>
            <p className="font-mono mt-1 break-all">{q.data.url}</p>
            <p className="mt-2">Para reportar escombro: abre Kindra y toca «Reportar Escombro».</p>
          </div>
        </div>
      </Card>
      <SectorLights data={portal.data} />
      <div className="no-print"><FacilitiesMap data={portal.data} /></div>
    </div>
  );
}
