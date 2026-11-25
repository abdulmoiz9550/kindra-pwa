import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Módulo elegido en pantalla. Vacío = todos los autorizados. El permiso real lo aplica el servidor. */
export const useModule = create<{ module: string; setModule: (m: string) => void }>()(persist((set) => ({ module: '', setModule: (module) => set({ module }) }), { name: 'kindra-module' }));
