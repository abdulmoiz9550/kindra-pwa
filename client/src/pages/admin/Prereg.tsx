import { useState } from 'react';
import type { PreregistrationCode } from '@kindra/shared';
import { Button, Field, Input, Badge, Spinner, Card } from '../../components/ui';
import { fmtDate } from '../../lib/format';
import { Section, useAdminList, useAdminAction } from './shared';

/** 18.4: pre-registro por código para personas sin teléfono. El código funciona como credencial de entrada. */
export default function Prereg() {
  const q = useAdminList<PreregistrationCode>('prereg-codes');
  const { post, busy } = useAdminAction();
  const [alias, setAlias] = useState('');
  const create = async () => {
    const r = await post<PreregistrationCode>('prereg-codes', { alias }, 'Código creado.');
    if (r) setAlias('');
  };
  return (
    <Section title="Pre-registro por código" subtitle="Para personas sin teléfono: se crea un código con su alias, se entrega en papel y con él entran desde cualquier dispositivo (pantalla Ingresar).">
      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px]">
            <Field label="Alias de la persona" required>
              <Input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Ej. vecina-calle-3" />
            </Field>
          </div>
          <Button onClick={create} disabled={busy || alias.trim().length < 2} className="mb-4">
            Generar código
          </Button>
        </div>
      </Card>
      {q.isLoading && <Spinner />}
      <table className="table-plain">
        <thead>
          <tr>
            <th scope="col">Código</th>
            <th scope="col">Alias</th>
            <th scope="col">Estado</th>
            <th scope="col">Creado</th>
          </tr>
        </thead>
        <tbody>
          {(q.data || []).map((c) => (
            <tr key={c.code}>
              <td className="font-mono font-semibold">{c.code}</td>
              <td>{c.alias}</td>
              <td>{c.used ? <Badge tone="ok">en uso</Badge> : <Badge tone="warn">sin usar</Badge>}</td>
              <td>{fmtDate(c.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}
