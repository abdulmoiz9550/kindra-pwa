import { create } from 'zustand';
import { EN } from '../i18n/en';
import { useFeature } from './config';

/**
 * Addendum v4.2, sección 1.2: el español es el idioma principal y por defecto. El inglés es un segundo idioma que solo
 * aparece si el Administrador Principal lo enciende. Los textos en español son la clave; lo que no está traducido
 * se muestra en español.
 */
type Lang = 'es' | 'en';
const KEY = 'kindra.lang';

export const useLang = create<{ lang: Lang; setLang: (l: Lang) => void }>((set) => ({
  lang: (() => {
    try {
      return localStorage.getItem(KEY) === 'en' ? 'en' : 'es';
    } catch {
      return 'es';
    }
  })(),
  setLang: (lang) => {
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      /* sin almacenamiento */
    }
    document.documentElement.lang = lang;
    set({ lang });
  },
}));

/** Traductor para el idioma activo. Con el inglés apagado siempre devuelve el español. */
export function useT(): (es: string) => string {
  const on = useFeature('english_language');
  const lang = useLang((s) => s.lang);
  if (!on || lang === 'es') return (s) => s;
  return (s) => EN[s] ?? s;
}
