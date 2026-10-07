// Public versioned API (SRS 3.4.3): OAuth 2.0 client-credentials for portals, idempotent job push
// endpoints, bulk upload, sandbox mode, public job feed in JSON or XML (legacy government systems).
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { one, all, run, json } = require('../db');
const { E, ah } = require('../utils/errors');
const config = require('../config');
const { TokenBucket } = require('../utils/ds');
const sync = require('../services/integrations/portalSync');
const { transform } = require('../services/integrations/portalAdapters');
const jobsSvc = require('../services/jobs');
const engine = require('../services/matching/engine');
const taxonomy = require('../services/taxonomy');
const { jobCard } = require('../services/serialize');

const r = express.Router();
const buckets = new TokenBucket();

function ipAllowed(list, ip) {
  if (!list.length) return true;
  const clean = String(ip || '').replace(/^::ffff:/, '');
  return list.some((entry) => {
    if (!entry.includes('/')) return entry === clean || entry === ip;
    const [base, bits] = entry.split('/'); const toInt = (a) => a.split('.').reduce((s, o) => (s << 8) + Number(o), 0) >>> 0;
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(clean) || !/^\d+\.\d+\.\d+\.\d+$/.test(base)) return false;
    const mask = bits === '0' ? 0 : (~0 << (32 - Number(bits))) >>> 0;
    return (toInt(clean) & mask) === (toInt(base) & mask);
  });
}

async function findPortalByKey(key) {
  if (!key || !key.startsWith('ssk_')) return null;
  for (const p of all("SELECT * FROM portals WHERE api_key_prefix=? AND status='active'", key.slice(0, 14))) if (await bcrypt.compare(key, p.api_key_hash)) return p;
  return null;
}

// OAuth 2.0 token endpoint (client_credentials). client_id = portal slug, client_secret = API key.
r.post('/oauth/token', express.urlencoded({ extended: false }), ah(async (req, res) => {
  const b = { ...req.body };
  if (req.headers.authorization?.startsWith('Basic ')) { const [id, secret] = Buffer.from(req.headers.authorization.slice(6), 'base64').toString().split(':'); b.client_id = id; b.client_secret = secret; }
  if (b.grant_type !== 'client_credentials') return res.status(400).json({ error: 'unsupported_grant_type' });
  const p = await findPortalByKey(b.client_secret);
  if (!p || p.slug !== b.client_id) return res.status(401).json({ error: 'invalid_client' });
  const token = jwt.sign({ sub: `portal:${p.id}`, scope: 'jobs:write jobs:read' }, config.jwtSecret, { expiresIn: '1h', issuer: 'skillsetu', audience: 'skillsetu-api' });
  res.json({ access_token: token, token_type: 'Bearer', expires_in: 3600, scope: 'jobs:write jobs:read' });
}));

const portalAuth = ah(async (req, res, next) => {
  let portal = null;
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    try { const p = jwt.verify(auth.slice(7), config.jwtSecret, { issuer: 'skillsetu', audience: 'skillsetu-api' }); portal = one("SELECT * FROM portals WHERE id=? AND status='active'", Number(String(p.sub).split(':')[1])); } catch { /* invalid */ }
  } else portal = await findPortalByKey(req.headers['x-api-key']);
  if (!portal) throw E.unauth('Missing or invalid API credentials. Send X-API-Key or an OAuth bearer token.');
  if (!ipAllowed(json(portal.ip_whitelist, []), req.ip)) {
    run('INSERT INTO security_events(type,severity,ip,detail) VALUES(?,?,?,?)', 'ip_blocked', 'high', req.ip, `Portal ${portal.slug} call from non-whitelisted IP`);
    sync.log(portal.id, 'push', 'auth', null, 403, false, `IP ${req.ip} not whitelisted`, 0);
    throw E.forbidden('Your IP address is not on this integration\'s whitelist.');
  }
  const rl = buckets.take(`portal:${portal.id}`, portal.rate_limit_per_min);
  res.setHeader('X-RateLimit-Limit', portal.rate_limit_per_min); res.setHeader('X-RateLimit-Remaining', rl.remaining);
  if (!rl.ok) { res.setHeader('Retry-After', rl.retryAfterSec); sync.log(portal.id, 'push', 'rate_limit', null, 429, false, 'Rate limit exceeded', 0); throw E.tooMany(`Rate limit of ${portal.rate_limit_per_min} requests/minute exceeded.`); }
  req.portal = portal; req.sandbox = String(req.headers['x-sandbox'] || '').toLowerCase() === 'true';
  next();
});

// Idempotency: replay the stored response for a repeated Idempotency-Key.
function idempotent(handler) {
  return ah(async (req, res) => {
    const key = req.headers['idempotency-key'];
    if (key && !req.sandbox) {
      const prev = one('SELECT * FROM idempotency_keys WHERE key=? AND portal_id=?', String(key), req.portal.id);
      if (prev) { res.setHeader('Idempotent-Replay', 'true'); return res.status(prev.status).json(JSON.parse(prev.response)); }
    }
    const out = await handler(req);
    if (key && !req.sandbox) run('INSERT OR IGNORE INTO idempotency_keys(key, portal_id, status, response) VALUES(?,?,?,?)', String(key), req.portal.id, out.statusCode, JSON.stringify(out.body));
    res.status(out.statusCode).json(out.body);
  });
}
function sandboxRun(portal, payload) {
  const out = transform(portal.adapter, payload, json(portal.field_mapping, {}));
  try { jobsSvc.jobSchema.parse(out.job); return { statusCode: 200, body: { sandbox: true, valid: true, transformed: out } }; }
  catch (e) { return { statusCode: 422, body: { sandbox: true, valid: false, errors: e.issues?.map((i) => `${i.path.join('.')}: ${i.message}`) || [e.message], transformed: out } }; }
}

r.get('/portal/status', portalAuth, (req, res) => res.json({ portal: { name: req.portal.name, slug: req.portal.slug, adapter: req.portal.adapter }, health: sync.health(req.portal.id), sandbox: req.sandbox }));
r.get('/portal/jobs', portalAuth, (req, res) => res.json({ items: engine.loadJobs('j.portal_id=? ORDER BY j.updated_at DESC LIMIT 500', [req.portal.id]).map((j) => ({ id: j.id, external_id: j.external_id, title: j.title, status: j.status, deadline: j.deadline, updated_at: j.updated_at })) }));
r.post('/portal/jobs', portalAuth, idempotent(async (req) => (req.sandbox ? sandboxRun(req.portal, req.body) : sync.upsertJob(req.portal, req.body))));
r.put('/portal/jobs/:externalId', portalAuth, idempotent(async (req) => {
  const idKey = { naukri: 'jobId', foundit: 'ref', ncs: 'ncsId' }[req.portal.adapter] || 'external_id';
  const payload = { ...req.body, [idKey]: req.params.externalId };
  if (req.sandbox) return sandboxRun(req.portal, payload);
  if (!one('SELECT 1 FROM jobs WHERE portal_id=? AND external_id=?', req.portal.id, req.params.externalId)) return { statusCode: 404, body: { error: 'not_found', message: 'No job with this external_id. Use POST to create.' } };
  return sync.upsertJob(req.portal, payload);
}));
r.patch('/portal/jobs/:externalId/deadline', portalAuth, ah(async (req, res) => {
  const { deadline } = z.object({ deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(req.body);
  const j = one('SELECT * FROM jobs WHERE portal_id=? AND external_id=?', req.portal.id, req.params.externalId); if (!j) throw E.notFound('Job');
  run("UPDATE jobs SET deadline=?, updated_at=datetime('now') WHERE id=?", deadline, j.id);
  if (j.status === 'expired' && deadline >= new Date().toISOString().slice(0, 10)) jobsSvc.transition(j.id, 'active', { reason: 'Deadline extended by portal' });
  sync.log(req.portal.id, 'push', 'deadline', j.external_id, 200, true, `Deadline -> ${deadline}`, 0); engine.invalidate();
  res.json({ id: j.id, external_id: j.external_id, deadline });
}));
r.delete('/portal/jobs/:externalId', portalAuth, (req, res) => { const out = sync.closeJob(req.portal, req.params.externalId); res.status(out.statusCode).json(out.body); });
r.post('/portal/jobs/bulk', portalAuth, express.text({ type: 'text/csv', limit: '2mb' }), ah(async (req, res) => {
  let items = req.body;
  if (typeof items === 'string') { // CSV
    const [head, ...lines] = items.trim().split(/\r?\n/); const cols = head.split(',').map((c) => c.trim());
    items = lines.map((l) => { const vals = l.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map((v) => v.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')); return Object.fromEntries(cols.map((c, i) => [c, vals[i]])); });
  }
  if (!Array.isArray(items) || items.length > 500) throw E.bad('Send a JSON array (or CSV) of up to 500 jobs.');
  const results = items.map((p) => (req.sandbox ? sandboxRun(req.portal, p) : sync.upsertJob(req.portal, p)));
  res.status(207).json({ total: items.length, succeeded: results.filter((x) => x.statusCode < 300).length, failed: results.filter((x) => x.statusCode >= 300).length, results: results.map((x) => ({ status: x.statusCode, ...x.body })) });
}));

// Public job feed for partners and legacy systems (JSON default, XML with ?format=xml).
r.get('/jobs', (req, res) => {
  const limit = Math.min(200, Number(req.query.limit) || 50);
  const jobs = engine.loadJobs(`j.status='active' ${req.query.since ? 'AND j.updated_at >= ?' : ''} ORDER BY j.published_at DESC LIMIT ${limit}`, req.query.since ? [req.query.since] : []).map((j) => jobCard(j));
  if (req.query.format === 'xml') {
    const x = (s) => String(s ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<jobs source="SkillSetu" generated="${new Date().toISOString()}">\n${jobs.map((j) => `  <job id="${j.id}"><title>${x(j.title)}</title><company>${x(j.company)}</company><city>${x(j.city)}</city><state>${x(j.state)}</state><contractType>${j.contractType}</contractType><workFormat>${j.workFormat}</workFormat><ctcMin>${j.ctcMin ?? ''}</ctcMin><ctcMax>${j.ctcMax ?? ''}</ctcMax><deadline>${j.deadline ?? ''}</deadline><skills>${j.skills.map((s) => `<skill>${x(s.name)}</skill>`).join('')}</skills></job>`).join('\n')}\n</jobs>`);
  } else res.json({ items: jobs, count: jobs.length });
});
r.get('/taxonomy/skills', (_req, res) => res.json({ items: taxonomy.skills().map(({ id, name, category, synonyms }) => ({ id, name, category, synonyms })) }));

module.exports = r;
module.exports.ipAllowed = ipAllowed;
