import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, Globe, LogOut, Menu, Settings, X } from 'lucide-react';
import { useAuth, homeFor } from '../lib/auth';
import { useT, LANGS } from '../lib/i18n';
import { api, getToken } from '../lib/api';
import { Logo, useToast } from './ui';

function useLiveNotifications() {
  const { user, setUnread } = useAuth(); const toast = useToast();
  useEffect(() => {
    if (!user) return undefined;
    const es = new EventSource(`/api/notifications/stream?access_token=${encodeURIComponent(getToken())}`);
    es.addEventListener('hello', (e) => setUnread(JSON.parse(e.data).unread));
    es.addEventListener('notification', (e) => { const n = JSON.parse(e.data); setUnread((u) => u + 1); toast(n.title); });
    return () => es.close();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
}

function LangSelect() {
  const { lang, setLang } = useT(); const { user } = useAuth();
  return (
    <label className="relative inline-flex items-center gap-1 text-sm text-ink-soft">
      <Globe className="h-4 w-4" aria-hidden /><span className="sr-only">Language</span>
      <select value={lang} onChange={(e) => { setLang(e.target.value); if (user) api('/auth/language', { method: 'PUT', body: { language: e.target.value } }).catch(() => {}); }} className="cursor-pointer appearance-none bg-transparent pr-1 font-medium focus:outline-none">
        {LANGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    </label>
  );
}

function UserMenu() {
  const { user, signOut, unread } = useAuth(); const { t } = useT(); const nav = useNavigate(); const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-1">
      <Link to="/notifications" className="btn-ghost relative p-2" aria-label={`${t('notifications')}${unread ? `, ${unread} unread` : ''}`}>
        <Bell className="h-5 w-5" />{unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-marigold-500 px-1 text-[10px] font-bold text-ink">{unread > 9 ? '9+' : unread}</span>}
      </Link>
      <div className="relative">
        <button className="btn-ghost gap-1.5 px-2" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-600 text-sm font-bold text-white">{user.name[0]}</span>
          <span className="hidden max-w-[120px] truncate md:inline">{user.name.split(' ')[0]}</span><ChevronDown className="h-4 w-4" />
        </button>
        {open && (
          <div className="absolute right-0 top-12 z-40 w-52 rounded-xl border border-line bg-white p-1.5 shadow-lift" role="menu" onMouseLeave={() => setOpen(false)}>
            <Link role="menuitem" to={homeFor(user.role)} className="block rounded-lg px-3 py-2 text-sm hover:bg-mist" onClick={() => setOpen(false)}>{t('dashboard')}</Link>
            <Link role="menuitem" to="/settings" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-mist" onClick={() => setOpen(false)}><Settings className="h-4 w-4" />{t('settings')}</Link>
            <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-600 hover:bg-orange-50" onClick={async () => { await signOut(); nav('/'); }}><LogOut className="h-4 w-4" />{t('signout')}</button>
          </div>
        )}
      </div>
    </div>
  );
}

function CookieBanner() {
  const [show, setShow] = useState(() => { try { return !localStorage.getItem('ss_consent'); } catch { return false; } });
  if (!show) return null;
  const decide = (analytics) => { try { localStorage.setItem('ss_consent', analytics ? 'all' : 'essential'); } catch { /* ignore */ } api('/auth/consent', { method: 'POST', body: { purposes: { cookies_essential: true, cookies_analytics: analytics } } }).catch(() => {}); setShow(false); };
  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-3xl rounded-2xl border border-line bg-white p-4 shadow-lift sm:flex sm:items-center sm:gap-4" role="region" aria-label="Privacy notice">
      <p className="text-sm text-ink-soft">We use essential storage to keep you signed in, and optional analytics to improve job matching. Your data is handled under the <Link to="/help?category=Privacy" className="font-medium text-teal-700 underline">Digital Personal Data Protection Act, 2023</Link>.</p>
      <div className="mt-3 flex shrink-0 gap-2 sm:mt-0"><button className="btn-outline btn-sm" onClick={() => decide(false)}>Essential only</button><button className="btn-primary btn-sm" onClick={() => decide(true)}>Accept all</button></div>
    </div>
  );
}

export default function Layout() {
  const { user } = useAuth(); const { t } = useT(); const [mobile, setMobile] = useState(false); const loc = useLocation();
  useLiveNotifications();
  useEffect(() => { setMobile(false); window.scrollTo(0, 0); }, [loc.pathname]);
  const links = [['/jobs', t('find')], ['/employers', t('employers')], ['/news', t('news')], ['/help', t('help')]];
  return (
    <div className="flex min-h-screen flex-col overflow-x-clip">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">{t('skip')}</a>
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <Link to="/" aria-label="SkillSetu home"><Logo /></Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {links.map(([to, l]) => <NavLink key={to} to={to} className={({ isActive }) => `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'text-teal-700' : 'text-ink-soft hover:text-ink'}`}>{l}</NavLink>)}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden sm:block"><LangSelect /></div>
            {user ? <UserMenu /> : (<><Link to="/login" className="btn-ghost hidden sm:inline-flex">{t('signin')}</Link><Link to="/register" className="btn-primary">{t('join')}</Link></>)}
            <button className="btn-ghost p-2 md:hidden" onClick={() => setMobile((m) => !m)} aria-label="Menu" aria-expanded={mobile}>{mobile ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
          </div>
        </div>
        {mobile && (
          <nav className="border-t border-line bg-white px-4 py-3 md:hidden" aria-label="Mobile">
            {links.map(([to, l]) => <Link key={to} to={to} className="block rounded-lg px-3 py-2.5 font-medium hover:bg-mist">{l}</Link>)}
            {user ? <Link to={homeFor(user.role)} className="block rounded-lg px-3 py-2.5 font-medium hover:bg-mist">{t('dashboard')}</Link> : <Link to="/login" className="block rounded-lg px-3 py-2.5 font-medium hover:bg-mist">{t('signin')}</Link>}
            <div className="px-3 py-2"><LangSelect /></div>
          </nav>
        )}
      </header>
      <main id="main" className="flex-1"><Outlet /></main>
      <footer className="mt-16 border-t border-line bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-4">
          <div className="md:col-span-2"><Logo /><p className="mt-3 max-w-sm text-sm text-ink-soft">An AI-driven job matching platform under the Youth Economic Empowerment in India (YEI) programme. Free for job seekers.</p></div>
          <div className="text-sm"><p className="mb-2 font-semibold">Platform</p><ul className="space-y-1.5 text-ink-soft"><li><Link to="/jobs" className="hover:text-ink">Search jobs</Link></li><li><Link to="/register?role=employer" className="hover:text-ink">Post a job</Link></li><li><a href="/api/docs" className="hover:text-ink">Partner API</a></li></ul></div>
          <div className="text-sm"><p className="mb-2 font-semibold">Support</p><ul className="space-y-1.5 text-ink-soft"><li><Link to="/help" className="hover:text-ink">Help centre</Link></li><li><Link to="/help?category=Labour%20laws" className="hover:text-ink">Labour laws</Link></li><li><Link to="/help?category=Privacy" className="hover:text-ink">Privacy &amp; DPDP</Link></li></ul></div>
        </div>
        <p className="border-t border-line py-4 text-center text-xs text-ink-faint">© {new Date().getFullYear()} SkillSetu · Built for the Software Engineering Lab · WCAG 2.1 AA</p>
      </footer>
      <CookieBanner />
    </div>
  );
}

// Sidebar shell for role dashboards
export function Shell({ nav, title, children }) {
  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[220px_1fr] lg:py-8">
      <aside aria-label={`${title} navigation`} className="min-w-0">
        <p className="mb-2 hidden px-3 text-xs font-semibold text-ink-faint lg:block">{title}</p>
        <nav className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
          {nav.map(([to, label, Icon, end]) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium ${isActive ? 'bg-white text-teal-700 shadow-sm ring-1 ring-line' : 'text-ink-soft hover:bg-white/70 hover:text-ink'}`}>
              {Icon && <Icon className="h-4 w-4" aria-hidden />}{label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <section className="min-w-0">{children}</section>
    </div>
  );
}
export const PageHead = ({ title, sub, action }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
    <div><h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>{sub && <p className="mt-1 text-ink-soft">{sub}</p>}</div>{action}
  </div>
);
