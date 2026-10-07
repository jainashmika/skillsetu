import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, BellOff, Bookmark, Search, Trash2 } from 'lucide-react';
import { api, qs, inr, ago, LABEL } from '../../lib/api';
import { useAsync, useToast, Spinner, ErrorBox, Empty, Tabs, JobCard } from '../../components/ui';
import { PageHead } from '../../components/Layout';

// Turn a stored search query into short readable chips.
function summary(q = {}) {
  const out = [];
  if (q.q) out.push(`"${q.q}"`);
  if (q.city) out.push(q.city); else if (q.state) out.push(q.state);
  if (q.workFormat) out.push(LABEL[q.workFormat] || q.workFormat);
  if (q.contractType) out.push(LABEL[q.contractType] || q.contractType);
  if (q.sector) out.push(q.sector);
  if (q.ctcMin) out.push(`${inr(Number(q.ctcMin))}+ /yr`);
  if (q.expMax != null && q.expMax !== '') out.push(Number(q.expMax) === 0 ? 'Freshers' : `Up to ${q.expMax} yrs`);
  if (q.skills) out.push(...[].concat(q.skills).flatMap((s) => String(s).split(',')).filter(Boolean).slice(0, 3));
  if (q.postedWithin) out.push(`Last ${q.postedWithin} days`);
  if (q.source) out.push(q.source === 'portal' ? 'Partner portals' : 'Direct');
  return out;
}
const toQuery = (q = {}) => qs(Object.fromEntries(Object.entries(q).filter(([k]) => !['page', 'pageSize'].includes(k)).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : v])));

export default function Saved() {
  const toast = useToast();
  const [tab, setTab] = useState('jobs');
  const jobs = useAsync(() => api('/seeker/saved-jobs'), []);
  const alerts = useAsync(() => api('/seeker/saved-searches'), []);
  const [busy, setBusy] = useState(null);

  const unsave = async (job) => {
    const prev = jobs.data;
    jobs.setData((d) => ({ ...d, items: d.items.filter((j) => j.id !== job.id) }));
    try { await api(`/seeker/saved-jobs/${job.id}`, { method: 'DELETE' }); toast('Removed from saved jobs'); }
    catch (e) { jobs.setData(prev); toast(e.message, 'error'); }
  };
  const toggleAlert = async (s) => {
    setBusy(s.id);
    try {
      await api(`/seeker/saved-searches/${s.id}`, { method: 'PATCH', body: { alert: !s.alert } });
      alerts.setData((d) => ({ ...d, items: d.items.map((x) => (x.id === s.id ? { ...x, alert: !s.alert } : x)) }));
      toast(s.alert ? 'Alerts turned off' : 'Alerts turned on');
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(null); }
  };
  const remove = async (s) => {
    if (!window.confirm(`Delete the saved search "${s.name}"?`)) return;
    setBusy(s.id);
    try {
      await api(`/seeker/saved-searches/${s.id}`, { method: 'DELETE' });
      alerts.setData((d) => ({ ...d, items: d.items.filter((x) => x.id !== s.id) }));
      toast('Saved search deleted');
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(null); }
  };

  return (
    <div>
      <PageHead title="Saved" sub="Jobs you bookmarked and searches you want alerts for." />
      <Tabs tabs={[['jobs', 'Saved jobs', jobs.data?.items.length], ['alerts', 'Job alerts', alerts.data?.items.length]]} value={tab} onChange={setTab} />
      <div className="mt-4" role="tabpanel">
        {tab === 'jobs' ? (
          jobs.loading && !jobs.data ? <Spinner /> : jobs.error ? <ErrorBox error={jobs.error} onRetry={jobs.reload} /> : !jobs.data.items.length ? (
            <Empty icon={Bookmark} title="No saved jobs" action={<Link to="/jobs" className="btn-primary">Browse jobs</Link>}>Tap the bookmark on any job to keep it here for later.</Empty>
          ) : <div className="space-y-3">{jobs.data.items.map((j) => <JobCard key={j.id} job={j} onSave={unsave} />)}</div>
        ) : (
          alerts.loading && !alerts.data ? <Spinner /> : alerts.error ? <ErrorBox error={alerts.error} onRetry={alerts.reload} /> : !alerts.data.items.length ? (
            <Empty icon={Bell} title="No job alerts" action={<Link to="/jobs" className="btn-primary">Search jobs</Link>}>Run a search and choose "Save search" to get notified about new matching jobs.</Empty>
          ) : (
            <ul className="space-y-3">
              {alerts.data.items.map((s) => {
                const chips = summary(s.query);
                return (
                  <li key={s.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{s.name}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">{chips.length ? chips.map((c, i) => <span key={i} className="chip">{c}</span>) : <span className="text-sm text-ink-faint">All jobs</span>}</div>
                      <p className="mt-1.5 text-xs text-ink-faint">{s.alert ? 'Alerts on' : 'Alerts off'}{s.created_at ? ` · Saved ${ago(s.created_at)}` : ''}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`/jobs${toQuery(s.query)}`} className="btn-outline btn-sm"><Search className="h-4 w-4" aria-hidden />Run search</Link>
                      <button className={`btn-sm ${s.alert ? 'btn-ghost' : 'btn-outline'}`} onClick={() => toggleAlert(s)} disabled={busy === s.id} aria-pressed={s.alert} aria-label={`${s.alert ? 'Turn off' : 'Turn on'} alerts for ${s.name}`}>
                        {s.alert ? <><BellOff className="h-4 w-4" aria-hidden />Turn off</> : <><Bell className="h-4 w-4" aria-hidden />Turn on</>}
                      </button>
                      <button className="btn-ghost btn-sm text-rose-600" onClick={() => remove(s)} disabled={busy === s.id} aria-label={`Delete ${s.name}`}><Trash2 className="h-4 w-4" aria-hidden /></button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        )}
      </div>
    </div>
  );
}
