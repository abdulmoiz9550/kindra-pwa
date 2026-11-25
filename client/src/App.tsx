import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { REPORT_ROLES } from '@kindra/shared';
import { Layout } from './components/Layout';
import { useFeature } from './lib/config';
import { RequireAccount, RequireRole } from './components/RequireRole';
import { Spinner } from './components/ui';
import './lib/offlineActions';

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
const Rewards = lazy(() => import('./pages/Rewards'));
const GatePage = lazy(() => import('./pages/GatePage'));
const TrackingLive = lazy(() => import('./pages/panels/TrackingLive'));
const TripDetail = lazy(() => import('./pages/panels/TripDetail'));
const Escort = lazy(() => import('./pages/panels/Escort'));
const Checkpoint = lazy(() => import('./pages/panels/Checkpoint'));
const Reports = lazy(() => import('./pages/panels/Reports'));
const InfoRequestPage = lazy(() => import('./pages/public/InfoRequest'));
const Driver = lazy(() => import('./pages/Driver'));
const Household = lazy(() => import('./pages/Service').then((m) => ({ default: m.Household })));
const BusinessArea = lazy(() => import('./pages/Service').then((m) => ({ default: m.BusinessArea })));
const GroupArea = lazy(() => import('./pages/GroupArea'));
const GroupsDirectory = lazy(() => import('./pages/GroupArea').then((m) => ({ default: m.GroupsDirectory })));
const Processing = lazy(() => import('./pages/panels/Processing'));
const RequestsPanel = lazy(() => import('./pages/panels/RequestsPanel'));
const GroupReview = lazy(() => import('./pages/panels/GroupReview'));
const NewsPage = lazy(() => import('./components/News'));
const HelpPage = lazy(() => import('./components/News').then((m) => ({ default: m.HelpPage })));
const Challenges = lazy(() => import('./pages/Challenges'));
const NotFound = lazy(() => import('./pages/NotFound'));

export default function App() {
  const groupsOn = useFeature('community_groups');
  const ecoOn = useFeature('eco_challenges');
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
          <Route path="/recompensas" element={<Rewards />} />
          <Route path="/puerta/:code" element={<GatePage />} />
          <Route path="/panel/seguimiento" element={<RequireRole roles={['admin', 'coordinator', 'supervisor', 'center']}><TrackingLive /></RequireRole>} />
          <Route path="/panel/viaje/:key" element={<RequireRole roles={['admin', 'coordinator', 'supervisor', 'center', 'removal', 'driver', 'destination']}><TripDetail /></RequireRole>} />
          <Route path="/conductor/*" element={<RequireRole roles={['driver']}><Driver /></RequireRole>} />
          <Route path="/hogar/*" element={<RequireRole roles={['householder']}><Household /></RequireRole>} />
          <Route path="/comercio/*" element={<RequireRole roles={['business']}><BusinessArea /></RequireRole>} />
          {groupsOn && <Route path="/comunidad/*" element={<RequireRole roles={['community']}><GroupArea kind="community" /></RequireRole>} />}
          {groupsOn && <Route path="/costero/*" element={<RequireRole roles={['coastal']}><GroupArea kind="coastal" /></RequireRole>} />}
          {groupsOn && <Route path="/grupos" element={<RequireAccount><GroupsDirectory /></RequireAccount>} />}
          <Route path="/panel/procesamiento" element={<RequireRole roles={['processing']}><Processing /></RequireRole>} />
          <Route path="/panel/solicitudes" element={<RequireRole roles={['coordinator', 'entity_admin', 'removal', 'center', 'admin']}><RequestsPanel /></RequireRole>} />
          {groupsOn && <Route path="/panel/grupos" element={<RequireRole roles={['coordinator']}><GroupReview /></RequireRole>} />}
          <Route path="/panel/reportes" element={<RequireRole roles={REPORT_ROLES}><Reports /></RequireRole>} />
          <Route path="/solicitar-informacion" element={<InfoRequestPage />} />
          <Route path="/panel/escolta" element={<RequireRole roles={['removal', 'center', 'driver']}><Escort /></RequireRole>} />
          <Route path="/panel/control" element={<RequireRole roles={['center', 'destination', 'coordinator']}><Checkpoint /></RequireRole>} />
          <Route path="/notificaciones" element={<Notifications />} />
          {ecoOn && <Route path="/retos" element={<RequireAccount><Challenges /></RequireAccount>} />}
          <Route path="/noticias" element={<NewsPage />} />
          <Route path="/ayuda" element={<HelpPage />} />
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
