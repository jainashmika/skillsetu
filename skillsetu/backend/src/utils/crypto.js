// Field-level encryption (AES-256-GCM) with key versioning so keys can be rotated (NFR-29, 32, 34).
const crypto = require('crypto');
const config = require('../config');

const KEYS = { v1: Buffer.from(config.dataKey, 'hex') };
const CURRENT = 'v1';

function encrypt(plain) {
  if (plain === null || plain === undefined || plain === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEYS[CURRENT], iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [CURRENT, iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}
function decrypt(blob) {
  if (!blob) return null;
  const [ver, iv, tag, data] = blob.split(':');
  const key = KEYS[ver];
  if (!key) throw new Error('Unknown key version');
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
}
const hmac = (v) => crypto.createHmac('sha256', config.hmacKey).update(String(v)).digest('hex');
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
const randomToken = (bytes = 24) => crypto.randomBytes(bytes).toString('base64url');

const maskPhone = (p) => (p ? `${p.startsWith('+91') ? '+91 ' : ''}xxxxxx${String(p).slice(-4)}` : null);
const maskEmail = (e) => (e ? e.replace(/^(.)(.*)(@.*)$/, (_, a, mid, d) => `${a}${'•'.repeat(Math.min(mid.length, 6))}${d}`) : null);
const maskAadhaar = (a) => (a ? `XXXX XXXX ${String(a).slice(-4)}` : null);

module.exports = { encrypt, decrypt, hmac, sha256, randomToken, maskPhone, maskEmail, maskAadhaar };
