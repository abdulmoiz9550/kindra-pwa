import { useQuery } from '@tanstack/react-query';
import type { Role, LevelConfig, PointsConfig } from '@kindra/shared';
import { api } from './api';

export interface PublicConfig {
  branding: { entityName: string; logoUrl: string | null; tagline: string; provisional: boolean; kindraLine: string };
  demoMode: boolean;
  simulatedLabel: string | null;
  sectors: { id: string; name: string; parish: string; polygon: [number, number][]; authorized: boolean; provisional: boolean }[];
  centers: { id: string; name: string; type: 'CDT' | 'CDF'; sectorId: string; location: { lat: number; lng: number } | null }[];
  demoRoles: { role: Role; alias: string }[];
  publicBaseUrl: string;
  complaintChannelUrl: string;
  levels: LevelConfig[];
  points: PointsConfig;
  thresholds: { duplicateDistanceM: number; duplicateWindowDays: number; timeSkewMinutes: number; tripArrivalDeadlineHours: number; dailyReportLimit: number };
  hazardChecklist: { key: string; label: string; provisional: boolean }[];
  qualityChecklist: { key: string; label: string; provisional: boolean }[];
  labels: {
    useTypes: Record<string, string>;
    sizes: Record<string, string>;
    urgencies: Record<string, string>;
    subcategories: Record<string, string>;
    rejectionReasons: Record<string, string>;
    structureTypes: Record<string, string>;
    causes: Record<string, string>;
    roles: Record<string, string>;
  };
  provisionalFlags: Record<string, boolean>;
}

export function usePublicConfig() {
  return useQuery({ queryKey: ['public', 'config'], queryFn: () => api.get<PublicConfig>('/public/config'), staleTime: 60_000 });
}
