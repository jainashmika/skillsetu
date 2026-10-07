// Job lifecycle (SRS 3.2.1, 3.2.4): validated create/update, a state machine for status changes
// with full audit history, scheduled expiry, and publish-time hooks (job alerts, candidate matches).
const { z } = require('zod');
const { one, all, run, db, json } = require('../db');
const { E } = require('../utils/errors');
const taxonomy = require('./taxonomy');
const settings = require('./settings');
const engine = require('./matching/engine');
const searchIndex = require('./matching/searchIndex');
const notify = require('./notify');
const config = require('../config');

const TRANSITIONS = {
  draft: ['active', 'archived'],
  active: ['paused', 'archived', 'expired'],
  paused: ['active', 'archived'],
  expired: ['active', 'archived'],
  archived: [],
};

const jobSchema = z.object({
  title: z.string().trim().min(3, 'Title needs at least 3 characters').max(120),
  description: z.string().trim().min(30, 'Description needs at least 30 characters').max(8000),
  sector: z.string().trim().max(80).optional().nullable(),
  occupation_id: z.coerce.number().int().optional().nullable(),
  contract_type: z.enum(['full_time', 'part_time', 'contract', 'internship', 'apprenticeship']).default('full_time'),
  work_format: z.enum(['onsite', 'remote', 'hybrid']).default('onsite'),
  city: z.string().trim().max(60).optional().nullable(),
  state: z.string().trim().max(60).optional().nullable(),
  ctc_min: z.coerce.number().int().min(0).optional().nullable(),
  ctc_max: z.coerce.number().int().min(0).optional().nullable(),
  experience_min: z.coerce.number().min(0).max(40).default(0),
  experience_max: z.coerce.number().min(0).max(50).optional().nullable(),
  education_level: z.coerce.number().int().min(0).max(7).default(0),
  openings: z.coerce.number().int().min(1).max(10000).default(1),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Deadline must be a date (YYYY-MM-DD)').optional().nullable(),
  visibility: z.enum(['public', 'registered']).default('public'),
  skills: z.array(z.union([z.coerce.number(), z.string(), z.object({ id: z.union([z.number(), z.string()]), required: z.boolean().optional() })])).max(30).default([]),
}).refine((d) => d.ctc_min == null || d.ctc_max == null || d.ctc_max >= d.ctc_min, { message: 'Maximum CTC must be at least the minimum', path: ['ctc_max'] })
  .refine((d) => d.experience_max == null || d.experience_max >= d.experience_min, { message: 'Maximum experience must be at least the minimum', path: ['experience_max'] });

function resolveSkills(list) {
  const out = new Map(); const unknown = [];
  for (const item of list) {
    const ref = typeof item === 'object' ? item.id : item; const req = typeof item === 'object' ? item.required !== false : true;
    const s = taxonomy.resolveSkill(ref);
    if (s) out.set(s.id, { id: s.id, required: req }); else unknown.push(String(ref));
  }
  return { skills: [...out.values()], unknown };
}

const insertSkill = db.prepare('INSERT OR REPLACE INTO job_skills(job_id, skill_id, required) VALUES(?,?,?)');

function save(input, { id, companyId, postedBy, portalId = null, externalId = null, source = 'direct', externalCompany = null, status } = {}) {
  const d = jobSchema.parse(input);
  const city = taxonomy.normCity(d.city);
  const state = d.state || taxonomy.stateOf(city);
  const { skills, unknown } = resolveSkills(d.skills);
  const deadline = d.deadline || new Date(Date.now() + settings.get('job_default_validity_days') * 86400000).toISOString().slice(0, 10);
  const jobId = db.transaction(() => {
    let jid = id;
    const cols = [d.title, d.description, d.sector || null, d.occupation_id || null, d.contract_type, d.work_format, city, state, d.ctc_min ?? null, d.ctc_max ?? null, d.experience_min, d.experience_max ?? null, d.education_level, d.openings, deadline, d.visibility];
    if (jid) {
      run(`UPDATE jobs SET title=?, description=?, sector=?, occupation_id=?, contract_type=?, work_format=?, city=?, state=?, ctc_min=?, ctc_max=?, experience_min=?, experience_max=?, education_level=?, openings=?, deadline=?, visibility=?, updated_at=datetime('now') WHERE id=?`, ...cols, jid);
      run('DELETE FROM job_skills WHERE job_id=?', jid);
    } else {
      const r = run(`INSERT INTO jobs(title, description, sector, occupation_id, contract_type, work_format, city, state, ctc_min, ctc_max, experience_min, experience_max, education_level, openings, deadline, visibility, company_id, posted_by, portal_id, external_id, source, external_company, status)
                     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ...cols, companyId || null, postedBy || null, portalId, externalId, source, externalCompany, 'draft');
      jid = Number(r.lastInsertRowid);
      run('INSERT INTO job_status_history(job_id, from_status, to_status, actor_id, reason) VALUES(?,?,?,?,?)', jid, null, 'draft', postedBy || null, source === 'direct' ? 'Created' : `Imported from ${source}`);
    }
    for (const s of skills) insertSkill.run(jid, s.id, s.required ? 1 : 0);
    return jid;
  })();
  engine.invalidate();
  if (status && status !== get(jobId).status) transition(jobId, status, { actorId: postedBy, reason: 'Published on save' });
  return { job: get(jobId), unknownSkills: unknown };
}

function get(id) {
  const j = one(`SELECT j.*, c.name company_name, c.slug company_slug, c.logo_url, c.verification_status company_verification, c.about company_about, c.website company_website, c.industry company_industry,
                        p.name portal_name
                 FROM jobs j LEFT JOIN companies c ON c.id=j.company_id LEFT JOIN portals p ON p.id=j.portal_id WHERE j.id=?`, id);
  if (!j) return null;
  j.skills = all('SELECT s.id, s.name, s.category, js.required FROM job_skills js JOIN skills s ON s.id=js.skill_id WHERE js.job_id=? ORDER BY js.required DESC, s.name', id).map((s) => ({ ...s, required: !!s.required }));
  j.education_label = taxonomy.EDU_LEVELS[j.education_level]?.label;
  j.company_display = j.company_name || j.external_company || j.portal_name || 'Employer';
  return j;
}

function transition(jobId, to, { actorId = null, reason = null } = {}) {
  const j = one('SELECT * FROM jobs WHERE id=?', jobId);
  if (!j) throw E.notFound('Job');
  if (j.status === to) return get(jobId);
  if (!TRANSITIONS[j.status]?.includes(to)) throw E.bad(`A ${j.status} job cannot move to ${to}. Allowed: ${TRANSITIONS[j.status].join(', ') || 'none'}.`);
  if (to === 'active') {
    if (j.deadline && j.deadline < new Date().toISOString().slice(0, 10)) throw E.bad('The deadline has passed. Extend the deadline before activating this job.');
    const skillCount = one('SELECT COUNT(*) c FROM job_skills WHERE job_id=?', jobId).c;
    if (!skillCount && j.source === 'direct') throw E.bad('Add at least one skill before publishing so we can match candidates.');
  }
  const firstPublish = to === 'active' && !j.published_at;
  db.transaction(() => {
    run(`UPDATE jobs SET status=?, published_at=COALESCE(published_at, CASE WHEN ?='active' THEN datetime('now') END), updated_at=datetime('now') WHERE id=?`, to, to, jobId);
    run('INSERT INTO job_status_history(job_id, from_status, to_status, actor_id, reason) VALUES(?,?,?,?,?)', jobId, j.status, to, actorId, reason);
  })();
  engine.invalidate();
  if (firstPublish) setImmediate(() => { try { onPublished(jobId); } catch (e) { console.error('[jobs] publish hook', e.message); } });
  return get(jobId);
}

// Publish hook: saved-search alerts + notify strong-match seekers (SRS 3.2.2 automated alerts, 3.6.2).
function onPublished(jobId) {
  const job = get(jobId); if (!job) return;
  const searches = all(`SELECT ss.*, u.name FROM saved_searches ss JOIN users u ON u.id=ss.user_id
                        LEFT JOIN notification_prefs np ON np.user_id=u.id
                        WHERE ss.alert=1 AND u.status='active' AND COALESCE(np.job_alerts,1)=1`);
  const notified = new Set();
  for (const s of searches) {
    const q = json(s.query, {});
    const res = searchIndex.search({ ...q, pageSize: 200 });
    if (res.items.some((x) => x.job.id === jobId)) {
      notified.add(s.user_id);
      notify.notify(s.user_id, { type: 'job_alert', title: `New job for "${s.name}"`, body: `${job.title} at ${job.company_display}, ${job.city || 'Remote'}`, link: `/jobs/${jobId}`,
        emailTemplate: 'job_alert', emailVars: { search: s.name, jobs: [{ title: job.title, company: job.company_display, city: job.city || 'Remote' }] } });
    }
  }
  const ej = engine.ensureIndex().jobs.get(jobId);
  if (!ej) return;
  const threshold = settings.get('match_threshold');
  const top = engine.topSeekersForJob(ej, { n: 25, seekers: engine.loadSeekers() });
  for (const m of top) {
    if (m.score < threshold || notified.has(m.seeker.id)) continue;
    notify.notify(m.seeker.id, { type: 'recommendation', title: `${Math.round(m.score)}% match: ${job.title}`, body: `${job.company_display} · ${job.city || 'Remote'}`, link: `/jobs/${jobId}` });
  }
}

function expireDue() {
  const today = new Date().toISOString().slice(0, 10);
  const due = all("SELECT id FROM jobs WHERE status IN ('active','paused') AND deadline IS NOT NULL AND deadline < ?", today);
  for (const d of due) {
    const j = one('SELECT status FROM jobs WHERE id=?', d.id);
    if (j.status === 'paused') { run("UPDATE jobs SET status='expired' WHERE id=?", d.id); run("INSERT INTO job_status_history(job_id,from_status,to_status,reason) VALUES(?,?,?,?)", d.id, 'paused', 'expired', 'Deadline passed'); }
    else transition(d.id, 'expired', { reason: 'Deadline passed' });
  }
  if (due.length) engine.invalidate();
  return due.length;
}

// Schema.org JobPosting for Google Jobs (SRS 3.2.1).
function jsonLd(j) {
  const EMP = { full_time: 'FULL_TIME', part_time: 'PART_TIME', contract: 'CONTRACTOR', internship: 'INTERN', apprenticeship: 'OTHER' };
  return {
    '@context': 'https://schema.org/', '@type': 'JobPosting',
    title: j.title, description: j.description, datePosted: (j.published_at || j.created_at).slice(0, 10), validThrough: j.deadline ? `${j.deadline}T23:59:59+05:30` : undefined,
    employmentType: EMP[j.contract_type], hiringOrganization: { '@type': 'Organization', name: j.company_display, sameAs: j.company_website || undefined, logo: j.logo_url ? `${config.publicUrl}${j.logo_url}` : undefined },
    jobLocation: j.work_format === 'remote' ? undefined : { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: j.city, addressRegion: j.state, addressCountry: 'IN' } },
    jobLocationType: j.work_format === 'remote' ? 'TELECOMMUTE' : undefined,
    applicantLocationRequirements: j.work_format === 'remote' ? { '@type': 'Country', name: 'India' } : undefined,
    baseSalary: j.ctc_min || j.ctc_max ? { '@type': 'MonetaryAmount', currency: 'INR', value: { '@type': 'QuantitativeValue', minValue: j.ctc_min || undefined, maxValue: j.ctc_max || undefined, unitText: 'YEAR' } } : undefined,
    skills: j.skills.map((s) => s.name).join(', '), experienceRequirements: j.experience_min ? { '@type': 'OccupationalExperienceRequirements', monthsOfExperience: j.experience_min * 12 } : undefined,
    identifier: { '@type': 'PropertyValue', name: 'SkillSetu', value: String(j.id) }, directApply: true,
  };
}

module.exports = { TRANSITIONS, jobSchema, save, get, transition, expireDue, jsonLd, onPublished, resolveSkills };
