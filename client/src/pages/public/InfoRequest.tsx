import { useState } from 'react';
import { INFO_REQUEST_STATUS_LABELS } from '@kindra/shared';
import type { InfoRequestStatus } from '@kindra/shared';
import { api, errorMessage } from '../../lib/api';
import { fmtDateTime } from '../../lib/format';
import { Alert, Button, Card, Field, Input, PageTitle, Textarea } from '../../components/ui';

interface Status {
  code: string;
  subject: string;
  status: InfoRequestStatus;
  createdAt: string;
  updatedAt: string;
  decisionNote: string | null;
}

/** v4.0, sección 9: solicitud de información. Se pide solo lo necesario; una persona la revisa. */
export default function InfoRequestPage() {
  const [f, setF] = useState({ subject: '', description: '', name: '', contact: '' });
  const [code, setCode] = useState('');
  const [sent, setSent] = useState<Status | null>(null);
  const [found, setFound] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      setSent(await api.post<Status>('/public/solicitudes-informacion', { subject: f.subject, description: f.description, name: f.name || null, contact: f.contact || null }));
      setF({ subject: '', description: '', name: '', contact: '' });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const lookup = async () => {
    setLookupError(null);
    setFound(null);
    try {
      setFound(await api.get<Status>(`/public/solicitudes-informacion/${encodeURIComponent(code.trim())}`));
    } catch (err) {
      setLookupError(errorMessage(err));
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <PageTitle title="Solicitar información" subtitle="Una persona autorizada revisa cada solicitud y decide qué se puede entregar." />
      {sent && (
        <Alert tone="ok" title={`Solicitud recibida: ${sent.code}`}>
          Guarda este código para consultar el estado.
        </Alert>
      )}
      <Card title="Nueva solicitud">
        <form onSubmit={(e) => { e.preventDefault(); send(); }}>
          <Field label="Asunto" required><Input value={f.subject} maxLength={120} onChange={(e) => setF({ ...f, subject: e.target.value })} required /></Field>
          <Field label="Qué información buscas" required><Textarea value={f.description} maxLength={2000} onChange={(e) => setF({ ...f, description: e.target.value })} required /></Field>
          <Field label="Tu nombre" hint="Opcional. No se publica."><Input value={f.name} maxLength={80} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Cómo contactarte" hint="Opcional. Solo lo ve la administración."><Input value={f.contact} maxLength={120} onChange={(e) => setF({ ...f, contact: e.target.value })} /></Field>
          {error && <Alert tone="bad" className="mb-3">{error}</Alert>}
          <Button type="submit" disabled={busy}>{busy ? 'Enviando…' : 'Enviar solicitud'}</Button>
        </form>
      </Card>
      <Card title="Consultar una solicitud">
        <form onSubmit={(e) => { e.preventDefault(); lookup(); }}>
          <Field label="Código" required><Input value={code} placeholder="SI-XXXXX" className="font-mono" onChange={(e) => setCode(e.target.value.toUpperCase())} required /></Field>
          <Button type="submit" variant="secondary">Consultar</Button>
        </form>
        {lookupError && <Alert tone="bad" className="mt-3">{lookupError}</Alert>}
        {found && (
          <Alert tone="info" className="mt-3" title={`${found.code} · ${INFO_REQUEST_STATUS_LABELS[found.status]}`}>
            {found.subject}. Último cambio: {fmtDateTime(found.updatedAt)}.{found.decisionNote ? ` ${found.decisionNote}` : ''}
          </Alert>
        )}
      </Card>
    </div>
  );
}
