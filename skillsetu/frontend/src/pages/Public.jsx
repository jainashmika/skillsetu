import { Link, useParams } from 'react-router-dom';
import { BadgeCheck, CheckCircle2, Globe, MapPin, Search, Sparkles, Users } from 'lucide-react';
import { api } from '../lib/api';
import { useAsync, Spinner, ErrorBox, JobCard, CompanyMark, Empty } from '../components/ui';

export function CompanyPage() {
  const { slug } = useParams(); const { data, error, loading } = useAsync(() => api(`/public/companies/${slug}`), [slug]);
  if (loading && !data) return <Spinner />;
  if (error) return <div className="mx-auto max-w-3xl p-6"><ErrorBox error={error} /></div>;
  const c = data.company;
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center gap-5">
        <CompanyMark name={c.name} logo={c.logo} size={80} />
        <div><h1 className="flex items-center gap-2 text-3xl font-semibold">{c.name}{c.verified && <BadgeCheck className="h-6 w-6 text-teal-600" aria-label="Verified employer" />}</h1>
          <p className="mt-1 flex flex-wrap gap-4 text-sm text-ink-soft"><span>{c.industry}</span>{c.city && <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{c.city}</span>}{c.size && <span className="flex items-center gap-1"><Users className="h-4 w-4" />{c.size} people</span>}{c.website && <a href={c.website} className="flex items-center gap-1 text-teal-700 hover:underline" rel="noopener noreferrer" target="_blank"><Globe className="h-4 w-4" />Website</a>}</p></div>
      </div>
      {c.about && <p className="mt-6 max-w-3xl text-ink-soft">{c.about}</p>}
      <h2 className="mt-10 text-2xl font-semibold">Open jobs ({data.jobs.length})</h2>
      <div className="mt-4 space-y-3">{data.jobs.length ? data.jobs.map((j) => <JobCard key={j.id} job={j} showMatch={false} />) : <Empty title="No open jobs right now" />}</div>
    </div>
  );
}

export function PublicProfile() {
  const { slug } = useParams(); const { data, error, loading } = useAsync(() => api(`/public/profiles/${slug}`), [slug]);
  if (loading && !data) return <Spinner />;
  if (error) return <div className="mx-auto max-w-3xl p-6"><ErrorBox error={error} /></div>;
  const p = data.profile;
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="card p-6 sm:p-8">
        <div className="flex items-center gap-4"><span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-600 font-display text-2xl font-bold text-white">{p.name[0]}</span>
          <div><h1 className="text-3xl font-semibold">{p.name}</h1><p className="text-ink-soft">{p.headline}</p><p className="mt-1 flex items-center gap-1 text-sm text-ink-faint"><MapPin className="h-4 w-4" />{p.city}, {p.state}</p></div></div>
        <div className="mt-4 flex flex-wrap gap-2">{p.verified.ekyc && <span className="chip-teal"><CheckCircle2 className="h-3.5 w-3.5" />Identity verified</span>}{p.verified.digilocker && <span className="chip-teal"><CheckCircle2 className="h-3.5 w-3.5" />Certificates verified</span>}<span className="chip">{p.educationLabel}</span><span className="chip">{p.experienceYears} yrs experience</span></div>
        {p.about && <p className="mt-6 text-ink-soft">{p.about}</p>}
        <h2 className="mt-6 text-lg font-semibold">Skills</h2><div className="mt-2 flex flex-wrap gap-2">{p.skills.map((s) => <span key={s.name} className="chip">{s.name}</span>)}</div>
        {p.experiences.length > 0 && <><h2 className="mt-6 text-lg font-semibold">Experience</h2><ul className="mt-2 space-y-2">{p.experiences.map((e, i) => <li key={i}><p className="font-medium">{e.title}</p><p className="text-sm text-ink-soft">{e.company} · {e.start?.slice(0, 4)}–{e.current ? 'present' : e.end?.slice(0, 4)}</p></li>)}</ul></>}
        {p.educations.length > 0 && <><h2 className="mt-6 text-lg font-semibold">Education</h2><ul className="mt-2 space-y-2">{p.educations.map((e, i) => <li key={i} className="flex items-center gap-2"><span className="font-medium">{e.qualification}</span><span className="text-sm text-ink-soft">{e.institution} {e.year}</span>{e.verified && <CheckCircle2 className="h-4 w-4 text-teal-600" aria-label="verified" />}</li>)}</ul></>}
      </div>
    </div>
  );
}

export function Employers() {
  return (
    <div>
      <section className="border-b border-line bg-white">
        <div className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6">
          <h1 className="text-4xl font-bold sm:text-5xl">Hire for skills, not just résumés.</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-ink-soft">Post a job once and SkillSetu ranks candidates by how well they fit, showing strengths and gaps so you shortlist faster.</p>
          <div className="mt-8 flex justify-center gap-3"><Link to="/register?role=employer" className="btn-primary px-6 py-3 text-base">Post a job for free</Link><Link to="/login" className="btn-outline px-6 py-3 text-base">Sign in</Link></div>
        </div>
      </section>
      <section className="mx-auto grid max-w-5xl gap-4 px-4 py-14 sm:px-6 md:grid-cols-3">
        {[[BadgeCheck, 'Get verified in minutes', 'Enter your GSTIN. We check it with government records and give you the Verified employer badge.'], [Sparkles, 'AI-ranked candidates', 'See the top matches for every job, with a breakdown by skills, education, experience, location and salary.'], [Search, 'Search the talent pool', 'Filter by minimum qualification and experience, save candidates to talent pools and invite them to apply.']].map(([I, h, p]) => (
          <div key={h} className="card p-6"><I className="h-6 w-6 text-teal-600" aria-hidden /><h2 className="mt-3 text-lg font-semibold">{h}</h2><p className="mt-1.5 text-sm text-ink-soft">{p}</p></div>))}
      </section>
      <section className="mx-auto max-w-5xl px-4 sm:px-6"><div className="rounded-3xl bg-teal-50 p-8"><h2 className="text-2xl font-semibold">Run a job portal?</h2><p className="mt-2 text-ink-soft">Push your listings to SkillSetu through our REST API with OAuth 2.0, idempotent writes and a sandbox. <a href="/api/docs" className="font-semibold text-teal-700 underline">Read the API docs</a> or <Link to="/register?role=portal" className="font-semibold text-teal-700 underline">register your portal</Link>.</p></div></section>
    </div>
  );
}
