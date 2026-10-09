// AI matching engine (SRS 3.3.1). Produces an explainable match percentage from five components:
// skills (taxonomy overlap + TF-IDF semantic similarity), education, experience, location, salary.
// Weights and the threshold come from admin settings and are applied at query time.
const { all, json } = require('../../db');
const crypto = require('crypto');
const settings = require('../settings');
const taxonomy = require('../taxonomy');
const metrics = require('../metrics');
const { Vectorizer, cosine } = require('./vectorizer');
const { TopN } = require('../../utils/ds');

let state = { version: 0, builtVersion: -1, vec: new Vectorizer(), jobs: new Map(), skillIndex: new Map() };
const invalidate = () => { state.version++; };

// ---------- data loading ----------
function loadJobs(where = "j.status = 'active'", params = []) {
  const rows = all(`SELECT j.*, c.name AS company_name, c.slug AS company_slug, c.logo_url, c.verification_status AS company_verification
                    FROM jobs j LEFT JOIN companies c ON c.id = j.company_id WHERE ${where}`, ...params);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const sk = all(`SELECT job_id, skill_id, required FROM job_skills WHERE job_id IN (${ids.map(() => '?').join(',')})`, ...ids);
  const byJob = new Map();
  for (const s of sk) { if (!byJob.has(s.job_id)) byJob.set(s.job_id, []); byJob.get(s.job_id).push({ id: s.skill_id, required: !!s.required }); }
  return rows.map((r) => ({ ...r, skills: byJob.get(r.id) || [] }));
}
function loadSeeker(userId) {
  const p = all(`SELECT u.id, u.name, u.email, u.phone_masked, sp.* FROM users u JOIN seeker_profiles sp ON sp.user_id = u.id WHERE u.id = ?`, userId)[0];
  if (!p) return null;
  p.skills = all('SELECT skill_id AS id, level, source, confidence FROM seeker_skills WHERE user_id = ?', userId);
  p.educations = all('SELECT * FROM educations WHERE user_id = ? ORDER BY level DESC, year DESC', userId);
  p.experiences = all('SELECT * FROM experiences WHERE user_id = ? ORDER BY current DESC, start_date DESC', userId);
  p.preferred_locations = json(p.preferred_locations, []);
  p.sectors = json(p.sectors, []);
  p.languages = json(p.languages, []);
  return p;
}
function loadSeekers(where = '1=1', params = []) {
  const ids = all(`SELECT u.id FROM users u JOIN seeker_profiles sp ON sp.user_id = u.id WHERE u.status='active' AND u.role='seeker' AND ${where}`, ...params).map((r) => r.id);
  return ids.map(loadSeeker).filter(Boolean);
}

const skillName = (id) => taxonomy.skillById(id)?.name || `#${id}`;
const jobText = (j) => `${j.title} ${j.title} ${j.sector || ''} ${j.description || ''} ${j.skills.map((s) => skillName(s.id)).join(' ')}`;
const seekerText = (p) => `${p.headline || ''} ${p.about || ''} ${p.experiences.map((e) => `${e.title} ${e.description || ''}`).join(' ')} ${p.educations.map((e) => `${e.qualification} ${e.field || ''}`).join(' ')} ${p.skills.map((s) => skillName(s.id)).join(' ')}`;

// Rebuild the in-memory vector space and inverted skill index when jobs change.
function ensureIndex() {
  if (state.builtVersion === state.version) return state;
  const t = Date.now();
  const jobs = loadJobs();
  const vec = new Vectorizer().fit(jobs.map(jobText));
  const map = new Map(); const skillIndex = new Map();
  for (const j of jobs) {
    j.vector = vec.vector(jobText(j));
    map.set(j.id, j);
    for (const s of j.skills) { if (!skillIndex.has(s.id)) skillIndex.set(s.id, new Set()); skillIndex.get(s.id).add(j.id); }
  }
  state = { ...state, builtVersion: state.version, vec, jobs: map, skillIndex, builtAt: new Date().toISOString(), buildMs: Date.now() - t };
  return state;
}

// ---------- component scores ----------
function skillComponent(seeker, job, sv, jv) {
  const have = new Map(seeker.skills.map((s) => [s.id, s]));
  const haveCats = new Set(seeker.skills.map((s) => taxonomy.skillById(s.id)?.category).filter(Boolean));
  let total = 0, got = 0; const matched = [], missing = [], partial = [];
  for (const s of job.skills) {
    const w = s.required ? 1 : 0.5; total += w;
    if (have.has(s.id)) { got += w; matched.push(skillName(s.id)); }
    else {
      const cat = taxonomy.skillById(s.id)?.category;
      if (cat && haveCats.has(cat) && cat !== 'General') { got += w * 0.25; partial.push(skillName(s.id)); }
      if (s.required) missing.push(skillName(s.id));
    }
  }
  const semantic = cosine(sv, jv);
  const coverage = total ? got / total : semantic;
  const score = total ? 0.8 * coverage + 0.2 * Math.min(1, semantic * 2) : Math.min(1, semantic * 2);
  return { score, coverage, semantic: Number(semantic.toFixed(3)), matched, missing, partial };
}
function educationComponent(seeker, job) {
  const need = job.education_level || 0; const have = seeker.education_level || 0;
  const d = need - have;
  const score = d <= 0 ? 1 : d === 1 ? 0.6 : d === 2 ? 0.3 : 0;
  return { score, required: taxonomy.EDU_LEVELS[need]?.label, have: taxonomy.EDU_LEVELS[have]?.label };
}
function experienceComponent(seeker, job) {
  const y = seeker.experience_years || 0; const min = job.experience_min || 0; const max = job.experience_max;
  let score = 1;
  if (y < min) score = Math.max(0, 1 - (min - y) / Math.max(2, min));
  else if (max != null && y > max + 2) score = 0.75; // over-qualified: still a fit, small penalty
  return { score, years: y, min, max };
}
function locationComponent(seeker, job) {
  if (job.work_format === 'remote') return { score: 1, reason: 'Remote role' };
  const city = taxonomy.normCity(seeker.city); const prefs = (seeker.preferred_locations || []).map((c) => taxonomy.normCity(c));
  if (job.city && (city === job.city || prefs.includes(job.city))) return { score: 1, reason: city === job.city ? 'Same city' : 'Preferred location' };
  if (prefs.some((p) => /anywhere|any/i.test(p))) return { score: 0.85, reason: 'Open to relocate' };
  const st = seeker.state || taxonomy.stateOf(city);
  if (job.state && st === job.state) return { score: job.work_format === 'hybrid' ? 0.6 : 0.7, reason: 'Same state' };
  return { score: job.work_format === 'hybrid' ? 0.3 : 0.15, reason: 'Different region' };
}
function salaryComponent(seeker, job) {
  const want = seeker.expected_ctc_min; const offer = job.ctc_max || job.ctc_min;
  if (!want || !offer) return { score: 0.7, reason: 'Salary not specified' };
  if (offer >= want) return { score: 1, reason: 'Meets expectation' };
  const r = offer / want;
  return { score: Math.max(0, r * r), reason: `Offer is ${Math.round((1 - r) * 100)}% below expectation` };
}

function normWeights() {
  const w = settings.get('match_weights'); const sum = Object.values(w).reduce((a, b) => a + Number(b), 0) || 1;
  return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, Number(v) / sum]));
}

function scorePair(seeker, job, ctx = {}) {
  const st = ctx.state || ensureIndex();
  const sv = ctx.seekerVector || st.vec.vector(seekerText(seeker));
  const jv = job.vector || st.vec.vector(jobText(job));
  const w = ctx.weights || normWeights();
  const parts = {
    skills: skillComponent(seeker, job, sv, jv),
    education: educationComponent(seeker, job),
    experience: experienceComponent(seeker, job),
    location: locationComponent(seeker, job),
    salary: salaryComponent(seeker, job),
  };
  let total = 0; for (const k of Object.keys(parts)) total += (w[k] || 0) * parts[k].score;
  const score = Math.round(total * 1000) / 10;
  // Confidence reflects how much data we had to work with (SRS 3.3.1 "confidence scores").
  const filled = [seeker.skills.length > 0, !!seeker.education_level, !!seeker.city, !!seeker.expected_ctc_min, job.skills.length > 0, !!(job.ctc_min || job.ctc_max)].filter(Boolean).length;
  const strengths = [], gaps = [];
  if (parts.skills.matched.length) strengths.push(`Has ${parts.skills.matched.slice(0, 4).join(', ')}`);
  if (parts.education.score === 1 && job.education_level) strengths.push('Meets education requirement');
  if (parts.experience.score === 1 && job.experience_min) strengths.push(`${seeker.experience_years} yrs experience fits`);
  if (parts.location.score >= 0.85) strengths.push(parts.location.reason);
  if (parts.skills.missing.length) gaps.push(`Missing ${parts.skills.missing.slice(0, 4).join(', ')}`);
  if (parts.education.score < 1) gaps.push(`Needs ${parts.education.required}`);
  if (parts.experience.score < 1 && seeker.experience_years < job.experience_min) gaps.push(`Needs ${job.experience_min}+ yrs experience`);
  if (parts.location.score < 0.5) gaps.push('Located in a different region');
  if (parts.salary.score < 1 && parts.salary.reason !== 'Salary not specified') gaps.push(parts.salary.reason);
  const breakdown = Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, { ...v, score: Math.round(v.score * 100), weight: Math.round((w[k] || 0) * 100) }]));
  
  const fairnessHash = crypto
    .createHash('sha256')
    .update(`${seeker.id || seeker.user_id}:${job.id}:${score}`)
    .digest('hex')
    .slice(0, 8);

  return {
    score,
    breakdown,
    strengths,
    gaps,
    confidence: Math.round((filled / 6) * 100) / 100,
    aboveThreshold: score >= settings.get('match_threshold'),
    matchedSkills: parts.skills.matched || [],
    missingSkills: (parts.skills.missing || []).slice(0, 3),
    fairnessHash: `fair-${fairnessHash}`
  };
}

// KNN-style retrieval: shortlist candidates through the inverted skill index and TF-IDF neighbours,
// then fully score and keep the Top-N with a bounded heap.
function topJobsForSeeker(seeker, { n = 20, excludeIds = new Set(), filter } = {}) {
  const t = Date.now();
  const st = ensureIndex();
  const sv = st.vec.vector(seekerText(seeker));
  const cand = new Set();
  for (const s of seeker.skills) for (const id of st.skillIndex.get(s.id) || []) cand.add(id);
  if (cand.size < n * 3) for (const id of st.jobs.keys()) cand.add(id); // small corpora / sparse profiles: score all
  const heap = new TopN(n); const ctx = { state: st, seekerVector: sv, weights: normWeights() };
  for (const id of cand) {
    if (excludeIds.has(id)) continue;
    const job = st.jobs.get(id); if (!job || (filter && !filter(job))) continue;
    const m = scorePair(seeker, job, ctx);
    heap.push({ job, ...m }, m.score);
  }
  metrics.time('match', Date.now() - t);
  return heap.sorted().map((x) => x.item);
}

function topSeekersForJob(job, { n = 20, seekers, filter } = {}) {
  const t = Date.now();
  const st = ensureIndex();
  const jv = job.vector || st.vec.vector(jobText(job));
  const j = { ...job, vector: jv };
  const heap = new TopN(n); const weights = normWeights();
  for (const s of seekers) {
    if (filter && !filter(s)) continue;
    const m = scorePair(s, j, { state: st, weights });
    heap.push({ seeker: s, ...m }, m.score);
  }
  metrics.time('match', Date.now() - t);
  return heap.sorted().map((x) => x.item);
}

module.exports = { ensureIndex, invalidate, scorePair, topJobsForSeeker, topSeekersForJob, loadJobs, loadSeeker, loadSeekers, jobText, seekerText, info: () => ({ version: state.version, builtAt: state.builtAt, buildMs: state.buildMs, jobs: state.jobs.size, vocab: state.vec.df.size }) };
