import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, CheckCircle2, Circle, GraduationCap, Sparkles } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useAsync, useToast, Spinner, ErrorBox, Empty, Stat, JobCard } from '../../components/ui';
import { PageHead } from '../../components/Layout';

const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

export default function Dashboard() {
  const { user } = useAuth() || {};
  const toast = useToast();
  const dash = useAsync(() => api('/seeker/dashboard'), []);
  const recs = useAsync(() => api('/seeker/recommendations'), []);
  const tr = useAsync(() => api('/seeker/trainings'), []);

  const toggleSave = async (job) => {
    const was = job.saved;
    recs.setData((d) => ({ ...d, items: d.items.map((j) => (j.id === job.id ? { ...j, saved: !was } : j)) }));
    try {
      await api(`/seeker/saved-jobs/${job.id}`, { method: was ? 'DELETE' : 'POST' });
      dash.setData((d) => d && { ...d, saved: Math.max(0, d.saved + (was ? -1 : 1)) });
      toast(was ? 'Removed from saved jobs' : 'Job saved');
    } catch (e) {
      recs.setData((d) => ({ ...d, items: d.items.map((j) => (j.id === job.id ? { ...j, saved: was } : j)) }));
      toast(e.message, 'error');
    }
  };

  if (dash.loading && !dash.data) return <Spinner />;
  if (dash.error) return <ErrorBox error={dash.error} onRetry={dash.reload} />;
  const d = dash.data; const c = d.completion; const a = d.applications || {};
  const name = (d.profile?.name || user?.name || '').split(' ')[0];

  return (
    <div className="space-y-6">
      <PageHead title={`${greet()}${name ? `, ${name}` : ''}`} sub={d.profile?.headline || 'Here is what is new on your job search.'} action={<Link to="/jobs" className="btn-primary">Find jobs</Link>} />

      <section className="card p-5" aria-labelledby="pc-h">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="pc-h" className="font-semibold">Profile strength</h2>
          <span className="text-sm text-ink-soft">Level {c.level} of 3 · <strong className="text-ink">{c.percent}%</strong></span>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-mist" role="progressbar" aria-valuenow={c.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Profile completion">
          <div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${c.percent}%` }} />
        </div>
        {c.missing.length > 0 ? (
          <>
            <p className="mt-3 text-sm text-ink-soft">Complete these to get better matches:</p>
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {c.missing.slice(0, 6).map((m) => (
                <li key={m.key}>
                  <Link to={`/seeker/profile#${m.key}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-mist">
                    <Circle className="h-4 w-4 shrink-0 text-marigold-500" aria-hidden />{m.label}<ArrowRight className="ml-auto h-3.5 w-3.5 text-ink-faint" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : <p className="mt-3 flex items-center gap-2 text-sm text-teal-700"><CheckCircle2 className="h-4 w-4" aria-hidden />Your profile is complete. Nice work.</p>}
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Applications" value={a.total || 0} sub={`${a.applied || 0} awaiting review`} />
        <Stat label="Shortlisted or interview" value={(a.shortlisted || 0) + (a.interview || 0)} tone="gold" sub={a.offered ? `${a.offered} offer${a.offered > 1 ? 's' : ''}` : undefined} />
        <Stat label="Saved jobs" value={d.saved} sub={`${d.savedSearches} job alert${d.savedSearches === 1 ? '' : 's'}`} />
        <Stat label="Profile views" value={d.profileViews} sub="Last 30 days" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section aria-labelledby="rec-h">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="rec-h" className="flex items-center gap-2 text-lg font-semibold"><Sparkles className="h-5 w-5 text-marigold-500" aria-hidden />Recommended for you</h2>
            <Link to="/jobs?sort=match" className="text-sm font-medium text-teal-700 hover:underline">See all</Link>
          </div>
          {recs.loading && !recs.data ? <Spinner label="Finding matches" /> : recs.error ? <ErrorBox error={recs.error} onRetry={recs.reload} /> : !recs.data.items.length ? (
            <Empty title="No matches yet" action={<Link to="/seeker/profile" className="btn-primary">Complete your profile</Link>}>Add skills, education and your city so we can match you with jobs.</Empty>
          ) : (
            <div className="space-y-3">{recs.data.items.map((j) => <JobCard key={j.id} job={j} onSave={toggleSave} />)}</div>
          )}
        </section>

        <aside className="card h-fit p-5" aria-labelledby="sk-h">
          <h2 id="sk-h" className="flex items-center gap-2 font-semibold"><GraduationCap className="h-5 w-5 text-teal-600" aria-hidden />Skills to learn</h2>
          <p className="mt-1 text-sm text-ink-soft">In demand across your top matches.</p>
          {tr.loading && !tr.data ? <Spinner /> : tr.error ? <ErrorBox error={tr.error} /> : !tr.data.gaps.length ? (
            <p className="mt-4 text-sm text-ink-soft">No gaps found. You have the skills your top matches ask for.</p>
          ) : (
            <ul className="mt-4 space-y-4">
              {tr.data.gaps.map((g) => (
                <li key={g.id}>
                  <div className="flex items-center justify-between gap-2"><span className="font-medium">{g.skill}</span><span className="chip-gold">Demand {g.demand}</span></div>
                  {g.trainings.slice(0, 2).map((t) => (
                    <a key={t.id} href={t.url || '#'} target="_blank" rel="noreferrer" className="mt-1.5 flex items-start gap-2 text-sm text-teal-700 hover:underline">
                      <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /><span>{t.title} <span className="text-ink-faint">· {t.provider}{t.duration ? `, ${t.duration}` : ''}</span></span>
                    </a>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
