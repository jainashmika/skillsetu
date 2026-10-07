import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Briefcase, Copy, Eye, Pencil, Plus, Users } from 'lucide-react';
import { api, LABEL } from '../../lib/api';
import { useAsync, useToast, Spinner, ErrorBox, Empty, Tabs, StatusChip } from '../../components/ui';
import { PageHead } from '../../components/Layout';

const TABS = ['all', 'active', 'draft', 'paused', 'expired', 'archived'];
const ACTION = { active: 'Publish', paused: 'Pause', archived: 'Archive' };

export default function Jobs() {
  const toast = useToast(); const nav = useNavigate();
  const [tab, setTab] = useState('all'); const [busy, setBusy] = useState(null);
  const { data, loading, error, reload } = useAsync(() => api('/employer/jobs'), []);
  const items = data?.items || [];
  const counts = Object.fromEntries(TABS.map((t) => [t, t === 'all' ? items.length : items.filter((j) => j.status === t).length]));
  const shown = tab === 'all' ? items : items.filter((j) => j.status === tab);

  const setStatus = async (job, status) => {
    if (status === 'archived' && !window.confirm(`Archive "${job.title}"? Archived jobs cannot be edited or reopened.`)) return;
    setBusy(`${job.id}:${status}`);
    try { await api(`/employer/jobs/${job.id}/status`, { method: 'POST', body: { status } }); toast(`${job.title}: ${LABEL[status].toLowerCase()}.`); reload(); }
    catch (e) { toast(e.message, 'error'); } finally { setBusy(null); }
  };
  const duplicate = async (job) => {
    setBusy(`${job.id}:dup`);
    try { const r = await api(`/employer/jobs/${job.id}/duplicate`, { method: 'POST' }); toast('Copy saved as a draft.'); nav(`/employer/jobs/${r.job.id}/edit`); }
    catch (e) { toast(e.message, 'error'); setBusy(null); }
  };

  return (
    <div className="space-y-5">
      <PageHead title="Jobs" sub="Manage postings and their lifecycle" action={<Link to="/employer/jobs/new" className="btn-primary"><Plus className="h-4 w-4" aria-hidden />Post a job</Link>} />
      <Tabs tabs={TABS.map((t) => [t, t === 'all' ? 'All' : LABEL[t], counts[t]])} value={tab} onChange={setTab} />
      {loading && !data ? <Spinner /> : error ? <ErrorBox error={error} onRetry={reload} /> : !shown.length ? (
        <Empty icon={Briefcase} title={tab === 'all' ? 'No jobs yet' : `No ${LABEL[tab].toLowerCase()} jobs`} action={tab === 'all' && <Link to="/employer/jobs/new" className="btn-primary btn-sm">Post your first job</Link>}>
          {tab === 'all' ? 'Create a job and we will recommend matching candidates.' : 'Jobs with this status will show here.'}
        </Empty>
      ) : (
        <ul className="space-y-3">
          {shown.map((j) => (
            <li key={j.id} className="card p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/employer/jobs/${j.id}`} className="text-base font-semibold hover:text-teal-700 sm:text-lg">{j.title}</Link>
                    <StatusChip s={j.status} />
                  </div>
                  <p className="mt-1 text-sm text-ink-soft">{[j.workFormat === 'remote' ? 'Remote' : j.city, LABEL[j.contractType], j.openings > 1 && `${j.openings} openings`].filter(Boolean).join(' · ')}</p>
                </div>
                <dl className="flex gap-5 text-sm">
                  <div><dt className="text-xs text-ink-faint">Applicants</dt><dd className="flex items-center gap-1.5 font-semibold">{j.applicants}{j.unreviewed > 0 && <span className="chip-gold py-0.5" title="Not yet reviewed">{j.unreviewed} new</span>}</dd></div>
                  <div><dt className="text-xs text-ink-faint">Views</dt><dd className="flex items-center gap-1 font-semibold"><Eye className="h-3.5 w-3.5 text-ink-faint" aria-hidden />{j.views}</dd></div>
                  <div><dt className="text-xs text-ink-faint">Deadline</dt><dd className="whitespace-nowrap font-semibold">{j.deadline || '–'}</dd></div>
                </dl>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
                {j.status !== 'archived' && <Link to={`/employer/jobs/${j.id}/edit`} className="btn-outline btn-sm"><Pencil className="h-3.5 w-3.5" aria-hidden />Edit</Link>}
                <Link to={`/employer/jobs/${j.id}`} className="btn-outline btn-sm"><Users className="h-3.5 w-3.5" aria-hidden />View applicants</Link>
                {j.allowed.filter((s) => ACTION[s]).map((s) => (
                  <button key={s} className={s === 'archived' ? 'btn-danger btn-sm' : s === 'active' ? 'btn-primary btn-sm' : 'btn-outline btn-sm'} disabled={!!busy} onClick={() => setStatus(j, s)}>
                    {busy === `${j.id}:${s}` ? 'Saving…' : j.status === 'paused' && s === 'active' ? 'Resume' : ACTION[s]}
                  </button>
                ))}
                <button className="btn-ghost btn-sm" disabled={!!busy} onClick={() => duplicate(j)}><Copy className="h-3.5 w-3.5" aria-hidden />Duplicate</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
