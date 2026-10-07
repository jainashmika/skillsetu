import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BellPlus, Filter, Search, X } from 'lucide-react';
import { api, qs, LABEL } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAsync, JobCard, Spinner, ErrorBox, Empty, Pager, useToast } from '../components/ui';

const KEYS = ['q', 'city', 'sector', 'workFormat', 'contractType', 'ctcMin', 'expMax', 'eduMax', 'postedWithin', 'sort', 'page', 'source', 'skills'];

export default function Jobs() {
  const [sp, setSp] = useSearchParams(); const { user } = useAuth(); const toast = useToast();
  const f = Object.fromEntries(KEYS.map((k) => [k, sp.get(k) || '']));
  const [q, setQ] = useState(f.q); const [open, setOpen] = useState(false);
  useEffect(() => setQ(f.q), [f.q]);
  const tax = useAsync(() => api('/public/taxonomy'), []);
  const res = useAsync(() => api(`/public/jobs${qs({ ...f, page: f.page || 1 })}`), [sp.toString()]);
  const set = (patch) => { const n = { ...f, ...patch }; if (!('page' in patch)) n.page = ''; setSp(Object.fromEntries(Object.entries(n).filter(([, v]) => v))); };
  const save = async (job) => {
    if (!user) return toast('Sign in as a job seeker to save jobs.', 'error');
    try { await api(`/seeker/saved-jobs/${job.id}`, { method: job.saved ? 'DELETE' : 'POST' }); res.setData((d) => ({ ...d, items: d.items.map((j) => (j.id === job.id ? { ...j, saved: !j.saved } : j)) })); toast(job.saved ? 'Removed from saved jobs' : 'Saved to your interested list'); }
    catch (e) { toast(e.message, 'error'); }
  };
  const alert = async () => {
    try { await api('/seeker/saved-searches', { method: 'POST', body: { name: f.q || f.sector || f.city || 'All jobs', query: Object.fromEntries(Object.entries(f).filter(([k, v]) => v && k !== 'page' && k !== 'sort')), alert: true } }); toast('Job alert created. We will notify you about new matches.'); }
    catch (e) { toast(e.message, 'error'); }
  };
  const Sel = ({ k, label, opts }) => (
    <div><label className="label" htmlFor={`f-${k}`}>{label}</label>
      <select id={`f-${k}`} className="input" value={f[k]} onChange={(e) => set({ [k]: e.target.value })}><option value="">Any</option>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
  );
  const filters = (
    <div className="space-y-4">
      <Sel k="city" label="City" opts={[['Remote', 'Remote'], ...(tax.data?.cities || []).map((c) => [c, c])]} />
      <Sel k="sector" label="Sector" opts={(tax.data?.sectors || []).map((s) => [s, s])} />
      <Sel k="workFormat" label="Work format" opts={['onsite', 'hybrid', 'remote'].map((x) => [x, LABEL[x]])} />
      <Sel k="contractType" label="Job type" opts={['full_time', 'part_time', 'contract', 'internship', 'apprenticeship'].map((x) => [x, LABEL[x]])} />
      <Sel k="ctcMin" label="Minimum salary" opts={[[200000, '₹2L+ /yr'], [400000, '₹4L+'], [600000, '₹6L+'], [1000000, '₹10L+']]} />
      <Sel k="expMax" label="My experience" opts={[[0, 'Fresher'], [1, '1 year'], [3, '3 years'], [5, '5+ years']]} />
      <Sel k="eduMax" label="My education" opts={(tax.data?.educationLevels || []).map((e) => [e.level, e.label])} />
      <Sel k="postedWithin" label="Posted" opts={[[1, 'Last 24 hours'], [7, 'Last 7 days'], [30, 'Last 30 days']]} />
      <Sel k="source" label="Source" opts={[['direct', 'Direct employers'], ['portal', 'Partner portals']]} />
      <button className="btn-ghost w-full" onClick={() => setSp({})}>Clear all filters</button>
    </div>
  );
  const d = res.data;
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <form onSubmit={(e) => { e.preventDefault(); set({ q }); }} className="flex gap-2" role="search">
        <div className="relative flex-1"><Search className="pointer-events-none absolute left-3.5 top-3 h-5 w-5 text-ink-faint" aria-hidden /><label htmlFor="jq" className="sr-only">Search jobs</label>
          <input id="jq" className="input py-3 pl-11 text-base" placeholder="Job title, skill or company" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <button className="btn-primary px-6">Search</button>
        <button type="button" className="btn-outline lg:hidden" onClick={() => setOpen(true)} aria-label="Filters"><Filter className="h-4 w-4" /></button>
      </form>
      <div className="mt-6 grid gap-8 lg:grid-cols-[250px_1fr]">
        <aside className="hidden lg:block" aria-label="Filters">{filters}</aside>
        {open && <div className="fixed inset-0 z-50 overflow-y-auto bg-white p-5 lg:hidden"><div className="mb-4 flex justify-between"><h2 className="text-xl font-semibold">Filters</h2><button onClick={() => setOpen(false)} aria-label="Close filters"><X /></button></div>{filters}<button className="btn-primary mt-4 w-full" onClick={() => setOpen(false)}>Show {d?.total ?? ''} jobs</button></div>}
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-soft" aria-live="polite">{d ? <><strong className="text-ink">{d.total}</strong> jobs{f.q && <> for “{f.q}”</>} <span className="text-ink-faint">· {d.tookMs} ms</span></> : ' '}</p>
            <div className="flex items-center gap-2">
              {user?.role === 'seeker' && <button className="btn-outline btn-sm" onClick={alert}><BellPlus className="h-4 w-4" />Create alert</button>}
              <label htmlFor="sort" className="sr-only">Sort</label>
              <select id="sort" className="input w-auto py-1.5" value={f.sort || 'relevance'} onChange={(e) => set({ sort: e.target.value })}>
                <option value="relevance">Most relevant</option><option value="newest">Newest</option><option value="salary">Highest salary</option>{user?.role === 'seeker' && <option value="match">Best match for me</option>}
              </select>
            </div>
          </div>
          {d?.expandedTerms?.length > 1 && <p className="mb-3 text-xs text-ink-faint">Also searching: {d.expandedTerms.slice(0, 8).join(', ')}</p>}
          {!user && <div className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-sm text-teal-700"><Link to="/register" className="font-semibold underline">Create a free profile</Link> to see your match score on every job.</div>}
          <ErrorBox error={res.error} onRetry={res.reload} />
          {res.loading && !d ? <Spinner /> : d?.items.length ? (
            <div className="space-y-3">{d.items.map((j) => <JobCard key={j.id} job={j} onSave={user?.role === 'seeker' || !user ? save : undefined} />)}</div>
          ) : d && <Empty icon={Search} title="No jobs match these filters" action={<button className="btn-outline" onClick={() => setSp({})}>Clear filters</button>}>Try a broader keyword or remove a filter.</Empty>}
          {d && <Pager page={d.page} total={d.total} size={d.pageSize} onPage={(p) => set({ page: p })} />}
        </div>
      </div>
    </div>
  );
}
