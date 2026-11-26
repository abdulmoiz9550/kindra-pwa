import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../lib/api';
import { sendOrQueue } from '../lib/offlineActions';
import { toast } from '../lib/toast';
import { useTab } from '../lib/useTab';
import { fmtRelative } from '../lib/format';
import { Alert, Badge, Button, Card, EmptyState, Modal, PageTitle, Spinner, Tabs, Textarea } from '../components/ui';
import { PhotoCapture, type CapturedPhoto } from '../components/PhotoCapture';

interface Case {
  id: string;
  code: string;
  sector: string;
  street: string | null;
  reference: string | null;
  location: { lat: number; lng: number } | null;
  createdAt: string;
  status: { key: string; label: string; reason: string | null };
  own: boolean;
  viaMonitor: boolean;
  verified: { result: string; at: string } | null;
  closurePending: boolean;
  disputed: boolean;
}

type Tab = 'verify' | 'closures' | 'disputes' | 'all';
const RESULT: Record<string, string> = { exists: 'El punto existe', not_exists: 'El punto no existe', already_cleared: 'Ya fue despejado' };

/**
 * Addendum v4.2, sección 8: el Contralor Comunitario verifica en campo, valida o rechaza cierres y atiende disputas
 * en su sector. Ve el caso, nunca a la persona que reportó. Sin señal, la acción queda guardada y se envía después.
 */
export default function Contralor() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['contralor', 'cases'], queryFn: () => api.get<Case[]>('/contralor/cases') });
  const [tab, setTab] = useTab<Tab>('verify');
  const [act, setAct] = useState<{ c: Case; kind: 'verify' | 'closure' } | null>(null);
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <Alert tone="bad">{errorMessage(q.error)}</Alert>;
  const lists: Record<Tab, Case[]> = {
    verify: q.data.filter((c) => !c.verified && c.status.key === 'received'),
    closures: q.data.filter((c) => c.closurePending),
    disputes: q.data.filter((c) => c.disputed),
    all: q.data,
  };
  const list = lists[tab];
  return (
    <div>
      <PageTitle title="Verificación en campo" subtitle="Casos de tu sector. Ves el caso, no a la persona que reportó. No puedes verificar tus propios reportes." actions={<Link className="btn-secondary btn-sm" to="/avisar">Reportar Escombro</Link>} />
      <Tabs value={tab} onChange={setTab} items={[{ value: 'verify', label: 'Por verificar', count: lists.verify.length }, { value: 'closures', label: 'Cierres', count: lists.closures.length }, { value: 'disputes', label: 'Disputas', count: lists.disputes.length }, { value: 'all', label: 'Todos', count: lists.all.length }]} />
      <div className="mt-3 grid md:grid-cols-2 gap-3">
        {list.map((c) => (
          <Card key={c.id} title={c.code} subtitle={`${c.sector} · ${fmtRelative(c.createdAt)}`} actions={<Badge tone={c.disputed ? 'bad' : 'info'} icon={false}>{c.status.label}</Badge>}>
            {(c.street || c.reference) && <p className="text-sm">{[c.street, c.reference].filter(Boolean).join(' · ')}</p>}
            {c.location && <p className="text-xs text-muted"><a className="underline" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${c.location.lat}&mlon=${c.location.lng}#map=18/${c.location.lat}/${c.location.lng}`}>Ver el punto en el mapa</a></p>}
            {c.viaMonitor && <Badge tone="neutral" icon={false}>vía contralor</Badge>}
            {c.verified && <p className="text-sm mt-1">Verificado: {RESULT[c.verified.result] ?? c.verified.result}</p>}
            {c.status.reason && <p className="text-xs text-muted mt-1">{c.status.reason}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              {c.own ? <span className="text-xs text-muted">Reporte tuyo: lo verifica otro Contralor del sector.</span> : (
                <>
                  {!c.verified && <Button size="sm" onClick={() => setAct({ c, kind: 'verify' })}>Verificar en campo</Button>}
                  {(c.closurePending || c.disputed) && <Button size="sm" variant="secondary" onClick={() => setAct({ c, kind: 'closure' })}>{c.disputed ? 'Revisar disputa' : 'Revisar cierre'}</Button>}
                </>
              )}
            </div>
          </Card>
        ))}
      </div>
      {list.length === 0 && <EmptyState title="No hay casos aquí" />}
      {act && <ActionModal c={act.c} kind={act.kind} onClose={() => setAct(null)} onDone={() => { setAct(null); qc.invalidateQueries({ queryKey: ['contralor'] }); }} />}
    </div>
  );
}

function ActionModal({ c, kind, onClose, onDone }: { c: Case; kind: 'verify' | 'closure'; onClose: () => void; onDone: () => void }) {
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [result, setResult] = useState<'exists' | 'not_exists' | 'already_cleared'>('exists');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const p = photos[0];
  const send = async (ok?: boolean) => {
    if (!p) return;
    setBusy(true);
    try {
      const photo = { dataUrl: p.preview, kind: kind === 'verify' ? 'on_site' : 'after', location: p.location };
      const r = kind === 'verify'
        ? await sendOrQueue(`/origins/${c.code}/on-site`, { result }, `Verificación de ${c.code}`, photo)
        : await sendOrQueue(`/contralor/cases/${c.id}/closure`, { ok: !!ok, note: note.trim() || null }, `Revisión del cierre de ${c.code}`, photo);
      if (r) toast.success('Registrado.');
      onDone();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={`${kind === 'verify' ? 'Verificar' : c.disputed ? 'Disputa' : 'Cierre'} · ${c.code}`}>
      <PhotoCapture kind="origin" label="Foto actual del punto (obligatoria)" photos={photos} onChange={setPhotos} max={1} deferUpload />
      {kind === 'verify' ? (
        <>
          <fieldset className="mt-3">
            <legend className="label">¿Qué encontraste?</legend>
            {Object.entries(RESULT).map(([k, v]) => <label key={k} className="flex items-center gap-2 text-sm py-1"><input type="radio" name="res" checked={result === k} onChange={() => setResult(k as typeof result)} /> {v}</label>)}
          </fieldset>
          <Button className="mt-3" disabled={busy || !p} onClick={() => send()}>Guardar verificación</Button>
        </>
      ) : (
        <>
          <Textarea className="mt-3" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Lo que viste (opcional)" aria-label="Nota" />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button disabled={busy || !p} onClick={() => send(true)}>El punto quedó despejado</Button>
            <Button variant="secondary" disabled={busy || !p} onClick={() => send(false)}>No quedó despejado</Button>
          </div>
        </>
      )}
    </Modal>
  );
}
