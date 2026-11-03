import { useState } from 'react';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import type { ChainVerification } from '@kindra/shared';
import { api, errorMessage } from '../lib/api';
import { Button, Alert } from './ui';

/** 3.2 / 11.4: botón público "Verificar integridad". Nunca usa la palabra blockchain. */
export function IntegrityButton({ chainIds, recordCode, size }: { chainIds?: string[]; recordCode?: string; size?: 'sm' }) {
  const [result, setResult] = useState<{ status: 'intact' | 'altered'; chains: ChainVerification[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = recordCode ? await api.get<{ status: 'intact' | 'altered'; chains: ChainVerification[] }>(`/public/ficha/${recordCode}/verificar`) : await api.post<{ status: 'intact' | 'altered'; chains: ChainVerification[] }>('/public/verificar', { chainIds });
      setResult(r);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const broken = result?.chains.filter((c) => c.status === 'altered') || [];
  const checked = result?.chains.reduce((s, c) => s + c.checked, 0) || 0;
  return (
    <div>
      <Button variant="secondary" size={size} onClick={run} disabled={busy}>
        <ShieldCheck size={18} /> {busy ? 'Verificando…' : 'Verificar integridad'}
      </Button>
      {error && (
        <Alert tone="bad" className="mt-2">
          {error}
        </Alert>
      )}
      {result && result.status === 'intact' && (
        <Alert tone="ok" className="mt-2" title="Registro intacto">
          Se recalculó el sello de {checked} evento{checked === 1 ? '' : 's'} en {result.chains.length} cadena{result.chains.length === 1 ? '' : 's'} y todos coinciden. Nadie alteró este historial.
        </Alert>
      )}
      {result && result.status === 'altered' && (
        <Alert tone="bad" className="mt-2" title="Registro alterado">
          <div className="flex items-start gap-2">
            <ShieldAlert size={16} className="mt-0.5" />
            <div>
              {broken.map((c) => (
                <p key={c.chainId}>
                  Cadena {c.chainId}: se rompe en el evento {c.brokenAt?.seq} ({c.brokenAt?.type}). {c.brokenAt?.reason}
                </p>
              ))}
            </div>
          </div>
        </Alert>
      )}
    </div>
  );
}
