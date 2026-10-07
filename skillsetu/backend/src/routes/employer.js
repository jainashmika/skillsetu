// Employer APIs (SRS 3.1.2, 3.2, 3.3.3, 4.1): company profile & government verification, HR team,
// job postings with lifecycle, applicant pipeline, AI candidate recommendations and talent pools.
const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { one, all, run, db } = require('../db');
const { E, ah } = require('../utils/errors');
const { requireRole } = require('../middleware/auth');
const { uploader, store } = require('../middleware/upload');
const { encrypt, hmac, maskPhone, randomToken } = require('../utils/crypto');
const taxonomy = require('../services/taxonomy');
const engine = require('../services/matching/engine');
const jobsSvc = require('../services/jobs');
const gov = require('../services/integrations/gov');
const notify = require('../services/notify');
const settings = require('../services/settings');
const { audit } = require('../services/audit');
const { track } = require('../services/events');
const { jobCard, candidateView, companyCard } = require('../services/serialize');
const { normPhone } = require('./auth');

const r = express.Router();
r.use(requireRole('employer'));

const company = (req) => one('SELECT * FROM companies WHERE id=?', req.user.companyId);
function ownJob(req, id) {
  const j = one('SELECT * FROM jobs WHERE id=? AND company_id=?', id, req.user.companyId);
  if (!j) throw E.notFound('Job');
  return j;
}
const companyOut = (c) => ({ ...companyCard(c), gstin: c.gstin, cin: c.cin, verificationStatus: c.verification_status, verificationNotes: c.verification_notes, verifiedAt: c.verified_at,
  documents: all('SELECT id, name, created_at FROM company_documents WHERE company_id=?', c.id) });

r.get('/dashboard', (req, res) => {
  const cid = req.user.companyId;
  const jobs = Object.fromEntries(all('SELECT status, COUNT(*) c FROM jobs WHERE company_id=? GROUP BY status', cid).map((x) => [x.status, x.c]));
  const apps = Object.fromEntries(all('SELECT a.status, COUNT(*) c FROM applications a JOIN jobs j ON j.id=a.job_id WHERE j.company_id=? GROUP BY a.status', cid).map((x) => [x.status, x.c]));
  const recent = all(`SELECT a.id, a.status, a.match_score, a.created_at, u.name, j.title, j.id job_id FROM applications a JOIN jobs j ON j.id=a.job_id JOIN users u ON u.id=a.seeker_id WHERE j.company_id=? ORDER BY a.id DESC LIMIT 6`, cid);
  const perJob = all(`SELECT j.id, j.title, j.status, j.views, j.deadline, COUNT(a.id) applicants, ROUND(AVG(a.match_score),1) avgMatch, SUM(a.status='shortlisted' OR a.status='interview') shortlisted
                      FROM jobs j LEFT JOIN applications a ON a.job_id=j.id WHERE j.company_id=? AND j.status IN ('active','paused') GROUP BY j.id ORDER BY j.published_at DESC LIMIT 8`, cid);
  const weekly = all(`SELECT date(a.created_at) day, COUNT(*) c FROM applications a JOIN jobs j ON j.id=a.job_id WHERE j.company_id=? AND a.created_at > datetime('now','-30 days') GROUP BY day ORDER BY day`, cid);
  const c = company(req);
  res.json({ company: { name: c.name, verificationStatus: c.verification_status, logo: c.logo_url, slug: c.slug }, jobs, applications: apps,
    totals: { jobs: Object.values(jobs).reduce((a, b) => a + b, 0), applicants: Object.values(apps).reduce((a, b) => a + b, 0), views: one('SELECT COALESCE(SUM(views),0) c FROM jobs WHERE company_id=?', cid).c, hires: apps.hired || 0 },
    recent, perJob, weekly });
});

// ---- Company profile & verification ----
r.get('/company', (req, res) => res.json({ company: companyOut(company(req)) }));
r.put('/company', ah(async (req, res) => {
  const d = z.object({ name: z.string().trim().min(2).max(120), industry: z.string().max(80).optional().nullable(), size: z.enum(['1-10', '11-50', '51-200', '201-1000', '1000+']).optional().nullable(),
    website: z.string().trim().url('Enter a full website URL (https://...)').optional().nullable().or(z.literal('')), about: z.string().max(3000).optional().nullable(), city: z.string().max(60).optional().nullable(), state: z.string().max(60).optional().nullable() }).parse(req.body);
  if (req.user.companyRole !== 'owner') throw E.forbidden('Only the company owner can edit the company profile.');
  const city = taxonomy.normCity(d.city);
  run('UPDATE companies SET name=?, industry=?, size=?, website=?, about=?, city=?, state=? WHERE id=?', d.name, d.industry || null, d.size || null, d.website || null, d.about || null, city, d.state || taxonomy.stateOf(city), req.user.companyId);
  audit(req, 'company.update', 'company', req.user.companyId);
  res.json({ company: companyOut(company(req)) });
}));
r.post('/company/logo', uploader('image'), ah(async (req, res) => {
  if (!req.file) throw E.bad('Choose an image.');
  run('UPDATE companies SET logo_url=? WHERE id=?', store(req.file, 'public'), req.user.companyId);
  res.json({ company: companyOut(company(req)) });
}));
r.post('/company/documents', uploader('document'), ah(async (req, res) => {
  if (!req.file) throw E.bad('Choose a document.');
  run('INSERT INTO company_documents(company_id, name, path) VALUES(?,?,?)', req.user.companyId, (req.body.name || req.file.originalname).slice(0, 120), store(req.file, 'private'));
  res.json({ company: companyOut(company(req)) });
}));

r.post('/company/verify', ah(async (req, res) => {
  const d = z.object({ gstin: z.string().trim().toUpperCase(), cin: z.string().trim().toUpperCase().optional().or(z.literal('')) }).parse(req.body);
  const g = gov.validateGstin(d.gstin); if (!g.valid) throw E.bad(g.reason, { field: 'gstin' });
  if (d.cin) { const c = gov.validateCin(d.cin); if (!c.valid) throw E.bad(c.reason, { field: 'cin' }); }
  const cid = req.user.companyId;
  run("UPDATE companies SET gstin=?, cin=?, verification_status='pending' WHERE id=?", g.gstin, d.cin || null, cid);
  let status = 'verified'; let note = null; const checks = {};
  try {
    checks.gst = await gov.gstLookup(g.gstin);
    if (!checks.gst.found) { status = 'rejected'; note = 'GSTIN not found in GSTN records.'; }
    if (d.cin && status === 'verified') { checks.mca = await gov.mcaLookup(d.cin); if (!checks.mca.found) { status = 'rejected'; note = 'CIN not found in MCA21 records.'; } }
  } catch (e) {
    // Network edge cases: fall back to manual review by the Ministry/administrators.
    status = 'manual_review'; note = 'Government records could not be reached automatically. Our team will verify your documents manually within 2 working days.';
  }
  const state = checks.gst?.state || null;
  run(`UPDATE companies SET verification_status=?, verification_notes=?, verified_at=CASE WHEN ?='verified' THEN datetime('now') ELSE NULL END, state=COALESCE(state, ?) WHERE id=?`, status, note, status, state, cid);
  audit(req, 'company.verification', 'company', cid, { status, gstAttempts: checks.gst?._meta?.attempts, mcaAttempts: checks.mca?._meta?.attempts });
  if (status === 'manual_review') for (const a of all("SELECT id FROM users WHERE role='admin'")) notify.inApp(a.id, { type: 'verification', title: 'Employer needs manual verification', body: company(req).name, link: '/admin/employers' });
  res.json({ status, note, checks: { gst: checks.gst || null, mca: checks.mca || null }, company: companyOut(company(req)) });
}));

// ---- HR team (multiple HR users per verified company) ----
r.get('/team', (req, res) => res.json({ items: all(`SELECT u.id, u.name, u.email, u.phone_masked phone, u.status, u.last_login_at, eu.company_role role FROM employer_users eu JOIN users u ON u.id=eu.user_id WHERE eu.company_id=? ORDER BY eu.company_role DESC, u.name`, req.user.companyId) }));
r.post('/team', ah(async (req, res) => {
  if (req.user.companyRole !== 'owner') throw E.forbidden('Only the company owner can add HR users.');
  const d = z.object({ name: z.string().trim().min(2).max(80), email: z.string().trim().toLowerCase().email(), phone: z.string() }).parse(req.body);
  const phone = normPhone(d.phone);
  if (one('SELECT 1 FROM users WHERE email=?', d.email)) throw E.conflict('A user with this email already exists.');
  if (one('SELECT 1 FROM users WHERE phone_hash=?', hmac(phone))) throw E.conflict('This mobile number is already registered.');
  const temp = `Ss@${randomToken(6)}9`;
  const id = db.transaction(() => {
    const x = run("INSERT INTO users(role,name,email,phone_hash,phone_enc,phone_masked,password_hash,status,phone_verified,password_changed_at) VALUES('employer',?,?,?,?,?,?,'active',1,'2000-01-01')",
      d.name, d.email, hmac(phone), encrypt(phone), maskPhone(phone), bcrypt.hashSync(temp, 10));
    const uid = Number(x.lastInsertRowid);
    run("INSERT INTO employer_users(user_id, company_id, company_role) VALUES(?,?,'hr')", uid, req.user.companyId);
    run('INSERT INTO notification_prefs(user_id) VALUES(?)', uid);
    return uid;
  })();
  notify.email(id, 'generic', { title: `You were added to ${company(req).name} on SkillSetu`, body: `Sign in with ${d.email} and the temporary password shared by your administrator. You will be asked to change it.` }, { critical: true });
  audit(req, 'company.team_add', 'user', id);
  res.status(201).json({ id, temporaryPassword: temp, message: 'HR user added. Share the temporary password securely; they must change it at first sign-in.' });
}));
r.delete('/team/:userId', ah(async (req, res) => {
  if (req.user.companyRole !== 'owner') throw E.forbidden('Only the company owner can remove HR users.');
  const m = one("SELECT * FROM employer_users WHERE user_id=? AND company_id=? AND company_role='hr'", req.params.userId, req.user.companyId); if (!m) throw E.notFound('Team member');
  run("UPDATE users SET status='banned' WHERE id=?", m.user_id); run('DELETE FROM employer_users WHERE user_id=?', m.user_id);
  audit(req, 'company.team_remove', 'user', m.user_id); res.json({ ok: true });
}));

// ---- Jobs ----
r.get('/jobs', (req, res) => {
  const st = req.query.status;
  const rows = all(`SELECT j.*, (SELECT COUNT(*) FROM applications a WHERE a.job_id=j.id) applicants, (SELECT COUNT(*) FROM applications a WHERE a.job_id=j.id AND a.status='applied') unreviewed
                    FROM jobs j WHERE j.company_id=? ${st ? 'AND j.status=?' : ''} ORDER BY j.updated_at DESC`, ...(st ? [req.user.companyId, st] : [req.user.companyId]));
  res.json({ items: rows.map((j) => ({ ...jobCard({ ...j, skills: all('SELECT s.id, s.name, js.required FROM job_skills js JOIN skills s ON s.id=js.skill_id WHERE js.job_id=?', j.id) }), applicants: j.applicants, unreviewed: j.unreviewed, views: j.views, updatedAt: j.updated_at, allowed: jobsSvc.TRANSITIONS[j.status] })) });
});
r.post('/jobs', ah(async (req, res) => {
  const publish = req.body.publish === true;
  const c = company(req);
  if (publish && c.verification_status !== 'verified') throw E.forbidden('Verify your company (GSTIN) before publishing jobs. You can save this job as a draft.');
  const { job, unknownSkills } = jobsSvc.save(req.body, { companyId: req.user.companyId, postedBy: req.user.id, status: publish ? 'active' : undefined });
  audit(req, 'job.create', 'job', job.id, { publish });
  track({ userId: req.user.id, role: 'employer', event: 'post_job', jobId: job.id });
  res.status(201).json({ job: { ...jobCard(job), description: job.description, allowed: jobsSvc.TRANSITIONS[job.status] }, unknownSkills });
}));
r.get('/jobs/:id', (req, res) => {
  ownJob(req, req.params.id);
  const j = jobsSvc.get(req.params.id);
  const history = all('SELECT h.*, u.name actor FROM job_status_history h LEFT JOIN users u ON u.id=h.actor_id WHERE job_id=? ORDER BY h.id DESC', j.id);
  res.json({ job: { ...jobCard(j), description: j.description, occupationId: j.occupation_id, visibility: j.visibility, views: j.views, allowed: jobsSvc.TRANSITIONS[j.status] }, history, jsonLd: jobsSvc.jsonLd(j) });
});
r.put('/jobs/:id', ah(async (req, res) => {
  const j = ownJob(req, req.params.id);
  if (j.status === 'archived') throw E.bad('Archived jobs cannot be edited. Duplicate it to post again.');
  const { job, unknownSkills } = jobsSvc.save(req.body, { id: j.id, companyId: req.user.companyId, postedBy: req.user.id });
  run("INSERT INTO job_status_history(job_id, from_status, to_status, actor_id, reason) VALUES(?,?,?,?, 'Details edited')", j.id, j.status, j.status, req.user.id);
  audit(req, 'job.update', 'job', j.id);
  res.json({ job: { ...jobCard(job), description: job.description, allowed: jobsSvc.TRANSITIONS[job.status] }, unknownSkills });
}));
r.post('/jobs/:id/status', ah(async (req, res) => {
  const { status, reason } = z.object({ status: z.enum(['active', 'paused', 'archived']), reason: z.string().max(200).optional() }).parse(req.body);
  ownJob(req, req.params.id);
  if (status === 'active' && company(req).verification_status !== 'verified') throw E.forbidden('Verify your company before publishing jobs.');
  const job = jobsSvc.transition(Number(req.params.id), status, { actorId: req.user.id, reason });
  audit(req, `job.${status}`, 'job', job.id, { reason });
  res.json({ job: { ...jobCard(job), allowed: jobsSvc.TRANSITIONS[job.status] } });
}));
r.post('/jobs/:id/deadline', ah(async (req, res) => {
  const { deadline } = z.object({ deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(req.body);
  const j = ownJob(req, req.params.id);
  if (deadline < new Date().toISOString().slice(0, 10)) throw E.bad('The new deadline must be today or later.');
  run("UPDATE jobs SET deadline=?, updated_at=datetime('now') WHERE id=?", deadline, j.id);
  run('INSERT INTO job_status_history(job_id, from_status, to_status, actor_id, reason) VALUES(?,?,?,?,?)', j.id, j.status, j.status, req.user.id, `Deadline extended to ${deadline}`);
  let job = jobsSvc.get(j.id);
  if (j.status === 'expired') job = jobsSvc.transition(j.id, 'active', { actorId: req.user.id, reason: 'Reactivated after deadline extension' });
  engine.invalidate();
  res.json({ job: { ...jobCard(job), allowed: jobsSvc.TRANSITIONS[job.status] } });
}));
r.post('/jobs/:id/duplicate', ah(async (req, res) => {
  ownJob(req, req.params.id);
  const j = jobsSvc.get(req.params.id);
  const { job } = jobsSvc.save({ ...j, title: `${j.title} (copy)`, deadline: null, skills: j.skills.map((s) => ({ id: s.id, required: s.required })) }, { companyId: req.user.companyId, postedBy: req.user.id });
  res.status(201).json({ job: jobCard(job) });
}));

// ---- Applicant pipeline ----
const PIPE = { applied: ['shortlisted', 'rejected'], shortlisted: ['interview', 'rejected'], interview: ['offered', 'rejected'], offered: ['hired', 'rejected'], hired: [], rejected: ['shortlisted'], withdrawn: [] };
r.get('/jobs/:id/applicants', (req, res) => {
  const j = ownJob(req, req.params.id);
  const ej = engine.loadJobs('j.id = ?', [j.id])[0];
  const rows = all('SELECT a.* FROM applications a WHERE a.job_id=? ORDER BY a.match_score DESC', j.id);
  const items = rows.map((a) => {
    const s = engine.loadSeeker(a.seeker_id); if (!s) return null;
    const m = engine.scorePair(s, ej);
    return { applicationId: a.id, status: a.status, coverNote: a.cover_note, appliedAt: a.created_at, updatedAt: a.updated_at, matchScore: m.score, strengths: m.strengths, gaps: m.gaps, breakdown: m.breakdown, allowed: PIPE[a.status], candidate: candidateView(s, { reveal: true }) };
  }).filter(Boolean);
  res.json({ job: { id: j.id, title: j.title, status: j.status }, items, counts: Object.fromEntries(Object.keys(PIPE).map((k) => [k, items.filter((i) => i.status === k).length])) });
});
r.patch('/applications/:id', ah(async (req, res) => {
  const { status, note } = z.object({ status: z.enum(['shortlisted', 'interview', 'offered', 'hired', 'rejected']), note: z.string().max(500).optional() }).parse(req.body);
  const a = one('SELECT a.*, j.title, j.company_id FROM applications a JOIN jobs j ON j.id=a.job_id WHERE a.id=?', req.params.id);
  if (!a || a.company_id !== req.user.companyId) throw E.notFound('Application');
  if (!PIPE[a.status].includes(status)) throw E.bad(`Cannot move an application from ${a.status} to ${status}.`);
  db.transaction(() => {
    run("UPDATE applications SET status=?, updated_at=datetime('now') WHERE id=?", status, a.id);
    run('INSERT INTO application_events(application_id, status, note, actor_id) VALUES(?,?,?,?)', a.id, status, note || null, req.user.id);
  })();
  const label = { shortlisted: 'Shortlisted', interview: 'Interview stage', offered: 'Offer made', hired: 'Hired', rejected: 'Not selected' }[status];
  const c = company(req);
  notify.notify(a.seeker_id, { type: 'application_update', title: `${a.title}: ${label}`, body: note || `${c.name} updated your application.`, link: '/seeker/applications',
    emailTemplate: 'application_update', emailVars: { job: a.title, company: c.name, status: label },
    smsTemplate: ['interview', 'offered', 'hired'].includes(status) ? 'application_update' : undefined, smsVars: { job: a.title.slice(0, 30), status: label } });
  audit(req, 'application.status', 'application', a.id, { from: a.status, to: status });
  res.json({ ok: true, status, allowed: PIPE[status] });
}));

// ---- AI candidate recommendations (reverse matching) ----
const candFilter = z.object({ minEdu: z.coerce.number().optional(), minExp: z.coerce.number().optional(), city: z.string().optional(), minScore: z.coerce.number().optional(), verifiedOnly: z.enum(['true', 'false']).optional(), limit: z.coerce.number().max(50).default(20) });
r.get('/jobs/:id/recommended-candidates', ah(async (req, res) => {
  const j = ownJob(req, req.params.id);
  const f = candFilter.parse(req.query);
  const ej = engine.loadJobs('j.id = ?', [j.id])[0];
  const applied = new Set(all('SELECT seeker_id FROM applications WHERE job_id=?', j.id).map((x) => x.seeker_id));
  // Privacy: only profiles visible to employers; private profiles never leave the controller.
  const seekers = engine.loadSeekers("sp.visibility IN ('public','employers')");
  const top = engine.topSeekersForJob(ej, { n: f.limit, seekers, filter: (s) => !applied.has(s.id)
    && (f.minEdu == null || s.education_level >= f.minEdu) && (f.minExp == null || s.experience_years >= f.minExp)
    && (!f.city || s.city === taxonomy.normCity(f.city)) && (f.verifiedOnly !== 'true' || s.ekyc_verified || s.digilocker_verified) });
  track({ userId: req.user.id, role: 'employer', event: 'candidate_search', jobId: j.id });
  res.json({ threshold: settings.get('match_threshold'), items: top.filter((t) => f.minScore == null || t.score >= f.minScore).map((t) => ({ matchScore: t.score, strengths: t.strengths, gaps: t.gaps, breakdown: t.breakdown, confidence: t.confidence, candidate: candidateView(t.seeker, { companyId: req.user.companyId }) })) });
}));
r.get('/candidates', ah(async (req, res) => {
  const q = String(req.query.q || '').toLowerCase().trim();
  const skillIds = String(req.query.skills || '').split(',').filter(Boolean).map(Number);
  const f = candFilter.parse(req.query);
  let seekers = engine.loadSeekers("sp.visibility IN ('public','employers')");
  seekers = seekers.filter((s) => (!q || `${s.name} ${s.headline || ''} ${s.about || ''} ${s.skills.map((k) => taxonomy.skillById(k.id)?.name).join(' ')}`.toLowerCase().includes(q))
    && skillIds.every((id) => s.skills.some((k) => k.id === id)) && (f.minEdu == null || s.education_level >= f.minEdu) && (f.minExp == null || s.experience_years >= f.minExp) && (!f.city || s.city === taxonomy.normCity(f.city)));
  track({ userId: req.user.id, role: 'employer', event: 'candidate_search', meta: { q } });
  res.json({ total: seekers.length, items: seekers.slice(0, 50).map((s) => candidateView(s, { companyId: req.user.companyId })) });
}));
r.get('/candidates/:id', (req, res) => {
  const vis = one('SELECT visibility FROM seeker_profiles WHERE user_id=?', req.params.id);
  const appliedHere = one('SELECT 1 FROM applications a JOIN jobs j ON j.id=a.job_id WHERE a.seeker_id=? AND j.company_id=?', req.params.id, req.user.companyId);
  if (!vis || (vis.visibility === 'private' && !appliedHere)) throw E.notFound('Candidate');
  const s = engine.loadSeeker(Number(req.params.id));
  track({ userId: req.user.id, role: 'employer', event: 'view_candidate', meta: { seekerId: s.id } });
  const jobs = engine.loadJobs("j.company_id=? AND j.status='active'", [req.user.companyId]);
  res.json({ candidate: candidateView(s, { companyId: req.user.companyId }), matches: jobs.map((j) => ({ jobId: j.id, title: j.title, score: engine.scorePair(s, j).score })).sort((a, b) => b.score - a.score),
    pools: all('SELECT p.id, p.name FROM talent_pool_members m JOIN talent_pools p ON p.id=m.pool_id WHERE m.seeker_id=? AND p.company_id=?', s.id, req.user.companyId) });
});
r.get('/candidates/:id/resume', (req, res) => {
  const ok = one('SELECT 1 FROM applications a JOIN jobs j ON j.id=a.job_id WHERE a.seeker_id=? AND j.company_id=?', req.params.id, req.user.companyId);
  if (!ok) throw E.forbidden('Resumes are available only for candidates who applied to your jobs.');
  const p = one('SELECT resume_path, resume_name FROM seeker_profiles WHERE user_id=?', req.params.id); if (!p?.resume_path) throw E.notFound('Resume');
  audit(req, 'candidate.resume_download', 'seeker', req.params.id);
  res.download(require('../middleware/upload').privatePath(p.resume_path), p.resume_name);
});
r.post('/candidates/:id/invite', ah(async (req, res) => {
  const { jobId, message } = z.object({ jobId: z.coerce.number(), message: z.string().max(500).optional() }).parse(req.body);
  const j = ownJob(req, jobId);
  if (j.status !== 'active') throw E.bad('Only active jobs can be shared with candidates.');
  const vis = one('SELECT visibility FROM seeker_profiles WHERE user_id=?', req.params.id); if (!vis || vis.visibility === 'private') throw E.notFound('Candidate');
  notify.notify(Number(req.params.id), { type: 'invite', title: `${company(req).name} invited you to apply`, body: message || `They think you'd be a good fit for ${j.title}.`, link: `/jobs/${j.id}`, emailTemplate: 'generic' });
  audit(req, 'candidate.invite', 'seeker', req.params.id, { jobId });
  res.json({ ok: true, message: 'Invitation sent.' });
}));

// ---- Talent pools ----
r.get('/pools', (req, res) => res.json({ items: all('SELECT p.*, (SELECT COUNT(*) FROM talent_pool_members m WHERE m.pool_id=p.id) members FROM talent_pools p WHERE company_id=? ORDER BY name', req.user.companyId) }));
r.post('/pools', ah(async (req, res) => {
  const { name } = z.object({ name: z.string().trim().min(2).max(80) }).parse(req.body);
  const x = run('INSERT INTO talent_pools(company_id, name) VALUES(?,?)', req.user.companyId, name); res.status(201).json({ id: Number(x.lastInsertRowid), name });
}));
r.get('/pools/:id', (req, res) => {
  const p = one('SELECT * FROM talent_pools WHERE id=? AND company_id=?', req.params.id, req.user.companyId); if (!p) throw E.notFound('Talent pool');
  const members = all('SELECT seeker_id, note, created_at FROM talent_pool_members WHERE pool_id=?', p.id).map((m) => {
    const s = engine.loadSeeker(m.seeker_id); return s ? { note: m.note, addedAt: m.created_at, candidate: candidateView(s, { companyId: req.user.companyId }) } : null; }).filter(Boolean);
  res.json({ pool: p, members });
});
r.delete('/pools/:id', (req, res) => { run('DELETE FROM talent_pools WHERE id=? AND company_id=?', req.params.id, req.user.companyId); res.json({ ok: true }); });
r.post('/pools/:id/members', ah(async (req, res) => {
  const { seekerId, note } = z.object({ seekerId: z.coerce.number(), note: z.string().max(300).optional() }).parse(req.body);
  const p = one('SELECT * FROM talent_pools WHERE id=? AND company_id=?', req.params.id, req.user.companyId); if (!p) throw E.notFound('Talent pool');
  const vis = one('SELECT visibility FROM seeker_profiles WHERE user_id=?', seekerId); if (!vis || vis.visibility === 'private') throw E.notFound('Candidate');
  run('INSERT OR REPLACE INTO talent_pool_members(pool_id, seeker_id, note) VALUES(?,?,?)', p.id, seekerId, note || null);
  res.json({ ok: true });
}));
r.delete('/pools/:id/members/:seekerId', (req, res) => {
  const p = one('SELECT id FROM talent_pools WHERE id=? AND company_id=?', req.params.id, req.user.companyId); if (!p) throw E.notFound('Talent pool');
  run('DELETE FROM talent_pool_members WHERE pool_id=? AND seeker_id=?', p.id, req.params.seekerId); res.json({ ok: true });
});

module.exports = r;
