// API + engine tests. Run: npm test
import { describe, it, expect, beforeAll } from 'vitest';
process.env.NODE_ENV = 'test';
process.env.DB_FILE = ':memory:';
process.env.SIMULATED_FAILURE_RATE = '0';
const request = (await import('supertest')).default;
const app = (await import('../src/app.js')).default;
const { seed } = await import('../src/db/seed.js');
const gov = await import('../src/services/integrations/gov.js');
const { TopN, LRU } = await import('../src/utils/ds.js');
const { encrypt, decrypt } = await import('../src/utils/crypto.js');
const { verifyChain } = await import('../src/services/audit.js');

const login = async (identifier, password) => {
  let r = (await request(app).post('/api/auth/login').send({ identifier, password })).body;
  if (r.mfaRequired) r = (await request(app).post('/api/auth/mfa/verify').send({ mfaToken: r.mfaToken, code: r.devCode })).body;
  return r.token;
};
let seeker, employer, admin;
beforeAll(async () => { seed(); seeker = await login('priya@example.in', 'Seeker@123'); employer = await login('hr@finlytics.in', 'Employer@123'); admin = await login('admin@skillsetu.in', 'Admin@123'); });

describe('validators and data structures', () => {
  it('validates GSTIN checksum', () => { expect(gov.validateGstin('29ABCDE1234F1ZW').valid).toBe(true); expect(gov.validateGstin('29ABCDE1234F1ZX').valid).toBe(false); });
  it('validates Aadhaar with Verhoeff', () => { const base = '23412341234'; const ok = base + gov.verhoeffDigit(base); expect(gov.validateAadhaar(ok).valid).toBe(true); expect(gov.validateAadhaar(base + ((gov.verhoeffDigit(base) + 1) % 10)).valid).toBe(false); });
  it('keeps the top N with a heap', () => { const h = new TopN(3); [5, 1, 9, 3, 7].forEach((v) => h.push(v, v)); expect(h.sorted().map((x) => x.item)).toEqual([9, 7, 5]); });
  it('evicts least recently used', () => { const c = new LRU(2); c.set('a', 1); c.set('b', 2); c.get('a'); c.set('c', 3); expect(c.get('b')).toBeUndefined(); expect(c.get('a')).toBe(1); });
  it('round-trips AES-256-GCM', () => { expect(decrypt(encrypt('+919876543210'))).toBe('+919876543210'); });
});

describe('auth', () => {
  it('rejects weak passwords', async () => { const r = await request(app).post('/api/auth/register').send({ role: 'seeker', name: 'Test User', email: 't@x.in', phone: '9811111111', password: 'weak', consent: true }); expect(r.status).toBe(400); });
  it('registers and activates with OTP', async () => {
    const r = await request(app).post('/api/auth/register').send({ role: 'seeker', name: 'Test User', email: 'new@x.in', phone: '9811111112', password: 'Strong@123', consent: true });
    expect(r.status).toBe(201);
    const v = await request(app).post('/api/auth/verify-otp').send({ userId: r.body.userId, code: r.body.devCode });
    expect(v.body.token).toBeTruthy();
  });
  it('locks the account after repeated failures', async () => {
    for (let i = 0; i < 5; i++) await request(app).post('/api/auth/login').send({ identifier: 'rahul@example.in', password: 'nope' });
    const r = await request(app).post('/api/auth/login').send({ identifier: 'rahul@example.in', password: 'Seeker@123' });
    expect(r.status).toBe(423);
  });
  it('enforces RBAC', async () => { const r = await request(app).get('/api/admin/overview').set('Authorization', `Bearer ${seeker}`); expect(r.status).toBe(403); });
});

describe('jobs and matching', () => {
  it('searches with synonym expansion', async () => { const r = await request(app).get('/api/public/jobs?q=reactjs'); expect(r.body.items.some((j) => j.title.includes('React'))).toBe(true); });
  it('returns an explainable match', async () => { const r = await request(app).get('/api/seeker/match/1').set('Authorization', `Bearer ${seeker}`); expect(r.body.score).toBeGreaterThan(60); expect(r.body.breakdown.skills.matched).toContain('React'); });
  it('recommends jobs', async () => { const r = await request(app).get('/api/seeker/recommendations').set('Authorization', `Bearer ${seeker}`); expect(r.body.items.length).toBeGreaterThan(0); });
  it('enforces the job state machine', async () => {
    const c = await request(app).post('/api/employer/jobs').set('Authorization', `Bearer ${employer}`).send({ title: 'QA Engineer', description: 'Write and run automated test suites for our web platform every sprint.', skills: ['JavaScript'], city: 'Bengaluru' });
    expect(c.body.job.status).toBe('draft');
    const bad = await request(app).post(`/api/employer/jobs/${c.body.job.id}/status`).set('Authorization', `Bearer ${employer}`).send({ status: 'paused' });
    expect(bad.status).toBe(400);
    const ok = await request(app).post(`/api/employer/jobs/${c.body.job.id}/status`).set('Authorization', `Bearer ${employer}`).send({ status: 'active' });
    expect(ok.body.job.status).toBe('active');
  });
  it('lets a seeker apply once', async () => {
    const a = await request(app).post('/api/seeker/applications').set('Authorization', `Bearer ${seeker}`).send({ jobId: 2 });
    expect(a.status).toBe(201);
    const b = await request(app).post('/api/seeker/applications').set('Authorization', `Bearer ${seeker}`).send({ jobId: 2 });
    expect(b.status).toBe(409);
  });
  it('hides private profiles from employers', async () => {
    await request(app).put('/api/seeker/profile').set('Authorization', `Bearer ${seeker}`).send({ visibility: 'private' });
    const r = await request(app).get('/api/employer/candidates').set('Authorization', `Bearer ${employer}`);
    expect(r.body.items.some((c) => c.name === 'Priya Sharma')).toBe(false);
  });
});

describe('portal API', () => {
  it('ingests idempotently and parks bad payloads in the DLQ', async () => {
    const t = await login('api@naukri-demo.in', 'Portal@123');
    const k = (await request(app).post('/api/portal/api-key/rotate').set('Authorization', `Bearer ${t}`)).body.apiKey;
    const payload = { jobId: 'NK-T1', jobTitle: 'Java Developer', jobDescription: 'Build Spring Boot services and SQL schemas for a fintech product.', companyName: 'Demo Co', location: 'Pune, Maharashtra', keySkills: 'Java, SQL', applyBy: '2030-01-01' };
    const a = await request(app).post('/api/v1/portal/jobs').set('X-API-Key', k).set('Idempotency-Key', 'k1').send(payload);
    expect(a.status).toBe(201);
    const b = await request(app).post('/api/v1/portal/jobs').set('X-API-Key', k).set('Idempotency-Key', 'k1').send(payload);
    expect(b.headers['idempotent-replay']).toBe('true');
    const bad = await request(app).post('/api/v1/portal/jobs').set('X-API-Key', k).send({ ...payload, jobId: 'NK-T2', jobTitle: '' });
    expect(bad.status).toBe(422);
    const dlq = await request(app).get('/api/portal/dead-letters').set('Authorization', `Bearer ${t}`);
    expect(dlq.body.items.length).toBe(1);
  });
});

describe('audit', () => { it('has an intact hash chain', () => { expect(verifyChain().valid).toBe(true); }); });
