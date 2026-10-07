import { Link } from 'react-router-dom';
import { Activity, AlertTriangle, Cable, Inbox, ShieldAlert, KeyRound } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { api, ago } from '../../lib/api';
import { useAsync, Spinner, ErrorBox, Empty, Stat } from '../../components/ui';
import { PageHead } from '../../components/Layout';

const TICK = { fontSize: 12, fill: '#7A8496' };
const fmt = (n) => (n == null ? '–' : Number(n).toLocaleString('en-IN'));
const upt = (s) => { const d = Math.floor(s / 86400); const h = Math.floor((s % 86400) / 3600); const m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`; };

export function ChartCard({ title, children, className = '', h = 260 }) {
  return (
    <section className={`card p-4 sm:p-5 ${className}`} aria-label={title}>
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      <div style={{ height: h }}>{children}</div>
    </section>
  );
}

function Alert({ to, icon: Icon, label, n }) {
  const hot = n > 0;
  return (
    <Link to={to} className={`flex items-center gap-3 rounded-2xl border p-3.5 transition-colors ${hot ? 'border-marigold-100 bg-marigold-50 hover:border-marigold-500' : 'border-line bg-white hover:border-teal-500'}`}>
      <Icon className={`h-5 w-5 shrink-0 ${hot ? 'text-marigold-700' : 'text-teal-600'}`} aria-hidden />
      <span className="flex-1 text-sm text-ink-soft">{label}</span>
      <span className={`font-display text-xl font-semibold ${hot ? 'text-marigold-700' : 'text-ink'}`}>{fmt(n)}</span>
    </Link>
  );
}

export default function Overview() {
  const { data, loading, error, reload } = useAsync(() => api('/admin/overview'), []);
  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const { stats: s, system, employment, skillGap, recentAudit } = data;
  const funnelMax = Math.max(1, ...employment.funnel.map((f) => f.count));

  return (
    <div className="space-y-6">
      <PageHead title="Overview" sub="Platform health and hiring activity at a glance" />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Job seekers" value={fmt(s.seekers)} sub={`${fmt(s.newUsers7d)} new users in 7 days`} />
        <Stat label="Verified employers" value={fmt(s.verifiedEmployers)} sub={`of ${fmt(s.employers)} registered`} />
        <Stat label="Active jobs" value={fmt(s.activeJobs)} sub={`${fmt(s.openings)} openings`} />
        <Stat label="Applications" value={fmt(s.applications)} />
        <Stat label="Hires" value={fmt(s.hires)} />
        <Stat label="Pending verifications" value={fmt(s.pendingVerifications)} tone={s.pendingVerifications ? 'gold' : 'teal'} sub={<Link to="/admin/employers" className="text-teal-700 underline">Review</Link>} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Alert to="/admin/integrations" icon={Cable} label="Portal approvals pending" n={data.pendingPortals} />
        <Alert to="/admin/integrations" icon={Inbox} label="Dead letters pending" n={data.dlq} />
        <Alert to="/admin/security" icon={ShieldAlert} label="Security events, 24h" n={data.security24h} />
        <Alert to="/admin/security" icon={KeyRound} label="Failed logins, 24h" n={data.failedLogins24h} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Applications and hires by month">
          {employment.monthly.length ? (
            <ResponsiveContainer>
              <BarChart data={employment.monthly} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#EEF1EC" />
                <XAxis dataKey="month" tick={TICK} tickLine={false} axisLine={false} />
                <YAxis tick={TICK} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: '#F4F6F2' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="applications" name="Applications" fill="#0F6E6E" radius={[6, 6, 0, 0]} />
                <Bar dataKey="hires" name="Hires" fill="#F2A900" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-ink-faint">No applications yet.</p>}
        </ChartCard>

        <section className="card p-4 sm:p-5" aria-label="Hiring funnel">
          <h2 className="mb-3 text-base font-semibold">Hiring funnel</h2>
          <ol className="space-y-3">
            {employment.funnel.map((f, i) => (
              <li key={f.stage}>
                <div className="mb-1 flex justify-between text-sm"><span className="capitalize text-ink-soft">{f.stage}</span>
                  <span className="font-semibold">{fmt(f.count)}{i > 0 && employment.funnel[0].count > 0 && <span className="ml-1.5 text-xs font-normal text-ink-faint">{Math.round((f.count / employment.funnel[0].count) * 100)}%</span>}</span></div>
                <div className="h-3 rounded-full bg-mist"><div className="h-3 rounded-full bg-teal-600" style={{ width: `${(f.count / funnelMax) * 100}%`, opacity: 1 - i * 0.12 }} /></div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Top skill gaps (share of jobs vs seekers, %)" className="lg:col-span-2" h={300}>
          {skillGap.length ? (
            <ResponsiveContainer>
              <BarChart data={skillGap} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke="#EEF1EC" />
                <XAxis type="number" tick={TICK} tickLine={false} axisLine={false} unit="%" />
                <YAxis type="category" dataKey="skill" tick={TICK} tickLine={false} axisLine={false} width={110} />
                <Tooltip cursor={{ fill: '#F4F6F2' }} formatter={(v) => `${v}%`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="demandShare" name="Demand" fill="#0F6E6E" radius={[0, 6, 6, 0]} barSize={9} />
                <Bar dataKey="supplyShare" name="Supply" fill="#F2A900" radius={[0, 6, 6, 0]} barSize={9} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-ink-faint">Not enough data yet.</p>}
        </ChartCard>

        <section className="card p-4 sm:p-5" aria-label="System health">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold">System health</h2><Link to="/admin/analytics" className="text-sm text-teal-700 underline">Details</Link></div>
          <dl className="grid grid-cols-2 gap-3">
            {[['Uptime', upt(system.uptimeSec)], ['p95 latency', `${system.p95} ms`], ['CPU', `${system.cpu}%`], ['Memory', `${system.memMb} MB`], ['Requests', fmt(system.requests)], ['Errors', fmt(system.errors)]].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-mist/60 p-3"><dt className="text-xs text-ink-faint">{k}</dt><dd className="font-display text-lg font-semibold">{v}</dd></div>
            ))}
          </dl>
          {system.errors > 0 && <p className="mt-3 flex items-center gap-1.5 text-xs text-marigold-700"><AlertTriangle className="h-3.5 w-3.5" aria-hidden />Server errors recorded since start</p>}
        </section>
      </div>

      <section className="card p-4 sm:p-5" aria-label="Recent audit activity">
        <div className="mb-2 flex items-center justify-between"><h2 className="text-base font-semibold">Recent admin activity</h2><Link to="/admin/security" className="text-sm text-teal-700 underline">Audit log</Link></div>
        {recentAudit.length ? (
          <ul className="divide-y divide-line/70">
            {recentAudit.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                <Activity className="h-4 w-4 text-teal-600" aria-hidden />
                <code className="rounded bg-mist px-1.5 py-0.5 text-xs">{a.action}</code>
                <span className="text-ink-soft">{a.entity}{a.entity_id ? ` #${a.entity_id}` : ''}</span>
                <span className="ml-auto text-xs text-ink-faint">{a.actor_role || 'system'} · {ago(a.created_at)}</span>
              </li>
            ))}
          </ul>
        ) : <Empty title="No activity yet" />}
      </section>
    </div>
  );
}
