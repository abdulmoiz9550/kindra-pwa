import { Link } from 'react-router-dom';
import { useNotifications } from '../lib/notifications';
import { fmtRelative } from '../lib/format';
import { Button, EmptyState, PageTitle, Spinner } from '../components/ui';

/** 15 Notificaciones: usuario con cuenta y códigos guardados en este teléfono. */
export default function Notifications() {
  const { notifications, unread, markRead, markAll, isLoading } = useNotifications();
  return (
    <div className="max-w-lg mx-auto">
      <PageTitle
        title="Notificaciones"
        subtitle="Incluye los avisos de tu cuenta y los de los códigos de reporte guardados en este teléfono."
        actions={
          unread > 0 ? (
            <Button size="sm" variant="secondary" onClick={markAll}>
              Marcar todo como leído
            </Button>
          ) : undefined
        }
      />
      {isLoading && <Spinner />}
      {!isLoading && notifications.length === 0 && <EmptyState title="Sin notificaciones por ahora" text="Aquí verás los avisos sobre tus reportes: validación, retiro, cierre y preguntas pendientes." />}
      <ul className="space-y-2">
        {notifications.map((n) => (
          <li key={n.id}>
            <Link
              to={n.link || '/mis-reportes'}
              onClick={() => {
                if (!n.readAt) markRead(n.id);
              }}
              className={`card block ${!n.readAt ? 'border-primary bg-primary-soft/40' : ''}`}
              aria-label={`${!n.readAt ? 'Sin leer. ' : ''}${n.text}`}
            >
              <p className={`text-sm ${!n.readAt ? 'font-semibold' : ''}`}>{n.text}</p>
              <p className="text-xs text-muted mt-1">
                {n.originCode ? `${n.originCode} · ` : ''}
                {n.sectorName ? `${n.sectorName} · ` : ''}
                {fmtRelative(n.createdAt)}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
