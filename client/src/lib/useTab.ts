import { useSearchParams } from 'react-router-dom';

/** Pestaña guardada en la dirección: el menú lateral puede enlazarla y el botón atrás funciona. */
export function useTab<T extends string>(fallback: T, allowed?: readonly T[]): [T, (t: T) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as T | null;
  const value = raw && (!allowed || allowed.includes(raw)) ? raw : fallback;
  const set = (t: T) => {
    const next = new URLSearchParams(params);
    if (t === fallback) next.delete('tab');
    else next.set('tab', t);
    setParams(next);
  };
  return [value, set];
}
