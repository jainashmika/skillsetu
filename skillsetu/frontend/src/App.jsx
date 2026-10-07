import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { BarChart3, Bell, Bookmark, Briefcase, Building2, Cable, ClipboardList, FileText, Gauge, LayoutDashboard, Newspaper, Settings, ShieldCheck, SlidersHorizontal, User, Users } from 'lucide-react';
import Layout, { Shell } from './components/Layout';
import { Spinner } from './components/ui';
import { useAuth } from './lib/auth';
import { useT } from './lib/i18n';
import Home from './pages/Home';
import Jobs from './pages/Jobs';
import JobDetail from './pages/JobDetail';
import { Login, Register } from './pages/Auth';
import Help from './pages/Help';
import { NewsList, NewsArticle } from './pages/News';
import { CompanyPage, PublicProfile, Employers } from './pages/Public';
import Notifications from './pages/Notifications';
import AccountSettings from './pages/AccountSettings';
const SeekerDashboard = lazy(() => import('./pages/seeker/Dashboard'));
const SeekerProfile = lazy(() => import('./pages/seeker/Profile'));
const SeekerApplications = lazy(() => import('./pages/seeker/Applications'));
const SeekerSaved = lazy(() => import('./pages/seeker/Saved'));
const EmployerDashboard = lazy(() => import('./pages/employer/Dashboard'));
const EmployerCompany = lazy(() => import('./pages/employer/Company'));
const EmployerJobs = lazy(() => import('./pages/employer/Jobs'));
const EmployerJobForm = lazy(() => import('./pages/employer/JobForm'));
const EmployerJobDetail = lazy(() => import('./pages/employer/JobDetail'));
const EmployerCandidates = lazy(() => import('./pages/employer/Candidates'));
const EmployerTeam = lazy(() => import('./pages/employer/Team'));
const PortalConsole = lazy(() => import('./pages/portal/Console'));
const AdminOverview = lazy(() => import('./pages/admin/Overview'));
const AdminUsers = lazy(() => import('./pages/admin/Users'));
const AdminEmployers = lazy(() => import('./pages/admin/Employers'));
const AdminJobs = lazy(() => import('./pages/admin/Jobs'));
const AdminMatching = lazy(() => import('./pages/admin/Matching'));
const AdminContent = lazy(() => import('./pages/admin/Content'));
const AdminIntegrations = lazy(() => import('./pages/admin/Integrations'));
const AdminAnalytics = lazy(() => import('./pages/admin/Analytics'));
const AdminReports = lazy(() => import('./pages/admin/Reports'));
const AdminSecurity = lazy(() => import('./pages/admin/Security'));
const AdminSettings = lazy(() => import('./pages/admin/Settings'));

function Guard({ role }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(window.location.pathname)}`} replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return <Outlet />;
}
function SeekerShell() { const { t } = useT(); return <Shell title="Job seeker" nav={[['/seeker', t('dashboard'), LayoutDashboard, true], ['/seeker/profile', t('profile'), User], ['/seeker/applications', t('applications'), ClipboardList], ['/seeker/saved', t('savedJobs'), Bookmark], ['/notifications', t('notifications'), Bell]]}><Outlet /></Shell>; }
const EmployerShell = () => <Shell title="Employer" nav={[['/employer', 'Dashboard', LayoutDashboard, true], ['/employer/jobs', 'Jobs', Briefcase], ['/employer/candidates', 'Candidates', Users], ['/employer/company', 'Company', Building2], ['/employer/team', 'Team', User]]}><Outlet /></Shell>;
const AdminShell = () => <Shell title="Administration" nav={[['/admin', 'Overview', Gauge, true], ['/admin/users', 'Users', Users], ['/admin/employers', 'Employers', Building2], ['/admin/jobs', 'Jobs', Briefcase], ['/admin/matching', 'AI matching', SlidersHorizontal], ['/admin/analytics', 'Analytics', BarChart3], ['/admin/reports', 'Reports', FileText], ['/admin/integrations', 'Integrations', Cable], ['/admin/content', 'Content', Newspaper], ['/admin/security', 'Security & audit', ShieldCheck], ['/admin/settings', 'Settings', Settings]]}><Outlet /></Shell>;

export default function App() {
  return (
    <Suspense fallback={<Spinner />}>
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="jobs" element={<Jobs />} />
        <Route path="jobs/:id" element={<JobDetail />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="help" element={<Help />} />
        <Route path="news" element={<NewsList />} />
        <Route path="news/:slug" element={<NewsArticle />} />
        <Route path="employers" element={<Employers />} />
        <Route path="companies/:slug" element={<CompanyPage />} />
        <Route path="p/:slug" element={<PublicProfile />} />
        <Route element={<Guard />}>
          <Route path="notifications" element={<div className="mx-auto max-w-3xl px-4 py-8"><Notifications /></div>} />
          <Route path="settings" element={<div className="mx-auto max-w-3xl px-4 py-8"><AccountSettings /></div>} />
        </Route>
        <Route element={<Guard role="seeker" />}><Route path="seeker" element={<SeekerShell />}>
          <Route index element={<SeekerDashboard />} /><Route path="profile" element={<SeekerProfile />} /><Route path="applications" element={<SeekerApplications />} /><Route path="saved" element={<SeekerSaved />} />
        </Route></Route>
        <Route element={<Guard role="employer" />}><Route path="employer" element={<EmployerShell />}>
          <Route index element={<EmployerDashboard />} /><Route path="company" element={<EmployerCompany />} /><Route path="jobs" element={<EmployerJobs />} /><Route path="jobs/new" element={<EmployerJobForm />} />
          <Route path="jobs/:id" element={<EmployerJobDetail />} /><Route path="jobs/:id/edit" element={<EmployerJobForm />} /><Route path="candidates" element={<EmployerCandidates />} /><Route path="team" element={<EmployerTeam />} />
        </Route></Route>
        <Route element={<Guard role="portal" />}><Route path="portal" element={<div className="mx-auto max-w-7xl px-4 py-8 sm:px-6"><PortalConsole /></div>} /></Route>
        <Route element={<Guard role="admin" />}><Route path="admin" element={<AdminShell />}>
          <Route index element={<AdminOverview />} /><Route path="users" element={<AdminUsers />} /><Route path="employers" element={<AdminEmployers />} /><Route path="jobs" element={<AdminJobs />} />
          <Route path="matching" element={<AdminMatching />} /><Route path="analytics" element={<AdminAnalytics />} /><Route path="reports" element={<AdminReports />} /><Route path="integrations" element={<AdminIntegrations />} />
          <Route path="content" element={<AdminContent />} /><Route path="security" element={<AdminSecurity />} /><Route path="settings" element={<AdminSettings />} />
        </Route></Route>
        <Route path="*" element={<div className="mx-auto max-w-xl px-4 py-24 text-center"><h1 className="text-4xl font-semibold">Page not found</h1><p className="mt-2 text-ink-soft">The link may be old or mistyped.</p><a href="/" className="btn-primary mt-6">Go to home</a></div>} />
      </Route>
    </Routes>
    </Suspense>
  );
}
