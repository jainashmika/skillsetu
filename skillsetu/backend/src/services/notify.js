// Notification system (SRS 3.6): in-app (persisted + pushed live over SSE), email (templated,
// immediate or daily digest) and SMS (TRAI DLT template IDs, opt-in, delivery tracking).
// Email/SMS go through an outbox table processed by a background worker with retries; the
// "providers" are mocks that log deliveries, swappable for SendGrid/SES and a DLT SMS gateway.
const { one, all, run, db } = require('../db');
const { bus } = require('./events');
const { decrypt } = require('../utils/crypto');
const config = require('../config');

const DLT_TEMPLATES = {
  otp: { id: '1107160000000000001', text: 'Your SkillSetu verification code is {code}. Valid for 10 minutes. Do not share it with anyone. -SKSETU' },
  application_update: { id: '1107160000000000002', text: 'SkillSetu: Your application for {job} is now {status}. Check the app for details. -SKSETU' },
  interview: { id: '1107160000000000003', text: 'SkillSetu: Interview update for {job}. Please check your SkillSetu account. -SKSETU' },
};

const EMAIL_TEMPLATES = {
  generic: (v) => ({ subject: v.title, html: v.body }),
  welcome: (v) => ({ subject: 'Welcome to SkillSetu', html: `Hi ${v.name},\n\nYour account is ready. Complete your profile to get better job matches.\n\n${config.publicUrl}` }),
  job_alert: (v) => ({ subject: `New jobs for "${v.search}"`, html: `Hi ${v.name},\n\nNew jobs match your saved search:\n${v.jobs.map((j) => `• ${j.title} – ${j.company} (${j.city})`).join('\n')}\n\nView: ${config.publicUrl}/jobs` }),
  application_update: (v) => ({ subject: `Application update: ${v.job}`, html: `Hi ${v.name},\n\nYour application for ${v.job} at ${v.company} moved to "${v.status}".\n\n${config.publicUrl}/seeker/applications` }),
  new_applicant: (v) => ({ subject: `New applicant for ${v.job}`, html: `${v.candidate} applied for ${v.job} (match ${v.score}%).\n\n${config.publicUrl}/employer/jobs/${v.jobId}` }),
  digest: (v) => ({ subject: `Your SkillSetu digest (${v.items.length} updates)`, html: `Hi ${v.name},\n\nHere is what happened:\n${v.items.map((i) => `• ${i}`).join('\n')}` }),
  verification: (v) => ({ subject: `Company verification: ${v.status}`, html: `Hi ${v.name},\n\nVerification for ${v.company} is now "${v.status}". ${v.note || ''}` }),
  report: (v) => ({ subject: `Scheduled report: ${v.name}`, html: `Your scheduled report "${v.name}" is ready (${v.rows} rows). Download it from Admin > Reports.` }),
};

const prefsOf = async userId => (await one('SELECT * FROM notification_prefs WHERE user_id = ?', userId)) || { email_mode: 'immediate', sms_opt_in: 1, inapp: 1, job_alerts: 1 };

async function inApp(userId, { type, title, body, link }) {
  const r = await run('INSERT INTO notifications(user_id,type,title,body,link) VALUES(?,?,?,?,?)', userId, type, title, body || null, link || null);
  const row = await one('SELECT * FROM notifications WHERE id = ?', r.lastInsertRowid);
  bus.emit(`notify:${userId}`, row);
  return row;
}

async function email(userId, template, vars, { critical = false } = {}) {
  const u = await one('SELECT email, name FROM users WHERE id = ?', userId); if (!u) return;
  const p = prefsOf(userId);
  if (p.email_mode === 'off' && !critical) return;
  const { subject, html } = (EMAIL_TEMPLATES[template] || EMAIL_TEMPLATES.generic)({ name: u.name, ...vars });
  const status = p.email_mode === 'digest' && !critical ? 'digest' : 'queued';
  await run('INSERT INTO outbox(channel,user_id,to_addr,subject,body,template,status) VALUES(?,?,?,?,?,?,?)', 'email', userId, u.email, subject, html, template, status);
}

async function sms(userId, template, vars, { critical = false, toPhone } = {}) {
  const p = prefsOf(userId);
  if (!p.sms_opt_in && !critical) return;
  let to = toPhone;
  if (!to) { const u = await one('SELECT phone_enc FROM users WHERE id = ?', userId); to = u?.phone_enc ? decrypt(u.phone_enc) : null; }
  if (!to) return;
  const t = DLT_TEMPLATES[template]; if (!t) return;
  const body = t.text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  await run('INSERT INTO outbox(channel,user_id,to_addr,body,template,dlt_template_id,status) VALUES(?,?,?,?,?,?,?)', 'sms', userId, to, body, template, t.id, 'queued');
}

// One call for the common case.
function notify(userId, { type, title, body, link, emailTemplate, emailVars, smsTemplate, smsVars, critical }) {
  const p = prefsOf(userId);
  let row = null;
  if (p.inapp || critical) row = inApp(userId, { type, title, body, link });
  if (emailTemplate) email(userId, emailTemplate, { title, body, ...(emailVars || {}) }, { critical });
  if (smsTemplate) sms(userId, smsTemplate, smsVars || {}, { critical });
  return row;
}

// --- background worker: mock providers with transient failures + retry (NFR-69) ---
const provider = {
  send(msg) {
    if (Math.random() < config.simulateTransientFailures / 2) { const e = new Error('Provider timeout'); e.transient = true; throw e; }
    if (process.env.LOG_OUTBOX === 'true') console.log(`[${msg.channel}] -> ${msg.to_addr}: ${msg.subject || msg.body.slice(0, 60)}`);
  },
};
let working = false;
async function processOutbox(limit = 50) {
  if (working) return 0; working = true; let n = 0;
  try {
    for (const m of await all("SELECT * FROM outbox WHERE status='queued' ORDER BY id LIMIT ?", limit)) {
      try { provider.send(m); await run("UPDATE outbox SET status='sent', attempts=attempts+1, sent_at=datetime('now') WHERE id=?", m.id); n++; }
      catch (e) { await run(`UPDATE outbox SET attempts=attempts+1, status=CASE WHEN attempts+1>=5 THEN 'failed' ELSE 'queued' END WHERE id=?`, m.id); }
    }
  } finally { working = false; }
  return n;
}
async function sendDigests() {
  const groups = await all("SELECT user_id, COUNT(*) c FROM outbox WHERE status='digest' AND channel='email' GROUP BY user_id");
  const tx = db.transaction(async () => {
    for (const g of groups) {
      const items = await all("SELECT id, subject FROM outbox WHERE status='digest' AND user_id=?", g.user_id);
      const u = await one('SELECT email, name FROM users WHERE id=?', g.user_id); if (!u) continue;
      const { subject, html } = EMAIL_TEMPLATES.digest({ name: u.name, items: items.map((i) => i.subject) });
      await run("INSERT INTO outbox(channel,user_id,to_addr,subject,body,template,status) VALUES('email',?,?,?,?, 'digest','queued')", g.user_id, u.email, subject, html);
      await run(`UPDATE outbox SET status='sent', sent_at=datetime('now') WHERE status='digest' AND user_id=?`, g.user_id);
    }
  });
  await tx();
  return groups.length;
}

module.exports = { notify, inApp, email, sms, processOutbox, sendDigests, prefsOf, DLT_TEMPLATES, EMAIL_TEMPLATES };
