import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, BadgeCheck, Building2, MapPin, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { api, qs } from '../lib/api';
import { useT } from '../lib/i18n';
import { useAsync, JobCard, CompanyMark, MatchMeter } from '../components/ui';

const SAMPLE = { skills: { score: 92, weight: 45 }, education: { score: 100, weight: 15 }, experience: { score: 80, weight: 15 }, location: { score: 100, weight: 15 }, salary: { score: 60, weight: 10 } };

export default function Home() {
  const { t } = useT(); const nav = useNavigate();
  const { data } = useAsync(() => api('/public/home'), []);
  const tax = useAsync(() => api('/public/taxonomy'), []);
  const [q, setQ] = useState(''); const [city, setCity] = useState('');
  const go = (e) => { e.preventDefault(); nav(`/jobs${qs({ q, city })}`); };
  const s = data?.stats;
  return (
    <>
      {data?.banner && <div className="bg-marigold-100 px-4 py-2 text-center text-sm font-medium">{data.banner}</div>}
      <section className="relative overflow-hidden border-b border-line bg-white">
        <div className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-teal-50" aria-hidden />
        <div className="pointer-events-none absolute -right-10 top-48 h-48 w-48 rounded-full bg-marigold-50" aria-hidden />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:py-20">
          <div>
            <h1 className="text-[2.6rem] font-bold leading-[1.02] sm:text-6xl">{t('hero1')}<br /><span className="text-teal-600">{t('hero2')}</span></h1>
            <p className="mt-5 max-w-xl text-lg text-ink-soft">{t('heroSub')}</p>
            <form onSubmit={go} className="mt-8 rounded-2xl border border-line bg-paper p-2 shadow-lift" role="search">
              <div className="flex flex-col gap-2 p-2 text-lg sm:flex-row sm:flex-wrap sm:items-center">
                <span className="font-display font-medium text-ink-soft">{t('lookingFor')}</span>
                <label className="sr-only" htmlFor="hq">Job, skill or company</label>
                <input id="hq" value={q} onChange={(e) => setQ(e.target.value)} placeholder="electrician, React, accounts…" className="min-w-0 flex-1 border-b-2 border-dashed border-teal-500 bg-transparent px-1 py-1 font-display font-semibold text-ink placeholder:font-normal placeholder:text-ink-faint focus:border-solid focus:outline-none" />
                <span className="font-display font-medium text-ink-soft">{t('workIn')}</span>
                <label className="sr-only" htmlFor="hc">City</label>
                <select id="hc" value={city} onChange={(e) => setCity(e.target.value)} className="border-b-2 border-dashed border-marigold-500 bg-transparent px-1 py-1 font-display font-semibold focus:outline-none">
                  <option value="">{t('anyCity')}</option><option value="Remote">Remote</option>
                  {tax.data?.cities.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <button className="btn-primary mt-1 w-full py-3 text-base"><Search className="h-5 w-5" aria-hidden />{t('search')}</button>
            </form>
            <div className="mt-5 flex flex-wrap gap-2 text-sm">
              {['Electrician', 'Data entry', 'Nurse', 'React', 'Delivery'].map((x) => <Link key={x} to={`/jobs?q=${x}`} className="chip hover:bg-teal-50 hover:text-teal-700">{x}</Link>)}
            </div>
          </div>
          <div className="card relative p-6 shadow-lift">
            <div className="flex items-start gap-4">
              <CompanyMark name="Shakti Engineering" />
              <div className="flex-1"><p className="font-display text-lg font-semibold">Electrician (ITI)</p><p className="flex items-center gap-1 text-sm text-ink-soft">Shakti Engineering Works <BadgeCheck className="h-4 w-4 text-teal-600" /></p><p className="mt-1 flex items-center gap-1 text-sm text-ink-soft"><MapPin className="h-3.5 w-3.5" />Coimbatore · ₹1.8L–₹2.6L /yr</p></div>
              <div className="text-right"><p className="font-display text-4xl font-bold text-teal-600">89%</p><p className="text-xs text-ink-faint">{t('match')}</p></div>
            </div>
            <div className="mt-5"><MatchMeter breakdown={SAMPLE} /></div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-teal-50 p-3"><p className="font-semibold text-teal-700">Why it fits</p><p className="mt-1 text-ink-soft">Has Electrical Wiring, Safety. Same city.</p></div>
              <div className="rounded-xl bg-marigold-50 p-3"><p className="font-semibold text-marigold-700">To improve</p><p className="mt-1 text-ink-soft">Salary is 10% below your expectation.</p></div>
            </div>
            <p className="mt-4 text-xs text-ink-faint">Every job shows a breakdown like this once you add your skills.</p>
          </div>
        </div>
        {s && (
          <div className="relative border-t border-line bg-paper/60">
            <dl className="mx-auto grid max-w-7xl grid-cols-2 gap-px px-4 sm:grid-cols-4 sm:px-6">
              {[[s.activeJobs, 'live jobs'], [s.openings, 'open positions'], [s.employers, 'verified employers'], [s.states, 'states covered']].map(([v, l]) => (
                <div key={l} className="py-5"><dt className="sr-only">{l}</dt><dd className="font-display text-3xl font-bold">{v.toLocaleString('en-IN')}</dd><p className="text-sm text-ink-soft">{l}</p></div>
              ))}
            </dl>
          </div>
        )}
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="mb-6 flex items-end justify-between"><h2 className="text-3xl font-semibold">{t('latest')}</h2><Link to="/jobs" className="text-sm font-semibold text-teal-700 hover:underline">See all jobs</Link></div>
        <div className="grid gap-3 md:grid-cols-2">{data?.latest.map((j) => <JobCard key={j.id} job={j} showMatch={false} />)}</div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-[1fr_1fr]">
        <div className="card p-6">
          <h2 className="text-2xl font-semibold">{t('browse')}</h2>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {data?.sectors.map((x) => (
              <Link key={x.name} to={`/jobs?sector=${encodeURIComponent(x.name)}`} className="flex items-center justify-between rounded-xl border border-line px-4 py-3 hover:border-teal-500 hover:bg-teal-50">
                <span className="font-medium">{x.name}</span><span className="text-sm text-ink-faint">{x.jobs}</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="card p-6">
          <h2 className="text-2xl font-semibold">Hiring now</h2>
          <ul className="mt-5 divide-y divide-line">
            {data?.companies.map((c) => (
              <li key={c.id}><Link to={`/companies/${c.slug}`} className="flex items-center gap-3 py-3 hover:text-teal-700"><CompanyMark name={c.name} logo={c.logo} size={38} /><span className="flex-1"><span className="flex items-center gap-1 font-medium">{c.name}<BadgeCheck className="h-4 w-4 text-teal-600" aria-label="verified" /></span><span className="text-sm text-ink-faint">{c.industry} · {c.city}</span></span><span className="chip-teal">{c.activeJobs} jobs</span></Link></li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-4 md:grid-cols-3">
          {[[Sparkles, 'Upload a resume, skip the typing', 'Our parser reads PDF or Word resumes and fills in your skills, education and experience. You confirm what goes in.'],
            [ShieldCheck, 'Only verified employers', 'Companies are checked against GST and MCA records before they can publish. Your Aadhaar is encrypted and never shown.'],
            [Building2, 'Jobs from across India', 'Listings come from direct employers, the National Career Service and partner job portals, in one search.']].map(([I, h, p]) => (
            <div key={h} className="rounded-2xl bg-white p-6 ring-1 ring-line"><I className="h-6 w-6 text-teal-600" aria-hidden /><h3 className="mt-3 text-lg font-semibold">{h}</h3><p className="mt-1.5 text-sm text-ink-soft">{p}</p></div>
          ))}
        </div>
      </section>

      {data?.news?.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-6 flex items-end justify-between"><h2 className="text-3xl font-semibold">Sector news</h2><Link to="/news" className="text-sm font-semibold text-teal-700 hover:underline">All news</Link></div>
          <div className="grid gap-4 md:grid-cols-3">
            {data.news.map((n) => (
              <Link key={n.id} to={`/news/${n.slug}`} className="card group p-5 hover:border-teal-500">
                <span className="chip-gold">{n.category}</span><h3 className="mt-3 font-semibold leading-snug group-hover:text-teal-700">{n.title}</h3><p className="mt-2 line-clamp-2 text-sm text-ink-soft">{n.summary}</p>
                <ArrowUpRight className="mt-3 h-4 w-4 text-ink-faint" aria-hidden />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto mt-14 max-w-7xl px-4 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-4 rounded-3xl bg-ink p-8 text-white sm:flex-row sm:items-center sm:p-10">
          <div><h2 className="text-3xl font-semibold text-white">Hiring? Find matched candidates today.</h2><p className="mt-2 text-white/70">Post a job and see the best-fit candidates ranked, with strengths and gaps.</p></div>
          <Link to="/register?role=employer" className="btn-accent px-6 py-3 text-base">Post a job for free</Link>
        </div>
      </section>
    </>
  );
}
