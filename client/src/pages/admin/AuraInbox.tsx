import { useState } from 'react';
import type { AppConfig } from '@kindra/shared';
import { fmtDateTime } from '../../lib/format';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Spinner, Textarea } from '../../components/ui';
import { Section, useAdminAction, useAdminGet, useAdminList } from './shared';

interface Ticket { id: string; profileId: string | null; userId: string | null; channel: 'whatsapp' | 'pwa'; name: string | null; phone: string | null; blocked: boolean; reason: string; history: { role: string; text: string; at: string }[]; status: 'open' | 'closed'; createdAt: string }

const WA: Record<string, { label: string; tone: 'ok' | 'bad' | 'warn' }> = {
  ok: { label: 'WhatsApp conectado', tone: 'ok' },
  down: { label: 'WhatsApp con fallas: el portal indica la PWA como alternativa', tone: 'bad' },
  not_configured: { label: 'WhatsApp no configurado: faltan las claves de Meta en el servidor', tone: 'warn' },
};

/** Addendum v4.2, 10.4 (flujo 5) y 10.6: conversaciones pasadas a una persona, respuesta y bloqueo de números. */
export default function AuraInbox() {
  const q = useAdminList<Ticket>('support-tickets');
  const st = useAdminGet<{ whatsapp: string; profiles: number; openTickets: number }>('aura-status');
  const { post, busy } = useAdminAction();
  const [reply, setReply] = useState<Record<string, string>>({});
  if (q.isLoading) return <Spinner />;
  return (
    <>
      <Section title="Conversaciones de AURA" subtitle="Cuando alguien pide hablar con una persona, la conversación llega aquí con su historial para que no tenga que repetir nada.">
        {st.data && <Alert tone={WA[st.data.whatsapp]?.tone === 'ok' ? 'ok' : WA[st.data.whatsapp]?.tone === 'bad' ? 'bad' : 'warn'} className="mb-3">{WA[st.data.whatsapp]?.label} · {st.data.profiles} personas recordadas · {st.data.openTickets} conversaciones abiertas</Alert>}
        {!q.data?.length ? <EmptyState title="No hay conversaciones" /> : (
          <div className="space-y-3">
            {q.data.map((t) => (
              <Card key={t.id} title={`${t.name || 'Sin nombre'} · ${t.channel === 'whatsapp' ? 'WhatsApp' : 'PWA'}`} subtitle={`${fmtDateTime(t.createdAt)} · ${t.reason}${t.phone ? ` · ${t.phone}` : ''}`} actions={<Badge tone={t.status === 'open' ? 'warn' : 'neutral'}>{t.status === 'open' ? 'Abierta' : 'Cerrada'}</Badge>}>
                <ul className="text-sm space-y-1 max-h-64 overflow-y-auto mb-2">
                  {t.history.map((h, i) => <li key={i} className={h.role === 'user' ? '' : 'text-muted'}><strong>{h.role === 'user' ? 'Persona' : h.role === 'staff' ? 'Equipo' : 'AURA'}:</strong> {h.text}</li>)}
                </ul>
                {t.status === 'open' && (
                  <>
                    <Textarea value={reply[t.id] ?? ''} maxLength={1000} onChange={(e) => setReply({ ...reply, [t.id]: e.target.value })} placeholder="Respuesta del equipo" aria-label="Respuesta" />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" disabled={busy || (reply[t.id] ?? '').trim().length < 2} onClick={async () => { if (await post(`support-tickets/${t.id}/reply`, { text: reply[t.id].trim() }, 'Respuesta enviada.')) setReply({ ...reply, [t.id]: '' }); }}>Responder</Button>
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => post(`support-tickets/${t.id}/close`, {}, 'Conversación cerrada.')}>Cerrar</Button>
                      {t.profileId && <Button size="sm" variant="ghost" disabled={busy} onClick={() => post(`aura-profiles/${t.profileId}/block`, { blocked: !t.blocked }, t.blocked ? 'Número desbloqueado.' : 'Número bloqueado.')}>{t.blocked ? 'Desbloquear número' : 'Bloquear número'}</Button>}
                    </div>
                  </>
                )}
              </Card>
            ))}
          </div>
        )}
      </Section>
      <ModuleSettings />
    </>
  );
}

const RAICES_FIELDS: [string, string][] = [
  ['reportValidated', 'Ciudadano: reporte validado'],
  ['closureConfirmed', 'Ciudadano: cierre confirmado'],
  ['reportFinalDestination', 'Ciudadano: su reporte llega a Destino Final'],
  ['disputeValid', 'Ciudadano: disputa con razón'],
  ['fieldVerification', 'Contralor: verificación en campo'],
  ['disputeResolved', 'Contralor: disputa resuelta'],
  ['accreditation', 'Contralor: acreditación aprobada'],
  ['tripNoDiscrepancy', 'Ente de Retiro: viaje recibido sin diferencias'],
  ['receptionWithin24h', 'Centro de Disposición: recepción en 24 h'],
  ['massBalanceClosed', 'Centro de Disposición: balance de masa cerrado'],
  ['testValidated', 'Evaluador Técnico: ensayo validado'],
  ['destinationReceipt', 'Destino Final: recepción registrada'],
  ['lessonCompleted', 'Todos: lección completada'],
  ['courseCompleted', 'Todos: curso completado'],
  ['weeklyStreak', 'Todos: semana activa consecutiva'],
];

/** Ajustes del Módulo 1 que el addendum deja configurables al Administrador Principal. */
function ModuleSettings() {
  const cfg = useAdminGet<AppConfig>('config');
  const { put, busy } = useAdminAction();
  const [d, setD] = useState<Partial<AppConfig> | null>(null);
  if (cfg.isLoading || !cfg.data) return <Spinner />;
  const c = { ...cfg.data, ...(d ?? {}) } as AppConfig;
  const set = (p: Partial<AppConfig>) => setD({ ...(d ?? {}), ...p });
  const r = c.raices;
  return (
    <Section title="Ajustes del Módulo 1" subtitle="AURA, cierres, datos abiertos y Raíces. Todo queda registrado en la bitácora.">
      <Card>
        <div className="grid sm:grid-cols-2 gap-x-3">
          <Field label="Número oficial de emergencias (AURA lo da ante riesgo inmediato)"><Input value={c.emergencyNumber ?? ''} maxLength={40} onChange={(e) => set({ emergencyNumber: e.target.value })} placeholder="Pendiente" /></Field>
          <Field label="Horario de respuesta del equipo (fuera de horario)"><Input value={c.supportHours ?? ''} maxLength={120} onChange={(e) => set({ supportHours: e.target.value })} placeholder="Ej. de lunes a viernes, de 8:00 a 17:00" /></Field>
          <Field label="Días para confirmar o disputar un cierre"><Input type="number" min={1} max={60} value={c.thresholds.closureConfirmDays ?? 7} onChange={(e) => set({ thresholds: { ...c.thresholds, closureConfirmDays: Number(e.target.value) } })} /></Field>
          <Field label="Reportes por número y día (control de abuso)"><Input type="number" min={1} max={50} value={c.thresholds.dailyReportLimit} onChange={(e) => set({ thresholds: { ...c.thresholds, dailyReportLimit: Number(e.target.value) } })} /></Field>
          <Field label="Minutos sin actividad para cerrar la sesión"><Input type="number" min={5} max={720} value={c.sessionIdleMinutes ?? 30} onChange={(e) => set({ sessionIdleMinutes: Number(e.target.value) })} /></Field>
          <Field label="Días que se conserva el rastreo de vehículos (nivel 2)" hint="Vacío: no se borra nada hasta que se apruebe el plazo."><Input type="number" min={1} max={3650} value={c.vehicleLocationRetentionDays ?? ''} onChange={(e) => set({ vehicleLocationRetentionDays: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
          <Field label="Licencia de los datos abiertos"><Input value={c.openDataLicense ?? ''} maxLength={200} onChange={(e) => set({ openDataLicense: e.target.value })} placeholder="Pendiente de definición" /></Field>
        </div>
        <h3 className="font-semibold mt-3 mb-1">Raíces por hecho validado</h3>
        <div className="grid sm:grid-cols-3 gap-x-3">
          {RAICES_FIELDS.map(([k, label]) => <Field key={k} label={label}><Input type="number" min={0} max={1000} value={(r.values as unknown as Record<string, number>)[k]} onChange={(e) => set({ raices: { ...r, values: { ...r.values, [k]: Number(e.target.value) } } })} /></Field>)}
          <Field label="Tope diario: reportes validados que suman"><Input type="number" min={1} max={50} value={r.dailyCaps.reportValidated ?? 3} onChange={(e) => set({ raices: { ...r, dailyCaps: { ...r.dailyCaps, reportValidated: Number(e.target.value) } } })} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm my-2"><input type="checkbox" checked={r.catalogApproved} onChange={(e) => set({ raices: { ...r, catalogApproved: e.target.checked } })} /> Catálogo de premios aprobado (si no, Reward muestra «Próximamente»)</label>
        <Button disabled={busy || !d} onClick={async () => { if (await put('config', d, 'Ajustes guardados.')) setD(null); }}>Guardar</Button>
      </Card>
    </Section>
  );
}
