import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** 18.3: alto contraste, variantes para daltonismo, tamaño de texto y movimiento reducido. */
export interface A11yState {
  highContrast: boolean;
  colorblind: boolean;
  textSize: 'normal' | 'lg' | 'xl';
  reduceMotion: boolean;
  set: (patch: Partial<Omit<A11yState, 'set'>>) => void;
}

export const useA11y = create<A11yState>()(
  persist(
    (set) => ({
      highContrast: false,
      colorblind: false,
      textSize: 'normal',
      reduceMotion: false,
      set: (patch) => set(patch),
    }),
    { name: 'kindra.a11y' },
  ),
);

export function applyA11y(s: Pick<A11yState, 'highContrast' | 'colorblind' | 'textSize' | 'reduceMotion'>): void {
  const html = document.documentElement;
  html.classList.toggle('high-contrast', s.highContrast);
  html.classList.toggle('colorblind', s.colorblind);
  html.classList.toggle('text-lg', s.textSize === 'lg');
  html.classList.toggle('text-xl', s.textSize === 'xl');
  html.classList.toggle('reduce-motion', s.reduceMotion);
}
