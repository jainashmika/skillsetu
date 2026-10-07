// Third-party portal console (SRS 3.1.3, 4.1 External Job Sites): API credentials, IP whitelist,
// field mapping, sync dashboard, submission logs and the dead-letter queue.
const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { one, all, run, json } = require('../db');
const { E, ah } = require('../utils/errors');
const { requireRole } = require('../middleware/auth');
const { randomToken } = require('../utils/crypto');
const sync = require('../services/integrations/portalSync');
const { adapters, transform } = require('../services/integrations/portalAdapters');
const { audit } = require('../services/audit');
const { jobCard } = require('../services/serialize');
const engine = require('../services/matching/engine');

const r = express.Router();
r.use(requireRole('portal'));
const myPortal = (req) => { const p = one('SELECT * FROM portals WHERE owner_user_id=?', req.user.id); if (!p) throw E.notFound('Portal'); return p; };
const portalOut = (p) => ({ id: p.id, name: p.name, slug: p.slug, status: p.status, adapter: p.adapter, rateLimitPerMin: p.rate_limit_per_min, ipWhitelist: json(p.ip_whitelist, []), fieldMapping: json(p.field_mapping, {}), apiKeyPrefix: p.api_key_prefix, hasKey: !!p.api_key_hash, createdAt: p.created_at });

r.get('/overview', (req, res) => {
  const p = myPortal(req);
  res.json({ portal: portalOut(p), health: sync.health(p.id), daily: sync.daily(p.id), adapters: Object.fromEntries(Object.entries(adapters).map(([k, v]) => [k, { label: v.label, sample: v.sample }])),
    recent: all('SELECT * FROM sync_logs WHERE portal_id=? ORDER BY id DESC LIMIT 10', p.id) });
});
r.get('/logs', (req, res) => {
  const p = myPortal(req); const ok = req.query.ok; const page = Math.max(1, Number(req.query.page) || 1);
  const where = ok === 'true' ? 'AND ok=1' : ok === 'false' ? 'AND ok=0' : '';
  res.json({ items: all(`SELECT * FROM sync_logs WHERE portal_id=? ${where} ORDER BY id DESC LIMIT 50 OFFSET ?`, p.id, (page - 1) * 50), total: one(`SELECT COUNT(*) c FROM sync_logs WHERE portal_id=? ${where}`, p.id).c });
});
r.get('/dead-letters', (req, res) => { const p = myPortal(req); res.json({ items: all("SELECT * FROM dead_letters WHERE portal_id=? ORDER BY status='pending' DESC, id DESC LIMIT 100", p.id).map((d) => ({ ...d, payload: json(d.payload, {}) })) }); });
r.post('/dead-letters/:id/retry', ah(async (req, res) => {
  const p = myPortal(req); const d = one('SELECT * FROM dead_letters WHERE id=? AND portal_id=?', req.params.id, p.id); if (!d) throw E.notFound('Failed submission');
  if (req.body?.payload) run('UPDATE dead_letters SET payload=? WHERE id=?', JSON.stringify(req.body.payload), d.id);
  const r2 = sync.retryDeadLetter(d.id); res.json({ ok: r2.ok, result: r2.body });
}));
r.post('/dead-letters/:id/discard', (req, res) => { const p = myPortal(req); run("UPDATE dead_letters SET status='discarded' WHERE id=? AND portal_id=?", req.params.id, p.id); res.json({ ok: true }); });

r.post('/api-key/rotate', ah(async (req, res) => {
  const p = myPortal(req);
  if (p.status !== 'active') throw E.forbidden('Your integration must be approved by an administrator before you can create API keys.');
  const key = `ssk_live_${randomToken(24)}`;
  run('UPDATE portals SET api_key_hash=?, api_key_prefix=? WHERE id=?', bcrypt.hashSync(key, 10), key.slice(0, 14), p.id);
  audit(req, 'portal.key_rotated', 'portal', p.id);
  res.json({ apiKey: key, clientId: p.slug, message: 'Copy this key now. For security it will not be shown again.' });
}));
r.put('/settings', ah(async (req, res) => {
  const p = myPortal(req);
  const d = z.object({ ipWhitelist: z.array(z.string().trim().regex(/^[\d.:a-fA-F/]+$/, 'Enter IPv4/IPv6 addresses or CIDR ranges')).max(20), fieldMapping: z.record(z.string()).default({}), adapter: z.enum(Object.keys(adapters)) }).parse(req.body);
  run('UPDATE portals SET ip_whitelist=?, field_mapping=?, adapter=? WHERE id=?', JSON.stringify(d.ipWhitelist), JSON.stringify(d.fieldMapping), d.adapter, p.id);
  audit(req, 'portal.settings', 'portal', p.id, d);
  res.json({ portal: portalOut(myPortal(req)) });
}));
// Dry-run a payload through the adapter + validation without writing anything.
r.post('/test-mapping', ah(async (req, res) => {
  const p = myPortal(req);
  const out = transform(req.body.adapter || p.adapter, req.body.payload || {}, req.body.fieldMapping || json(p.field_mapping, {}));
  let valid = true; let errors = null;
  try { require('../services/jobs').jobSchema.parse(out.job); } catch (e) { valid = false; errors = e.issues?.map((i) => `${i.path.join('.')}: ${i.message}`); }
  res.json({ transformed: out, valid, errors });
}));
r.get('/jobs', (req, res) => {
  const p = myPortal(req);
  res.json({ items: engine.loadJobs('j.portal_id = ? ORDER BY j.updated_at DESC LIMIT 200', [p.id]).map((j) => jobCard(j, { externalId: j.external_id })) });
});

module.exports = r;
