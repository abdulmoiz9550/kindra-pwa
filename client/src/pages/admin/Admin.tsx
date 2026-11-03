import { NavLink, Route, Routes, Navigate } from 'react-router-dom';
import Overview from './Overview';
import Entities from './Entities';
import Users from './Users';
import Sectors from './Sectors';
import Centers from './Centers';
import Vehicles from './Vehicles';
import Config from './Config';
import Transitions from './Transitions';
import Texts from './Texts';
import Lessons from './Lessons';
import Photos from './Photos';
import Prereg from './Prereg';
import Demo from './Demo';

const NAV = [
  { to: '', label: 'Resumen' },
  { to: 'entidades', label: 'Entidades' },
  { to: 'usuarios', label: 'Usuarios' },
  { to: 'sectores', label: 'Sectores' },
  { to: 'centros', label: 'Centros' },
  { to: 'vehiculos', label: 'Vehículos' },
  { to: 'configuracion', label: 'Configuración' },
  { to: 'estados', label: 'Estados' },
  { to: 'textos', label: 'Textos de AURA' },
  { to: 'lecciones', label: 'Lecciones' },
  { to: 'fotos', label: 'Moderación de fotos' },
  { to: 'preregistro', label: 'Pre-registro' },
  { to: 'demo', label: 'Datos de demostración' },
];

/** 17. Panel de administración: todo lo configurable se edita aquí, sin tocar código. Nunca edita ni borra eventos. */
export default function Admin() {
  return (
    <div className="md:grid md:grid-cols-[220px_1fr] md:gap-6">
      <nav aria-label="Secciones de administración" className="mb-4 md:mb-0">
        <ul className="flex md:flex-col gap-1 overflow-x-auto pb-2 md:pb-0 -mx-1 px-1">
          {NAV.map((n) => (
            <li key={n.to} className="shrink-0">
              <NavLink to={n.to} end={n.to === ''} className={({ isActive }) => `block rounded-lg px-3 py-2 text-sm whitespace-nowrap ${isActive ? 'bg-primary text-primary-ink font-semibold' : 'hover:bg-surface-2'}`}>
                {n.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0">
        <Routes>
          <Route index element={<Overview />} />
          <Route path="entidades" element={<Entities />} />
          <Route path="usuarios" element={<Users />} />
          <Route path="sectores" element={<Sectors />} />
          <Route path="centros" element={<Centers />} />
          <Route path="vehiculos" element={<Vehicles />} />
          <Route path="configuracion" element={<Config />} />
          <Route path="estados" element={<Transitions />} />
          <Route path="textos" element={<Texts />} />
          <Route path="lecciones" element={<Lessons />} />
          <Route path="fotos" element={<Photos />} />
          <Route path="preregistro" element={<Prereg />} />
          <Route path="demo" element={<Demo />} />
          <Route path="*" element={<Navigate to="" replace />} />
        </Routes>
      </div>
    </div>
  );
}
