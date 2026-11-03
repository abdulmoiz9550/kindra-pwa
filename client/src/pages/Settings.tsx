import { useA11y } from '../lib/a11y';
import { Card, PageTitle } from '../components/ui';

/** 18.3: alto contraste, variantes para daltonismo, tamaño de texto y movimiento reducido. Persisten en el dispositivo. */
export default function Settings() {
  const s = useA11y();
  return (
    <div className="max-w-lg mx-auto">
      <PageTitle title="Accesibilidad" subtitle="Ajusta la pantalla a lo que te resulte más cómodo. Se guarda en este teléfono." />
      <Card>
        <Toggle label="Alto contraste" hint="Texto negro sobre fondo blanco y bordes marcados." checked={s.highContrast} onChange={(v) => s.set({ highContrast: v })} />
        <Toggle label="Colores para daltonismo" hint="El semáforo usa azul, naranja y marrón, siempre acompañados de icono y texto." checked={s.colorblind} onChange={(v) => s.set({ colorblind: v })} />
        <Toggle label="Reducir movimiento" hint="Quita animaciones y transiciones." checked={s.reduceMotion} onChange={(v) => s.set({ reduceMotion: v })} />
        <fieldset className="mt-4">
          <legend className="label">Tamaño del texto</legend>
          <div className="flex gap-2">
            {(['normal', 'lg', 'xl'] as const).map((t) => (
              <button key={t} type="button" className={`chip ${s.textSize === t ? 'chip-active' : ''}`} onClick={() => s.set({ textSize: t })} aria-pressed={s.textSize === t}>
                {t === 'normal' ? 'Normal' : t === 'lg' ? 'Grande' : 'Muy grande'}
              </button>
            ))}
          </div>
        </fieldset>
      </Card>
      <p className="text-xs text-muted mt-4">Toda la plataforma funciona con lector de pantalla: los estados llevan texto e icono, no solo color, y los botones tienen nombres claros.</p>
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start justify-between gap-3 py-3 border-b border-line last:border-0">
      <span>
        <span className="block font-semibold">{label}</span>
        <span className="block text-sm text-muted">{hint}</span>
      </span>
      <input type="checkbox" role="switch" aria-checked={checked} checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-6 w-11 shrink-0 accent-[var(--primary)]" />
    </label>
  );
}
