import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, Briefcase, ExternalLink, Search } from 'lucide-react';
import { api, qs, ctc, ago, LABEL } from '../../lib/api';
import { useAsync, useToast, Spinner, ErrorBox, Empty, Field, Modal, StatusChip, Pager } from '../../components/ui';
import { PageHead } from '../../components/Layout';

// The moderation endpoint accepts only these targets; "expired" is set by the system, not by admins.
const MODERATE = ['active', 'paused', 'archived'];
const VERB = { active: 'Reactivate', paused: 'Pause', archived: 'Archive' };
const STATUSES = [['', 'Any status'], ['active', 'Active'], ['paused', 'Paused'], ['draft', 'Draft'], ['expired', 'Expired'], ['archived', 'Archived']];
const SOURCES = [['', 'All sources'], ['direct', 'Direct postings'], ['portal', 'Partner portals']];

export default function Jobs() {
  const toast = useToast();
  const [f, setF] = useState({ status: '', source: '', q: '', page: 1 });
  const [q, setQ] = useState('');
  const [mod, setMod] = useState(null);
  const [busy, setBusy] = useState(false);
  const { data, loading, error, reload } = useAsync(() => api(`/admin/jobs${qs(f)}`), [f.status, f.source, f.q, f.page]);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v, page: k === 'page' ? v : 1 }));

  const submit = async (e) => {
    e.preventDefault();
    if (mod.reason.trim().length < 3) { setMod({ ...mod, err: 'Give a reason of at least 3 characters.' }); return; }
    setBusy(true);
    try { await api(`/admin/jobs/${mod.job.id}/status`, { method: 'POST', body: { status: mod.status, reason: mod.reason.trim() } }); toast(`"${mod.job.title}" is now ${LABEL[mod.status].toLowerCase()}`); setMod(null); reload(); }
    catch (err) { setMod((m) => ({ ...m, err: err.fields?.reason || err.message })); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <PageHead title="Jobs" sub="Moderate postings from employers and partner portals" />

      <form className="card mb-4 grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto_auto]" role="search" onSubmit={(e) => { e.preventDefault(); set('q', q.trim()); }}>
        <label className="relative"><span className="sr-only">Search by title or company</span>
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-faint" aria-hidden />
          <input className="input pl-9" placeholder="Search by title or company" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <select className="input" aria-label="Status" value={f.status} onChange={(e) => set('status', e.target.value)}>{STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select className="input" aria-label="Source" value={f.source} onChange={(e) => set('source', e.target.value)}>{SOURCES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <button className="btn-outline">Search</button>
      </form>

      {loading && !data ? <Spinner /> : error ? <ErrorBox error={error} onRetry={reload} /> : !data.items.length ? <Empty icon={Briefcase} title="No jobs match these filters" /> : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[880px]">
            <thead><tr><th>Job</th><th>Location</th><th>CTC</th><th>Source</th><th>Applicants</th><th>Status</th><th className="text-right">Moderation</th></tr></thead>
            <tbody>
              {data.items.map((j) => {
                const allowed = (j.allowed || []).filter((s) => MODERATE.includes(s));
                return (
                  <tr key={j.id}>
                    <td>
                      <Link to={`/jobs/${j.id}`} className="inline-flex items-center gap-1 font-medium hover:text-teal-700">{j.title}<ExternalLink className="h-3 w-3 text-ink-faint" aria-hidden /></Link>
                      <p className="flex items-center gap-1 text-xs text-ink-faint">{j.company}{j.companyVerified && <BadgeCheck className="h-3.5 w-3.5 text-teal-600" aria-label="Verified" />}<span>· {ago(j.createdAt)}</span></p>
                    </td>
                    <td className="text-ink-soft">{j.workFormat === 'remote' ? 'Remote' : [j.city, j.state].filter(Boolean).join(', ')}</td>
                    <td className="whitespace-nowrap text-ink-soft">{ctc(j.ctcMin, j.ctcMax)}</td>
                    <td>{j.source === 'direct' ? <span className="chip">Direct</span> : <span className="chip-gold">{String(j.source).replace('portal:', '')}</span>}</td>
                    <td className="text-ink-soft">{j.applicants} <span className="text-xs text-ink-faint">· {j.views ?? 0} views</span></td>
                    <td><StatusChip s={j.status} /></td>
                    <td><div className="flex flex-wrap justify-end gap-1.5">
                      {allowed.length ? allowed.map((s) => (
                        <button key={s} className={s === 'archived' ? 'btn-danger btn-sm' : s === 'active' ? 'btn-primary btn-sm' : 'btn-outline btn-sm'} onClick={() => setMod({ job: j, status: s, reason: '', err: null })}>{VERB[s]}</button>
                      )) : <span className="text-xs text-ink-faint">No actions</span>}
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pager page={data.page} total={data.total} size={data.pageSize} onPage={(p) => set('page', p)} />}

      <Modal open={!!mod} onClose={() => setMod(null)} title={mod ? `${VERB[mod.status]} job` : ''}>
        {mod && (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-ink-soft"><strong className="text-ink">{mod.job.title}</strong> at {mod.job.company}. The employer is notified with your reason.</p>
            <Field id="mreason" label="Reason" error={mod.err} hint="Between 3 and 200 characters">
              <textarea id="mreason" required minLength={3} maxLength={200} rows={3} className="input" value={mod.reason} onChange={(e) => setMod({ ...mod, reason: e.target.value, err: null })} placeholder="For example: misleading salary information" />
            </Field>
            <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setMod(null)}>Cancel</button>
              <button className={mod.status === 'archived' ? 'btn-danger' : 'btn-primary'} disabled={busy}>{VERB[mod.status]}</button></div>
          </form>
        )}
      </Modal>
    </div>
  );
}
