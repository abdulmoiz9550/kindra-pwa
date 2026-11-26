import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import type { OriginEffectiveState } from '@kindra/shared';
import { api, ApiError, errorMessage } from '../lib/api';
import { saveCode, savedCodes } from '../lib/storage';
import { useSavedCodes } from '../lib/notifications';
import { fmtDateTime } from '../lib/format';
import { Alert, Badge, Button, Card, Field, Input, OriginStateBadge, PageTitle, Spinner } from '../components/ui';
import { PUBLIC_LOT_STATES } from '@kindra/shared';

interface Estado {
  status: { code: string; sector: string; state: OriginEffectiveState; label: string; plain: string; center: string; createdAt: string; pendingRemovalConfirmation: boolean; pendingSatisfaction: boolean; mainCode?: string | null };
  messages: { id: string; text: string; kind: string; createdAt: string; link: string | null }[];
}

/** Acepta R-CB-004512 y LG-CB-000123 (addendum v4.2) y los códigos anteriores LG-4821, en cualquier caja. */
export function normalizeCode(v: string): string {
  const t = v.toUpperCase().replace(/\s+/g, '');
  if (/^LG-[A-Z0-9]{4}$/.test(t)) return t;
  const m = /^(R|LG)-?([A-Z]{2})-?(\d{1,6})$/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3].padStart(6, '0')}`;
  const old = /^LG-?([A-Z0-9]{4})$/.exec(t);
  return old ? `LG-${old[1]}` : '';
}

interface Lookup { code: string; kind: 'report' | 'lot'; sector: string; status: { label: string; reason: string | null } | null; lotCodes: string[]; publicStage: number; publicStageLabel: string | null; timeline: { label: string; at: string }[]; cutoff: string }

/** 16.1 "Consultar mi reporte" por código. */
export default function Consult() {
  const [input, setInput] = useState('');
  const [code, setCode] = useState<string | null>(null);
  useSavedCodes();
  const q = useQuery({ queryKey: ['public', 'estado', code], queryFn: () => api.get<Estado>(`/public/reportes/${code}/estado`), enabled: !!code, retry: false });
  const lk = useQuery({ queryKey: ['public', 'consulta', code], queryFn: () => api.get<Lookup>(`/public/consulta/${code}`), enabled: !!code, retry: false });
  const notFound = q.error instanceof ApiError && q.error.status === 404;
  useEffect(() => {
    if (q.data && code && !savedCodes().find((c) => c.code === code)) saveCode(code, q.data.status.sector);
  }, [q.data, code]);

  return (
    <div className="max-w-lg mx-auto">
      <PageTitle title="Seguimiento" subtitle="Escribe el código de tu reporte (R-CB-004512) o de un lote (LG-CB-000123). No hace falta cuenta." />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const c = normalizeCode(input);
          if (c) setCode(c);
        }}
      >
        <Field label="Código del reporte o del lote">
          <div className="flex gap-2">
            <Input value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} placeholder="R-CB-004512" autoCapitalize="characters" className="font-mono tracking-widest text-lg" />
            <Button type="submit" aria-label="Buscar">
              <Search size={18} />
            </Button>
          </div>
        </Field>
      </form>

      {q.isFetching && <Spinner label="Buscando…" />}
      {notFound && (
        <Alert tone="warn" title="No encontramos ese código">
          No hay ningún reporte registrado con el código {code}. Revisa que esté bien escrito, por ejemplo R-CB-004512.
        </Alert>
      )}
      {q.error && !notFound && <Alert tone="bad">{errorMessage(q.error)}</Alert>}

      {q.data && (
        <Card className="mt-2" title={q.data.status.code} subtitle={`${q.data.status.sector} · ${fmtDateTime(q.data.status.createdAt)}`} actions={lk.data?.status ? <Badge tone="info" icon={false}>{lk.data.status.label}</Badge> : <OriginStateBadge state={q.data.status.state} />}>
          <p className="text-base">{q.data.status.plain}</p>
          {lk.data && (
            <div className="mt-3">
              <ol className="grid grid-cols-4 gap-1 text-center text-xs" aria-label="Estados públicos">
                {PUBLIC_LOT_STATES.map((label, i) => <li key={label} className={`rounded-md border px-1 py-2 ${lk.data!.publicStage > i ? 'border-ok bg-ok-soft font-semibold' : 'border-line text-muted'}`}>{label}</li>)}
              </ol>
              {lk.data.lotCodes.length > 0 && <p className="text-sm mt-2">Lote{lk.data.lotCodes.length > 1 ? 's' : ''}: {lk.data.lotCodes.join(', ')}</p>}
              <ul className="mt-2 text-sm space-y-0.5">{lk.data.timeline.map((t, i) => <li key={i}>{fmtDateTime(t.at)} · {t.label}</li>)}</ul>
              <p className="text-xs text-muted mt-1">Corte: {fmtDateTime(lk.data.cutoff)}</p>
            </div>
          )}
          {q.data.status.mainCode && (
            <p className="text-sm text-muted mt-1">
              Este aviso se sumó al reporte <Link to={`/reporte/${q.data.status.mainCode}`} className="underline">{q.data.status.mainCode}</Link>.
            </p>
          )}
          {(q.data.status.pendingRemovalConfirmation || q.data.status.pendingSatisfaction) && (
            <Alert tone="info" className="mt-3">
              Hay una pregunta esperando tu respuesta en la ficha del reporte.
            </Alert>
          )}
          <div className="mt-3 flex gap-2">
            <Link to={`/reporte/${q.data.status.code}`} className="btn-primary flex-1">
              Ver la ficha completa
            </Link>
            <Link to="/aura" className="btn-secondary">
              Preguntar a AURA
            </Link>
          </div>
          {q.data.messages.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold mb-2">Mensajes sobre este reporte</h3>
              <ul className="space-y-2">
                {q.data.messages.map((m) => (
                  <li key={m.id} className="rounded-lg bg-surface-2 p-3 text-sm">
                    <p>{m.text}</p>
                    <p className="text-xs text-muted mt-1">{fmtDateTime(m.createdAt)}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      <SavedList onPick={(c) => { setInput(c); setCode(c); }} />
    </div>
  );
}

function SavedList({ onPick }: { onPick: (c: string) => void }) {
  const codes = useSavedCodes();
  const list = savedCodes();
  if (!codes.length) return null;
  return (
    <Card className="mt-4" title="Códigos guardados en este teléfono">
      <ul className="divide-y divide-line">
        {list.map((c) => (
          <li key={c.code} className="flex items-center justify-between py-2">
            <button type="button" className="font-mono font-semibold underline" onClick={() => onPick(c.code)}>
              {c.code}
            </button>
            <span className="text-xs text-muted">{c.sectorName || ''}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
