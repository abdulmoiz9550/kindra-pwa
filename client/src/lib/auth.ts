import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PublicUser, Role } from '@kindra/shared';

interface AuthState {
  token: string | null;
  user: PublicUser | null;
  setSession: (s: { token: string; user: PublicUser }) => void;
  setUser: (u: PublicUser) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSession: ({ token, user }) => set({ token, user }),
      setUser: (user) => set({ user }),
      logout: () => set({ token: null, user: null }),
    }),
    { name: 'kindra.auth' },
  ),
);

export const getToken = () => useAuth.getState().token;
export const currentUser = () => useAuth.getState().user;

export function hasRole(role: Role): boolean {
  const u = useAuth.getState().user;
  return !!u && u.roles.includes(role);
}

export const INSTITUTIONAL: Role[] = ['coordinator', 'removal', 'center', 'evaluator', 'supervisor', 'destination', 'admin'];
