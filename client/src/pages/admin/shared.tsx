import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../lib/api';
import { toast } from '../../lib/toast';

export function useAdminList<T>(path: string) {
  return useQuery({ queryKey: ['admin', path], queryFn: () => api.get<T[]>(`/admin/${path}`) });
}

export function useAdminGet<T>(path: string) {
  return useQuery({ queryKey: ['admin', path], queryFn: () => api.get<T>(`/admin/${path}`) });
}

/** Ejecuta una mutación de administración, muestra el error en voz humana y refresca las listas. */
export function useAdminAction() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const run = async <T,>(fn: () => Promise<T>, okText?: string): Promise<T | null> => {
    setBusy(true);
    try {
      const r = await fn();
      if (okText) toast.success(okText);
      qc.invalidateQueries({ queryKey: ['admin'] });
      qc.invalidateQueries({ queryKey: ['public', 'config'] });
      return r;
    } catch (err) {
      toast.error(errorMessage(err));
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { run, busy, post: <T,>(path: string, body: unknown, okText?: string) => run(() => api.post<T>(`/admin/${path}`, body), okText), put: <T,>(path: string, body: unknown, okText?: string) => run(() => api.put<T>(`/admin/${path}`, body), okText), del: (path: string, okText?: string) => run(() => api.del(`/admin/${path}`), okText) };
}

export function Section({ title, subtitle, children, actions }: { title: ReactNode; subtitle?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">{title}</h1>
          {subtitle && <p className="text-sm text-muted mt-0.5 max-w-prose">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

export function numberOr(v: string, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && v !== '' ? n : fallback;
}
