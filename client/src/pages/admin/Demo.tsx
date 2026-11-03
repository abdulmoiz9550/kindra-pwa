import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, Button, ConfirmButton, Alert } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { toast } from '../../lib/toast';
import { Section } from './shared';

interface JobsReport {
  ranAt: string;
  tripsNoArrival: number;
  originsNoTrip: number;
  batchesHeld: number;
  dispatchesUnconfirmed: number;
}

interface ResetResult {
  ok: boolean;
  ms: number;
  origins: number;
  trips: number;
  batches: number;
  works: number;
  events: number;
  users: number;
}

/** 19.5 / 17: reinicio de datos de demostración con doble confirmación; ejecución manual de escalamientos (7.13). */
export default function Demo() {
  const qc = useQueryClient();
  const [agree, setAgree] = useState(false);
  const [jobs, setJobs] = useState<JobsReport | null>(null);
  const [reset, setReset] = useState<ResetResult | null>(null);
  const [busy, setBusy] = useState(false);

  const runJobs = async () => {
    setBusy(true);
    try {
      setJobs(await api.post<JobsReport>('/admin/run-jobs'));
      qc.invalidateQueries();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const doReset = async () => {
    try {
      const r = await api.post<ResetResult>('/admin/reset-demo', { confirm: 'REINICIAR' });
      setReset(r);
      setAgree(false);
      qc.clear();
      toast.success(`Datos de demostración restaurados en ${r.ms} ms.`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Section title="Datos de demostración" subtitle="Los datos son simulados y llevan la etiqueta permanente en todas las pantallas. Aquí se ejecutan los escalamientos a demanda y se reinicia el estado inicial de la demo.">
      <div className="space-y-4">
        <Card title="Escalamientos (7.13)" subtitle="El planificador corre cada minuto. Puedes ejecutarlo ahora para ver alertas de viajes sin llegada, orígenes sin camión, lotes retenidos y despachos sin confirmar.">
          <Button variant="secondary" onClick={runJobs} disabled={busy}>
            Ejecutar escalamientos ahora
          </Button>
          {jobs && (
            <ul className="mt-3 text-sm grid grid-cols-2 gap-2">
              <li>Viajes marcados sin llegada: <strong>{jobs.tripsNoArrival}</strong></li>
              <li>Orígenes validados sin camión: <strong>{jobs.originsNoTrip}</strong></li>
              <li>Lotes retenidos sin decisión: <strong>{jobs.batchesHeld}</strong></li>
              <li>Despachos sin confirmar: <strong>{jobs.dispatchesUnconfirmed}</strong></li>
            </ul>
          )}
        </Card>

        <Card title="Reiniciar datos de demostración (19.5)" subtitle="Borra todo y vuelve a cargar la semilla: entidades, usuarios de prueba, sectores, orígenes, viajes, lotes, obras y la bitácora. Tarda menos de un minuto.">
          <Alert tone="warn" className="mb-3" title="Acción irreversible">
            Se pierde cualquier dato creado durante las pruebas. Es el único camino para vaciar la bitácora de eventos.
          </Alert>
          <label className="flex items-center gap-2 text-sm mb-3">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> Entiendo que se borrarán todos los datos actuales.
          </label>
          {agree ? (
            <ConfirmButton label="Reiniciar datos de demostración" confirmLabel="Sí, reiniciar" typed="REINICIAR" onConfirm={doReset}>
              Segunda confirmación: escribe REINICIAR para restaurar el estado inicial de la demostración.
            </ConfirmButton>
          ) : (
            <Button variant="danger" disabled>
              Reiniciar datos de demostración
            </Button>
          )}
          {reset && (
            <p className="mt-3 text-sm text-ok">
              Listo en {reset.ms} ms: {reset.origins} orígenes, {reset.trips} viajes, {reset.batches} lotes, {reset.works} obras, {reset.users} usuarios y {reset.events} eventos.
            </p>
          )}
        </Card>

        <Card title="Usuarios de prueba (19.3)">
          <p className="text-sm text-ink-2">Un usuario por rol, contraseña <span className="font-mono">demo1234</span>: ciudadano, contralora, vecina, coordinador, retiro, centro (Norte), centro-sur, evaluador, supervisor, obras, admin. El selector de la cabecera cambia de rol en un toque mientras el modo demostración esté activo.</p>
        </Card>
      </div>
    </Section>
  );
}
