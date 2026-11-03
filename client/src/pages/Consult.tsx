import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import type { OriginEffectiveState } from '@kindra/shared';
import { api, ApiError, errorMessage } from '../lib/api';
import { saveCode, savedCodes } from '../lib/storage';
import { useSavedCodes } from '../lib/notifications';
import { fmtDateTime } from '../lib/format';
import { Alert, Button, Card, Field, Input, OriginStateBadge, PageTitle, Spinner } from '../components/ui';

interface Estado {
  status: { code: string; sector: string; state: OriginEffectiveState; label: string; plain: string; center: string; createdAt: string; pendingRemovalConfirmation: boolean; pendingSatisfaction: boolean; mainCode?: string | null };
  messages: { id: string; text: string; kind: string; createdAt: string; link: string | null }[];
}

function normalize(v: string): string {
  const t = v.toUpperCase().replace(/\s+/g, '').replace(/^LG-?/, '');
  return t ? `LG-${t.slice(0, 4)}` : '';
}

/** 16.1 "Consultar mi reporte" por código. */
export default function Consult() {
  const [input, setInput] = useState('');
  const [code, setCode] = useState<string | null>(null);
  useSavedCodes();
  const q = useQuery({ queryKey: ['public', 'estado', code], queryFn: () => api.get<Estado>(`/public/reportes/${code}/estado`), enabled: !!code, retry: false });
  const notFound = q.error instanceof ApiError && q.error.status === 404;
  useEffect(() => {
    if (q.data && code && !savedCodes().find((c) => c.code === code)) saveCode(code, q.data.status.sector);
  }, [q.data, code]);

  return (
    <div className="max-w-lg mx-auto">
      <PageTitle title="Consultar mi reporte" subtitle="Escribe el código que recibiste al reportar. Tiene la forma LG-4821." />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const c = normalize(input);
          if (c.length === 7) setCode(c);
        }}
      >
        <Field label="Código del reporte">
          <div className="flex gap-2">
            <Input value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} placeholder="LG-4821" autoCapitalize="characters" className="font-mono tracking-widest text-lg" />
            <Button type="submit" aria-label="Buscar">
              <Search size={18} />
            </Button>
          </div>
        </Field>
      </form>

      {q.isFetching && <Spinner label="Buscando…" />}
      {notFound && (
        <Alert tone="warn" title="No encontramos ese código">
          No hay ningún reporte registrado con el código {code}. Revisa que esté bien escrito: dos letras, un guion y cuatro caracteres.
        </Alert>
      )}
      {q.error && !notFound && <Alert tone="bad">{errorMessage(q.error)}</Alert>}

      {q.data && (
        <Card className="mt-2" title={q.data.status.code} subtitle={`${q.data.status.sector} · reportado ${fmtDateTime(q.data.status.createdAt)}`} actions={<OriginStateBadge state={q.data.status.state} />}>
          <p className="text-base">{q.data.status.plain}</p>
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
