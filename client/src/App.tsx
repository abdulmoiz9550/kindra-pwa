import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RequireRole } from './components/RequireRole';
import { Spinner } from './components/ui';

const Entry = lazy(() => import('./pages/Entry'));
const Report = lazy(() => import('./pages/Report'));
const Aura = lazy(() => import('./pages/Aura'));
const Consult = lazy(() => import('./pages/Consult'));
const MyReports = lazy(() => import('./pages/MyReports'));
const RecordPage = lazy(() => import('./pages/Record'));
const Learn = lazy(() => import('./pages/Learn'));
const Lesson = lazy(() => import('./pages/Lesson'));
const Profile = lazy(() => import('./pages/Profile'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Settings = lazy(() => import('./pages/Settings'));
const Login = lazy(() => import('./pages/auth/Login'));
const Register = lazy(() => import('./pages/auth/Register'));
const Verification = lazy(() => import('./pages/auth/Verification'));
const Dashboard = lazy(() => import('./pages/public/Dashboard'));
const BatchPage = lazy(() => import('./pages/public/BatchPage'));
const WorkPage = lazy(() => import('./pages/public/WorkPage'));
const PublicRecord = lazy(() => import('./pages/public/PublicRecord'));
const Certificate = lazy(() => import('./pages/public/Certificate'));
const QRPoster = lazy(() => import('./pages/public/QRPoster'));
const Coordinator = lazy(() => import('./pages/panels/Coordinator'));
const Removal = lazy(() => import('./pages/panels/Removal'));
const Center = lazy(() => import('./pages/panels/Center'));
const Evaluator = lazy(() => import('./pages/panels/Evaluator'));
const Destination = lazy(() => import('./pages/panels/Destination'));
const Supervisor = lazy(() => import('./pages/panels/Supervisor'));
const Admin = lazy(() => import('./pages/admin/Admin'));
const EntityAdmin = lazy(() => import('./pages/panels/EntityAdmin'));
const KindraCard = lazy(() => import('./pages/KindraCard'));
const PublicCard = lazy(() => import('./pages/public/PublicCard'));
const NotFound = lazy(() => import('./pages/NotFound'));

export default function App() {
  return (
    <Layout>
      <Suspense fallback={<Spinner label="Cargando…" />}>
        <Routes>
          <Route path="/" element={<Entry />} />
          <Route path="/avisar" element={<Report />} />
          <Route path="/aura" element={<Aura />} />
          <Route path="/consultar" element={<Consult />} />
          <Route path="/mis-reportes" element={<MyReports />} />
          <Route path="/reporte/:code" element={<RecordPage />} />
          <Route path="/aprende" element={<Learn />} />
          <Route path="/aprende/:id" element={<Lesson />} />
          <Route path="/perfil" element={<Profile />} />
          <Route path="/tarjeta" element={<KindraCard />} />
          <Route path="/notificaciones" element={<Notifications />} />
          <Route path="/ajustes" element={<Settings />} />
          <Route path="/ingresar" element={<Login />} />
          <Route path="/registro" element={<Register />} />
          <Route path="/verificacion" element={<Verification />} />
          <Route path="/tablero" element={<Dashboard />} />
          <Route path="/publico/tablero" element={<Navigate to="/tablero" replace />} />
          <Route path="/publico/lote/:code" element={<BatchPage />} />
          <Route path="/publico/obra/:code" element={<WorkPage />} />
          <Route path="/publico/ficha/:code" element={<PublicRecord />} />
          <Route path="/publico/certificado/:code" element={<Certificate />} />
          <Route path="/publico/qr/:kind/:code" element={<QRPoster />} />
          <Route path="/publico/tarjeta/:code" element={<PublicCard />} />
          <Route path="/panel/coordinador" element={<RequireRole roles={['coordinator']}><Coordinator /></RequireRole>} />
          <Route path="/panel/retiro" element={<RequireRole roles={['removal']}><Removal /></RequireRole>} />
          <Route path="/panel/centro" element={<RequireRole roles={['center']}><Center /></RequireRole>} />
          <Route path="/panel/evaluador" element={<RequireRole roles={['evaluator']}><Evaluator /></RequireRole>} />
          <Route path="/panel/destino" element={<RequireRole roles={['destination']}><Destination /></RequireRole>} />
          <Route path="/panel/supervisor" element={<RequireRole roles={['supervisor']}><Supervisor /></RequireRole>} />
          <Route path="/panel/entidad" element={<RequireRole roles={['entity_admin']}><EntityAdmin /></RequireRole>} />
          <Route path="/admin/*" element={<RequireRole roles={['admin']}><Admin /></RequireRole>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}
