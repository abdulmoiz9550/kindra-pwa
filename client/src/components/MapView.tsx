import { MapContainer, TileLayer, Polygon, CircleMarker, Tooltip, useMapEvents, useMap } from 'react-leaflet';
import { useEffect } from 'react';
import type { LatLngExpression } from 'leaflet';
import { polygonCentroid } from '@kindra/shared';

export interface MapSector {
  id: string;
  name: string;
  polygon: [number, number][];
  color?: string;
  fillOpacity?: number;
  label?: string;
  authorized?: boolean;
}

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  color?: string;
  label?: string;
  radius?: number;
  onClick?: () => void;
}

const DEFAULT_CENTER: [number, number] = [10.599, -66.956];

/** Área del piloto: de Santa Eduvigis (oeste) a Caraballeda (este), unos 19 km (datos de referencia v0.1). */
export const PILOT_BOUNDS: [[number, number], [number, number]] = [
  [10.578, -67.015],
  [10.628, -66.825],
];

function FitPilot({ sectors }: { sectors: MapSector[] }) {
  const map = useMap();
  const key = sectors.map((s) => s.id).join(',');
  useEffect(() => {
    const pts = [...sectors.flatMap((s) => s.polygon), ...PILOT_BOUNDS];
    const lats = pts.map((p) => p[0]);
    const lngs = pts.map((p) => p[1]);
    map.fitBounds([
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ], { padding: [8, 8] });
  }, [key]);
  return null;
}

function ClickHandler({ onClick }: { onClick?: (p: { lat: number; lng: number }) => void }) {
  useMapEvents({
    click(e) {
      onClick?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

function Recenter({ center, zoom }: { center?: [number, number] | null; zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, zoom ?? map.getZoom());
  }, [center?.[0], center?.[1]]);
  return null;
}

/** Mapa base con sectores (polígonos) y puntos. Para páginas públicas no se pasan puntos individuales (12.3, 12.5). */
export function MapView({ sectors = [], points = [], center, zoom = 14, height = 280, onClick, className = '', fitSectors = true, pilotArea = true }: { sectors?: MapSector[]; points?: MapPoint[]; center?: [number, number] | null; zoom?: number; height?: number; onClick?: (p: { lat: number; lng: number }) => void; className?: string; fitSectors?: boolean; pilotArea?: boolean }) {
  const c: [number, number] = center || (sectors.length && fitSectors ? ((): [number, number] => {
    const all = sectors.flatMap((s) => s.polygon);
    const cc = polygonCentroid(all);
    return [cc.lat, cc.lng];
  })() : DEFAULT_CENTER);
  return (
    <div className={className} style={{ height }}>
      <MapContainer center={c} zoom={zoom} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false} attributionControl>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Recenter center={center ?? null} zoom={zoom} />
        {!center && fitSectors && pilotArea && <FitPilot sectors={sectors} />}
        {onClick && <ClickHandler onClick={onClick} />}
        {sectors.map((s) => (
          <Polygon key={s.id} positions={s.polygon as LatLngExpression[]} pathOptions={{ color: s.color || 'var(--primary)', weight: 2, fillOpacity: s.fillOpacity ?? 0.12, dashArray: s.authorized === false ? '6 6' : undefined }}>
            <Tooltip sticky>{s.label || s.name}</Tooltip>
          </Polygon>
        ))}
        {points.map((p) => (
          <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={p.radius ?? 8} pathOptions={{ color: '#fff', weight: 2, fillColor: p.color || 'var(--primary)', fillOpacity: 0.95 }} eventHandlers={p.onClick ? { click: p.onClick } : undefined}>
            {p.label && <Tooltip>{p.label}</Tooltip>}
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
