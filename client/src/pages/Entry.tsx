import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, BarChart3, MessageCircle, Search, LayoutDashboard } from 'lucide-react';
import { ROLE_HOME, ROLE_LABELS } from '@kindra/shared';
import { usePublicConfig } from '../lib/config';
import { useAuth } from '../lib/auth';
import { Button, Card, Select } from '../components/ui';
import { EntityBadge, KindraLine, KINDRA_ICON } from '../components/Brand';

/** 16.1 Pantalla de entrada: una acción clara, sin pedir datos personales. */
export default function Entry() {
  const { data: cfg } = usePublicConfig();
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const [sector, setSector] = useState('');
  const institutional = user && user.activeRole !== 'citizen' && user.activeRole !== 'monitor';

  return (
    <div className="max-w-lg mx-auto">
      <section className="hero mb-5">
        <div className="flex items-center gap-3">
          <img src={KINDRA_ICON} alt="Kindra" className="h-14 w-14 rounded-2xl shadow-lg shrink-0" />
          <div className="min-w-0">
            <p className="eyebrow text-white/70">Retiro de escombros</p>
            <h1 className="text-2xl font-bold leading-tight !text-white">{cfg?.branding.entityName || 'Ente Coordinador'}</h1>
          </div>
        </div>
        <p className="mt-4 text-[15px] leading-relaxed text-white/90 max-w-prose">{cfg?.branding.tagline || 'Trazabilidad del retiro de escombros: lo que se reporta se sigue hasta convertirse en otra obra pública.'}</p>
        <div className="mt-4 flex items-center gap-2">
          <EntityBadge size={26} className="!rounded-md" />
          <KindraLine size={16} tone="light" />
        </div>
      </section>

      {institutional && (
        <Card className="mb-4 bg-primary-soft border-primary/30">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Estás como {ROLE_LABELS[user.activeRole]}</p>
              <p className="text-xs text-muted">Tu trabajo pendiente está en tu panel.</p>
            </div>
            <Link to={ROLE_HOME[user.activeRole]}>
              <Button size="sm">
                <LayoutDashboard size={16} /> Ir a mi panel
              </Button>
            </Link>
          </div>
        </Card>
      )}

      <div className="space-y-3">
        <Link to="/avisar" className="btn-primary w-full text-lg !py-4">
          <AlertTriangle size={22} /> Avisar de un escombro
        </Link>
        <Card>
          <div className="flex flex-col gap-2">
            <label className="label" htmlFor="entry-sector">
              Ver cómo va mi sector
            </label>
            <div className="flex gap-2">
              <Select id="entry-sector" value={sector} onChange={(e) => setSector(e.target.value)}>
                <option value="">Todos los sectores</option>
                {cfg?.sectors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              <Button variant="secondary" onClick={() => navigate(sector ? `/tablero?sector=${sector}` : '/tablero')} aria-label="Ver cómo va mi sector">
                <BarChart3 size={18} /> Ver
              </Button>
            </div>
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-3">
          <Link to="/consultar" className="btn-secondary flex-col !py-4 text-sm">
            <Search size={20} /> Consultar mi reporte
          </Link>
          <Link to="/aura" className="btn-secondary flex-col !py-4 text-sm">
            <MessageCircle size={20} /> Hablar con AURA
          </Link>
        </div>
      </div>

      <p className="mt-6 text-xs text-muted text-center">
        Para avisar no hace falta cuenta ni datos personales. Si quieres sumar puntos y seguir tus reportes, puedes <Link to="/registro" className="underline">crear una cuenta</Link>.
      </p>
    </div>
  );
}
