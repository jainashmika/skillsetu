// Registration, OTP activation, login with lockout + MFA, password lifecycle, DigiLocker OIDC
// (sandbox) and DPDP data-subject rights (export, erasure).
const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { one, all, run, db, json } = require('../db');
const { E, ah } = require('../utils/errors');
const { encrypt, decrypt, hmac, maskPhone, randomToken } = require('../utils/crypto');
const { slugify } = require('../utils/text');
const { sign, signMfa, verifyMfaToken, requireAuth, revoke, loadUser } = require('../middleware/auth');
const { rateLimit } = require('../middleware/common');
const settings = require('../services/settings');
const otp = require('../services/otp');
const notify = require('../services/notify');
const { audit } = require('../services/audit');
const { track } = require('../services/events');
const config = require('../config');

const r = express.Router();
const authLimit = rateLimit('auth', 30);

function checkPassword(pw) {
  const p = settings.get('password_policy'); const errs = [];
  if (pw.length < p.minLength) errs.push(`at least ${p.minLength} characters`);
  if (p.upper && !/[A-Z]/.test(pw)) errs.push('an uppercase letter');
  if (p.lower && !/[a-z]/.test(pw)) errs.push('a lowercase letter');
  if (p.digit && !/\d/.test(pw)) errs.push('a number');
  if (p.symbol && !/[^A-Za-z0-9]/.test(pw)) errs.push('a symbol');
  if (errs.length) throw E.bad(`Password needs ${errs.join(', ')}.`, { field: 'password' });
}
const normPhone = (p) => { const d = String(p || '').replace(/\D/g, '').slice(-10); if (!/^[6-9]\d{9}$/.test(d)) throw E.bad('Enter a valid 10-digit Indian mobile number.', { field: 'phone' }); return `+91${d}`; };
const accessLog = async (req, userId, email, event) => await run('INSERT INTO access_logs(user_id,email,event,ip,user_agent) VALUES(?,?,?,?,?)', userId || null, email || null, event, req.ip, String(req.headers['user-agent'] || '').slice(0, 200));
const uniqueSlug = async (table, base) => { let s = slugify(base); let i = 1; while (await one(`SELECT 1 FROM ${table} WHERE slug=?`, s)) s = `${slugify(base)}-${++i}`; return s; };

async function session(req, user) {
  const { token, expiresAt } = sign(user);
  await run("UPDATE users SET last_login_at=datetime('now'), failed_attempts=0, locked_until=NULL WHERE id=?", user.id);
  accessLog(req, user.id, user.email, 'login_success');
  track({ userId: user.id, role: user.role, event: 'login' });
  return { token, expiresAt, user: publicUser(loadUser(user.id)) };
}
function publicUser(u) {
  const maxAge = settings.get('password_policy').maxAgeDays;
  const passwordExpired = maxAge ? (Date.now() - new Date(`${u.password_changed_at}Z`).getTime()) / 86400000 > maxAge : false;
  return { id: u.id, role: u.role, name: u.name, email: u.email, phone: u.phone_masked, mfaEnabled: !!u.mfa_enabled, language: u.language, companyId: u.companyId, companyRole: u.companyRole, portalId: u.portalId, passwordExpired };
}

const registerSchema = z.object({
  role: z.enum(['seeker', 'employer', 'portal']),
  name: z.string().trim().min(2, 'Enter your full name').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  phone: z.string().min(10, 'Enter a valid mobile number'),
  password: z.string().min(1, 'Enter a password').max(128),
  companyName: z.string().trim().max(120).optional(),
  portalName: z.string().trim().max(120).optional(),
  language: z.enum(['en', 'hi', 'kn']).default('en'),
  consent: z.literal(true, { errorMap: () => ({ message: 'Please accept the privacy notice to continue' }) }),
});

r.post('/register', authLimit, ah(async (req, res) => {
  const d = registerSchema.parse(req.body);
  checkPassword(d.password);
  const phone = normPhone(d.phone);
  if (await one('SELECT 1 FROM users WHERE email=?', d.email)) throw E.conflict('An account with this email already exists. Try signing in.');
  if (await one('SELECT 1 FROM users WHERE phone_hash=?', hmac(phone))) throw E.conflict('This mobile number is already registered.');
  if (d.role === 'employer' && !d.companyName) throw E.bad('Enter your company name.', { field: 'companyName' });
  if (d.role === 'portal' && !d.portalName) throw E.bad('Enter your job portal name.', { field: 'portalName' });
  const hash = await bcrypt.hash(d.password, 11);
  const userId = db.transaction(async () => {
    const u = await run('INSERT INTO users(role,name,email,phone_hash,phone_enc,phone_masked,password_hash,language) VALUES(?,?,?,?,?,?,?,?)',
      d.role, d.name, d.email, hmac(phone), encrypt(phone), maskPhone(phone), hash, d.language);
    const id = Number(u.lastInsertRowid);
    await run('INSERT INTO notification_prefs(user_id) VALUES(?)', id);
    await run('INSERT INTO consents(user_id,purpose,granted) VALUES(?,?,1)', id, 'data_processing');
    if (d.role === 'seeker') await run('INSERT INTO seeker_profiles(user_id, slug) VALUES(?,?)', id, uniqueSlug('seeker_profiles', `${d.name}-${id}`));
    if (d.role === 'employer') {
      const c = await run('INSERT INTO companies(name, slug) VALUES(?,?)', d.companyName, uniqueSlug('companies', d.companyName));
      await run("INSERT INTO employer_users(user_id, company_id, company_role) VALUES(?,?,'owner')", id, c.lastInsertRowid);
    }
    if (d.role === 'portal') await run("INSERT INTO portals(name, slug, owner_user_id, status) VALUES(?,?,?,'suspended')", d.portalName, uniqueSlug('portals', d.portalName), id);
    return id;
  })();
  const o = otp.issue(userId, 'activate', { phone });
  audit({ ...req, user: { id: userId, role: d.role } }, 'user.register', 'user', userId, { role: d.role });
  res.status(201).json({ userId, otpSentTo: maskPhone(phone), message: 'We sent a 6-digit code to your mobile.', ...o });
}));

r.post('/verify-otp', authLimit, ah(async (req, res) => {
  const { userId, code } = z.object({ userId: z.coerce.number(), code: z.string().min(4) }).parse(req.body);
  const u = await one('SELECT * FROM users WHERE id=?', userId); if (!u) throw E.notFound('Account');
  otp.verify(userId, 'activate', code);
  const status = u.role === 'portal' ? 'pending_approval' : 'active';
  await run('UPDATE users SET phone_verified=1, status=? WHERE id=?', status, userId);
  accessLog(req, userId, u.email, 'otp_verified');
  if (status === 'pending_approval') {
    for (const a of await all("SELECT id FROM users WHERE role='admin'")) notify.inApp(a.id, { type: 'approval', title: 'Portal integration awaiting approval', body: u.name, link: '/admin/integrations' });
    return res.json({ pendingApproval: true, message: 'Mobile verified. An administrator will approve your portal integration shortly.' });
  }
  notify.email(userId, 'welcome', {});
  res.json(session(req, u));
}));

r.post('/resend-otp', rateLimit('otp', 5), ah(async (req, res) => {
  const { userId, purpose } = z.object({ userId: z.coerce.number(), purpose: z.enum(['activate', 'mfa']).default('activate') }).parse(req.body);
  const u = await one('SELECT id FROM users WHERE id=?', userId); if (!u) throw E.notFound('Account');
  res.json({ message: 'A new code is on its way.', ...otp.issue(userId, purpose) });
}));

r.post('/login', authLimit, ah(async (req, res) => {
  const { identifier, password } = z.object({ identifier: z.string().trim().min(3, 'Enter your email or mobile number'), password: z.string().min(1, 'Enter your password') }).parse(req.body);
  const byPhone = /^[+\d\s-]{10,}$/.test(identifier);
  const u = byPhone ? await one('SELECT * FROM users WHERE phone_hash=?', hmac(normPhone(identifier))) : await one('SELECT * FROM users WHERE email=?', identifier.toLowerCase());
  const generic = E.unauth('Email/mobile or password is incorrect.');
  if (!u) { accessLog(req, null, identifier, 'login_failed_unknown'); throw generic; }
  if (u.locked_until && new Date(`${u.locked_until}Z`) > new Date()) {
    accessLog(req, u.id, u.email, 'login_blocked_locked');
    throw E.locked(`Your account is locked after too many failed attempts. Try again after ${new Date(`${u.locked_until}Z`).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })} IST, or contact support.`);
  }
  if (!(await bcrypt.compare(password, u.password_hash))) {
    const max = settings.get('lockout_attempts'); const n = u.failed_attempts + 1;
    if (n >= max) {
      await run(`UPDATE users SET failed_attempts=?, locked_until=datetime('now', ?) WHERE id=?`, n, `+${settings.get('lockout_minutes')} minutes`, u.id);
      accessLog(req, u.id, u.email, 'account_locked');
      await run('INSERT INTO security_events(type,severity,ip,detail) VALUES(?,?,?,?)', 'lockout', 'high', req.ip, `User ${u.id} locked after ${n} failed attempts`);
      audit({ ...req, user: { id: u.id, role: u.role } }, 'user.locked', 'user', u.id);
    } else await run('UPDATE users SET failed_attempts=? WHERE id=?', n, u.id);
    accessLog(req, u.id, u.email, 'login_failed');
    const left = max - n;
    throw left > 0 && left <= 2 ? E.unauth(`Email/mobile or password is incorrect. ${left} attempt${left > 1 ? 's' : ''} left before your account is locked.`) : n >= max ? E.locked(`Too many failed attempts. Your account is locked for ${settings.get('lockout_minutes')} minutes.`) : generic;
  }
  if (u.status === 'banned') { accessLog(req, u.id, u.email, 'login_blocked_banned'); throw E.forbidden('This account has been suspended. Contact support for help.'); }
  if (u.status === 'pending_otp') { const o = otp.issue(u.id, 'activate'); return res.json({ needsActivation: true, userId: u.id, otpSentTo: u.phone_masked, ...o }); }
  if (u.status === 'pending_approval') throw E.forbidden('Your account is waiting for administrator approval.');
  const mfaRequired = u.mfa_enabled || settings.get('mfa_required_roles').includes(u.role);
  if (mfaRequired) {
    const o = otp.issue(u.id, 'mfa');
    accessLog(req, u.id, u.email, 'mfa_challenge');
    return res.json({ mfaRequired: true, mfaToken: signMfa(u), otpSentTo: u.phone_masked, ...o });
  }
  res.json(session(req, u));
}));

r.post('/mfa/verify', authLimit, ah(async (req, res) => {
  const { mfaToken, code } = z.object({ mfaToken: z.string(), code: z.string().min(4) }).parse(req.body);
  const p = verifyMfaToken(mfaToken);
  const u = await one('SELECT * FROM users WHERE id=?', p.sub);
  try { otp.verify(u.id, 'mfa', code); } catch (e) { accessLog(req, u.id, u.email, 'mfa_failed'); throw e; }
  accessLog(req, u.id, u.email, 'mfa_success');
  res.json(session(req, u));
}));

r.post('/mfa/resend', rateLimit('otp', 5), ah(async (req, res) => {
  const p = verifyMfaToken(req.body.mfaToken);
  res.json({ message: 'A new code is on its way.', ...otp.issue(p.sub, 'mfa') });
}));

r.post('/logout', requireAuth, (req, res) => {
  revoke(req.tokenJti, req.tokenExp);
  accessLog(req, req.user.id, req.user.email, 'logout');
  res.json({ ok: true });
});

r.get('/me', requireAuth, async (req, res) => {
  const u = loadUser(req.user.id);
  const out = { user: publicUser(u), sessionExpiresAt: new Date(req.tokenExp * 1000).toISOString() };
  if (u.role === 'employer') out.company = await one('SELECT id, name, slug, logo_url, verification_status FROM companies WHERE id=?', u.companyId);
  if (u.role === 'portal') out.portal = await one('SELECT id, name, slug, status FROM portals WHERE id=?', u.portalId);
  out.unread = (await one('SELECT COUNT(*) c FROM notifications WHERE user_id=? AND read_at IS NULL', u.id)).c;
  res.json(out);
});

r.post('/refresh', requireAuth, (req, res) => {
  revoke(req.tokenJti, req.tokenExp);
  const { token, expiresAt } = sign(req.user);
  res.json({ token, expiresAt });
});

r.get('/password-policy', (_req, res) => res.json(settings.get('password_policy')));

r.post('/password/change', requireAuth, ah(async (req, res) => {
  const { current, next } = z.object({ current: z.string(), next: z.string() }).parse(req.body);
  const u = await one('SELECT password_hash FROM users WHERE id=?', req.user.id);
  if (!(await bcrypt.compare(current, u.password_hash))) throw E.bad('Your current password is incorrect.', { field: 'current' });
  if (current === next) throw E.bad('Choose a password different from your current one.', { field: 'next' });
  checkPassword(next);
  await run("UPDATE users SET password_hash=?, password_changed_at=datetime('now') WHERE id=?", await bcrypt.hash(next, 11), req.user.id);
  audit(req, 'user.password_change', 'user', req.user.id);
  res.json({ message: 'Password changed.' });
}));

r.post('/password/forgot', rateLimit('otp', 5), ah(async (req, res) => {
  const { email } = z.object({ email: z.string().email() }).parse(req.body);
  const u = await one('SELECT id FROM users WHERE email=?', email.toLowerCase());
  const extra = u ? otp.issue(u.id, 'reset') : {};
  res.json({ message: 'If this email is registered, we sent a reset code to the linked mobile number.', ...extra });
}));
r.post('/password/reset', authLimit, ah(async (req, res) => {
  const { email, code, password } = z.object({ email: z.string().email(), code: z.string(), password: z.string() }).parse(req.body);
  const u = await one('SELECT id, role FROM users WHERE email=?', email.toLowerCase()); if (!u) throw E.bad('That code is not correct.');
  otp.verify(u.id, 'reset', code); checkPassword(password);
  await run("UPDATE users SET password_hash=?, password_changed_at=datetime('now'), failed_attempts=0, locked_until=NULL WHERE id=?", await bcrypt.hash(password, 11), u.id);
  audit({ ...req, user: u }, 'user.password_reset', 'user', u.id);
  res.json({ message: 'Password reset. You can sign in now.' });
}));

r.put('/mfa', requireAuth, ah(async (req, res) => {
  const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
  if (!enabled && settings.get('mfa_required_roles').includes(req.user.role)) throw E.bad('Two-step verification is mandatory for your role.');
  await run('UPDATE users SET mfa_enabled=? WHERE id=?', enabled ? 1 : 0, req.user.id);
  audit(req, enabled ? 'user.mfa_enabled' : 'user.mfa_disabled', 'user', req.user.id);
  res.json({ mfaEnabled: enabled });
}));
r.put('/language', requireAuth, ah(async (req, res) => {
  const { language } = z.object({ language: z.enum(['en', 'hi', 'kn']) }).parse(req.body);
  await run('UPDATE users SET language=? WHERE id=?', language, req.user.id); res.json({ language });
}));

// ---- Third-party sign-in: DigiLocker OIDC (sandbox) (NFR-28) ----
r.post('/oauth/digilocker', authLimit, ah(async (req, res) => {
  const d = z.object({ name: z.string().trim().min(2), email: z.string().email(), phone: z.string(), consent: z.literal(true) }).parse(req.body);
  let u = await one('SELECT * FROM users WHERE email=?', d.email.toLowerCase());
  if (u && u.role !== 'seeker') throw E.conflict('This email belongs to a non-job-seeker account. Sign in with your password.');
  if (!u) {
    const phone = normPhone(d.phone);
    if (await one('SELECT 1 FROM users WHERE phone_hash=?', hmac(phone))) throw E.conflict('This mobile number is already registered.');
    const id = db.transaction(async () => {
      const x = await run("INSERT INTO users(role,name,email,phone_hash,phone_enc,phone_masked,password_hash,status,phone_verified) VALUES('seeker',?,?,?,?,?,?, 'active', 1)",
        d.name, d.email.toLowerCase(), hmac(phone), encrypt(phone), maskPhone(phone), bcrypt.hashSync(randomToken(), 8));
      const nid = Number(x.lastInsertRowid);
      await run('INSERT INTO notification_prefs(user_id) VALUES(?)', nid);
      await run('INSERT INTO consents(user_id,purpose,granted) VALUES(?,?,1)', nid, 'data_processing');
      await run('INSERT INTO seeker_profiles(user_id, slug, digilocker_verified) VALUES(?,?,1)', nid, uniqueSlug('seeker_profiles', `${d.name}-${nid}`));
      return nid;
    })();
    u = await one('SELECT * FROM users WHERE id=?', id);
    audit({ ...req, user: { id, role: 'seeker' } }, 'user.register_oidc', 'user', id, { provider: 'digilocker' });
  }
  if (u.status !== 'active') throw E.forbidden('This account is not active.');
  res.json({ ...session(req, u), provider: 'digilocker', sandbox: true });
}));

// ---- DPDP Act: data portability & erasure (NFR-33) ----
r.get('/account/export', requireAuth, async (req, res) => {
  const id = req.user.id;
  const u = await one('SELECT id, role, name, email, phone_enc, language, created_at, last_login_at FROM users WHERE id=?', id);
  u.phone = decrypt(u.phone_enc); delete u.phone_enc;
  const data = {
    exportedAt: new Date().toISOString(), account: u,
    profile: (await one('SELECT * FROM seeker_profiles WHERE user_id=?', id)) || null,
    skills: await all('SELECT s.name, ss.level, ss.source FROM seeker_skills ss JOIN skills s ON s.id=ss.skill_id WHERE ss.user_id=?', id),
    educations: await all('SELECT * FROM educations WHERE user_id=?', id), experiences: await all('SELECT * FROM experiences WHERE user_id=?', id),
    applications: await all('SELECT a.*, j.title FROM applications a JOIN jobs j ON j.id=a.job_id WHERE a.seeker_id=?', id),
    savedJobs: await all('SELECT * FROM saved_jobs WHERE user_id=?', id), savedSearches: await all('SELECT * FROM saved_searches WHERE user_id=?', id),
    notifications: await all('SELECT type,title,body,created_at,read_at FROM notifications WHERE user_id=?', id),
    consents: await all('SELECT purpose, granted, created_at FROM consents WHERE user_id=?', id),
    activity: await all('SELECT event, job_id, meta, created_at FROM activity_events WHERE user_id=? ORDER BY id DESC LIMIT 1000', id),
  };
  if (data.profile) { delete data.profile.aadhaar_enc; }
  audit(req, 'user.data_export', 'user', id);
  res.setHeader('Content-Disposition', `attachment; filename="skillsetu-my-data-${id}.json"`);
  res.json(data);
});

r.delete('/account', requireAuth, ah(async (req, res) => {
  const { password } = z.object({ password: z.string() }).parse(req.body);
  const u = await one('SELECT * FROM users WHERE id=?', req.user.id);
  if (!(await bcrypt.compare(password, u.password_hash))) throw E.bad('Password is incorrect.', { field: 'password' });
  if (u.role === 'admin') throw E.bad('Administrator accounts must be removed by another administrator.');
  const prof = await one('SELECT resume_path FROM seeker_profiles WHERE user_id=?', u.id);
  if (prof?.resume_path) { const f = path.join(config.uploadDir, path.basename(prof.resume_path)); try { const size = fs.statSync(f).size; fs.writeFileSync(f, Buffer.alloc(size)); fs.unlinkSync(f); } catch { /* gone */ } }
  db.transaction(async () => {
    await run('DELETE FROM activity_events WHERE user_id=?', u.id);
    await run('DELETE FROM outbox WHERE user_id=?', u.id);
    await run('DELETE FROM access_logs WHERE user_id=?', u.id);
    if (u.role === 'employer') {
      const eu = await one('SELECT company_id, company_role FROM employer_users WHERE user_id=?', u.id);
      const others = (await one('SELECT COUNT(*) c FROM employer_users WHERE company_id=? AND user_id<>?', eu.company_id, u.id)).c;
      if (eu.company_role === 'owner' && !others) await run('DELETE FROM companies WHERE id=?', eu.company_id);
    }
    await run('DELETE FROM users WHERE id=?', u.id);
  })();
  revoke(req.tokenJti, req.tokenExp);
  audit(req, 'user.erased', 'user', u.id, { role: u.role });
  res.json({ message: 'Your account and personal data have been permanently deleted.' });
}));

r.post('/consent', ah(async (req, res) => {
  const { purposes } = z.object({ purposes: z.record(z.boolean()) }).parse(req.body);
  for (const [p, g] of Object.entries(purposes)) await run('INSERT INTO consents(user_id,guest_id,purpose,granted) VALUES(?,?,?,?)', req.user?.id || null, req.guestId, p, g ? 1 : 0);
  res.json({ ok: true });
}));

module.exports = r;
module.exports.checkPassword = checkPassword;
module.exports.normPhone = normPhone;
module.exports.uniqueSlug = uniqueSlug;
module.exports._json = json;
