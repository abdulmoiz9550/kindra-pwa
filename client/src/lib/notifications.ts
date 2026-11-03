import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Notification } from '@kindra/shared';
import { api } from './api';
import { useAuth } from './auth';
import { savedCodes } from './storage';

export function useSavedCodes(): string[] {
  const [codes, setCodes] = useState(() => savedCodes().map((c) => c.code));
  useEffect(() => {
    const h = () => setCodes(savedCodes().map((c) => c.code));
    window.addEventListener('kindra:codes', h);
    return () => window.removeEventListener('kindra:codes', h);
  }, []);
  return codes;
}

/** Notificaciones del usuario con cuenta y de los códigos guardados en este teléfono (15). */
export function useNotifications() {
  const token = useAuth((s) => s.token);
  const codes = useSavedCodes();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['notifications', token, codes.join(',')],
    queryFn: () => api.post<Notification[]>('/me/notifications/lookup', { codes }),
    refetchInterval: 30_000,
  });
  const unread = (q.data || []).filter((n) => !n.readAt).length;
  const markRead = async (id: string) => {
    await api.post(`/me/notifications/${id}/read`, { codes });
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };
  const markAll = async () => {
    await api.post('/me/notifications/read-all', { codes });
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };
  return { ...q, notifications: q.data || [], unread, markRead, markAll };
}
