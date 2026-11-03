import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import type { Role } from '@kindra/shared';
import { ROLE_LABELS } from '@kindra/shared';
import { useAuth } from '../lib/auth';
import { Alert, Button } from './ui';

/** La interfaz solo muestra lo permitido; la validación real ocurre en el servidor (3.3, 3.5). */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const user = useAuth((s) => s.user);
  const location = useLocation();
  if (!user) return <Navigate to={`/ingresar?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (!roles.includes(user.activeRole)) {
    return (
      <div className="max-w-lg mx-auto">
        <Alert tone="warn" title="Este panel es para otro rol">
          Estás usando el rol {ROLE_LABELS[user.activeRole]}. Este panel requiere: {roles.map((r) => ROLE_LABELS[r]).join(' o ')}.
          {user.roles.some((r) => roles.includes(r)) && ' Puedes cambiar de rol desde el selector de la parte superior.'}
        </Alert>
        <div className="mt-3">
          <Link to="/">
            <Button variant="secondary">Volver al inicio</Button>
          </Link>
        </div>
      </div>
    );
  }
  if (user.verificationStatus !== 'verified') {
    return (
      <div className="max-w-lg mx-auto">
        <Alert tone="info" title="Falta la verificación de identidad">
          Para usar este rol necesitas completar la verificación por selfie.
        </Alert>
        <div className="mt-3">
          <Link to="/verificacion">
            <Button>Ir a la verificación</Button>
          </Link>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
