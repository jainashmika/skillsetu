import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BadgeCheck, Bookmark, BookmarkCheck, Briefcase, Calendar, GraduationCap, IndianRupee, MapPin, Users } from 'lucide-react';
import { api, ctc, LABEL } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAsync, Spinner, ErrorBox, MatchMeter, MatchRing, CompanyMark, JobCard, Modal, useToast } from '../components/ui';

export default function JobDetail() {
  const { id } = useParams(); const { user } = useAuth(); const toast = useToast(); const nav = useNavigate();
  const { data, error, loading, reload, setData } = useAsync(() => api(`/public/jobs/${id}`), [id]);
  const [applyOpen, setApplyOpen] = useState(false); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!data?.jsonLd) return undefined;
    const s = document.createElement('script'); s.type = 'application/ld+json'; s.text = JSON.stringify(data.jsonLd); document.head.appendChild(s);
    document.title = `${data.job.title} · ${data.job.company.name} · SkillSetu`;
    return () => { s.remove(); document.title = 'SkillSetu · Jobs that fit your skills'; };
  }, [data]);
  if (loading && !data) return <Spinner />;
  if (error) return <div className="mx-auto max-w-3xl p-6"><ErrorBox error={error} /></div>;
  const { job, match } = data;
  const apply = async () => {
    setBusy(true);
    try { const r = await api('/seeker/applications', { method: 'POST', body: { jobId: job.id, coverNote: note || undefined } }); toast(`Application sent with a ${Math.round(r.matchScore)}% match.`); setApplyOpen(false); reload(); }
    catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const save = async () => {
    try { await api(`/seeker/saved-jobs/${job.id}`, { method: data.saved ? 'DELETE' : 'POST' }); setData((d) => ({ ...d, saved: !d.saved })); toast(data.saved ? 'Removed from saved jobs' : 'Saved to your interested list'); } catch (e) { toast(e.message, 'error'); }
  };
  const onApply = () => { if (!user) return nav(`/login?next=/jobs/${job.id}`); if (user.role !== 'seeker') return toast('Only job seeker accounts can apply.', 'error'); setApplyOpen(true); };
  const facts = [[MapPin, job.workFormat === 'remote' ? 'Remote (India)' : `${job.city}, ${job.state}${job.workFormat === 'hybrid' ? ' · Hybrid' : ''}`], [IndianRupee, ctc(job.ctcMin, job.ctcMax)], [Briefcase, `${LABEL[job.contractType]} · ${job.experienceMin ? `${job.experienceMin}${job.experienceMax ? `–${job.experienceMax}` : '+'} yrs` : 'Freshers welcome'}`],
    [GraduationCap, job.educationLabel], [Users, `${job.openings} opening${job.openings > 1 ? 's' : ''}`], [Calendar, job.deadline ? `Apply by ${new Date(job.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Open']];
  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_340px]">
      <article>
        <nav className="mb-4 text-sm text-ink-faint" aria-label="Breadcrumb"><Link to="/jobs" className="hover:text-ink">Jobs</Link> / {job.sector || 'Job'}</nav>
        <div className="flex items-start gap-4">
          <CompanyMark name={job.company.name} logo={job.company.logo} size={60} />
          <div><h1 className="text-3xl font-semibold leading-tight sm:text-4xl">{job.title}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-ink-soft">{job.company.slug ? <Link to={`/companies/${job.company.slug}`} className="font-medium hover:text-teal-700">{job.company.name}</Link> : job.company.name}{job.company.verified && <span className="chip-teal"><BadgeCheck className="h-3.5 w-3.5" />Verified employer</span>}</p></div>
        </div>
        <dl className="mt-6 grid gap-3 rounded-2xl bg-white p-5 ring-1 ring-line sm:grid-cols-2">
          {facts.map(([I, v], i) => <div key={i} className="flex items-center gap-2.5 text-sm"><I className="h-4 w-4 shrink-0 text-teal-600" aria-hidden /><dd>{v}</dd></div>)}
        </dl>
        {!data.accepting && <p className="mt-4 rounded-xl bg-marigold-50 p-3 text-sm text-marigold-700">This job is no longer accepting applications.</p>}
        <section className="mt-8"><h2 className="text-xl font-semibold">About the role</h2><p className="mt-3 whitespace-pre-line text-ink-soft">{job.description}</p>
          {data.loginRequired && <p className="mt-3 text-sm"><Link to="/login" className="font-semibold text-teal-700 underline">Sign in</Link> to read the full description.</p>}</section>
        <section className="mt-8"><h2 className="text-xl font-semibold">Skills</h2>
          <div className="mt-3 flex flex-wrap gap-2">{job.skills.map((s) => {
            const have = match?.breakdown.skills.matched.includes(s.name);
            return <span key={s.id} className={have ? 'chip-teal' : s.required ? 'chip bg-white ring-1 ring-line' : 'chip'}>{s.name}{!s.required && <span className="text-ink-faint">· nice to have</span>}</span>; })}</div></section>
        {job.company.about && <section className="mt-8"><h2 className="text-xl font-semibold">About {job.company.name}</h2><p className="mt-3 text-ink-soft">{job.company.about}</p></section>}
        {data.similar?.length > 0 && <section className="mt-10"><h2 className="mb-3 text-xl font-semibold">Similar jobs</h2><div className="grid gap-3">{data.similar.map((j) => <JobCard key={j.id} job={j} showMatch={false} />)}</div></section>}
      </article>
      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="card p-5">
          {match ? (<>
            <div className="flex items-center gap-4"><MatchRing score={match.score} size={72} /><div><p className="font-display text-lg font-semibold">{match.score >= 75 ? 'Strong match' : match.score >= 55 ? 'Good match' : 'Partial match'}</p><p className="text-xs text-ink-faint">Confidence {Math.round(match.confidence * 100)}%</p></div></div>
            <div className="mt-4"><MatchMeter breakdown={match.breakdown} /></div>
            {match.strengths.length > 0 && <div className="mt-4"><p className="text-sm font-semibold text-teal-700">Why it fits</p><ul className="mt-1 list-disc pl-5 text-sm text-ink-soft">{match.strengths.map((s) => <li key={s}>{s}</li>)}</ul></div>}
            {match.gaps.length > 0 && <div className="mt-3"><p className="text-sm font-semibold text-marigold-700">Gaps</p><ul className="mt-1 list-disc pl-5 text-sm text-ink-soft">{match.gaps.map((s) => <li key={s}>{s}</li>)}</ul></div>}
          </>) : <p className="text-sm text-ink-soft">{user ? 'Match scores are shown to job seekers.' : <><Link to="/register" className="font-semibold text-teal-700 underline">Create a profile</Link> to see how well you match.</>}</p>}
          <div className="mt-5 flex gap-2">
            {data.application ? <Link to="/seeker/applications" className="btn-outline flex-1">Applied · {LABEL[data.application.status]}</Link>
              : <button className="btn-primary flex-1 py-3" disabled={!data.accepting} onClick={onApply}>Apply now</button>}
            {user?.role === 'seeker' && <button className="btn-outline px-3" onClick={save} aria-label={data.saved ? 'Remove from saved' : 'Save job'}>{data.saved ? <BookmarkCheck className="h-5 w-5 text-teal-600" /> : <Bookmark className="h-5 w-5" />}</button>}
          </div>
        </div>
        <p className="px-1 text-xs text-ink-faint">{job.views} views · Job ID {job.id}{job.source !== 'direct' && ` · Synced from ${job.source.replace('portal:', '')}`}</p>
      </aside>
      <Modal open={applyOpen} onClose={() => setApplyOpen(false)} title={`Apply for ${job.title}`}>
        <p className="text-sm text-ink-soft">Your profile, skills and resume will be shared with {job.company.name}.</p>
        <label htmlFor="note" className="label mt-4">Note to the employer (optional)</label>
        <textarea id="note" rows={4} className="input" maxLength={1500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why are you interested in this role?" />
        <div className="mt-5 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setApplyOpen(false)}>Cancel</button><button className="btn-primary" disabled={busy} onClick={apply}>{busy ? 'Sending…' : 'Send application'}</button></div>
      </Modal>
    </div>
  );
}
