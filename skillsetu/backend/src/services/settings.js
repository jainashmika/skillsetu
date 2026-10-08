// System settings stored in the DB so admins can change behaviour without code changes (NFR-103).
const { one, all, run } = require('../db');

const DEFAULTS = {
  match_weights: { skills: 0.45, education: 0.15, experience: 0.15, location: 0.15, salary: 0.10 },
  match_threshold: 60,                // % - SRS 3.3.1 "admin-defined match thresholds (e.g., 60%)"
  cf_blend: 0.2,                      // share of collaborative-filtering signal in recommendations
  session_timeout_minutes: 60,
  lockout_attempts: 5,
  lockout_minutes: 15,
  password_policy: { minLength: 8, upper: true, lower: true, digit: true, symbol: true, maxAgeDays: 180 },
  mfa_required_roles: ['admin'],
  job_default_validity_days: 30,
  employer_auto_approve_verified: true,
  log_retention_days: 365,
  maintenance_banner: '',
};

let cache = null;
async function load() {
  const rows = await all('SELECT key, value FROM system_settings');
  cache = { ...DEFAULTS };
  for (const r of rows) { try { cache[r.key] = JSON.parse(r.value); } catch { /* ignore bad row */ } }
  return cache;
}
const get = (key) => (cache || load())[key];
const getAll = () => ({ ...(cache || load()) });
async function set(key, value, userId) {
  if (!(key in DEFAULTS)) throw new Error(`Unknown setting ${key}`);
  await run(`INSERT INTO system_settings(key,value,updated_by,updated_at) VALUES(?,?,?,datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_by=excluded.updated_by, updated_at=excluded.updated_at`,
  key, JSON.stringify(value), userId || null);
  cache = null;
}
const meta = async () => await all('SELECT key, updated_by, updated_at FROM system_settings');
module.exports = { get, getAll, set, DEFAULTS, meta, reload: load, _one: one };
