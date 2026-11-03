import { Link } from 'react-router-dom';
import { Button, EmptyState } from '../components/ui';

export default function NotFound() {
  return (
    <div className="max-w-md mx-auto py-10">
      <EmptyState
        title="Esta página no existe"
        text="Revisa el enlace o vuelve al inicio."
        action={
          <Link to="/">
            <Button variant="secondary">Ir al inicio</Button>
          </Link>
        }
      />
    </div>
  );
}
