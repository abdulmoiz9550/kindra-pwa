import type { ChainVerification } from '@kindra/shared';
import { Card, Spinner, Badge, Alert, EmptyState } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';
import { Section, useAdminGet } from './shared';

interface AuditRow {
  id: string;
  seq: number;
  type: 'admin_action' | 'entity_admin_action';
  label: string;
  serverTime: string;
  userAlias: string | null;
  entityName: string | null;
  data: Record<string, unknown>;
  hash: string;
  chainId: string;
}

const describe = (r: AuditRow): string => {
  const d = r.data as { method?: string; path?: string; action?: string; alias?: string; plate?: string; fields?: string[]; items?: number | null };
  if (d.action) return [d.action.replace(/_/g, ' '), d.alias, d.plate].filter(Boolean).join(' · ');
  const extra = d.items != null ? `${d.items} elementos` : d.fields?.length ? `campos: ${d.fields.join(', ')}` : '';
  return [`${d.method} ${d.path}`, extra].filter(Boolean).join(' · ');
};

/** Addendum, parte 3: cada acción del administrador principal y de los administradores de entidad queda como evento sellado. */
export default function Audit() {
  const q = useAdminGet<{ events: AuditRow[]; integrity: ChainVerification[] }>('audit');
  if (q.isLoading || !q.data) return <Spinner />;
  const altered = q.data.integrity.filter((c) => c.status !== 'intact');
  return (
    <Section title="Bitácora de administración" subtitle="Acciones de los administradores, en orden. Son eventos de la misma bitácora sellada: nadie, ni el administrador principal, puede editarlos ni borrarlos.">
      {altered.length ? (
        <Alert tone="bad" className="mb-3" title="Integridad alterada">
          {altered.map((c) => `${c.chainId}: ${c.brokenAt?.reason}`).join(' ')}
        </Alert>
      ) : (
        <Alert tone="ok" className="mb-3" title="Integridad verificada">
          Se recalcularon {q.data.integrity.reduce((s, c) => s + c.checked, 0)} sellos en {q.data.integrity.length} cadenas y todos coinciden.
        </Alert>
      )}
      {q.data.events.length === 0 ? (
        <EmptyState title="Sin acciones registradas" text="Cuando un administrador cambie algo, aparecerá aquí." />
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {q.data.events.map((r) => (
              <li key={r.id} className="py-2.5 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={r.type === 'admin_action' ? 'primary' : 'info'} icon={false}>
                    {r.type === 'admin_action' ? 'Kindra' : r.entityName || 'Entidad'}
                  </Badge>
                  <span className="font-semibold">{r.userAlias || 'sistema'}</span>
                  <span className="text-muted text-xs">{fmtDateTime(r.serverTime)}</span>
                </div>
                <p className="mt-1">{describe(r)}</p>
                <p className="text-[11px] text-muted font-mono truncate" title={r.hash}>
                  #{r.seq} · sello {r.hash.slice(0, 16)}…
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Section>
  );
}
