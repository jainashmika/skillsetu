// Ingestion pipeline for external portals: push (REST API) and pull (scheduled/manual feed fetch).
// Writes are idempotent on (portal, external_id); failures are logged and parked in a dead-letter
// queue so they can be retried without blocking the core platform (SRS 3.1.3, 3.4.1).
const { ZodError } = require('zod');
const { one, all, run, json } = require('../../db');
const jobs = require('../jobs');
const { transform, adapters } = require('./portalAdapters');

function log(portalId, direction, operation, externalId, statusCode, ok, message, ms) {
  run('INSERT INTO sync_logs(portal_id,direction,operation,external_id,status_code,ok,message,duration_ms) VALUES(?,?,?,?,?,?,?,?)',
    portalId, direction, operation, externalId || null, statusCode, ok ? 1 : 0, message ? String(message).slice(0, 500) : null, ms);
}
const zodMsg = (e) => e.issues.map((i) => `${i.path.join('.') || 'payload'}: ${i.message}`).join('; ');

function upsertJob(portal, payload, { direction = 'push', dlq = true } = {}) {
  const t = Date.now();
  let externalId = null;
  try {
    const { externalId: ext, company, job } = transform(portal.adapter, payload, json(portal.field_mapping, {}));
    externalId = ext;
    if (!externalId) throw Object.assign(new Error('external_id is required (your unique job reference).'), { status: 422 });
    const existing = one('SELECT id, status FROM jobs WHERE portal_id=? AND external_id=?', portal.id, externalId);
    const { job: saved, unknownSkills } = jobs.save(job, { id: existing?.id, portalId: portal.id, externalId, source: `portal:${portal.slug}`, externalCompany: company || portal.name });
    let status = saved.status;
    if (!existing || ['draft', 'expired'].includes(saved.status)) {
      try { status = jobs.transition(saved.id, 'active', { reason: `Synced from ${portal.name}` }).status; } catch (e) { status = saved.status; }
    }
    const op = existing ? 'update' : 'create';
    log(portal.id, direction, op, externalId, existing ? 200 : 201, true, unknownSkills.length ? `Unmapped skills: ${unknownSkills.join(', ')}` : null, Date.now() - t);
    return { ok: true, statusCode: existing ? 200 : 201, body: { id: saved.id, external_id: externalId, status, operation: op, unmapped_skills: unknownSkills, source_tag: `portal:${portal.slug}` } };
  } catch (e) {
    const msg = e instanceof ZodError ? zodMsg(e) : e.message;
    const code = e instanceof ZodError || e.status === 422 ? 422 : e.status || 500;
    log(portal.id, direction, 'upsert', externalId, code, false, msg, Date.now() - t);
    if (dlq) run('INSERT INTO dead_letters(portal_id, operation, payload, error) VALUES(?,?,?,?)', portal.id, 'upsert', JSON.stringify(payload), msg);
    return { ok: false, statusCode: code, body: { error: 'validation_failed', message: msg, external_id: externalId } };
  }
}

function closeJob(portal, externalId) {
  const t = Date.now();
  const j = one('SELECT id, status FROM jobs WHERE portal_id=? AND external_id=?', portal.id, String(externalId));
  if (!j) { log(portal.id, 'push', 'close', externalId, 404, false, 'Unknown external_id', Date.now() - t); return { ok: false, statusCode: 404, body: { error: 'not_found', message: 'No job with this external_id.' } }; }
  if (j.status !== 'archived') jobs.transition(j.id, 'archived', { reason: `Closed by ${portal.name}` });
  log(portal.id, 'push', 'close', externalId, 200, true, null, Date.now() - t);
  return { ok: true, statusCode: 200, body: { id: j.id, external_id: externalId, status: 'archived' } };
}

// Mock pull feed: realistic payloads in the portal's own schema, including one malformed record so
// the DLQ path is visible in the dashboard.
function mockFeed(portal) {
  const a = adapters[portal.adapter] || adapters.generic;
  const base = a.sample; const stamp = Date.now().toString(36).slice(-4).toUpperCase();
  const idKey = { generic: 'external_id', naukri: 'jobId', foundit: 'ref', ncs: 'ncsId' }[portal.adapter] || 'external_id';
  const bad = { ...base, [idKey]: `${base[idKey]}-BAD-${stamp}` };
  const titleKey = { generic: 'title', naukri: 'jobTitle', foundit: 'title', ncs: 'post' }[portal.adapter] || 'title';
  bad[titleKey] = '';
  return [{ ...base }, { ...base, [idKey]: `${base[idKey]}-${stamp}` }, bad];
}
function pull(portal) {
  const feed = mockFeed(portal);
  const results = feed.map((p) => upsertJob(portal, p, { direction: 'pull' }));
  return { fetched: feed.length, ok: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results: results.map((r) => r.body) };
}

function retryDeadLetter(id) {
  const d = one('SELECT * FROM dead_letters WHERE id=?', id); if (!d) return null;
  const portal = one('SELECT * FROM portals WHERE id=?', d.portal_id);
  const r = upsertJob(portal, JSON.parse(d.payload), { direction: 'retry', dlq: false });
  if (r.ok) run("UPDATE dead_letters SET status='resolved', attempts=attempts+1, last_attempt_at=datetime('now') WHERE id=?", id);
  else run("UPDATE dead_letters SET attempts=attempts+1, last_attempt_at=datetime('now'), error=? WHERE id=?", r.body.message, id);
  return r;
}

function health(portalId) {
  const s = one(`SELECT COUNT(*) total, SUM(ok) ok, AVG(duration_ms) avg_ms, MAX(created_at) last_at FROM sync_logs WHERE portal_id=? AND created_at > datetime('now','-7 days')`, portalId);
  const dlq = one("SELECT COUNT(*) c FROM dead_letters WHERE portal_id=? AND status='pending'", portalId).c;
  const jobsCount = one("SELECT COUNT(*) c FROM jobs WHERE portal_id=? AND status='active'", portalId).c;
  const rate = s.total ? s.ok / s.total : 1;
  return { total7d: s.total, success7d: s.ok || 0, successRate: Number((rate * 100).toFixed(1)), avgMs: Math.round(s.avg_ms || 0), lastSyncAt: s.last_at, deadLetters: dlq, activeJobs: jobsCount, status: rate >= 0.9 && dlq < 5 ? 'healthy' : rate >= 0.6 ? 'degraded' : 'failing' };
}
const daily = (portalId) => all(`SELECT date(created_at) day, SUM(ok) ok, COUNT(*)-SUM(ok) failed FROM sync_logs WHERE portal_id=? AND created_at > datetime('now','-14 days') GROUP BY day ORDER BY day`, portalId);

module.exports = { upsertJob, closeJob, pull, retryDeadLetter, health, daily, log };
