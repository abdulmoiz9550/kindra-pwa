const TZ = 'America/Caracas';

export function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-VE', { dateStyle: 'medium', timeStyle: 'short', timeZone: TZ });
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-VE', { dateStyle: 'medium', timeZone: TZ });
}

export function fmtTime(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-VE', { timeStyle: 'short', timeZone: TZ });
}

export function fmtRelative(iso?: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return 'hace un momento';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `hace ${d} día${d === 1 ? '' : 's'}`;
  return fmtDate(iso);
}

export function fmtNum(n: number | null | undefined, decimals = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('es-VE', { maximumFractionDigits: decimals }).format(n);
}

export function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${Math.round(n * 100)} %`;
}

export function unitLabel(u?: string | null): string {
  return u === 't' ? 't' : u === 'm3' ? 'm³' : u || '';
}
