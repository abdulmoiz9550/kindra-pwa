import type { FeatureDefinition } from '@kindra/shared';
import { Card, Spinner, Badge, Alert } from '../../components/ui';
import { Section, useAdminList, useAdminAction } from './shared';

type FeatureRow = FeatureDefinition & { enabled: boolean };

const GROUPS: { key: FeatureDefinition['group']; title: string; subtitle: string }[] = [
  { key: 'debris', title: 'Funciones del módulo de escombros', subtitle: 'Se pueden encender y apagar. El cambio aplica de inmediato en toda la PWA y queda registrado como evento.' },
  { key: 'later_phase', title: 'Fase posterior', subtitle: 'Previstas en la especificación, fuera de esta entrega.' },
  { key: 'hidden', title: 'Ocultas en el módulo de escombros', subtitle: 'Pertenecen a otros módulos de Kindra. En esta fase no aparecen en ninguna pantalla del módulo de escombros.' },
];

/** Addendum: el administrador principal enciende y apaga funciones. */
export default function Features() {
  const q = useAdminList<FeatureRow>('features');
  const { put, busy } = useAdminAction();
  if (q.isLoading || !q.data) return <Spinner />;
  const toggle = (f: FeatureRow) => put('features', { [f.key]: !f.enabled }, `${f.label}: ${f.enabled ? 'apagada' : 'encendida'}.`);
  return (
    <Section title="Funciones" subtitle="Interruptores de las funciones de la plataforma. Solo el administrador principal de Kindra puede cambiarlos.">
      <Alert tone="info" className="mb-3">
        Las funciones marcadas como no disponibles no están construidas en esta instalación, así que su interruptor queda bloqueado en apagado.
      </Alert>
      {GROUPS.map((g) => {
        const items = q.data!.filter((f) => f.group === g.key);
        if (!items.length) return null;
        return (
          <Card key={g.key} title={g.title} subtitle={g.subtitle} className="mb-3">
            <ul className="divide-y divide-line">
              {items.map((f) => (
                <li key={f.key} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm">
                      {f.label} {!f.available && <Badge tone="neutral" icon={false}>no disponible</Badge>}
                    </p>
                    <p className="text-xs text-muted mt-0.5">{f.description}</p>
                  </div>
                  <label className={`inline-flex items-center gap-2 text-sm shrink-0 ${!f.available ? 'opacity-50' : 'cursor-pointer'}`}>
                    <input type="checkbox" role="switch" className="h-5 w-5 accent-[var(--primary)]" checked={f.enabled} disabled={!f.available || busy} onChange={() => toggle(f)} aria-label={`${f.label}: ${f.enabled ? 'encendida' : 'apagada'}`} />
                    {f.enabled ? 'Encendida' : 'Apagada'}
                  </label>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </Section>
  );
}
