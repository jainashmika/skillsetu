// Shapes returned to clients. Keeping these in one place keeps responses consistent (NFR-74) and
// makes the privacy scrubbing for employer-facing views explicit (SRS 3.3.3).
const taxonomy = require('./taxonomy');
const { one, all } = require('../db');

const jobCard = (j, extra = {}) => ({
  id: j.id, title: j.title, company: j.company_name || j.external_company || j.portal_name || 'Employer', companySlug: j.company_slug || null,
  companyVerified: j.company_verification === 'verified', logo: j.logo_url || null, source: j.source,
  city: j.city, state: j.state, workFormat: j.work_format, contractType: j.contract_type, sector: j.sector,
  ctcMin: j.ctc_min, ctcMax: j.ctc_max, experienceMin: j.experience_min, experienceMax: j.experience_max,
  educationLevel: j.education_level, openings: j.openings, deadline: j.deadline, status: j.status, publishedAt: j.published_at,
  skills: (j.skills || []).map((s) => ({ id: s.id, name: s.name || taxonomy.skillById(s.id)?.name, required: !!s.required })).filter((s) => s.name),
  ...extra,
});

function completion(p) {
  const items = [
    { key: 'city', label: 'Add your city', done: !!p.city, level: 1 },
    { key: 'headline', label: 'Write a one-line headline', done: !!p.headline, level: 1 },
    { key: 'education_level', label: 'Add your highest education', done: p.education_level > 0 || p.educations.length > 0, level: 1 },
    { key: 'skills', label: 'Add at least 3 skills', done: p.skills.length >= 3, level: 2 },
    { key: 'educations', label: 'Add education details', done: p.educations.length > 0, level: 2 },
    { key: 'languages', label: 'Add languages you speak', done: p.languages.length > 0, level: 2 },
    { key: 'experience', label: 'Add work experience (or mark yourself a fresher)', done: p.experiences.length > 0 || p.experience_years === 0 && p.profile_level >= 3, level: 3 },
    { key: 'expected_ctc', label: 'Set your expected salary', done: !!p.expected_ctc_min, level: 3 },
    { key: 'preferred_locations', label: 'Choose preferred locations', done: p.preferred_locations.length > 0, level: 3 },
    { key: 'resume', label: 'Upload your resume', done: !!p.resume_path, level: 3 },
    { key: 'verification', label: 'Verify ID or certificates', done: !!(p.ekyc_verified || p.digilocker_verified), level: 3 },
  ];
  const done = items.filter((i) => i.done).length;
  const level = items.filter((i) => i.level === 1).every((i) => i.done) ? (items.filter((i) => i.level === 2).every((i) => i.done) ? 3 : 2) : 1;
  return { percent: Math.round((done / items.length) * 100), level, missing: items.filter((i) => !i.done).map(({ key, label, level: l }) => ({ key, label, level: l })) };
}

function seekerFull(p) {
  return {
    id: p.id || p.user_id, name: p.name, email: p.email, phone: p.phone_masked, slug: p.slug, headline: p.headline, about: p.about, gender: p.gender,
    city: p.city, state: p.state, educationLevel: p.education_level, educationLabel: taxonomy.EDU_LEVELS[p.education_level]?.label, experienceYears: p.experience_years,
    expectedCtcMin: p.expected_ctc_min, expectedCtcMax: p.expected_ctc_max, preferredLocations: p.preferred_locations, preferredWorkFormat: p.preferred_work_format,
    preferredContract: p.preferred_contract, sectors: p.sectors, languages: p.languages, visibility: p.visibility,
    aadhaarMasked: p.aadhaar_masked, ekycVerified: !!p.ekyc_verified, digilockerVerified: !!p.digilocker_verified,
    resumeName: p.resume_name, hasResume: !!p.resume_path, profileLevel: p.profile_level, updatedAt: p.updated_at,
    skills: p.skills.map((s) => ({ id: s.id, name: taxonomy.skillById(s.id)?.name, category: taxonomy.skillById(s.id)?.category, level: s.level, source: s.source, confidence: s.confidence })).filter((s) => s.name),
    educations: p.educations, experiences: p.experiences,
  };
}

// Employer-facing candidate view. Contact details only when the candidate applied to this company.
function candidateView(p, { companyId, reveal = false } = {}) {
  const applied = reveal || (companyId && one('SELECT 1 FROM applications a JOIN jobs j ON j.id=a.job_id WHERE a.seeker_id=? AND j.company_id=?', p.id, companyId));
  const f = seekerFull(p);
  return {
    id: f.id, name: f.name, headline: f.headline, about: f.about, city: f.city, state: f.state, educationLevel: f.educationLevel, educationLabel: f.educationLabel,
    experienceYears: f.experienceYears, expectedCtcMin: f.expectedCtcMin, expectedCtcMax: f.expectedCtcMax, languages: f.languages, skills: f.skills, slug: f.slug,
    educations: f.educations.map(({ qualification, field, institution, year, verified }) => ({ qualification, field, institution, year, verified: !!verified })),
    experiences: f.experiences.map(({ title, company, start_date, end_date, current }) => ({ title, company, start_date, end_date, current: !!current })),
    verified: { ekyc: f.ekycVerified, digilocker: f.digilockerVerified }, hasResume: f.hasResume && !!applied,
    contact: applied ? { email: p.email, phone: p.phone_masked } : null, contactHidden: !applied,
  };
}

const companyCard = (c) => ({ id: c.id, name: c.name, slug: c.slug, logo: c.logo_url, industry: c.industry, city: c.city, state: c.state, size: c.size, website: c.website, about: c.about, verified: c.verification_status === 'verified',
  activeJobs: one("SELECT COUNT(*) c FROM jobs WHERE company_id=? AND status='active'", c.id).c });

module.exports = { jobCard, completion, seekerFull, candidateView, companyCard, _all: all };
