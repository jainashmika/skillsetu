import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, CalendarPlus, Download, FolderPlus, Lock, Mail, MapPin, Pencil, Phone, Send, Sparkles, Users } from 'lucide-react';
import { api, download, qs, ago, LABEL } from '../../lib/api';
import { useAsync, useToast, Spinner, ErrorBox, Empty, Tabs, StatusChip, MatchRing, MatchMeter, Modal } from '../../components/ui';
import { PageHead } from '../../components/Layout';

const NEXT = { shortlisted: 'Shortlist', interview: 'Move to interview', offered: 'Make offer', hired: 'Mark hired', rejected: 'Reject' };
const Reasons = ({ strengths = [], gaps = [] }) => (
  <div className="mt-2 flex flex-wrap gap-1.5">
    {strengths.map((s) => <span key={s} className="chip-teal">{s}</span>)}
    {gaps.map((g) => <span key={g} className="chip-red">{g}</span>)}
  </div>
);
const Meta = ({ c }) => (
  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-ink-soft">
    {c.headline && <span>{c.headline}</span>}
    {c.city && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden />{c.city}</span>}
    <span>{c.experienceYears ? `${c.experienceYears} yrs` : 'Fresher'}</span>
    {c.educationLabel && <span>{c.educationLabel}</span>}
  </p>
);

function Applicants({ jobId }) {
  const toast = useToast(); const [busy, setBusy] = useState(null); const [filter, setFilter] = useState('all');
  const { data, loading, error, reload } = useAsync(() => api(`/employer/jobs/${jobId}/applicants`), [jobId]);
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const move = async (a, status) => {
    setBusy(a.applicationId);
    try { await api(`/employer/applications/${a.applicationId}`, { method: 'PATCH', body: { status } }); toast(`${a.candidate.name}: ${LABEL[status].toLowerCase()}.`); reload(); }
    catch (e) { toast(e.message, 'error'); } finally { setBusy(null); }
  };
  const resume = (c) => download(`/employer/candidates/${c.id}/resume`, `${c.name.replace(/\s+/g, '_')}_resume`).catch((e) => toast(e.message, 'error'));
  const items = filter === 'all' ? data.items : data.items.filter((i) => i.status === filter);
  if (!data.items.length) return <Empty icon={Users} title="No applicants yet">Try the AI recommended tab to invite strong matches.</Empty>;
  return (
    <div className="space-y-3">
      <Tabs tabs={[['all', 'All', data.items.length], ...Object.entries(data.counts).filter(([, n]) => n).map(([k, n]) => [k, LABEL[k], n])]} value={filter} onChange={setFilter} />
      {items.map((a) => { const c = a.candidate; return (
        <article key={a.applicationId} className="card p-4 sm:p-5">
          <div className="flex gap-4">
            <MatchRing score={a.matchScore} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-semibold">{c.name}</h3>{(c.verified.ekyc || c.verified.digilocker) && <BadgeCheck className="h-4 w-4 text-teal-600" aria-label="ID verified" />}<StatusChip s={a.status} /><span className="text-xs text-ink-faint">Applied {ago(a.appliedAt)}</span></div>
              <Meta c={c} />
              {c.contact && <p className="mt-1 flex flex-wrap gap-x-4 text-sm"><a href={`mailto:${c.contact.email}`} className="inline-flex items-center gap-1 text-teal-700"><Mail className="h-3.5 w-3.5" aria-hidden />{c.contact.email}</a>{c.contact.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" aria-hidden />{c.contact.phone}</span>}</p>}
              <Reasons strengths={a.strengths} gaps={a.gaps} />
              {a.coverNote && <blockquote className="mt-3 rounded-xl bg-mist p-3 text-sm text-ink-soft">{a.coverNote}</blockquote>}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
            {a.allowed.map((s) => <button key={s} className={s === 'rejected' ? 'btn-danger btn-sm' : 'btn-primary btn-sm'} disabled={busy === a.applicationId} onClick={() => move(a, s)}>{NEXT[s]}</button>)}
            {c.hasResume && <button className="btn-outline btn-sm" onClick={() => resume(c)}><Download className="h-3.5 w-3.5" aria-hidden />Resume</button>}
          </div>
        </article>); })}
    </div>
  );
}

function Recommended({ job }) {
  const toast = useToast(); const [f, setF] = useState({ minEdu: '', minExp: '', verifiedOnly: false }); const [poolFor, setPoolFor] = useState(null);
  const { data, loading, error, reload } = useAsync(() => api(`/employer/jobs/${job.id}/recommended-candidates${qs({ minEdu: f.minEdu, minExp: f.minExp, verifiedOnly: f.verifiedOnly ? 'true' : '' })}`), [job.id, f.minEdu, f.minExp, f.verifiedOnly]);
  const tax = useAsync(() => api('/public/taxonomy'), []);
  const pools = useAsync(() => api('/employer/pools'), []);
  const invite = async (c) => {
    try { const r = await api(`/employer/candidates/${c.id}/invite`, { method: 'POST', body: { jobId: job.id } }); toast(r.message || 'Invitation sent.'); } catch (e) { toast(e.message, 'error'); }
  };
  const addToPool = async (poolId) => {
    try { await api(`/employer/pools/${poolId}/members`, { method: 'POST', body: { seekerId: poolFor.id } }); toast(`${poolFor.name} added to pool.`); setPoolFor(null); pools.reload(); } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <label className="min-w-[10rem] flex-1 text-sm"><span className="label">Minimum education</span>
          <select className="input" value={f.minEdu} onChange={(e) => setF({ ...f, minEdu: e.target.value })}><option value="">Any</option>{tax.data?.educationLevels.map((e) => <option key={e.level} value={e.level}>{e.label}</option>)}</select></label>
        <label className="w-36 text-sm"><span className="label">Min experience</span><input type="number" min="0" className="input" value={f.minExp} onChange={(e) => setF({ ...f, minExp: e.target.value })} placeholder="Years" /></label>
        <label className="flex items-center gap-2 pb-2.5 text-sm"><input type="checkbox" checked={f.verifiedOnly} onChange={(e) => setF({ ...f, verifiedOnly: e.target.checked })} className="h-4 w-4 accent-teal-600" />Verified only</label>
      </div>
      {job.status !== 'active' && <p className="text-sm text-ink-soft">Publish this job to send invitations.</p>}
      {loading && !data ? <Spinner /> : error ? <ErrorBox error={error} onRetry={reload} /> : !data.items.length ? <Empty icon={Sparkles} title="No matches found">Try relaxing the filters or adding more skills to the job.</Empty> : data.items.map((m) => { const c = m.candidate; return (
        <article key={c.id} className="card p-4 sm:p-5">
          <div className="flex gap-4">
            <MatchRing score={m.matchScore} />
            <div className="min-w-0 flex-1">
              <h3 className="flex items-center gap-2 text-base font-semibold">{c.name}{(c.verified.ekyc || c.verified.digilocker) && <BadgeCheck className="h-4 w-4 text-teal-600" aria-label="ID verified" />}</h3>
              <Meta c={c} />
              <div className="mt-3"><MatchMeter breakdown={m.breakdown} /></div>
              <Reasons strengths={m.strengths} gaps={m.gaps} />
              {c.contactHidden && <p className="mt-2 inline-flex items-center gap-1 text-xs text-ink-faint"><Lock className="h-3.5 w-3.5" aria-hidden />Contact details are shared once the candidate applies.</p>}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
            <button className="btn-primary btn-sm" disabled={job.status !== 'active'} onClick={() => invite(c)}><Send className="h-3.5 w-3.5" aria-hidden />Invite to apply</button>
            <button className="btn-outline btn-sm" onClick={() => setPoolFor(c)}><FolderPlus className="h-3.5 w-3.5" aria-hidden />Add to pool</button>
          </div>
        </article>); })}
      <Modal open={!!poolFor} onClose={() => setPoolFor(null)} title={`Add ${poolFor?.name || ''} to a pool`}>
        {pools.data?.items.length ? <ul className="space-y-2">{pools.data.items.map((p) => <li key={p.id}><button className="btn-outline w-full justify-between" onClick={() => addToPool(p.id)}>{p.name}<span className="text-xs text-ink-faint">{p.members} members</span></button></li>)}</ul>
          : <p className="text-sm text-ink-soft">No pools yet. Create one on the <Link to="/employer/candidates" className="text-teal-700 underline">Candidates</Link> page.</p>}
      </Modal>
    </div>
  );
}

export default function JobDetail() {
  const { id } = useParams(); const toast = useToast(); const [tab, setTab] = useState('applicants');
  const [extend, setExtend] = useState(false); const [date, setDate] = useState('');
  const { data, loading, error, reload } = useAsync(() => api(`/employer/jobs/${id}`), [id]);
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const { job, history } = data;
  const saveDeadline = async (e) => {
    e.preventDefault();
    try { await api(`/employer/jobs/${id}/deadline`, { method: 'POST', body: { deadline: date } }); toast('Deadline updated.'); setExtend(false); reload(); } catch (err) { toast(err.message, 'error'); }
  };
  return (
    <div className="space-y-5">
      <Link to="/employer/jobs" className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-teal-700"><ArrowLeft className="h-4 w-4" aria-hidden />All jobs</Link>
      <PageHead title={job.title} sub={<span className="flex flex-wrap items-center gap-2"><StatusChip s={job.status} />{job.workFormat === 'remote' ? 'Remote' : job.city} · Deadline {job.deadline || 'not set'} · {job.views} views</span>}
        action={<div className="flex gap-2">{job.status !== 'archived' && <Link to={`/employer/jobs/${id}/edit`} className="btn-outline btn-sm"><Pencil className="h-3.5 w-3.5" aria-hidden />Edit</Link>}
          {job.status !== 'archived' && <button className="btn-outline btn-sm" onClick={() => { setDate(job.deadline || ''); setExtend(true); }}><CalendarPlus className="h-3.5 w-3.5" aria-hidden />Extend deadline</button>}</div>} />
      <Tabs tabs={[['applicants', 'Applicants'], ['recommended', 'AI recommended'], ['history', 'History', history.length]]} value={tab} onChange={setTab} />
      {tab === 'applicants' && <Applicants jobId={id} />}
      {tab === 'recommended' && <Recommended job={job} />}
      {tab === 'history' && (
        <ol className="card divide-y divide-line">
          {history.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-2 p-4 text-sm">
              {h.from_status && h.from_status !== h.to_status && <><StatusChip s={h.from_status} /><span aria-hidden>→</span></>}<StatusChip s={h.to_status} />
              <span className="text-ink-soft">{h.reason}</span>
              <span className="ml-auto text-xs text-ink-faint">{h.actor || 'System'} · {ago(h.created_at)}</span>
            </li>
          ))}
        </ol>
      )}
      <Modal open={extend} onClose={() => setExtend(false)} title="Extend deadline">
        <form onSubmit={saveDeadline} className="space-y-4">
          <label className="block"><span className="label">New deadline</span><input type="date" className="input" required min={new Date().toISOString().slice(0, 10)} value={date} onChange={(e) => setDate(e.target.value)} /></label>
          {job.status === 'expired' && <p className="text-sm text-ink-soft">This job will be reactivated.</p>}
          <button className="btn-primary w-full" disabled={!date}>Save deadline</button>
        </form>
      </Modal>
    </div>
  );
}
