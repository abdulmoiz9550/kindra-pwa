import { useEffect, useState } from 'react';
import type { TransitionRule } from '@kindra/shared';
import { Lock } from 'lucide-react';
import { Card, Button, Spinner, Alert, Modal, Field, Input, Select, Textarea, Badge } from '../../components/ui';
import { Section, useAdminGet, useAdminAction } from './shared';

const OBJECT_LABEL = { origin: 'Origen', trip: 'Viaje', batch: 'Lote' } as const;

interface FixedGate {
  object: TransitionRule['object'];
  action: string;
  conditions: string[];
  rule: string;
}

/** 3.3: tabla de transiciones. El servidor valida cada cambio de estado contra esta tabla. */
export default function Transitions() {
  const q = useAdminGet<TransitionRule[]>('transitions');
  const fixedQ = useAdminGet<FixedGate[]>('transitions/fixed');
  const fixed = fixedQ.data || [];
  const gateOf = (r: Pick<TransitionRule, 'object' | 'action'>) => fixed.find((g) => g.object === r.object && g.action === r.action);
  const fixedCount = (r: TransitionRule) => rules?.filter((x) => x.object === r.object && x.action === r.action).length ?? 0;
  const { put, busy } = useAdminAction();
  const [rules, setRules] = useState<TransitionRule[] | null>(null);
  const [editing, setEditing] = useState<{ index: number; rule: TransitionRule } | null>(null);
  useEffect(() => {
    if (q.data && !rules) setRules(structuredClone(q.data));
  }, [q.data, rules]);
  if (!rules) return <Spinner />;
  const save = async () => {
    const r = await put<TransitionRule[]>('transitions', rules, 'Tabla de estados guardada.');
    if (r) setRules(structuredClone(r));
  };
  const commit = () => {
    if (!editing) return;
    // Las condiciones fijas no se pueden quitar: se reponen al aplicar.
    const gate = gateOf(editing.rule);
    if (gate) editing.rule.conditions = [...new Set([...editing.rule.conditions, ...gate.conditions])];
    const next = [...rules];
    if (editing.index >= 0) next[editing.index] = editing.rule;
    else next.push(editing.rule);
    setRules(next);
    setEditing(null);
  };
  const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
  return (
    <Section
      title="Estados y transiciones"
      subtitle="Qué rol puede mover cada objeto de qué estado a cuál y bajo qué condiciones. La interfaz solo muestra los botones permitidos; la validación real ocurre en el servidor."
      actions={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setEditing({ index: -1, rule: { object: 'origin', action: '', from: [], to: '', roles: [], conditions: [], description: '' } })}>
            Nueva regla
          </Button>
          <Button onClick={save} disabled={busy}>
            Guardar tabla
          </Button>
        </div>
      }
    >
      <Alert tone="warn" className="mb-3" title="Compuertas fijas">
        Las reglas 7.2, 7.3, 7.4 y "nadie valida ni recibe lo que reportó" (4.1) están en el código y no se pueden quitar de esta tabla, ni siquiera por el administrador principal. Aparecen con candado; si se borran o se quitan sus condiciones, el servidor las repone al guardar.
      </Alert>
      <Alert tone="info" className="mb-3">
        Condiciones disponibles: zoneAuthorized (7.2), notOwnReport (4.1), isReporter, notAnonymous, allHazardDecided (7.3), qualityApproved (7.4), sameCenter, hasEvidence, notHeld. Destinos especiales: "previous" (vuelve al estado anterior) y "a|b" (el servicio decide entre dos).
      </Alert>
      {(['origin', 'trip', 'batch'] as const).map((obj) => (
        <Card key={obj} title={OBJECT_LABEL[obj]} className="mb-3">
          <div className="overflow-x-auto">
            <table className="table-plain min-w-[720px]">
              <thead>
                <tr>
                  <th scope="col">Acción (evento)</th>
                  <th scope="col">Desde</th>
                  <th scope="col">Hacia</th>
                  <th scope="col">Roles</th>
                  <th scope="col">Condiciones</th>
                  <th scope="col"></th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r, i) =>
                  r.object === obj ? (
                    <tr key={`${r.object}-${r.action}-${i}`}>
                      <td>
                        <span className="font-mono text-xs">{r.action}</span>
                        {r.description && <span className="block text-xs text-muted">{r.description}</span>}
                      </td>
                      <td className="text-xs">{r.from.join(', ')}</td>
                      <td className="text-xs font-semibold">{r.to}</td>
                      <td className="text-xs">{r.roles.join(', ')}</td>
                      <td className="text-xs">
                        {r.conditions.length === 0 && '—'}
                        {r.conditions.map((c) => {
                          const locked = gateOf(r)?.conditions.includes(c);
                          return (
                            <span key={c} className="inline-flex items-center gap-0.5 mr-1">
                              {locked && <Lock size={11} aria-label="condición fija" />}
                              {c}
                            </span>
                          );
                        })}
                        {gateOf(r) && (
                          <span className="block mt-1">
                            <Badge tone="warn" icon={false}>
                              Compuerta fija {gateOf(r)!.rule}
                            </Badge>
                          </span>
                        )}
                      </td>
                      <td className="text-right whitespace-nowrap">
                        <Button variant="ghost" size="sm" onClick={() => setEditing({ index: i, rule: structuredClone(r) })}>
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!!gateOf(r) && fixedCount(r) <= 1}
                          title={gateOf(r) && fixedCount(r) <= 1 ? 'Regla con compuerta fija: no se puede quitar' : undefined}
                          onClick={() => setRules(rules.filter((_, j) => j !== i))}
                          aria-label={`Quitar regla ${r.action}`}
                        >
                          Quitar
                        </Button>
                      </td>
                    </tr>
                  ) : null,
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing && editing.index >= 0 ? 'Editar regla' : 'Nueva regla'} wide>
        {editing && (
          <div>
            <div className="grid sm:grid-cols-2 sm:gap-3">
              <Field label="Objeto" required>
                <Select value={editing.rule.object} onChange={(e) => setEditing({ ...editing, rule: { ...editing.rule, object: e.target.value as TransitionRule['object'] } })}>
                  <option value="origin">Origen</option>
                  <option value="trip">Viaje</option>
                  <option value="batch">Lote</option>
                </Select>
              </Field>
              <Field label="Acción (tipo de evento)" required>
                <Input value={editing.rule.action} onChange={(e) => setEditing({ ...editing, rule: { ...editing.rule, action: e.target.value.trim() } })} placeholder="origin_validated" />
              </Field>
              <Field label="Estados de partida (separados por coma)" required>
                <Input value={editing.rule.from.join(', ')} onChange={(e) => setEditing({ ...editing, rule: { ...editing.rule, from: list(e.target.value) } })} />
              </Field>
              <Field label="Estado destino" required>
                <Input value={editing.rule.to} onChange={(e) => setEditing({ ...editing, rule: { ...editing.rule, to: e.target.value.trim() } })} />
              </Field>
              <Field label="Roles (separados por coma)" required>
                <Input value={editing.rule.roles.join(', ')} onChange={(e) => setEditing({ ...editing, rule: { ...editing.rule, roles: list(e.target.value) as TransitionRule['roles'] } })} placeholder="coordinator, system" />
              </Field>
              <Field label="Condiciones (separadas por coma)" hint={gateOf(editing.rule) ? `Fijas, se reponen siempre: ${gateOf(editing.rule)!.conditions.join(', ')}` : undefined}>
                <Input value={editing.rule.conditions.join(', ')} onChange={(e) => setEditing({ ...editing, rule: { ...editing.rule, conditions: list(e.target.value) } })} />
              </Field>
            </div>
            <Field label="Descripción">
              <Textarea value={editing.rule.description || ''} onChange={(e) => setEditing({ ...editing, rule: { ...editing.rule, description: e.target.value } })} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button onClick={commit} disabled={!editing.rule.action || !editing.rule.to || !editing.rule.from.length || !editing.rule.roles.length}>
                Aplicar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Section>
  );
}
