// Background jobs (cron-like): job expiry, outbox delivery, digests, recommender retraining,
// scheduled reports, backups, and retention clean-up.
const { run } = require('./db');
const jobs = require('./services/jobs');
const notify = require('./services/notify');
const recommender = require('./services/matching/recommender');
const reports = require('./services/reports');
const backup = require('./services/backup');
const settings = require('./services/settings');

const every = (ms, name, fn) => { const t = setInterval(() => { try { const r = fn(); if (r && r.catch) r.catch((e) => console.error(`[${name}]`, e.message)); } catch (e) { console.error(`[${name}]`, e.message); } }, ms); t.unref(); return t; };

function start() {
  try { jobs.expireDue(); } catch (e) { console.error('[expire]', e.message); }
  every(60_000, 'expire', () => jobs.expireDue());
  every(2_000, 'outbox', () => notify.processOutbox());
  every(60 * 60_000, 'digest', () => notify.sendDigests());
  every(15 * 60_000, 'recommender', () => recommender.train());
  every(60 * 60_000, 'reports', () => reports.runSchedules(notify));
  every(24 * 60 * 60_000, 'backup', () => backup.backup('full'));
  every(6 * 60 * 60_000, 'retention', async () => {
    await run("DELETE FROM revoked_tokens WHERE expires_at < datetime('now')");
    await run("DELETE FROM otps WHERE expires_at < datetime('now','-1 day')");
    await run("DELETE FROM idempotency_keys WHERE created_at < datetime('now','-2 days')");
    await run('DELETE FROM activity_events WHERE created_at < datetime(\'now\', ?)', `-${settings.get('log_retention_days')} days`);
    await run('DELETE FROM access_logs WHERE created_at < datetime(\'now\', ?)', `-${settings.get('log_retention_days')} days`);
  });
}
module.exports = { start };
