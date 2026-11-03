import { useEffect, useState } from 'react';
import type { AppConfig } from '@kindra/shared';
import { Card, Button, Field, Input, Textarea, Spinner, Provisional, Alert } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { compressImage } from '../../lib/media';
import { toast } from '../../lib/toast';
import { Section, useAdminGet, useAdminAction, numberOr } from './shared';

type Draft = Omit<AppConfig, 'transitions'>;

/** 17: umbrales, escalamientos, puntos, niveles, co-branding, canal de denuncias, listas de verificación. */
export default function Config() {
  const q = useAdminGet<AppConfig>('config');
  const { put, busy } = useAdminAction();
  const [d, setD] = useState<Draft | null>(null);
  useEffect(() => {
    if (q.data && !d) {
      const { transitions: _t, ...rest } = q.data;
      setD(structuredClone(rest));
    }
  }, [q.data, d]);
  if (!d) return <Spinner />;
  const flags = d.provisionalFlags || {};
  const save = async () => {
    const r = await put<AppConfig>('config', d, 'Configuración guardada.');
    if (r) {
      const { transitions: _t, ...rest } = r;
      setD(structuredClone(rest));
    }
  };
  const uploadLogo = async (file?: File) => {
    if (!file) return;
    try {
      const dataUrl = await compressImage(file, 512, 0.9);
      const ph = await api.post<{ url: string }>('/photos', { dataUrl, kind: 'other' });
      setD({ ...d, branding: { ...d.branding, logoUrl: ph.url } });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  const num = (label: string, value: number, onChange: (n: number) => void, hint?: string) => (
    <Field label={label} hint={hint}>
      <Input type="number" value={value} onChange={(e) => onChange(numberOr(e.target.value, value))} />
    </Field>
  );
  return (
    <Section
      title="Configuración"
      subtitle="Todo lo que la especificación llama configurable. Los valores marcados como provisionales esperan los datos definitivos."
      actions={
        <Button onClick={save} disabled={busy}>
          Guardar cambios
        </Button>
      }
    >
      <div className="space-y-4">
        <Card title={<span>Co-branding {flags.branding && <Provisional />}</span>} subtitle='La línea "con tecnología Kindra" es fija y aparece en el pie, la entrada y las páginas públicas (3.7).'>
          <Field label="Nombre del ente operador" required>
            <Input value={d.branding.entityName} onChange={(e) => setD({ ...d, branding: { ...d.branding, entityName: e.target.value } })} />
          </Field>
          <Field label="Frase de la pantalla de entrada (una sola oración)">
            <Textarea value={d.branding.tagline} onChange={(e) => setD({ ...d, branding: { ...d.branding, tagline: e.target.value } })} />
          </Field>
          <Field label="Logo" hint="PNG o JPG; se comprime en el navegador.">
            <div className="flex items-center gap-3">
              {d.branding.logoUrl ? <img src={d.branding.logoUrl} alt="Logo actual" className="h-12 w-12 rounded object-contain border border-line" /> : <span className="text-xs text-muted">Logo provisional (inicial del nombre)</span>}
              <input type="file" accept="image/*" onChange={(e) => uploadLogo(e.target.files?.[0])} aria-label="Subir logo" />
              {d.branding.logoUrl && (
                <Button variant="ghost" size="sm" onClick={() => setD({ ...d, branding: { ...d.branding, logoUrl: null } })}>
                  Quitar
                </Button>
              )}
            </div>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={d.branding.provisional} onChange={(e) => setD({ ...d, branding: { ...d.branding, provisional: e.target.checked } })} /> Identidad provisional
          </label>
        </Card>

        <Card title="Modo demostración">
          <label className="flex items-center gap-2 text-sm mb-3">
            <input type="checkbox" checked={d.demoMode} onChange={(e) => setD({ ...d, demoMode: e.target.checked })} /> Activar modo demostración (etiqueta permanente y cambio rápido de rol)
          </label>
          <Field label="Etiqueta permanente de datos simulados (19.4)">
            <Input value={d.simulatedDataLabel} onChange={(e) => setD({ ...d, simulatedDataLabel: e.target.value })} />
          </Field>
          <Field label="Enlace al canal oficial de denuncias ambientales" hint="Vacío hasta recibirlo; AURA lo usa en el mensaje de fuera de alcance.">
            <Input value={d.complaintChannelUrl} onChange={(e) => setD({ ...d, complaintChannelUrl: e.target.value })} placeholder="https://…" />
          </Field>
        </Card>

        <Card title={<span>Umbrales {flags.thresholds && <Provisional />}</span>}>
          <div className="grid sm:grid-cols-2 sm:gap-3">
            {num('Periodo del lote (días)', d.batchPeriodDays, (n) => setD({ ...d, batchPeriodDays: n }), 'Semanal por defecto (5.9).')}
            {num('Distancia para duplicados (m)', d.thresholds.duplicateDistanceM, (n) => setD({ ...d, thresholds: { ...d.thresholds, duplicateDistanceM: n } }), '7.10')}
            {num('Ventana para duplicados (días)', d.thresholds.duplicateWindowDays, (n) => setD({ ...d, thresholds: { ...d.thresholds, duplicateWindowDays: n } }), '7.10')}
            {num('Diferencia de hora tolerada (minutos)', d.thresholds.timeSkewMinutes, (n) => setD({ ...d, thresholds: { ...d.thresholds, timeSkewMinutes: n } }), '3.4')}
            {num('Plazo de llegada del viaje (horas)', d.thresholds.tripArrivalDeadlineHours, (n) => setD({ ...d, thresholds: { ...d.thresholds, tripArrivalDeadlineHours: n }, escalation: { ...d.escalation, tripNoArrivalHours: n } }), '6.2')}
            {num('Límite diario de reportes por usuario', d.thresholds.dailyReportLimit, (n) => setD({ ...d, thresholds: { ...d.thresholds, dailyReportLimit: n } }), '7.11')}
          </div>
        </Card>

        <Card title="Escalamientos (7.13)">
          <div className="grid sm:grid-cols-2 sm:gap-3">
            {num('Origen validado sin viaje (días)', d.escalation.originNoTripDays, (n) => setD({ ...d, escalation: { ...d.escalation, originNoTripDays: n } }))}
            {num('Viaje sin llegada (horas)', d.escalation.tripNoArrivalHours, (n) => setD({ ...d, escalation: { ...d.escalation, tripNoArrivalHours: n }, thresholds: { ...d.thresholds, tripArrivalDeadlineHours: n } }))}
            {num('Lote retenido sin decisión (días)', d.escalation.batchHeldDays, (n) => setD({ ...d, escalation: { ...d.escalation, batchHeldDays: n } }))}
            {num('Despacho sin confirmar (días)', d.escalation.dispatchUnconfirmedDays, (n) => setD({ ...d, escalation: { ...d.escalation, dispatchUnconfirmedDays: n } }))}
          </div>
        </Card>

        <Card title={<span>Puntos y niveles {flags.points && <Provisional />}</span>} subtitle="Solo suman hechos verificados por otro actor. Reportar no da puntos (9.1).">
          <div className="grid sm:grid-cols-2 sm:gap-3">
            {num('Cierre final de un origen propio', d.points.finalClosure, (n) => setD({ ...d, points: { ...d.points, finalClosure: n } }))}
            {num('Verificación en sitio (contralor)', d.points.onSiteVerification, (n) => setD({ ...d, points: { ...d.points, onSiteVerification: n } }))}
            {num('Reporte validado por el coordinador', d.points.reportValidated, (n) => setD({ ...d, points: { ...d.points, reportValidated: n } }))}
            {num('Retiro confirmado por el ciudadano', d.points.removalConfirmed, (n) => setD({ ...d, points: { ...d.points, removalConfirmed: n } }))}
            {num('Lección completada', d.points.lessonCompleted, (n) => setD({ ...d, points: { ...d.points, lessonCompleted: n } }))}
            {num('Penalización por reporte falso o duplicado intencional', d.points.rejectionPenalty, (n) => setD({ ...d, points: { ...d.points, rejectionPenalty: n } }))}
            {num('Rechazos consecutivos para suspender', d.points.suspensionAfterRejections, (n) => setD({ ...d, points: { ...d.points, suspensionAfterRejections: n } }))}
            {num('Días de suspensión', d.points.suspensionDays, (n) => setD({ ...d, points: { ...d.points, suspensionDays: n } }))}
          </div>
          <table className="table-plain mt-2">
            <thead>
              <tr>
                <th scope="col">Nivel</th>
                <th scope="col">Nombre</th>
                <th scope="col">Umbral de puntos</th>
              </tr>
            </thead>
            <tbody>
              {d.levels.map((l, i) => (
                <tr key={l.key}>
                  <td className="text-muted">{l.key}</td>
                  <td>
                    <input className="input !min-h-[36px] !py-1" value={l.name} onChange={(e) => setD({ ...d, levels: d.levels.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} aria-label={`Nombre del nivel ${l.key}`} />
                  </td>
                  <td>
                    <input className="input !min-h-[36px] !py-1 w-28" type="number" value={l.threshold} onChange={(e) => setD({ ...d, levels: d.levels.map((x, j) => (j === i ? { ...x, threshold: numberOr(e.target.value, x.threshold) } : x)) })} aria-label={`Umbral del nivel ${l.key}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-muted mt-2">El último nivel habilita la solicitud del rol de contralor comunitario (9.3).</p>
        </Card>

        <Card title={<span>Listas de verificación del evaluador {(flags.hazardChecklist || flags.qualityChecklist) && <Provisional />}</span>} subtitle="Provisionales hasta recibir las definitivas (5.10, 5.11).">
          <ChecklistEditor title="Material peligroso" items={d.hazardChecklist} onChange={(items) => setD({ ...d, hazardChecklist: items })} />
          <ChecklistEditor title="Calidad del agregado" items={d.qualityChecklist} onChange={(items) => setD({ ...d, qualityChecklist: items })} />
        </Card>

        <Alert tone="info">La tabla de estados y transiciones se edita en la sección "Estados". Los textos de AURA, en "Textos de AURA".</Alert>
        <div className="flex justify-end">
          <Button onClick={save} disabled={busy}>
            Guardar cambios
          </Button>
        </div>
      </div>
    </Section>
  );
}

function ChecklistEditor({ title, items, onChange }: { title: string; items: { key: string; label: string; provisional: boolean }[]; onChange: (items: { key: string; label: string; provisional: boolean }[]) => void }) {
  return (
    <div className="mb-4">
      <p className="label">{title}</p>
      <ul className="space-y-2">
        {items.map((it, i) => (
          <li key={it.key} className="flex items-center gap-2">
            <span className="text-xs text-muted w-32 truncate">{it.key}</span>
            <input className="input !min-h-[36px] !py-1 flex-1" value={it.label} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} aria-label={`Texto del punto ${it.key}`} />
            <label className="text-xs inline-flex items-center gap-1">
              <input type="checkbox" checked={it.provisional} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, provisional: e.target.checked } : x)))} /> prov.
            </label>
            <Button variant="ghost" size="sm" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={`Quitar ${it.key}`}>
              Quitar
            </Button>
          </li>
        ))}
      </ul>
      <Button variant="ghost" size="sm" className="mt-2" onClick={() => onChange([...items, { key: `item_${items.length + 1}`, label: '', provisional: true }])}>
        Añadir punto
      </Button>
    </div>
  );
}
