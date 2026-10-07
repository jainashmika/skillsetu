// One-time passwords for phone activation, MFA and password reset. Codes are stored hashed,
// expire after 10 minutes and allow 5 attempts.
const crypto = require('crypto');
const { one, run } = require('../db');
const { hmac } = require('../utils/crypto');
const { E } = require('../utils/errors');
const notify = require('./notify');
const config = require('../config');

function issue(userId, purpose, { phone } = {}) {
  const recent = one(`SELECT COUNT(*) c FROM otps WHERE user_id=? AND purpose=? AND created_at > datetime('now','-10 minutes')`, userId, purpose).c;
  if (recent >= 5) throw E.tooMany('Too many codes requested. Please wait 10 minutes.');
  const code = String(crypto.randomInt(100000, 1000000));
  run(`UPDATE otps SET consumed=1 WHERE user_id=? AND purpose=? AND consumed=0`, userId, purpose);
  run(`INSERT INTO otps(user_id,purpose,code_hash,expires_at) VALUES(?,?,?,datetime('now','+10 minutes'))`, userId, purpose, hmac(`${userId}:${purpose}:${code}`));
  notify.sms(userId, 'otp', { code }, { critical: true, toPhone: phone });
  return config.exposeOtp ? { devCode: code } : {};
}

function verify(userId, purpose, code) {
  const o = one(`SELECT * FROM otps WHERE user_id=? AND purpose=? AND consumed=0 ORDER BY id DESC LIMIT 1`, userId, purpose);
  if (!o) throw E.bad('No active code. Request a new one.');
  if (new Date(`${o.expires_at}Z`) < new Date()) throw E.bad('This code has expired. Request a new one.');
  if (o.attempts >= 5) throw E.bad('Too many wrong attempts. Request a new code.');
  if (o.code_hash !== hmac(`${userId}:${purpose}:${String(code).trim()}`)) {
    run('UPDATE otps SET attempts=attempts+1 WHERE id=?', o.id);
    throw E.bad('That code is not correct.');
  }
  run('UPDATE otps SET consumed=1 WHERE id=?', o.id);
  return true;
}
module.exports = { issue, verify };
