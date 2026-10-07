// Adapter pattern for third-party job portals (SRS 3.1.3, 3.4.1). Each adapter maps a portal's own
// schema into SkillSetu's canonical job shape; a per-portal JSON field mapping can override fields.
const taxonomy = require('../taxonomy');

const lpa = (x) => (x == null || x === '' ? null : Math.round(Number(x) * 100000));
const range = (s) => { const m = String(s || '').match(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)/); return m ? [Number(m[1]), Number(m[2])] : [Number(String(s).match(/\d+(\.\d+)?/)?.[0]) || null, null]; };
const listOf = (v) => (Array.isArray(v) ? v : String(v || '').split(/[,;|]/)).map((s) => String(s).trim()).filter(Boolean);
const TYPE = (t) => { const s = String(t || '').toLowerCase(); if (s.includes('part')) return 'part_time'; if (s.includes('intern')) return 'internship'; if (s.includes('contract') || s.includes('temp')) return 'contract'; if (s.includes('apprent')) return 'apprenticeship'; return 'full_time'; };
const MODE = (m) => { const s = String(m || '').toLowerCase(); if (/wfh|remote|home/.test(s) || m === true) return 'remote'; if (s.includes('hybrid')) return 'hybrid'; return 'onsite'; };
const EDU = (q) => { const f = taxonomy.detectQualifications(String(q || '')); return f.length ? Math.min(...f.map((x) => x.level)) : 0; };
const get = (obj, path) => String(path).split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

const adapters = {
  generic: {
    label: 'SkillSetu canonical schema',
    toJob: (p) => ({ externalId: p.external_id ?? p.id, company: p.company, job: {
      title: p.title, description: p.description, sector: p.sector, contract_type: p.contract_type, work_format: p.work_format, city: p.city, state: p.state,
      ctc_min: p.ctc_min, ctc_max: p.ctc_max, experience_min: p.experience_min, experience_max: p.experience_max, education_level: p.education_level,
      openings: p.openings, deadline: p.deadline, skills: listOf(p.skills) } }),
    sample: { external_id: 'EXT-1001', company: 'Acme Logistics', title: 'Warehouse Supervisor', description: 'Supervise inbound and outbound operations, manage a team of 12 pickers and ensure inventory accuracy using WMS.', sector: 'Logistics', contract_type: 'full_time', work_format: 'onsite', city: 'Pune', ctc_min: 300000, ctc_max: 420000, experience_min: 2, education_level: 4, skills: ['Inventory Management', 'Team Leadership', 'MS Excel'], deadline: '2026-12-31' },
  },
  naukri: {
    label: 'Naukri-style feed',
    toJob: (p) => { const [smin, smax] = [p.salary?.min, p.salary?.max]; const [emin, emax] = range(p.experience); const [city, state] = String(p.location || '').split(',').map((s) => s.trim());
      return { externalId: p.jobId, company: p.companyName, job: { title: p.jobTitle, description: p.jobDescription, sector: p.industry, contract_type: TYPE(p.employmentType), work_format: MODE(p.workMode), city, state,
        ctc_min: lpa(smin), ctc_max: lpa(smax), experience_min: emin || 0, experience_max: emax, education_level: EDU(p.education), openings: p.vacancies || 1, deadline: p.applyBy, skills: listOf(p.keySkills) } }; },
    sample: { jobId: 'NK-88213', jobTitle: 'Java Backend Developer', jobDescription: 'Build REST microservices with Spring Boot, design SQL schemas and own CI pipelines for a fintech product used by 2M users.', companyName: 'Finlytics Pvt Ltd', industry: 'IT & Software', location: 'Bengaluru, Karnataka', salary: { min: 8, max: 14 }, experience: '2-5 Yrs', keySkills: 'Java, Spring Boot, SQL, REST APIs', employmentType: 'Full Time, Permanent', workMode: 'Hybrid', education: 'B.Tech/B.E.', applyBy: '2026-12-15' },
  },
  foundit: {
    label: 'foundit-style feed',
    toJob: (p) => { const [cmin, cmax] = range(p.ctcLpa); const loc = listOf(p.locations)[0];
      return { externalId: p.ref, company: p.org, job: { title: p.title, description: p.desc, sector: p.function, contract_type: TYPE(p.type), work_format: p.remote ? 'remote' : 'onsite', city: loc,
        ctc_min: lpa(cmin), ctc_max: lpa(cmax), experience_min: p.minExp || 0, experience_max: p.maxExp, education_level: EDU(p.qualification), deadline: p.expiry, skills: listOf(p.skills) } }; },
    sample: { ref: 'FI-55120', title: 'Digital Marketing Executive', desc: 'Plan and run social media campaigns, manage Google Ads budgets and report weekly on SEO and conversion metrics.', org: 'BrightCart', function: 'Marketing', locations: ['Mumbai'], ctcLpa: '3-5', minExp: 1, maxExp: 3, skills: ['Digital Marketing', 'SEO', 'Social Media'], type: 'Full time', remote: false, qualification: 'BBA / B.Com', expiry: '2026-12-20' },
  },
  ncs: {
    label: 'National Career Service (NCS) feed',
    toJob: (p) => ({ externalId: p.ncsId, company: p.employer, job: { title: p.post, description: p.details, sector: p.sector, contract_type: TYPE(p.nature), work_format: 'onsite', city: p.district, state: p.state,
      ctc_min: p.salaryMonthly ? p.salaryMonthly * 12 : null, ctc_max: p.salaryMonthlyMax ? p.salaryMonthlyMax * 12 : null, experience_min: p.expYears || 0, education_level: EDU(p.qualification), openings: p.vacancies || 1, deadline: p.lastDate, skills: listOf(p.skills) } }),
    sample: { ncsId: 'NCS-2026-77031', post: 'Electrician (ITI)', details: 'Install and maintain electrical wiring in industrial units, read circuit diagrams and follow safety norms. Apprenticeship-trained candidates preferred.', employer: 'Shakti Engineering Works', sector: 'Manufacturing', nature: 'Full Time', district: 'Coimbatore', state: 'Tamil Nadu', salaryMonthly: 18000, salaryMonthlyMax: 24000, expYears: 0, qualification: 'ITI Electrician', vacancies: 6, lastDate: '2026-11-30', skills: 'Electrical Wiring, Safety Compliance' },
  },
};

function transform(adapterName, payload, mapping = {}) {
  const a = adapters[adapterName] || adapters.generic;
  const out = a.toJob(payload || {});
  // Per-portal overrides: { "title": "position.name", "city": "address.town" }
  for (const [ours, theirs] of Object.entries(mapping || {})) {
    const v = get(payload, theirs); if (v === undefined) continue;
    if (ours === 'external_id') out.externalId = v; else if (ours === 'company') out.company = v; else if (ours === 'skills') out.job.skills = listOf(v); else out.job[ours] = v;
  }
  if (out.externalId != null) out.externalId = String(out.externalId);
  return out;
}

module.exports = { adapters, transform };
