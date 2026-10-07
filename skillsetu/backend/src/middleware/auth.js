// Authentication & RBAC (SRS 3.1.5, NFR-22..28). Stateless JWTs with a jti revocation list so
// they scale across load-balanced instances; session lifetime comes from admin settings.
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');
const { one, run } = require('../db');
const { E } = require('../utils/errors');
const settings = require('../services/settings');

function sign(user, extra = {}) {
  const minutes = settings.get('session_timeout_minutes');
  const jti = crypto.randomUUID();
  const token = jwt.sign({ sub: user.id, role: user.role, jti, ...extra }, config.jwtSecret, { expiresIn: `${minutes}m`, issuer: 'skillsetu' });
  return { token, expiresAt: new Date(Date.now() + minutes * 60000).toISOString(), jti };
}
const signMfa = (user) => jwt.sign({ sub: user.id, purpose: 'mfa' }, config.jwtSecret, { expiresIn: '10m', issuer: 'skillsetu' });
const verifyMfaToken = (t) => { try { const p = jwt.verify(t, config.jwtSecret, { issuer: 'skillsetu' }); if (p.purpose !== 'mfa') throw new Error(); return p; } catch { throw E.unauth('Your verification step expired. Please sign in again.'); } };

function loadUser(id) {
  const u = one('SELECT id, role, name, email, status, phone_masked, mfa_enabled, language, password_changed_at FROM users WHERE id=?', id);
  if (!u) return null;
  if (u.role === 'employer') { const eu = one('SELECT company_id, company_role FROM employer_users WHERE user_id=?', id); u.companyId = eu?.company_id; u.companyRole = eu?.company_role; }
  if (u.role === 'portal') u.portalId = one('SELECT id FROM portals WHERE owner_user_id=?', id)?.id;
  return u;
}

function tokenFrom(req) {
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) return h.slice(7);
  if (req.query && req.query.access_token && req.path.endsWith('/stream')) return String(req.query.access_token); // EventSource cannot set headers
  return null;
}

// Populates req.user when a valid token is present; never rejects.
function authenticate(req, _res, next) {
  const t = tokenFrom(req);
  req.guestId = req.headers['x-guest-id'] ? String(req.headers['x-guest-id']).slice(0, 64) : null;
  if (!t) return next();
  try {
    const p = jwt.verify(t, config.jwtSecret, { issuer: 'skillsetu' });
    if (p.purpose) return next();
    if (one('SELECT 1 FROM revoked_tokens WHERE jti=?', p.jti)) return next();
    const u = loadUser(p.sub);
    if (u && u.status === 'active') { req.user = u; req.tokenJti = p.jti; req.tokenExp = p.exp; }
  } catch { /* expired or invalid - treated as guest */ }
  next();
}

function requireAuth(req, _res, next) { if (!req.user) return next(E.unauth()); next(); }

function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(E.unauth());
    if (!roles.includes(req.user.role)) {
      run('INSERT INTO access_logs(user_id,email,event,ip,user_agent) VALUES(?,?,?,?,?)', req.user.id, req.user.email, `access_denied:${req.method} ${req.originalUrl}`.slice(0, 200), req.ip, String(req.headers['user-agent'] || '').slice(0, 200));
      return next(E.forbidden());
    }
    next();
  };
}

function revoke(jti, exp) { run('INSERT OR IGNORE INTO revoked_tokens(jti, expires_at) VALUES(?, ?)', jti, new Date(exp * 1000).toISOString()); }

module.exports = { sign, signMfa, verifyMfaToken, authenticate, requireAuth, requireRole, revoke, loadUser };
