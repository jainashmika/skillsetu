// Administrator APIs (SRS 3.1.4, 3.5, 3.7, 5.6.3): users & entities, employer verification,
// moderation, taxonomy, configurable matching, CMS, integrations, analytics, reports, audit,
// security monitoring, outbox and backups. Every mutating call is written to the audit chain.
const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { one, all, run, db, json } = require('../db');
const { E, ah } = require('../utils/errors');
const { requireRole } = require('../middleware/auth');
const { randomToken } = require('../utils/crypto');
const { slugify } = require('../utils/text');
const settings = require('../services/settings');
const taxonomy = require('../services/taxonomy');
const engine = require('../services/matching/engine');
const recommender = require('../services/matching/recommender');
const jobsSvc = require('../services/jobs');
const analytics = require('../services/analytics');
const reports = require('../services/reports');
const metrics = require('../services/metrics');
const events = require('../services/events');
const notify = require('../services/notify');
const backup = require('../services/backup');
const sync = require('../services/integrations/portalSync');
const gov = require('../services/integrations/gov');
const { audit, verifyChain } = require('../services/audit');
const { jobCard } = require('../services/serialize');
const { uniqueSlug } = require('./auth');

const r = express.Router();
r.use(requireRole('admin'));
const page = (req) => { const p = Math.max(1, Number(req.query.page) || 1); const size = Math.min(100, Number(req.query.pageSize) || 25); return { p, size, off: (p - 1) * size }; };

r.get('/overview', (req, res) => {
  const m = metrics.snapshot();
  res.json({ stats: analytics.overview(), system: { uptimeSec: m.uptimeSec, p95: m.p95, requests: m.requests, errors: m.errors, cpu: m.resources.cpuPercent, memMb: m.resources.rssMb },
    security24h: one("SELECT COUNT(*) c FROM security_events WHERE created_at > datetime('now','-1 day')").c,
    failedLogins24h: one("SELECT COUNT(*) c FROM access_logs WHERE event LIKE 'login_failed%' AND created_at > datetime('now','-1 day')").c,
    pendingPortals: one("SELECT COUNT(*) c FROM users WHERE role='portal' AND status='pending_approval'").c,
    dlq: one("SELECT COUNT(*) c FROM dead_letters WHERE status='pending'").c,
    recentAudit: all('SELECT id, actor_id, actor_role, action, entity, entity_id, created_at FROM audit_logs ORDER BY id DESC LIMIT 8'),
    employment: analytics.employment(), skillGap: analytics.skillGap(8) });
});

// ---------- Users ----------
r.get('/users', (req, res) => {
  const { p, size, off } = page(req); const c = []; const v = [];
  if (req.query.role) { c.push('u.role=?'); v.push(req.query.role); }
  if (req.query.status) { c.push('u.status=?'); v.push(req.query.status); }
  if (req.query.q) { c.push('(u.name LIKE ? OR u.email LIKE ?)'); v.push(`%${req.query.q}%`, `%${req.query.q}%`); }
  const w = c.length ? `WHERE ${c.join(' AND ')}` : '';
  const items = all(`SELECT u.id, u.role, u.name, u.email, u.phone_masked phone, u.status, u.mfa_enabled, u.failed_attempts, u.locked_until, u.last_login_at, u.created_at,
                     COALESCE(co.name, po.name) org FROM users u LEFT JOIN employer_users eu ON eu.user_id=u.id LEFT JOIN companies co ON co.id=eu.company_id LEFT JOIN portals po ON po.owner_user_id=u.id
                     ${w} ORDER BY u.id DESC LIMIT ? OFFSET ?`, ...v, size, off)
    .map((u) => ({ ...u, locked: !!(u.locked_until && new Date(`${u.locked_until}Z`) > new Date()) }));
  res.json({ items, total: one(`SELECT COUNT(*) c FROM users u ${w}`, ...v).c, page: p, pageSize: size });
});
r.patch('/users/:id', ah(async (req, res) => {
  const { status } = z.object({ status: z.enum(['active', 'banned']) }).parse(req.body);
  const u = one('SELECT * FROM users WHERE id=?', req.params.id); if (!u) throw E.notFound('User');
  if (u.id === req.user.id) throw E.bad('You cannot change your own status.');
  run('UPDATE users SET status=? WHERE id=?', status, u.id);
  if (u.role === 'portal' && status === 'active') run("UPDATE portals SET status='active' WHERE owner_user_id=?", u.id);
  if (u.role === 'portal' && status === 'banned') run("UPDATE portals SET status='suspended' WHERE owner_user_id=?", u.id);
  if (status === 'active' && u.status === 'pending_approval') notify.notify(u.id, { type: 'approval', title: 'Your integration is approved', body: 'You can now create API keys and start syncing jobs.', link: '/portal', emailTemplate: 'generic' });
  audit(req, status === 'banned' ? 'user.ban' : 'user.activate', 'user', u.id, { from: u.status });
  res.json({ ok: true });
}));
r.post('/users/:id/unlock', (req, res) => { run('UPDATE users SET failed_attempts=0, locked_until=NULL WHERE id=?', req.params.id); audit(req, 'user.unlock', 'user', req.params.id); res.json({ ok: true }); });
r.post('/users/:id/reset-password', ah(async (req, res) => {
  const u = one('SELECT id FROM users WHERE id=?', req.params.id); if (!u) throw E.notFound('User');
  const temp = `Ss@${randomToken(6)}7`;
  run("UPDATE users SET password_hash=?, password_changed_at='2000-01-01', failed_attempts=0, locked_until=NULL WHERE id=?", bcrypt.hashSync(temp, 10), u.id);
  audit(req, 'user.password_reset_by_admin', 'user', u.id);
  res.json({ temporaryPassword: temp, message: 'Share this temporary password securely. The user must change it at next sign-in.' });
}));
r.post('/users', ah(async (req, res) => {
  const d = z.object({ name: z.string().min(2), email: z.string().email(), phone: z.string() }).parse(req.body);
  const { normPhone } = require('./auth'); const { encrypt, hmac, maskPhone } = require('../utils/crypto');
  const phone = normPhone(d.phone);
  if (one('SELECT 1 FROM users WHERE email=?', d.email.toLowerCase())) throw E.conflict('Email already registered.');
  const temp = `Ss@${randomToken(6)}5`;
  const x = run("INSERT INTO users(role,name,email,phone_hash,phone_enc,phone_masked,password_hash,status,phone_verified,mfa_enabled,password_changed_at) VALUES('admin',?,?,?,?,?,?,'active',1,1,'2000-01-01')", d.name, d.email.toLowerCase(), hmac(phone), encrypt(phone), maskPhone(phone), bcrypt.hashSync(temp, 10));
  run('INSERT INTO notification_prefs(user_id) VALUES(?)', x.lastInsertRowid);
  audit(req, 'admin.create', 'user', x.lastInsertRowid);
  res.status(201).json({ id: Number(x.lastInsertRowid), temporaryPassword: temp });
}));
r.delete('/users/:id', ah(async (req, res) => {
  const u = one('SELECT * FROM users WHERE id=?', req.params.id); if (!u) throw E.notFound('User');
  if (u.id === req.user.id) throw E.bad('You cannot delete your own account here.');
  db.transaction(() => { run('DELETE FROM activity_events WHERE user_id=?', u.id); run('DELETE FROM outbox WHERE user_id=?', u.id); run('DELETE FROM users WHERE id=?', u.id); })();
  audit(req, 'user.erase_by_admin', 'user', u.id, { role: u.role });
  res.json({ ok: true });
}));

// ---------- Employers / verification (manual fallback) ----------
r.get('/companies', (req, res) => {
  const st = req.query.status;
  const items = all(`SELECT c.*, (SELECT COUNT(*) FROM jobs j WHERE j.company_id=c.id) jobs, (SELECT COUNT(*) FROM employer_users e WHERE e.company_id=c.id) users,
                      (SELECT COUNT(*) FROM company_documents d WHERE d.company_id=c.id) documents FROM companies c ${st ? 'WHERE c.verification_status=?' : ''} ORDER BY CASE c.verification_status WHEN 'manual_review' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, c.id DESC`, ...(st ? [st] : []));
  res.json({ items: items.map((c) => ({ ...c, gstinCheck: c.gstin ? gov.validateGstin(c.gstin) : null })) });
});
r.post('/companies/:id/verify', ah(async (req, res) => {
  const { decision, note } = z.object({ decision: z.enum(['verified', 'rejected', 'manual_review']), note: z.string().max(300).optional() }).parse(req.body);
  const c = one('SELECT * FROM companies WHERE id=?', req.params.id); if (!c) throw E.notFound('Company');
  run(`UPDATE companies SET verification_status=?, verification_notes=?, verified_at=CASE WHEN ?='verified' THEN datetime('now') ELSE verified_at END WHERE id=?`, decision, note || null, decision, c.id);
  for (const u of all('SELECT user_id FROM employer_users WHERE company_id=?', c.id)) notify.notify(u.user_id, { type: 'verification', title: `Company verification: ${decision.replace('_', ' ')}`, body: note || '', link: '/employer/company', emailTemplate: 'verification', emailVars: { company: c.name, status: decision, note } });
  audit(req, 'company.manual_verification', 'company', c.id, { decision, note });
  res.json({ ok: true });
}));

// ---------- Jobs moderation ----------
r.get('/jobs', (req, res) => {
  const { p, size, off } = page(req); const c = []; const v = [];
  if (req.query.status) { c.push('j.status=?'); v.push(req.query.status); }
  if (req.query.source) { c.push(req.query.source === 'direct' ? "j.source='direct'" : "j.source<>'direct'"); }
  if (req.query.q) { c.push('(j.title LIKE ? OR c.name LIKE ? OR j.external_company LIKE ?)'); v.push(`%${req.query.q}%`, `%${req.query.q}%`, `%${req.query.q}%`); }
  const w = c.length ? `WHERE ${c.join(' AND ')}` : '';
  const rows = all(`SELECT j.*, c.name company_name, c.verification_status company_verification, p.name portal_name, (SELECT COUNT(*) FROM applications a WHERE a.job_id=j.id) applicants FROM jobs j LEFT JOIN companies c ON c.id=j.company_id LEFT JOIN portals p ON p.id=j.portal_id ${w} ORDER BY j.id DESC LIMIT ? OFFSET ?`, ...v, size, off);
  res.json({ items: rows.map((j) => jobCard(j, { applicants: j.applicants, views: j.views, allowed: jobsSvc.TRANSITIONS[j.status], createdAt: j.created_at })), total: one(`SELECT COUNT(*) c FROM jobs j LEFT JOIN companies c ON c.id=j.company_id ${w}`, ...v).c, page: p, pageSize: size });
});
r.post('/jobs/:id/status', ah(async (req, res) => {
  const { status, reason } = z.object({ status: z.enum(['active', 'paused', 'archived']), reason: z.string().min(3, 'Give a reason for moderation').max(200) }).parse(req.body);
  const j = jobsSvc.transition(Number(req.params.id), status, { actorId: req.user.id, reason: `Admin: ${reason}` });
  if (j.posted_by) notify.notify(j.posted_by, { type: 'moderation', title: `Your job "${j.title}" was ${status === 'active' ? 'reactivated' : status} by an administrator`, body: reason, link: `/employer/jobs/${j.id}` });
  audit(req, `job.moderate.${status}`, 'job', j.id, { reason });
  res.json({ ok: true, status: j.status });
}));

// ---------- Taxonomy ----------
const TAX = {
  skills: { cols: ['name', 'category', 'synonyms'], schema: z.object({ name: z.string().trim().min(1).max(60), category: z.string().trim().max(40).default('General'), synonyms: z.array(z.string().trim().max(40)).max(20).default([]) }) },
  sectors: { cols: ['name'], schema: z.object({ name: z.string().trim().min(2).max(80) }) },
  occupations: { cols: ['title', 'nco_code', 'sector', 'skill_ids'], schema: z.object({ title: z.string().trim().min(2).max(100), nco_code: z.string().max(20).optional().nullable(), sector: z.string().max(80).optional().nullable(), skill_ids: z.array(z.number()).default([]) }) },
  trainings: { cols: ['title', 'provider', 'url', 'duration', 'skill_ids'], schema: z.object({ title: z.string().trim().min(2).max(120), provider: z.string().trim().min(2).max(80), url: z.string().url().optional().nullable(), duration: z.string().max(40).optional().nullable(), skill_ids: z.array(z.number()).default([]) }) },
};
const enc = (v) => (Array.isArray(v) ? JSON.stringify(v) : v ?? null);
r.get('/taxonomy/:kind', (req, res) => {
  const t = TAX[req.params.kind]; if (!t) throw E.notFound('Taxonomy');
  let rows = all(`SELECT * FROM ${req.params.kind} ORDER BY ${t.cols[0]}`);
  if (req.params.kind === 'skills') {
    const dem = new Map(all("SELECT skill_id, COUNT(*) c FROM job_skills js JOIN jobs j ON j.id=js.job_id WHERE j.status='active' GROUP BY skill_id").map((x) => [x.skill_id, x.c]));
    const sup = new Map(all('SELECT skill_id, COUNT(*) c FROM seeker_skills GROUP BY skill_id').map((x) => [x.skill_id, x.c]));
    rows = rows.map((s) => ({ ...s, synonyms: json(s.synonyms, []), jobs: dem.get(s.id) || 0, seekers: sup.get(s.id) || 0 }));
  } else rows = rows.map((x) => (x.skill_ids ? { ...x, skill_ids: json(x.skill_ids, []) } : x));
  res.json({ items: rows, cache: taxonomy.cacheStats() });
});
r.post('/taxonomy/:kind', ah(async (req, res) => {
  const t = TAX[req.params.kind]; if (!t) throw E.notFound('Taxonomy');
  const d = t.schema.parse(req.body);
  try { const x = run(`INSERT INTO ${req.params.kind}(${t.cols.join(',')}) VALUES(${t.cols.map(() => '?').join(',')})`, ...t.cols.map((c) => enc(d[c]))); taxonomy.invalidate(); engine.invalidate(); audit(req, `taxonomy.${req.params.kind}.create`, req.params.kind, x.lastInsertRowid, d); res.status(201).json({ id: Number(x.lastInsertRowid) }); }
  catch (e) { if (String(e.message).includes('UNIQUE')) throw E.conflict('An entry with this name already exists.'); throw e; }
}));
r.put('/taxonomy/:kind/:id', ah(async (req, res) => {
  const t = TAX[req.params.kind]; if (!t) throw E.notFound('Taxonomy');
  const d = t.schema.parse(req.body);
  run(`UPDATE ${req.params.kind} SET ${t.cols.map((c) => `${c}=?`).join(',')} WHERE id=?`, ...t.cols.map((c) => enc(d[c])), req.params.id);
  taxonomy.invalidate(); engine.invalidate(); audit(req, `taxonomy.${req.params.kind}.update`, req.params.kind, req.params.id, d);
  res.json({ ok: true });
}));
r.delete('/taxonomy/:kind/:id', (req, res) => {
  if (!TAX[req.params.kind]) throw E.notFound('Taxonomy');
  run(`DELETE FROM ${req.params.kind} WHERE id=?`, req.params.id);
  taxonomy.invalidate(); engine.invalidate(); audit(req, `taxonomy.${req.params.kind}.delete`, req.params.kind, req.params.id);
  res.json({ ok: true });
});

// ---------- Settings & matching ----------
r.get('/settings', (_req, res) => res.json({ settings: settings.getAll(), defaults: settings.DEFAULTS, meta: settings.meta() }));
r.put('/settings', ah(async (req, res) => {
  const body = z.record(z.any()).parse(req.body);
  const checks = {
    match_weights: z.object({ skills: z.number().min(0).max(1), education: z.number().min(0).max(1), experience: z.number().min(0).max(1), location: z.number().min(0).max(1), salary: z.number().min(0).max(1) }),
    match_threshold: z.number().min(0).max(100), cf_blend: z.number().min(0).max(0.8), session_timeout_minutes: z.number().int().min(5).max(1440),
    lockout_attempts: z.number().int().min(3).max(20), lockout_minutes: z.number().int().min(1).max(1440),
    password_policy: z.object({ minLength: z.number().int().min(8).max(64), upper: z.boolean(), lower: z.boolean(), digit: z.boolean(), symbol: z.boolean(), maxAgeDays: z.number().int().min(0).max(730) }),
    mfa_required_roles: z.array(z.enum(['admin', 'employer', 'seeker', 'portal'])).refine((a) => a.includes('admin'), 'MFA must stay mandatory for administrators (NFR-22)'),
    job_default_validity_days: z.number().int().min(1).max(180), employer_auto_approve_verified: z.boolean(), log_retention_days: z.number().int().min(90).max(3650), maintenance_banner: z.string().max(240),
  };
  for (const [k, v] of Object.entries(body)) { if (!checks[k]) throw E.bad(`Unknown setting: ${k}`); settings.set(k, checks[k].parse(v), req.user.id); }
  if (body.match_weights) engine.invalidate();
  audit(req, 'settings.update', 'settings', Object.keys(body).join(','), body);
  res.json({ settings: settings.getAll() });
}));
r.get('/matching/info', (_req, res) => res.json({ engine: engine.info(), recommender: recommender.info(), weights: settings.get('match_weights'), threshold: settings.get('match_threshold'), cfBlend: settings.get('cf_blend') }));
r.post('/matching/retrain', (req, res) => { engine.invalidate(); engine.ensureIndex(); const info = recommender.train(); audit(req, 'matching.retrain', 'engine', null, info); res.json({ engine: engine.info(), recommender: info }); });
r.post('/matching/preview', ah(async (req, res) => {
  const { seekerId, jobId, weights } = z.object({ seekerId: z.coerce.number(), jobId: z.coerce.number(), weights: z.record(z.number()).optional() }).parse(req.body);
  const s = engine.loadSeeker(seekerId); const j = engine.loadJobs('j.id=?', [jobId])[0];
  if (!s || !j) throw E.notFound('Seeker or job');
  let w; if (weights) { const sum = Object.values(weights).reduce((a, b) => a + b, 0) || 1; w = Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, v / sum])); }
  res.json({ seeker: { id: s.id, name: s.name }, job: { id: j.id, title: j.title }, result: engine.scorePair(s, j, w ? { weights: w } : {}) });
}));
r.get('/matching/sample', (_req, res) => res.json({ seekers: all("SELECT u.id, u.name FROM users u WHERE role='seeker' AND status='active' ORDER BY id LIMIT 50"), jobs: all("SELECT id, title FROM jobs WHERE status='active' ORDER BY id DESC LIMIT 50") }));

// ---------- CMS: news & FAQ ----------
const newsSchema = z.object({ title: z.string().trim().min(5).max(160), summary: z.string().max(300).optional().nullable(), body: z.string().min(20), category: z.string().max(40).default('Update'), tags: z.array(z.string().max(40)).max(15).default([]), status: z.enum(['draft', 'published']).default('draft') });
r.get('/news', (_req, res) => res.json({ items: all('SELECT n.*, u.name author FROM news n LEFT JOIN users u ON u.id=n.author_id ORDER BY n.id DESC').map((n) => ({ ...n, tags: json(n.tags, []) })) }));
r.post('/news', ah(async (req, res) => {
  const d = newsSchema.parse(req.body);
  const x = run(`INSERT INTO news(title, slug, summary, body, category, tags, status, author_id, published_at) VALUES(?,?,?,?,?,?,?,?, CASE WHEN ?='published' THEN datetime('now') END)`, d.title, uniqueSlug('news', d.title), d.summary || null, d.body, d.category, JSON.stringify(d.tags), d.status, req.user.id, d.status);
  audit(req, 'news.create', 'news', x.lastInsertRowid); res.status(201).json({ id: Number(x.lastInsertRowid) });
}));
r.put('/news/:id', ah(async (req, res) => {
  const d = newsSchema.parse(req.body);
  run(`UPDATE news SET title=?, summary=?, body=?, category=?, tags=?, status=?, published_at=CASE WHEN ?='published' THEN COALESCE(published_at, datetime('now')) ELSE NULL END WHERE id=?`, d.title, d.summary || null, d.body, d.category, JSON.stringify(d.tags), d.status, d.status, req.params.id);
  audit(req, 'news.update', 'news', req.params.id); res.json({ ok: true });
}));
r.delete('/news/:id', (req, res) => { run('DELETE FROM news WHERE id=?', req.params.id); audit(req, 'news.delete', 'news', req.params.id); res.json({ ok: true }); });
const faqSchema = z.object({ question: z.string().trim().min(5).max(300), answer: z.string().min(5), category: z.string().max(60).default('General'), context: z.string().max(200).optional().nullable(), video_url: z.string().url().optional().nullable().or(z.literal('')) });
r.get('/faqs', (_req, res) => res.json({ items: all('SELECT * FROM faqs ORDER BY category, id') }));
r.post('/faqs', ah(async (req, res) => { const d = faqSchema.parse(req.body); const x = run('INSERT INTO faqs(question, answer, category, context, video_url) VALUES(?,?,?,?,?)', d.question, d.answer, d.category, d.context || null, d.video_url || null); audit(req, 'faq.create', 'faq', x.lastInsertRowid); res.status(201).json({ id: Number(x.lastInsertRowid) }); }));
r.put('/faqs/:id', ah(async (req, res) => { const d = faqSchema.parse(req.body); run('UPDATE faqs SET question=?, answer=?, category=?, context=?, video_url=? WHERE id=?', d.question, d.answer, d.category, d.context || null, d.video_url || null, req.params.id); audit(req, 'faq.update', 'faq', req.params.id); res.json({ ok: true }); }));
r.delete('/faqs/:id', (req, res) => { run('DELETE FROM faqs WHERE id=?', req.params.id); audit(req, 'faq.delete', 'faq', req.params.id); res.json({ ok: true }); });

// ---------- Integrations ----------
r.get('/portals', (_req, res) => res.json({ items: all('SELECT p.*, u.name owner_name, u.email owner_email, u.status owner_status FROM portals p LEFT JOIN users u ON u.id=p.owner_user_id ORDER BY p.id').map((p) => ({ id: p.id, name: p.name, slug: p.slug, adapter: p.adapter, status: p.status, rateLimitPerMin: p.rate_limit_per_min, ipWhitelist: json(p.ip_whitelist, []), apiKeyPrefix: p.api_key_prefix, owner: p.owner_name ? { name: p.owner_name, email: p.owner_email, status: p.owner_status, id: p.owner_user_id } : null, health: sync.health(p.id) })) }));
r.post('/portals', ah(async (req, res) => {
  const d = z.object({ name: z.string().trim().min(2).max(80), adapter: z.enum(['generic', 'naukri', 'foundit', 'ncs']).default('generic'), rateLimitPerMin: z.number().int().min(1).max(6000).default(60) }).parse(req.body);
  const x = run('INSERT INTO portals(name, slug, adapter, rate_limit_per_min) VALUES(?,?,?,?)', d.name, uniqueSlug('portals', d.name), d.adapter, d.rateLimitPerMin);
  audit(req, 'portal.create', 'portal', x.lastInsertRowid, d); res.status(201).json({ id: Number(x.lastInsertRowid) });
}));
r.patch('/portals/:id', ah(async (req, res) => {
  const d = z.object({ status: z.enum(['active', 'suspended']).optional(), rateLimitPerMin: z.number().int().min(1).max(6000).optional(), adapter: z.enum(['generic', 'naukri', 'foundit', 'ncs']).optional() }).parse(req.body);
  if (d.status) run('UPDATE portals SET status=? WHERE id=?', d.status, req.params.id);
  if (d.rateLimitPerMin) run('UPDATE portals SET rate_limit_per_min=? WHERE id=?', d.rateLimitPerMin, req.params.id);
  if (d.adapter) run('UPDATE portals SET adapter=? WHERE id=?', d.adapter, req.params.id);
  audit(req, 'portal.update', 'portal', req.params.id, d); res.json({ ok: true });
}));
r.post('/portals/:id/pull', ah(async (req, res) => {
  const p = one('SELECT * FROM portals WHERE id=?', req.params.id); if (!p) throw E.notFound('Portal');
  const out = sync.pull(p); audit(req, 'portal.pull', 'portal', p.id, { ok: out.ok, failed: out.failed }); res.json(out);
}));
r.get('/portals/:id/logs', (req, res) => res.json({ items: all('SELECT * FROM sync_logs WHERE portal_id=? ORDER BY id DESC LIMIT 100', req.params.id), daily: sync.daily(Number(req.params.id)) }));
r.get('/dead-letters', (_req, res) => res.json({ items: all("SELECT d.*, p.name portal FROM dead_letters d JOIN portals p ON p.id=d.portal_id ORDER BY d.status='pending' DESC, d.id DESC LIMIT 200").map((d) => ({ ...d, payload: json(d.payload, {}) })) }));
r.post('/dead-letters/:id/retry', (req, res) => { const out = sync.retryDeadLetter(Number(req.params.id)); if (!out) throw E.notFound('Dead letter'); res.json({ ok: out.ok, result: out.body }); });
r.post('/dead-letters/:id/discard', (req, res) => { run("UPDATE dead_letters SET status='discarded' WHERE id=?", req.params.id); res.json({ ok: true }); });
r.get('/integrations/government', (_req, res) => res.json({ services: Object.entries(gov.breakers).map(([k, b]) => ({ key: k, name: b.name, state: b.state, failures: b.failures })),
  recent: all("SELECT action, entity_id, details, created_at FROM audit_logs WHERE action IN ('company.verification','seeker.ekyc_verified','seeker.digilocker_fetch') ORDER BY id DESC LIMIT 20").map((x) => ({ ...x, details: json(x.details, {}) })) }));

// ---------- Analytics ----------
const filt = (req) => ({ from: req.query.from || null, to: req.query.to || null, state: req.query.state || null, sector: req.query.sector || null });
r.get('/analytics/employment', (req, res) => res.json(analytics.employment(filt(req))));
r.get('/analytics/skill-gap', (req, res) => res.json({ items: analytics.skillGap(Number(req.query.limit) || 15) }));
r.get('/analytics/activity', (req, res) => res.json(analytics.activity(Number(req.query.days) || 14)));
r.get('/analytics/match-accuracy', (_req, res) => res.json(analytics.matchAccuracy()));
r.get('/analytics/system', (_req, res) => res.json({ metrics: metrics.snapshot(), engine: engine.info(), recommender: recommender.info(), cache: taxonomy.cacheStats(), events: events.stats(),
  outbox: Object.fromEntries(all('SELECT channel || \':\' || status k, COUNT(*) c FROM outbox GROUP BY k').map((x) => [x.k, x.c])),
  breakers: Object.values(gov.breakers).map((b) => ({ name: b.name, state: b.state })), dbSizeMb: Number(((one('PRAGMA page_count').page_count * one('PRAGMA page_size').page_size) / 1048576).toFixed(2)) }));

// ---------- Reports ----------
r.get('/reports/datasets', (_req, res) => res.json({ items: Object.entries(reports.DATASETS).map(([k, v]) => ({ key: k, label: v.label, columns: v.columns })) }));
r.get('/reports/:dataset/preview', (req, res) => { if (!reports.DATASETS[req.params.dataset]) throw E.notFound('Dataset'); res.json(reports.preview(req.params.dataset, filt(req))); });
r.get('/reports/:dataset/export', (req, res) => {
  const ds = req.params.dataset; if (!reports.DATASETS[ds]) throw E.notFound('Dataset');
  audit(req, 'report.export', 'report', ds, { format: req.query.format || 'csv', ...filt(req) });
  if (req.query.format === 'pdf') return reports.pdf(res, ds, filt(req));
  if (req.query.format === 'json') return res.json({ dataset: ds, generatedAt: new Date().toISOString(), rows: [...reports.rowsOf(ds, filt(req))] });
  reports.streamCsv(res, ds, filt(req));
});
r.get('/reports/schedules', (_req, res) => res.json({ items: all('SELECT * FROM report_schedules ORDER BY id DESC').map((s) => ({ ...s, filters: json(s.filters, {}) })) }));
r.post('/reports/schedules', ah(async (req, res) => {
  const d = z.object({ name: z.string().min(2).max(80), dataset: z.enum(Object.keys(reports.DATASETS)), format: z.enum(['csv', 'pdf']).default('csv'), frequency: z.enum(['daily', 'weekly', 'monthly']), recipient: z.string().email(), filters: z.record(z.any()).default({}) }).parse(req.body);
  const x = run('INSERT INTO report_schedules(name, dataset, filters, format, frequency, recipient, created_by) VALUES(?,?,?,?,?,?,?)', d.name, d.dataset, JSON.stringify(d.filters), d.format, d.frequency, d.recipient, req.user.id);
  audit(req, 'report.schedule', 'report', x.lastInsertRowid, d); res.status(201).json({ id: Number(x.lastInsertRowid) });
}));
r.delete('/reports/schedules/:id', (req, res) => { run('DELETE FROM report_schedules WHERE id=?', req.params.id); res.json({ ok: true }); });
r.post('/reports/schedules/run', (req, res) => res.json({ ran: reports.runSchedules(notify) }));

// ---------- Audit & security ----------
r.get('/audit', (req, res) => {
  const { p, size, off } = page(req); const c = []; const v = [];
  if (req.query.action) { c.push('a.action LIKE ?'); v.push(`%${req.query.action}%`); }
  if (req.query.actor) { c.push('a.actor_id=?'); v.push(req.query.actor); }
  const w = c.length ? `WHERE ${c.join(' AND ')}` : '';
  res.json({ items: all(`SELECT a.*, u.name actor_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ${w} ORDER BY a.id DESC LIMIT ? OFFSET ?`, ...v, size, off).map((a) => ({ ...a, details: json(a.details, null) })), total: one(`SELECT COUNT(*) c FROM audit_logs a ${w}`, ...v).c, page: p, pageSize: size });
});
r.get('/audit/verify', (_req, res) => res.json(verifyChain()));
r.get('/access-logs', (req, res) => { const { size, off } = page(req); res.json({ items: all(`SELECT * FROM access_logs ${req.query.event ? 'WHERE event LIKE ?' : ''} ORDER BY id DESC LIMIT ? OFFSET ?`, ...(req.query.event ? [`%${req.query.event}%`] : []), size, off), byEvent: all("SELECT event, COUNT(*) c FROM access_logs WHERE created_at > datetime('now','-7 days') GROUP BY event ORDER BY c DESC") }); });
r.get('/security-events', (_req, res) => res.json({ items: all('SELECT * FROM security_events ORDER BY id DESC LIMIT 200'), byType: all("SELECT type, severity, COUNT(*) c FROM security_events WHERE created_at > datetime('now','-7 days') GROUP BY type, severity") }));
r.get('/error-logs', (_req, res) => res.json({ items: all('SELECT id, ref, method, path, message, created_at FROM error_logs ORDER BY id DESC LIMIT 100') }));

// ---------- Outbox & backups ----------
r.get('/outbox', (req, res) => { const ch = req.query.channel; res.json({ items: all(`SELECT * FROM outbox ${ch ? 'WHERE channel=?' : ''} ORDER BY id DESC LIMIT 100`, ...(ch ? [ch] : [])), stats: all('SELECT channel, status, COUNT(*) c FROM outbox GROUP BY channel, status') }); });
r.post('/outbox/process', (_req, res) => res.json({ sent: notify.processOutbox(200) }));
r.post('/outbox/digest', (_req, res) => res.json({ digests: notify.sendDigests() }));
r.get('/backups', (_req, res) => res.json({ items: all('SELECT * FROM backups ORDER BY id DESC') }));
r.post('/backups', ah(async (req, res) => { const b = await backup.backup('manual'); audit(req, 'backup.create', 'backup', b.file, b); res.status(201).json(b); }));

module.exports = r;
module.exports._slugify = slugify;
