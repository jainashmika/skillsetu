// Government database integrations (SRS 3.1.2, 3.4.2): GSTIN / MCA company verification,
// Aadhaar e-KYC and DigiLocker credential checks. Real validation algorithms (GSTIN checksum,
// CIN format, Aadhaar Verhoeff) run locally; the remote lookups are realistic mocks behind an
// adapter interface with retry + circuit breaker, ready to be pointed at the real APIs.
const { withRetry, TransientError, CircuitBreaker, sleep } = require('../../utils/retry');
const config = require('../../config');

const GST_STATE = { '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', 10: 'Bihar', 18: 'Assam', 19: 'West Bengal', 20: 'Jharkhand', 21: 'Odisha', 22: 'Chhattisgarh', 23: 'Madhya Pradesh', 24: 'Gujarat', 27: 'Maharashtra', 29: 'Karnataka', 30: 'Goa', 32: 'Kerala', 33: 'Tamil Nadu', 34: 'Puducherry', 36: 'Telangana', 37: 'Andhra Pradesh' };
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function gstinChecksum(first14) {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = CHARS.indexOf(first14[i]); const p = v * (i % 2 ? 2 : 1);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}
function validateGstin(g) {
  const s = String(g || '').toUpperCase().trim();
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(s)) return { valid: false, reason: 'GSTIN format is invalid (15 characters, e.g. 29ABCDE1234F1Z5).' };
  if (gstinChecksum(s.slice(0, 14)) !== s[14]) return { valid: false, reason: 'GSTIN check digit does not match.' };
  return { valid: true, gstin: s, stateCode: s.slice(0, 2), state: GST_STATE[Number(s.slice(0, 2))] || GST_STATE[s.slice(0, 2)] || null, pan: s.slice(2, 12) };
}
const makeGstin = (stateCode, pan, entity = '1') => { const f = `${stateCode}${pan}${entity}Z`; return f + gstinChecksum(f); };

function validateCin(c) {
  const s = String(c || '').toUpperCase().trim();
  const m = /^([LU])(\d{5})([A-Z]{2})(\d{4})([A-Z]{3})(\d{6})$/.exec(s);
  if (!m) return { valid: false, reason: 'CIN format is invalid (21 characters, e.g. U72200KA2015PTC123456).' };
  return { valid: true, cin: s, listed: m[1] === 'L', stateCode: m[3], year: Number(m[4]), type: m[5] };
}

// Verhoeff checksum used by Aadhaar numbers.
const D = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
const P = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
const INV = [0,4,3,2,1,5,6,7,8,9];
function verhoeffValid(num) { let c = 0; const a = String(num).split('').reverse().map(Number); for (let i = 0; i < a.length; i++) c = D[c][P[i % 8][a[i]]]; return c === 0; }
function verhoeffDigit(num) { let c = 0; const a = String(num).split('').reverse().map(Number); for (let i = 0; i < a.length; i++) c = D[c][P[(i + 1) % 8][a[i]]]; return INV[c]; }
function validateAadhaar(a) {
  const s = String(a || '').replace(/\s/g, '');
  if (!/^[2-9]\d{11}$/.test(s)) return { valid: false, reason: 'Aadhaar must be 12 digits and cannot start with 0 or 1.' };
  if (!verhoeffValid(s)) return { valid: false, reason: 'Aadhaar number failed the checksum. Please re-check the digits.' };
  return { valid: true, aadhaar: s };
}

// ---------- mock remote APIs ----------
const breakers = { mca: new CircuitBreaker('MCA21 API'), gst: new CircuitBreaker('GSTN API'), digilocker: new CircuitBreaker('DigiLocker API'), ekyc: new CircuitBreaker('UIDAI e-KYC') };
async function remote(name, fn) {
  const t = Date.now(); let attempts = 0;
  const result = await breakers[name].exec(() => withRetry(async () => {
    attempts++;
    await sleep(40 + Math.random() * 80);
    if (Math.random() < config.simulateTransientFailures) throw new TransientError(`${name} gateway timeout`);
    return fn();
  }, { retries: 3 }));
  return { ...result, _meta: { source: name, attempts, ms: Date.now() - t, sandbox: true } };
}

const gstLookup = (gstin) => remote('gst', () => {
  const v = validateGstin(gstin); if (!v.valid) return { found: false };
  return { found: true, status: 'Active', gstin: v.gstin, state: v.state, pan: v.pan, registrationType: 'Regular', taxpayerType: 'Private Limited Company' };
});
const mcaLookup = (cin) => remote('mca', () => {
  const v = validateCin(cin); if (!v.valid) return { found: false };
  return { found: true, status: 'Active', cin: v.cin, incorporated: v.year, category: v.listed ? 'Listed company' : 'Unlisted company', classType: v.type === 'PTC' ? 'Private' : v.type === 'PLC' ? 'Public' : v.type };
});
const ekyc = (aadhaar, name) => remote('ekyc', () => {
  const v = validateAadhaar(aadhaar); if (!v.valid) return { verified: false, reason: v.reason };
  return { verified: true, nameMatch: true, name, maskedAadhaar: `XXXX XXXX ${v.aadhaar.slice(-4)}`, txnId: `UKC:${Date.now()}` };
});
const digilockerFetch = (educations) => remote('digilocker', () => ({
  documents: educations.map((e) => ({
    educationId: e.id, qualification: e.qualification,
    issuer: e.level <= 2 ? 'CBSE / State Board' : e.level <= 4 ? 'State Board of Technical Education' : e.institution || 'University',
    uri: `in.gov.${e.level <= 2 ? 'cbse' : 'nad'}-${e.level <= 2 ? 'SSCER' : 'DGCER'}-${(e.year || 2020)}${String(e.id).padStart(6, '0')}`,
    verified: !!e.year,
    reason: e.year ? null : 'Passing year missing - add it to verify',
  })),
}));

module.exports = { validateGstin, validateCin, validateAadhaar, makeGstin, verhoeffDigit, gstLookup, mcaLookup, ekyc, digilockerFetch, breakers };
