// Public (guest-accessible) APIs: home page, job search & detail, company and profile pages,
// taxonomy for forms, news and the help centre (SRS 3.2.2, 3.7, 4.1 Guest User).
const express = require('express');
const { z } = require('zod');
const { one, all, run, json } = require('../db');
const { E, ah } = require('../utils/errors');
const taxonomy = require('../services/taxonomy');
const engine = require('../services/matching/engine');
const searchIndex = require('../services/matching/searchIndex');
const jobsSvc = require('../services/jobs');
const { track } = require('../services/events');
const { jobCard, companyCard, seekerFull } = require('../services/serialize');
const settings = require('../services/settings');

const r = express.Router();

r.get('/health', async (_req, res) => res.json({ status: 'ok', time: new Date().toISOString(), db: (await one('SELECT 1 ok')).ok === 1 }));

r.get('/taxonomy', (_req, res) => res.json({
  skills: taxonomy.skills().map(({ id, name, category }) => ({ id, name, category })),
  sectors: taxonomy.sectors().map((s) => s.name),
  occupations: taxonomy.occupations().map(({ id, title, sector, nco_code: nco }) => ({ id, title, sector, nco })),
  educationLevels: taxonomy.EDU_LEVELS, states: taxonomy.STATES, cities: Object.keys(taxonomy.CITIES).sort(),
}));

r.get('/home', async (_req, res) => {
  const latest = engine.loadJobs("j.status='active' ORDER BY j.published_at DESC LIMIT 8");
  const sectors = await all("SELECT sector name, COUNT(*) jobs FROM jobs WHERE status='active' AND sector IS NOT NULL GROUP BY sector ORDER BY jobs DESC LIMIT 8");
  const cities = await all("SELECT city name, COUNT(*) jobs FROM jobs WHERE status='active' AND city IS NOT NULL GROUP BY city ORDER BY jobs DESC LIMIT 8");
  const companies = await all(`SELECT c.*, COUNT(j.id) jobs FROM companies c JOIN jobs j ON j.company_id=c.id AND j.status='active' WHERE c.verification_status='verified' GROUP BY c.id ORDER BY jobs DESC LIMIT 6`);
  const news = await all("SELECT id, title, slug, summary, category, published_at FROM news WHERE status='published' ORDER BY published_at DESC LIMIT 3");
  res.json({
    stats: {
      activeJobs: (await one("SELECT COUNT(*) c FROM jobs WHERE status='active'")).c,
      openings: (await one("SELECT COALESCE(SUM(openings),0) c FROM jobs WHERE status='active'")).c,
      employers: (await one("SELECT COUNT(*) c FROM companies WHERE verification_status='verified'")).c,
      seekers: (await one("SELECT COUNT(*) c FROM users WHERE role='seeker' AND status='active'")).c,
      hires: (await one("SELECT COUNT(*) c FROM applications WHERE status='hired'")).c,
      states: (await one("SELECT COUNT(DISTINCT state) c FROM jobs WHERE status='active'")).c,
    },
    latest: latest.map((j) => jobCard(j)), sectors, cities,
    companies: companies.map((c) => ({ ...companyCard(c), activeJobs: c.jobs })), news,
    banner: settings.get('maintenance_banner') || null,
  });
});

const searchQ = z.object({
  q: z.string().max(120).optional(), city: z.string().max(60).optional(), state: z.string().max(60).optional(),
  workFormat: z.enum(['onsite', 'remote', 'hybrid']).optional(), contractType: z.enum(['full_time', 'part_time', 'contract', 'internship', 'apprenticeship']).optional(),
  sector: z.string().max(80).optional(), ctcMin: z.coerce.number().optional(), expMax: z.coerce.number().optional(), eduMax: z.coerce.number().optional(),
  skills: z.union([z.string(), z.array(z.string())]).optional(), postedWithin: z.coerce.number().optional(), source: z.enum(['direct', 'portal']).optional(),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(15), sort: z.enum(['relevance', 'newest', 'salary', 'match']).default('relevance'),
});
r.get('/jobs', ah(async (req, res) => {
  const q = searchQ.parse(req.query);
  const skills = q.skills ? (Array.isArray(q.skills) ? q.skills : q.skills.split(',')).filter(Boolean) : [];
  const isSeeker = req.user?.role === 'seeker';
  const me = isSeeker ? engine.loadSeeker(req.user.id) : null;
  let result;
  if (q.sort === 'match' && me) {
    const all = searchIndex.search({ ...q, skills, page: 1, pageSize: 1000 });
    const ctx = { };
    const scored = all.items.map((x) => ({ ...x, m: engine.scorePair(me, x.job, ctx) })).sort((a, b) => b.m.score - a.m.score);
    result = { ...all, items: scored.slice((q.page - 1) * q.pageSize, q.page * q.pageSize), page: q.page, pageSize: q.pageSize };
  } else result = searchIndex.search({ ...q, skills });
  const saved = isSeeker ? new Set((await all('SELECT job_id FROM saved_jobs WHERE user_id=?', req.user.id)).map((x) => x.job_id)) : new Set();
  const applied = isSeeker ? new Set((await all('SELECT job_id FROM applications WHERE seeker_id=?', req.user.id)).map((x) => x.job_id)) : new Set();
  const items = result.items.map(({ job, m }) => {
    const extra = { saved: saved.has(job.id), applied: applied.has(job.id) };
    if (me) { const mm = m || engine.scorePair(me, job); extra.match = { score: mm.score, aboveThreshold: mm.aboveThreshold }; }
    return jobCard(job, extra);
  });
  track({ userId: req.user?.id, guestId: req.guestId, role: req.user?.role || null, event: 'search', meta: { q: q.q || '', city: q.city, results: result.total } });
  res.json({ total: result.total, page: result.page, pageSize: result.pageSize, items, facets: result.facets, tookMs: result.tookMs, expandedTerms: result.expandedTerms });
}));

r.get('/jobs/:id', ah(async (req, res) => {
  const j = jobsSvc.get(req.params.id);
  const isOwner = req.user?.role === 'employer' && j && j.company_id === req.user.companyId;
  if (!j || (!['active', 'expired', 'paused'].includes(j.status) && !isOwner && req.user?.role !== 'admin')) throw E.notFound('Job');
  const loginRequired = j.visibility === 'registered' && !req.user;
  if (!isOwner) { await run('UPDATE jobs SET views=views+1 WHERE id=?', j.id); track({ userId: req.user?.id, guestId: req.guestId, role: req.user?.role || null, event: 'view_job', jobId: j.id }); }
  const out = { job: { ...jobCard(j), description: loginRequired ? `${j.description.slice(0, 280)}…` : j.description, educationLabel: j.education_label, views: j.views, visibility: j.visibility,
    company: { name: j.company_display, slug: j.company_slug, about: j.company_about, website: j.company_website, industry: j.company_industry, logo: j.logo_url, verified: j.company_verification === 'verified' } },
  jsonLd: jobsSvc.jsonLd(j), loginRequired, accepting: j.status === 'active' };
  if (req.user?.role === 'seeker') {
    const me = engine.loadSeeker(req.user.id);
    const ej = engine.loadJobs('j.id = ?', [j.id])[0];
    out.match = engine.scorePair(me, ej);
    out.saved = !!(await one('SELECT 1 FROM saved_jobs WHERE user_id=? AND job_id=?', req.user.id, j.id));
    const a = await one('SELECT id, status, created_at FROM applications WHERE seeker_id=? AND job_id=?', req.user.id, j.id);
    out.application = a || null;
  }
  // Similar jobs: TF-IDF neighbours in the job vector space
  const st = engine.ensureIndex(); const v = st.jobs.get(j.id)?.vector;
  if (v) {
    const { cosine } = require('../services/matching/vectorizer');
    out.similar = [...st.jobs.values()].filter((x) => x.id !== j.id).map((x) => ({ x, s: cosine(v, x.vector) })).sort((a, b) => b.s - a.s).slice(0, 4).map(({ x }) => jobCard(x));
  } else out.similar = [];
  res.json(out);
}));

r.get('/companies/:slug', async (req, res) => {
  const c = await one('SELECT * FROM companies WHERE slug=?', req.params.slug); if (!c) throw E.notFound('Company');
  const jobs = engine.loadJobs("j.company_id = ? AND j.status='active' ORDER BY j.published_at DESC", [c.id]).map((j) => jobCard(j));
  res.json({ company: companyCard(c), jobs });
});

r.get('/profiles/:slug', async (req, res) => {
  const p0 = await one('SELECT user_id, visibility FROM seeker_profiles WHERE slug=?', req.params.slug);
  if (!p0) throw E.notFound('Profile');
  const canSee = p0.visibility === 'public' || (p0.visibility === 'employers' && ['employer', 'admin'].includes(req.user?.role)) || req.user?.id === p0.user_id;
  if (!canSee) throw E.forbidden('This profile is private.');
  const f = seekerFull(engine.loadSeeker(p0.user_id));
  res.json({ profile: { name: f.name, headline: f.headline, about: f.about, city: f.city, state: f.state, educationLabel: f.educationLabel, experienceYears: f.experienceYears, skills: f.skills.map((s) => ({ name: s.name, level: s.level })), languages: f.languages,
    educations: f.educations.map(({ qualification, field, institution, year, verified }) => ({ qualification, field, institution, year, verified: !!verified })),
    experiences: f.experiences.map(({ title, company, start_date: s, end_date: e, current }) => ({ title, company, start: s, end: e, current: !!current })),
    verified: { ekyc: f.ekycVerified, digilocker: f.digilockerVerified }, slug: f.slug } });
});

// ---- Content: news (targeted to profile tags) and help centre ----
r.get('/news', async (req, res) => {
  let items = (await all("SELECT id, title, slug, summary, category, tags, published_at FROM news WHERE status='published' ORDER BY published_at DESC LIMIT 50")).map((n) => ({ ...n, tags: json(n.tags, []) }));
  if (req.user?.role === 'seeker') {
    const me = engine.loadSeeker(req.user.id);
    const mine = new Set([...me.skills.map((s) => taxonomy.skillById(s.id)?.name), ...me.sectors, me.state].filter(Boolean).map((x) => x.toLowerCase()));
    items = items.map((n) => ({ ...n, relevant: n.tags.some((t) => mine.has(String(t).toLowerCase())) })).sort((a, b) => b.relevant - a.relevant);
  }
  if (req.query.category) items = items.filter((n) => n.category === req.query.category);
  res.json({ items });
});
r.get('/news/:slug', async (req, res) => {
  const n = await one("SELECT * FROM news WHERE slug=? AND status='published'", req.params.slug); if (!n) throw E.notFound('Article');
  res.json({ article: { ...n, tags: json(n.tags, []) } });
});
r.get('/faqs', async (req, res) => {
  const q = String(req.query.q || '').trim(); const cat = req.query.category; const ctx = req.query.context;
  let items;
  if (q) {
    const fts = q.replace(/["*^():]/g, ' ').split(/\s+/).filter(Boolean).map((t) => `"${t}"*`).join(' OR ');
    items = await all(`SELECT f.*, snippet(faqs_fts, 1, '<mark>', '</mark>', '…', 18) snippet, bm25(faqs_fts) rank FROM faqs_fts JOIN faqs f ON f.id=faqs_fts.rowid WHERE faqs_fts MATCH ? ORDER BY rank LIMIT 30`, fts);
  } else items = await all('SELECT * FROM faqs ORDER BY category, id');
  if (cat) items = items.filter((f) => f.category === cat);
  if (ctx) items = items.filter((f) => (f.context || '').split(',').includes(ctx));
  res.json({ items, categories: await all('SELECT category, COUNT(*) c FROM faqs GROUP BY category ORDER BY category') });
});

module.exports = r;
