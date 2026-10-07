// Job seeker APIs (SRS 3.1.1, 3.2.3, 3.3.2, 4.1): progressive profile, resume parsing, verification,
// recommendations, applications, saved jobs and saved searches.
const express = require('express');
const fs = require('fs');
const { z } = require('zod');
const { one, all, run, db } = require('../db');
const { E, ah } = require('../utils/errors');
const { requireRole } = require('../middleware/auth');
const { uploader, store, privatePath } = require('../middleware/upload');
const taxonomy = require('../services/taxonomy');
const engine = require('../services/matching/engine');
const recommender = require('../services/matching/recommender');
const resumeParser = require('../services/resumeParser');
const gov = require('../services/integrations/gov');
const notify = require('../services/notify');
const jobsSvc = require('../services/jobs');
const { encrypt } = require('../utils/crypto');
const { audit } = require('../services/audit');
const { track } = require('../services/events');
const { jobCard, completion, seekerFull } = require('../services/serialize');

const r = express.Router();
r.use(requireRole('seeker'));

const loadMe = (req) => engine.loadSeeker(req.user.id);
const touch = (id) => run("UPDATE seeker_profiles SET updated_at=datetime('now') WHERE user_id=?", id);
function profileResponse(id) {
  const p = engine.loadSeeker(id);
  const c = completion(p);
  if (c.level !== p.profile_level) run('UPDATE seeker_profiles SET profile_level=? WHERE user_id=?', c.level, id);
  return { profile: seekerFull({ ...p, profile_level: c.level }), completion: c };
}

r.get('/profile', (req, res) => res.json(profileResponse(req.user.id)));

const profileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  headline: z.string().trim().max(140).optional().nullable(),
  about: z.string().trim().max(2000).optional().nullable(),
  gender: z.enum(['female', 'male', 'other', 'prefer_not']).optional().nullable(),
  city: z.string().trim().max(60).optional().nullable(),
  state: z.string().trim().max(60).optional().nullable(),
  educationLevel: z.coerce.number().int().min(0).max(7).optional(),
  experienceYears: z.coerce.number().min(0).max(50).optional(),
  expectedCtcMin: z.coerce.number().int().min(0).optional().nullable(),
  expectedCtcMax: z.coerce.number().int().min(0).optional().nullable(),
  preferredLocations: z.array(z.string().max(60)).max(10).optional(),
  preferredWorkFormat: z.enum(['onsite', 'remote', 'hybrid', 'any']).optional().nullable(),
  preferredContract: z.enum(['full_time', 'part_time', 'contract', 'internship', 'apprenticeship', 'any']).optional().nullable(),
  sectors: z.array(z.string().max(80)).max(10).optional(),
  languages: z.array(z.string().max(30)).max(12).optional(),
  visibility: z.enum(['public', 'employers', 'private']).optional(),
  fresher: z.boolean().optional(),
});
r.put('/profile', ah(async (req, res) => {
  const d = profileSchema.parse(req.body);
  const map = { headline: 'headline', about: 'about', gender: 'gender', state: 'state', educationLevel: 'education_level', experienceYears: 'experience_years', expectedCtcMin: 'expected_ctc_min', expectedCtcMax: 'expected_ctc_max', preferredWorkFormat: 'preferred_work_format', preferredContract: 'preferred_contract', visibility: 'visibility' };
  const sets = []; const vals = [];
  for (const [k, col] of Object.entries(map)) if (d[k] !== undefined) { sets.push(`${col}=?`); vals.push(d[k]); }
  if (d.city !== undefined) { const c = taxonomy.normCity(d.city); sets.push('city=?'); vals.push(c); if (d.state === undefined) { sets.push('state=?'); vals.push(taxonomy.stateOf(c)); } }
  for (const k of ['preferredLocations', 'sectors', 'languages']) if (d[k]) { sets.push(`${{ preferredLocations: 'preferred_locations', sectors: 'sectors', languages: 'languages' }[k]}=?`); vals.push(JSON.stringify(k === 'preferredLocations' ? d[k].map(taxonomy.normCity) : d[k])); }
  if (d.fresher) { sets.push('experience_years=0', 'profile_level=MAX(profile_level,3)'); }
  if (sets.length) run(`UPDATE seeker_profiles SET ${sets.join(', ')}, updated_at=datetime('now') WHERE user_id=?`, ...vals, req.user.id);
  if (d.name) run('UPDATE users SET name=? WHERE id=?', d.name, req.user.id);
  if (d.visibility) audit(req, 'profile.visibility', 'seeker', req.user.id, { visibility: d.visibility });
  res.json(profileResponse(req.user.id));
}));

r.put('/skills', ah(async (req, res) => {
  const { skills } = z.object({ skills: z.array(z.object({ id: z.coerce.number(), level: z.enum(['beginner', 'intermediate', 'expert']).default('intermediate') })).max(40) }).parse(req.body);
  db.transaction(() => {
    run('DELETE FROM seeker_skills WHERE user_id=?', req.user.id);
    for (const s of skills) if (taxonomy.skillById(s.id)) run("INSERT OR REPLACE INTO seeker_skills(user_id, skill_id, level, source, confidence) VALUES(?,?,?,'manual',1)", req.user.id, s.id, s.level);
  })();
  touch(req.user.id);
  res.json(profileResponse(req.user.id));
}));

const eduSchema = z.object({ qualification: z.string().trim().min(2).max(80), level: z.coerce.number().int().min(0).max(7).optional(), field: z.string().trim().max(80).optional().nullable(), institution: z.string().trim().max(120).optional().nullable(), year: z.coerce.number().int().min(1960).max(2035).optional().nullable(), grade: z.string().trim().max(20).optional().nullable() });
const expSchema = z.object({ title: z.string().trim().min(2).max(80), company: z.string().trim().max(120).optional().nullable(), start_date: z.string().optional().nullable(), end_date: z.string().optional().nullable(), current: z.boolean().default(false), description: z.string().trim().max(1500).optional().nullable() });
function recomputeEducation(uid) {
  const max = one('SELECT MAX(level) m FROM educations WHERE user_id=?', uid).m;
  if (max != null) run('UPDATE seeker_profiles SET education_level=MAX(education_level, ?) WHERE user_id=?', max, uid);
}
function recomputeExperience(uid) {
  const rows = all('SELECT start_date, end_date, current FROM experiences WHERE user_id=?', uid);
  const yrs = rows.reduce((s, e) => { const a = new Date(e.start_date || Date.now()); const b = e.current || !e.end_date ? new Date() : new Date(e.end_date); return s + Math.max(0, (b - a) / (365.25 * 86400000)); }, 0);
  if (rows.length) run('UPDATE seeker_profiles SET experience_years=? WHERE user_id=?', Math.round(yrs * 10) / 10, uid);
}
r.post('/educations', ah(async (req, res) => {
  const d = eduSchema.parse(req.body);
  const level = d.level ?? taxonomy.detectQualifications(d.qualification)[0]?.level ?? 0;
  run('INSERT INTO educations(user_id, qualification, level, field, institution, year, grade) VALUES(?,?,?,?,?,?,?)', req.user.id, d.qualification, level, d.field || null, d.institution || null, d.year || null, d.grade || null);
  recomputeEducation(req.user.id); touch(req.user.id);
  res.status(201).json(profileResponse(req.user.id));
}));
r.put('/educations/:id', ah(async (req, res) => {
  const d = eduSchema.parse(req.body);
  const level = d.level ?? taxonomy.detectQualifications(d.qualification)[0]?.level ?? 0;
  const x = run('UPDATE educations SET qualification=?, level=?, field=?, institution=?, year=?, grade=?, verified=0 WHERE id=? AND user_id=?', d.qualification, level, d.field || null, d.institution || null, d.year || null, d.grade || null, req.params.id, req.user.id);
  if (!x.changes) throw E.notFound('Education');
  recomputeEducation(req.user.id); res.json(profileResponse(req.user.id));
}));
r.delete('/educations/:id', (req, res) => { run('DELETE FROM educations WHERE id=? AND user_id=?', req.params.id, req.user.id); res.json(profileResponse(req.user.id)); });
r.post('/experiences', ah(async (req, res) => {
  const d = expSchema.parse(req.body);
  run('INSERT INTO experiences(user_id, title, company, start_date, end_date, current, description) VALUES(?,?,?,?,?,?,?)', req.user.id, d.title, d.company || null, d.start_date || null, d.current ? null : d.end_date || null, d.current ? 1 : 0, d.description || null);
  recomputeExperience(req.user.id); touch(req.user.id);
  res.status(201).json(profileResponse(req.user.id));
}));
r.put('/experiences/:id', ah(async (req, res) => {
  const d = expSchema.parse(req.body);
  const x = run('UPDATE experiences SET title=?, company=?, start_date=?, end_date=?, current=?, description=? WHERE id=? AND user_id=?', d.title, d.company || null, d.start_date || null, d.current ? null : d.end_date || null, d.current ? 1 : 0, d.description || null, req.params.id, req.user.id);
  if (!x.changes) throw E.notFound('Experience');
  recomputeExperience(req.user.id); res.json(profileResponse(req.user.id));
}));
r.delete('/experiences/:id', (req, res) => { run('DELETE FROM experiences WHERE id=? AND user_id=?', req.params.id, req.user.id); recomputeExperience(req.user.id); res.json(profileResponse(req.user.id)); });

// ---- Resume upload + AI parsing ----
r.post('/resume', uploader('resume'), ah(async (req, res) => {
  if (!req.file) throw E.bad('Choose a resume file to upload.');
  const parsed = await resumeParser.parseResume(req.file.buffer, req.file.mimetype, req.file.originalname);
  const old = one('SELECT resume_path FROM seeker_profiles WHERE user_id=?', req.user.id)?.resume_path;
  const name = store(req.file, 'private');
  run("UPDATE seeker_profiles SET resume_path=?, resume_name=?, updated_at=datetime('now') WHERE user_id=?", name, req.file.originalname.slice(0, 120), req.user.id);
  if (old) try { fs.unlinkSync(privatePath(old)); } catch { /* ignore */ }
  const me = loadMe(req); const have = new Set(me.skills.map((s) => s.id));
  parsed.skills = parsed.skills.map((s) => ({ ...s, alreadyAdded: have.has(s.id) }));
  res.json({ parsed, resumeName: req.file.originalname });
}));
r.get('/resume', (req, res) => {
  const p = one('SELECT resume_path, resume_name FROM seeker_profiles WHERE user_id=?', req.user.id);
  if (!p?.resume_path) throw E.notFound('Resume');
  res.download(privatePath(p.resume_path), p.resume_name);
});
r.post('/resume/apply', ah(async (req, res) => {
  const d = z.object({
    skills: z.array(z.object({ id: z.coerce.number(), confidence: z.number().optional() })).default([]),
    educations: z.array(eduSchema.extend({ level: z.coerce.number().int().min(0).max(7) })).default([]),
    experiences: z.array(expSchema).default([]),
    experienceYears: z.number().nullable().optional(), educationLevel: z.number().int().optional(), city: z.string().nullable().optional(), headline: z.string().nullable().optional(), languages: z.array(z.string()).optional(),
  }).parse(req.body);
  const uid = req.user.id;
  db.transaction(() => {
    for (const s of d.skills) if (taxonomy.skillById(s.id)) run("INSERT OR IGNORE INTO seeker_skills(user_id, skill_id, level, source, confidence) VALUES(?,?, 'intermediate', 'resume', ?)", uid, s.id, s.confidence ?? 0.8);
    for (const e of d.educations) if (!one('SELECT 1 FROM educations WHERE user_id=? AND qualification=?', uid, e.qualification)) run('INSERT INTO educations(user_id, qualification, level, field, institution, year, grade) VALUES(?,?,?,?,?,?,?)', uid, e.qualification, e.level, e.field || null, e.institution || null, e.year || null, e.grade || null);
    for (const x of d.experiences) run('INSERT INTO experiences(user_id, title, company, start_date, end_date, current) VALUES(?,?,?,?,?,?)', uid, x.title, x.company || null, x.start_date || null, x.end_date || null, x.current ? 1 : 0);
    if (d.educationLevel != null) run('UPDATE seeker_profiles SET education_level=MAX(education_level, ?) WHERE user_id=?', d.educationLevel, uid);
    if (d.experienceYears != null) run('UPDATE seeker_profiles SET experience_years=? WHERE user_id=?', d.experienceYears, uid);
    if (d.city) run('UPDATE seeker_profiles SET city=COALESCE(city, ?), state=COALESCE(state, ?) WHERE user_id=?', taxonomy.normCity(d.city), taxonomy.stateOf(d.city), uid);
    if (d.headline) run('UPDATE seeker_profiles SET headline=COALESCE(headline, ?) WHERE user_id=?', d.headline, uid);
    if (d.languages?.length) run("UPDATE seeker_profiles SET languages=? WHERE user_id=? AND languages='[]'", JSON.stringify(d.languages), uid);
  })();
  touch(uid);
  res.json(profileResponse(uid));
}));

// ---- Government verification (sandbox) ----
r.post('/verify/ekyc', ah(async (req, res) => {
  const { aadhaar, consent } = z.object({ aadhaar: z.string(), consent: z.literal(true, { errorMap: () => ({ message: 'Consent is required for e-KYC' }) }) }).parse(req.body);
  const v = gov.validateAadhaar(aadhaar); if (!v.valid) throw E.bad(v.reason, { field: 'aadhaar' });
  let result;
  try { result = await gov.ekyc(v.aadhaar, req.user.name); } catch (e) { throw E.unavailable('The e-KYC service is not responding right now. Please try again in a few minutes.'); }
  if (!result.verified) throw E.bad(result.reason || 'e-KYC could not be completed.');
  run('UPDATE seeker_profiles SET aadhaar_enc=?, aadhaar_masked=?, ekyc_verified=1 WHERE user_id=?', encrypt(v.aadhaar), result.maskedAadhaar, req.user.id);
  audit(req, 'seeker.ekyc_verified', 'seeker', req.user.id, { txn: result.txnId, attempts: result._meta.attempts });
  res.json({ ...profileResponse(req.user.id), verification: { maskedAadhaar: result.maskedAadhaar, txnId: result.txnId, attempts: result._meta.attempts } });
}));
r.post('/verify/digilocker', ah(async (req, res) => {
  const edus = all('SELECT * FROM educations WHERE user_id=?', req.user.id);
  if (!edus.length) throw E.bad('Add at least one education entry before fetching certificates from DigiLocker.');
  let result;
  try { result = await gov.digilockerFetch(edus); } catch { throw E.unavailable('DigiLocker is not responding right now. Please try again shortly.'); }
  db.transaction(() => { for (const d of result.documents) if (d.verified) run('UPDATE educations SET verified=1 WHERE id=? AND user_id=?', d.educationId, req.user.id); })();
  const any = result.documents.some((d) => d.verified);
  if (any) run('UPDATE seeker_profiles SET digilocker_verified=1 WHERE user_id=?', req.user.id);
  audit(req, 'seeker.digilocker_fetch', 'seeker', req.user.id, { verified: result.documents.filter((d) => d.verified).length });
  res.json({ ...profileResponse(req.user.id), documents: result.documents });
}));

// ---- Recommendations & matching ----
r.get('/recommendations', ah(async (req, res) => {
  const me = loadMe(req);
  const n = Math.min(30, Number(req.query.limit) || 12);
  const saved = new Set(all('SELECT job_id FROM saved_jobs WHERE user_id=?', req.user.id).map((x) => x.job_id));
  const recs = recommender.recommendForSeeker(me, { n });
  res.json({ items: recs.map((x) => jobCard(x.job, { match: { score: x.score, rank: x.rank, strengths: x.strengths, gaps: x.gaps, aboveThreshold: x.aboveThreshold }, saved: saved.has(x.job.id) })), threshold: require('../services/settings').get('match_threshold') });
}));
r.get('/match/:jobId', ah(async (req, res) => {
  const job = engine.loadJobs('j.id = ?', [req.params.jobId])[0]; if (!job) throw E.notFound('Job');
  res.json(engine.scorePair(loadMe(req), job));
}));
r.get('/trainings', (req, res) => {
  // Skill-gap learning suggestions from the gaps in your top matches.
  const me = loadMe(req);
  const top = engine.topJobsForSeeker(me, { n: 15 });
  const freq = new Map();
  for (const t of top) for (const s of t.job.skills) if (!me.skills.some((m) => m.id === s.id)) freq.set(s.id, (freq.get(s.id) || 0) + (s.required ? 2 : 1));
  const gaps = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, w]) => ({ skill: taxonomy.skillById(id)?.name, id, demand: w, trainings: taxonomy.trainings().filter((t) => t.skill_ids.includes(id)) }));
  res.json({ gaps });
});

// ---- Applications ----
r.get('/applications', (req, res) => {
  const rows = all(`SELECT a.*, j.title, j.city, j.status job_status, j.work_format, COALESCE(c.name, j.external_company) company, c.logo_url FROM applications a JOIN jobs j ON j.id=a.job_id LEFT JOIN companies c ON c.id=j.company_id WHERE a.seeker_id=? ORDER BY a.updated_at DESC`, req.user.id);
  const ev = all(`SELECT e.* FROM application_events e JOIN applications a ON a.id=e.application_id WHERE a.seeker_id=? ORDER BY e.id`, req.user.id);
  res.json({ items: rows.map((a) => ({ id: a.id, jobId: a.job_id, title: a.title, company: a.company, logo: a.logo_url, city: a.city, workFormat: a.work_format, jobStatus: a.job_status, status: a.status, matchScore: a.match_score, coverNote: a.cover_note, createdAt: a.created_at, updatedAt: a.updated_at,
    timeline: ev.filter((e) => e.application_id === a.id).map((e) => ({ status: e.status, note: e.note, at: e.created_at })) })) });
});
r.post('/applications', ah(async (req, res) => {
  const { jobId, coverNote } = z.object({ jobId: z.coerce.number(), coverNote: z.string().trim().max(1500).optional() }).parse(req.body);
  const job = jobsSvc.get(jobId);
  if (!job || job.status !== 'active') throw E.bad('This job is no longer accepting applications.');
  if (one('SELECT 1 FROM applications WHERE job_id=? AND seeker_id=?', jobId, req.user.id)) throw E.conflict('You have already applied for this job.');
  const me = loadMe(req);
  const ej = engine.loadJobs('j.id = ?', [jobId])[0];
  const m = engine.scorePair(me, ej);
  const appId = db.transaction(() => {
    const x = run('INSERT INTO applications(job_id, seeker_id, match_score, cover_note) VALUES(?,?,?,?)', jobId, req.user.id, m.score, coverNote || null);
    run("INSERT INTO application_events(application_id, status, note, actor_id) VALUES(?, 'applied', 'Application submitted', ?)", x.lastInsertRowid, req.user.id);
    return Number(x.lastInsertRowid);
  })();
  track({ userId: req.user.id, role: 'seeker', event: 'apply', jobId });
  for (const hr of all('SELECT user_id FROM employer_users WHERE company_id=?', job.company_id)) {
    notify.notify(hr.user_id, { type: 'new_applicant', title: `New applicant: ${job.title}`, body: `${req.user.name} applied (${Math.round(m.score)}% match)`, link: `/employer/jobs/${jobId}`, emailTemplate: 'new_applicant', emailVars: { job: job.title, candidate: req.user.name, score: Math.round(m.score), jobId } });
  }
  notify.notify(req.user.id, { type: 'application', title: 'Application sent', body: `${job.title} at ${job.company_display}`, link: '/seeker/applications' });
  audit(req, 'application.create', 'application', appId, { jobId });
  res.status(201).json({ id: appId, matchScore: m.score, message: 'Application sent.' });
}));
r.post('/applications/:id/withdraw', ah(async (req, res) => {
  const a = one('SELECT * FROM applications WHERE id=? AND seeker_id=?', req.params.id, req.user.id); if (!a) throw E.notFound('Application');
  if (['hired', 'withdrawn', 'rejected'].includes(a.status)) throw E.bad(`An application that is ${a.status} cannot be withdrawn.`);
  run("UPDATE applications SET status='withdrawn', updated_at=datetime('now') WHERE id=?", a.id);
  run("INSERT INTO application_events(application_id, status, note, actor_id) VALUES(?, 'withdrawn', 'Withdrawn by candidate', ?)", a.id, req.user.id);
  res.json({ ok: true });
}));

// ---- Interested list (saved jobs) ----
r.get('/saved-jobs', (req, res) => {
  const ids = all('SELECT job_id FROM saved_jobs WHERE user_id=? ORDER BY created_at DESC', req.user.id).map((x) => x.job_id);
  const me = loadMe(req);
  const jobs = ids.length ? engine.loadJobs(`j.id IN (${ids.map(() => '?').join(',')})`, ids) : [];
  const byId = new Map(jobs.map((j) => [j.id, j]));
  res.json({ items: ids.map((id) => byId.get(id)).filter(Boolean).map((j) => jobCard(j, { saved: true, match: { score: engine.scorePair(me, j).score } })) });
});
r.post('/saved-jobs/:jobId', (req, res) => {
  if (!one('SELECT 1 FROM jobs WHERE id=?', req.params.jobId)) throw E.notFound('Job');
  run('INSERT OR IGNORE INTO saved_jobs(user_id, job_id) VALUES(?,?)', req.user.id, req.params.jobId);
  track({ userId: req.user.id, role: 'seeker', event: 'save_job', jobId: Number(req.params.jobId) });
  res.json({ saved: true });
});
r.delete('/saved-jobs/:jobId', (req, res) => { run('DELETE FROM saved_jobs WHERE user_id=? AND job_id=?', req.user.id, req.params.jobId); res.json({ saved: false }); });

// ---- Saved searches / job alerts ----
r.get('/saved-searches', (req, res) => res.json({ items: all('SELECT * FROM saved_searches WHERE user_id=? ORDER BY id DESC', req.user.id).map((s) => ({ ...s, query: JSON.parse(s.query), alert: !!s.alert })) }));
r.post('/saved-searches', ah(async (req, res) => {
  const d = z.object({ name: z.string().trim().min(2).max(80), query: z.record(z.any()), alert: z.boolean().default(true) }).parse(req.body);
  if (one('SELECT COUNT(*) c FROM saved_searches WHERE user_id=?', req.user.id).c >= 20) throw E.bad('You can keep up to 20 saved searches.');
  const x = run('INSERT INTO saved_searches(user_id, name, query, alert) VALUES(?,?,?,?)', req.user.id, d.name, JSON.stringify(d.query), d.alert ? 1 : 0);
  res.status(201).json({ id: Number(x.lastInsertRowid) });
}));
r.patch('/saved-searches/:id', ah(async (req, res) => {
  const { alert } = z.object({ alert: z.boolean() }).parse(req.body);
  run('UPDATE saved_searches SET alert=? WHERE id=? AND user_id=?', alert ? 1 : 0, req.params.id, req.user.id); res.json({ ok: true });
}));
r.delete('/saved-searches/:id', (req, res) => { run('DELETE FROM saved_searches WHERE id=? AND user_id=?', req.params.id, req.user.id); res.json({ ok: true }); });

r.get('/dashboard', (req, res) => {
  const id = req.user.id;
  const counts = Object.fromEntries(all('SELECT status, COUNT(*) c FROM applications WHERE seeker_id=? GROUP BY status', id).map((x) => [x.status, x.c]));
  const p = profileResponse(id);
  res.json({
    completion: p.completion, profile: { name: p.profile.name, headline: p.profile.headline, city: p.profile.city, ekycVerified: p.profile.ekycVerified, digilockerVerified: p.profile.digilockerVerified, skills: p.profile.skills.length, slug: p.profile.slug, visibility: p.profile.visibility },
    applications: { total: Object.values(counts).reduce((a, b) => a + b, 0), ...counts },
    saved: one('SELECT COUNT(*) c FROM saved_jobs WHERE user_id=?', id).c,
    savedSearches: one('SELECT COUNT(*) c FROM saved_searches WHERE user_id=?', id).c,
    profileViews: one("SELECT COUNT(*) c FROM activity_events WHERE event='view_candidate' AND json_extract(meta,'$.seekerId')=? AND created_at > datetime('now','-30 days')", id).c,
    unread: one('SELECT COUNT(*) c FROM notifications WHERE user_id=? AND read_at IS NULL', id).c,
  });
});

module.exports = r;
