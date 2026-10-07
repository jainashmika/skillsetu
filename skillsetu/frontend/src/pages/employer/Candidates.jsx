import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, FolderOpen, Lock, MapPin, Search, Trash2, Users } from 'lucide-react';
import { api, qs, ctc } from '../../lib/api';
import { useAsync, useToast, Spinner, ErrorBox, Empty, Tabs, Modal, MatchRing } from '../../components/ui';
import { PageHead } from '../../components/Layout';

function CandidateCard({ c, onOpen, extra }) {
  return (
    <article className="card relative p-4">
      <h3 className="flex items-center gap-1.5 font-semibold"><button className="text-left after:absolute after:inset-0 hover:text-teal-700" onClick={() => onOpen(c.id)}>{c.name}</button>{(c.verified.ekyc || c.verified.digilocker) && <BadgeCheck className="h-4 w-4 text-teal-600" aria-label="ID verified" />}</h3>
      <p className="text-sm text-ink-soft">{c.headline || 'Job seeker'}</p>
      <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-faint">{c.city && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden />{c.city}</span>}<span>{c.experienceYears ? `${c.experienceYears} yrs` : 'Fresher'}</span>{c.educationLabel && <span>{c.educationLabel}</span>}</p>
      <div className="mt-2 flex flex-wrap gap-1">{c.skills.slice(0, 5).map((s) => <span key={s.id} className="chip">{s.name}</span>)}</div>
      {extra && <div className="relative z-10 mt-3">{extra}</div>}
    </article>
  );
}

function Profile({ id, onClose }) {
  const toast = useToast();
  const { data, loading, error } = useAsync(() => (id ? Promise.all([api(`/employer/candidates/${id}`), api('/employer/pools')]) : null), [id]);
  const add = async (poolId) => { try { await api(`/employer/pools/${poolId}/members`, { method: 'POST', body: { seekerId: id } }); toast('Added to pool.'); } catch (e) { toast(e.message, 'error'); } };
  const c = data?.[0].candidate;
  return (
    <Modal open={!!id} onClose={onClose} title={c?.name || 'Candidate'} wide>
      {loading ? <Spinner /> : error ? <ErrorBox error={error} /> : c && (
        <div className="space-y-5 text-sm">
          <div>
            <p className="text-ink-soft">{c.headline}</p>
            <p className="mt-1 text-ink-faint">{[c.city, c.experienceYears ? `${c.experienceYears} yrs experience` : 'Fresher', c.educationLabel, c.expectedCtcMin && `Expects ${ctc(c.expectedCtcMin, c.expectedCtcMax)}`].filter(Boolean).join(' · ')}</p>
            {c.contact ? <p className="mt-2">{c.contact.email} · {c.contact.phone}</p> : <p className="mt-2 inline-flex items-center gap-1 text-xs text-ink-faint"><Lock className="h-3.5 w-3.5" aria-hidden />Contact details are shared once the candidate applies to one of your jobs.</p>}
          </div>
          {c.about && <p className="whitespace-pre-line text-ink-soft">{c.about}</p>}
          <div className="flex flex-wrap gap-1.5">{c.skills.map((s) => <span key={s.id} className="chip">{s.name}</span>)}</div>
          {c.experiences.length > 0 && <section><h3 className="mb-1 font-semibold">Experience</h3><ul className="space-y-1">{c.experiences.map((e, i) => <li key={i}>{e.title}, {e.company} <span className="text-ink-faint">({e.start_date?.slice(0, 7)} to {e.current ? 'present' : e.end_date?.slice(0, 7) || '?'})</span></li>)}</ul></section>}
          {c.educations.length > 0 && <section><h3 className="mb-1 font-semibold">Education</h3><ul className="space-y-1">{c.educations.map((e, i) => <li key={i}>{e.qualification}{e.field && `, ${e.field}`}{e.institution && ` · ${e.institution}`}{e.year && ` (${e.year})`}{e.verified && <BadgeCheck className="ml-1 inline h-3.5 w-3.5 text-teal-600" aria-label="Verified" />}</li>)}</ul></section>}
          <section>
            <h3 className="mb-2 font-semibold">Match with your active jobs</h3>
            {data[0].matches.length ? <ul className="space-y-2">{data[0].matches.map((m) => <li key={m.jobId} className="flex items-center gap-3"><MatchRing score={m.score} size={40} /><Link to={`/employer/jobs/${m.jobId}`} className="hover:text-teal-700">{m.title}</Link></li>)}</ul> : <p className="text-ink-faint">You have no active jobs.</p>}
          </section>
          <section>
            <h3 className="mb-2 font-semibold">Talent pools</h3>
            {data[0].pools.length > 0 && <p className="mb-2 text-ink-soft">In: {data[0].pools.map((p) => p.name).join(', ')}</p>}
            <div className="flex flex-wrap gap-2">{data[1].items.filter((p) => !data[0].pools.some((x) => x.id === p.id)).map((p) => <button key={p.id} className="btn-outline btn-sm" onClick={() => add(p.id)}>Add to {p.name}</button>)}</div>
          </section>
        </div>
      )}
    </Modal>
  );
}

function SearchTab({ onOpen }) {
  const [f, setF] = useState({ q: '', minEdu: '', minExp: '', city: '' }); const [applied, setApplied] = useState(f);
  const tax = useAsync(() => api('/public/taxonomy'), []);
  const { data, loading, error, reload } = useAsync(() => api(`/employer/candidates${qs(applied)}`), [applied]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="space-y-4">
      <form className="card grid gap-3 p-4 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); setApplied(f); }}>
        <label className="text-sm"><span className="label">Keywords or skills</span><input className="input" value={f.q} onChange={set('q')} placeholder="e.g. Excel, welder" /></label>
        <label className="text-sm"><span className="label">Education</span><select className="input" value={f.minEdu} onChange={set('minEdu')}><option value="">Any</option>{tax.data?.educationLevels.map((e) => <option key={e.level} value={e.level}>{e.label}</option>)}</select></label>
        <label className="text-sm"><span className="label">Min experience</span><input type="number" min="0" className="input" value={f.minExp} onChange={set('minExp')} /></label>
        <label className="text-sm"><span className="label">City</span><input className="input" list="cand-cities" value={f.city} onChange={set('city')} /><datalist id="cand-cities">{tax.data?.cities.map((c) => <option key={c} value={c} />)}</datalist></label>
        <button className="btn-primary"><Search className="h-4 w-4" aria-hidden />Search</button>
      </form>
      {loading && !data ? <Spinner /> : error ? <ErrorBox error={error} onRetry={reload} /> : !data.items.length ? <Empty icon={Users} title="No candidates found">Try fewer filters or different keywords.</Empty> : (
        <>
          <p className="text-sm text-ink-soft">{data.total} candidate{data.total === 1 ? '' : 's'}{data.total > 50 && ', showing the first 50'}</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{data.items.map((c) => <CandidateCard key={c.id} c={c} onOpen={onOpen} />)}</div>
        </>
      )}
    </div>
  );
}

function PoolsTab({ onOpen }) {
  const toast = useToast(); const [name, setName] = useState(''); const [open, setOpen] = useState(null);
  const pools = useAsync(() => api('/employer/pools'), []);
  const pool = useAsync(() => (open ? api(`/employer/pools/${open}`) : null), [open]);
  const create = async (e) => {
    e.preventDefault();
    try { await api('/employer/pools', { method: 'POST', body: { name } }); setName(''); toast('Pool created.'); pools.reload(); } catch (err) { toast(err.message, 'error'); }
  };
  const remove = async (p) => {
    if (!window.confirm(`Delete the pool "${p.name}"? Candidates are not affected.`)) return;
    try { await api(`/employer/pools/${p.id}`, { method: 'DELETE' }); if (open === p.id) setOpen(null); pools.reload(); toast('Pool deleted.'); } catch (err) { toast(err.message, 'error'); }
  };
  const removeMember = async (seekerId) => {
    try { await api(`/employer/pools/${open}/members/${seekerId}`, { method: 'DELETE' }); pool.reload(); pools.reload(); } catch (err) { toast(err.message, 'error'); }
  };
  return (
    <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
      <div className="space-y-3">
        <form onSubmit={create} className="flex gap-2"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="New pool name" aria-label="New pool name" /><button className="btn-primary" disabled={name.trim().length < 2}>Add</button></form>
        {pools.loading && !pools.data ? <Spinner /> : pools.error ? <ErrorBox error={pools.error} /> : (
          <ul className="space-y-1.5">
            {pools.data.items.map((p) => (
              <li key={p.id} className={`flex items-center gap-2 rounded-xl border p-2 pl-3 ${open === p.id ? 'border-teal-500 bg-teal-50' : 'border-line bg-white'}`}>
                <button className="flex-1 text-left text-sm font-medium" onClick={() => setOpen(p.id)} aria-pressed={open === p.id}>{p.name} <span className="text-xs text-ink-faint">{p.members}</span></button>
                <button className="btn-ghost p-1.5" onClick={() => remove(p)} aria-label={`Delete pool ${p.name}`}><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
            {!pools.data.items.length && <li className="text-sm text-ink-faint">No pools yet.</li>}
          </ul>
        )}
      </div>
      <div>
        {!open ? <Empty icon={FolderOpen} title="Choose a pool">Pools help you keep promising candidates for future roles.</Empty>
          : pool.loading && !pool.data ? <Spinner /> : pool.error ? <ErrorBox error={pool.error} /> : (
            <>
              <h2 className="mb-3 text-lg font-semibold">{pool.data.pool.name}</h2>
              {pool.data.members.length ? <div className="grid gap-3 sm:grid-cols-2">{pool.data.members.map((m) => <CandidateCard key={m.candidate.id} c={m.candidate} onOpen={onOpen} extra={<button className="btn-ghost btn-sm text-rose-600" onClick={() => removeMember(m.candidate.id)}>Remove from pool</button>} />)}</div>
                : <p className="text-sm text-ink-soft">No members yet. Add candidates from search or AI recommendations.</p>}
            </>
          )}
      </div>
    </div>
  );
}

export default function Candidates() {
  const [tab, setTab] = useState('search'); const [viewing, setViewing] = useState(null);
  return (
    <div className="space-y-5">
      <PageHead title="Candidates" sub="Search job seekers who are open to employers" />
      <Tabs tabs={[['search', 'Search'], ['pools', 'Talent pools']]} value={tab} onChange={setTab} />
      {tab === 'search' ? <SearchTab onOpen={setViewing} /> : <PoolsTab onOpen={setViewing} />}
      <Profile id={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
