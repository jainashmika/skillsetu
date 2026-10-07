import { Link } from 'react-router-dom';
import { AlertTriangle, Plus, Users } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { api, ago } from '../../lib/api';
import { useAsync, Spinner, ErrorBox, Empty, Stat, StatusChip, MatchRing, CompanyMark } from '../../components/ui';
import { PageHead } from '../../components/Layout';

const fmtDay = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export default function Dashboard() {
  const { data, loading, error, reload } = useAsync(() => api('/employer/dashboard'), []);
  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const { company, totals, jobs, perJob, recent, weekly } = data;
  const verified = company.verificationStatus === 'verified';

  return (
    <div className="space-y-6">
      <PageHead
        title={<span className="flex items-center gap-3"><CompanyMark name={company.name} logo={company.logo} size={40} />{company.name}</span>}
        sub="Your hiring at a glance"
        action={<Link to="/employer/jobs/new" className="btn-primary"><Plus className="h-4 w-4" aria-hidden />Post a job</Link>}
      />

      {!verified && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-marigold-100 bg-marigold-50 p-4" role="status">
          <AlertTriangle className="h-5 w-5 shrink-0 text-marigold-700" aria-hidden />
          <p className="flex-1 text-sm text-ink">
            {company.verificationStatus === 'manual_review' ? 'Your company is under manual review. You can save drafts, and publish once verified.'
              : company.verificationStatus === 'rejected' ? 'Verification was not successful. Check your GSTIN and try again.'
                : 'Verify your company with its GSTIN to publish jobs and earn the verified employer badge.'}
          </p>
          <Link to="/employer/company" className="btn-accent btn-sm">Verify company</Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active jobs" value={jobs.active || 0} sub={`${totals.jobs} total`} />
        <Stat label="Applicants" value={totals.applicants} sub={`${data.applications.applied || 0} not reviewed`} />
        <Stat label="Job views" value={totals.views} />
        <Stat label="Hires" value={totals.hires} tone="gold" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="card p-5" aria-labelledby="apps-chart">
          <h2 id="apps-chart" className="text-lg font-semibold">Applications, last 30 days</h2>
          {weekly.length ? (
            <div className="mt-4 h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weekly.map((w) => ({ day: fmtDay(w.day), Applications: w.c }))} margin={{ left: -20, right: 8, top: 4 }}>
                  <defs><linearGradient id="appsFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0F6E6E" stopOpacity={0.3} /><stop offset="100%" stopColor="#0F6E6E" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid stroke="#E2E7DF" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Area type="monotone" dataKey="Applications" stroke="#0F6E6E" strokeWidth={2} fill="url(#appsFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="mt-4 text-sm text-ink-soft">No applications in the last 30 days yet.</p>}
        </section>

        <section className="card p-5" aria-labelledby="recent-apps">
          <h2 id="recent-apps" className="text-lg font-semibold">Recent applicants</h2>
          {recent.length ? (
            <ul className="mt-3 divide-y divide-line">
              {recent.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2.5">
                  <MatchRing score={a.match_score} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.name}</p>
                    <Link to={`/employer/jobs/${a.job_id}`} className="block truncate text-xs text-ink-soft hover:text-teal-700">{a.title} · {ago(a.created_at)}</Link>
                  </div>
                  <StatusChip s={a.status} />
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm text-ink-soft">Applicants will appear here.</p>}
        </section>
      </div>

      <section className="card overflow-hidden" aria-labelledby="per-job">
        <h2 id="per-job" className="p-5 pb-2 text-lg font-semibold">Open jobs</h2>
        {perJob.length ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th scope="col">Job</th><th scope="col">Applicants</th><th scope="col">Avg match</th><th scope="col">Shortlisted</th><th scope="col">Views</th><th scope="col">Deadline</th></tr></thead>
              <tbody>
                {perJob.map((j) => (
                  <tr key={j.id}>
                    <td><Link to={`/employer/jobs/${j.id}`} className="font-medium hover:text-teal-700">{j.title}</Link> {j.status !== 'active' && <StatusChip s={j.status} />}</td>
                    <td>{j.applicants}</td>
                    <td>{j.avgMatch != null ? `${j.avgMatch}%` : '–'}</td>
                    <td>{j.shortlisted || 0}</td>
                    <td>{j.views}</td>
                    <td className="whitespace-nowrap">{j.deadline || '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5 pt-2"><Empty icon={Users} title="No open jobs" action={<Link to="/employer/jobs/new" className="btn-primary btn-sm">Post a job</Link>}>Post a job and we will match it with suitable candidates.</Empty></div>
        )}
      </section>
    </div>
  );
}
