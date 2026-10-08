// Static reference data (skills, occupations, sectors, education levels) with an LRU-backed
// in-memory cache so search/matching never re-read these tables per request (SRS 3.1.4, NFR-15).
const { all, json } = require('../db');
const { LRU } = require('../utils/ds');

const cache = new LRU(50, 10 * 60 * 1000);

const EDU_LEVELS = [
  { level: 0, label: 'No formal / below 10th' },
  { level: 1, label: '10th (SSLC / SSC / Matric)' },
  { level: 2, label: '12th (HSC / PUC / Intermediate)' },
  { level: 3, label: 'ITI / Certificate' },
  { level: 4, label: 'Diploma / Polytechnic' },
  { level: 5, label: 'Graduate (B.Tech, B.Sc, B.Com, BA, BCA...)' },
  { level: 6, label: 'Postgraduate (M.Tech, MBA, PGDM, MCA...)' },
  { level: 7, label: 'Doctorate (PhD)' },
];

// Indian qualification acronyms -> ordinal level (SRS 3.3.1 "B.Tech, PGDM").
const QUALIFICATIONS = [
  [/\bph\.?\s?d\b|doctorate/i, 7, 'PhD'],
  [/\bm\.?\s?tech\b/i, 6, 'M.Tech'], [/\bm\.?e\.?\b(?![a-z])/i, 6, 'M.E.'], [/\bmba\b/i, 6, 'MBA'], [/\bpgdm\b/i, 6, 'PGDM'],
  [/\bmca\b/i, 6, 'MCA'], [/\bm\.?\s?sc\b/i, 6, 'M.Sc'], [/\bm\.?\s?com\b/i, 6, 'M.Com'], [/\bm\.?a\.?\b(?= |,|$)/i, 6, 'M.A.'],
  [/\bb\.?\s?tech\b/i, 5, 'B.Tech'], [/\bb\.?e\.?\b(?= |,|$)/i, 5, 'B.E.'], [/\bb\.?\s?sc\b/i, 5, 'B.Sc'], [/\bbca\b/i, 5, 'BCA'],
  [/\bb\.?\s?com\b/i, 5, 'B.Com'], [/\bbba\b/i, 5, 'BBA'], [/\bb\.?\s?pharm\b/i, 5, 'B.Pharm'], [/\bmbbs\b/i, 5, 'MBBS'],
  [/\bb\.?a\.?\b(?= |,|$)/i, 5, 'B.A.'], [/\bbachelor/i, 5, "Bachelor's"], [/\bmaster/i, 6, "Master's"],
  [/\bdiploma\b|polytechnic/i, 4, 'Diploma'], [/\biti\b|industrial training institute/i, 3, 'ITI'],
  [/\b12th\b|\bhsc\b|\bpuc\b|intermediate|higher secondary/i, 2, '12th'],
  [/\b10th\b|\bsslc\b|\bssc\b|matriculation|secondary school/i, 1, '10th'],
];

async function skills() {
  let s = cache.get('skills');
  if (!s) {
    s = (await all('SELECT id, name, category, synonyms FROM skills ORDER BY name')).map((r) => ({ ...r, synonyms: json(r.synonyms, []) }));
    cache.set('skills', s);
  }
  return s;
}
// alias (lowercase) -> skill
function aliasIndex() {
  let idx = cache.get('aliasIndex');
  if (!idx) {
    idx = new Map();
    for (const s of skills()) { idx.set(s.name.toLowerCase(), s); for (const a of s.synonyms) idx.set(String(a).toLowerCase(), s); }
    cache.set('aliasIndex', idx);
  }
  return idx;
}
const skillById = (id) => skills().find((s) => s.id === Number(id));
function resolveSkill(nameOrId) {
  if (typeof nameOrId === 'number' || /^\d+$/.test(String(nameOrId))) return skillById(nameOrId);
  return aliasIndex().get(String(nameOrId).trim().toLowerCase());
}
async function sectors() { let v = cache.get('sectors'); if (!v) { v = await all('SELECT * FROM sectors ORDER BY name'); cache.set('sectors', v); } return v; }
async function occupations() { let v = cache.get('occ'); if (!v) { v = (await all('SELECT * FROM occupations ORDER BY title')).map((o) => ({ ...o, skill_ids: json(o.skill_ids, []) })); cache.set('occ', v); } return v; }
async function trainings() { let v = cache.get('tr'); if (!v) { v = (await all('SELECT * FROM trainings')).map((t) => ({ ...t, skill_ids: json(t.skill_ids, []) })); cache.set('tr', v); } return v; }

function detectQualifications(text) {
  const found = [];
  for (const [re, level, label] of QUALIFICATIONS) if (re.test(text)) found.push({ label, level });
  return found;
}

const STATES = ['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Delhi','Goa','Gujarat','Haryana','Himachal Pradesh','Jammu and Kashmir','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Chandigarh','Puducherry','Ladakh'];
const CITIES = {
  Bengaluru: 'Karnataka', Mysuru: 'Karnataka', Mangaluru: 'Karnataka', Hubballi: 'Karnataka',
  Mumbai: 'Maharashtra', Pune: 'Maharashtra', Nagpur: 'Maharashtra', Nashik: 'Maharashtra',
  Delhi: 'Delhi', Noida: 'Uttar Pradesh', Lucknow: 'Uttar Pradesh', Kanpur: 'Uttar Pradesh', Varanasi: 'Uttar Pradesh',
  Gurugram: 'Haryana', Faridabad: 'Haryana', Hyderabad: 'Telangana', Warangal: 'Telangana', Chennai: 'Tamil Nadu', Coimbatore: 'Tamil Nadu', Madurai: 'Tamil Nadu',
  Kolkata: 'West Bengal', Ahmedabad: 'Gujarat', Surat: 'Gujarat', Vadodara: 'Gujarat', Jaipur: 'Rajasthan', Udaipur: 'Rajasthan',
  Kochi: 'Kerala', Thiruvananthapuram: 'Kerala', Bhopal: 'Madhya Pradesh', Indore: 'Madhya Pradesh', Patna: 'Bihar', Bhubaneswar: 'Odisha',
  Chandigarh: 'Chandigarh', Guwahati: 'Assam', Visakhapatnam: 'Andhra Pradesh', Vijayawada: 'Andhra Pradesh', Ranchi: 'Jharkhand', Dehradun: 'Uttarakhand', Ludhiana: 'Punjab', Raipur: 'Chhattisgarh',
};
const CITY_ALIASES = { bangalore: 'Bengaluru', bombay: 'Mumbai', 'new delhi': 'Delhi', gurgaon: 'Gurugram', madras: 'Chennai', calcutta: 'Kolkata', mysore: 'Mysuru', mangalore: 'Mangaluru', trivandrum: 'Thiruvananthapuram', cochin: 'Kochi', vizag: 'Visakhapatnam' };
function normCity(c) {
  if (!c) return null; const k = String(c).trim().toLowerCase();
  if (CITY_ALIASES[k]) return CITY_ALIASES[k];
  return Object.keys(CITIES).find((x) => x.toLowerCase() === k) || String(c).trim();
}
const stateOf = (city) => CITIES[normCity(city)] || null;

module.exports = { EDU_LEVELS, QUALIFICATIONS, skills, aliasIndex, resolveSkill, skillById, sectors, occupations, trainings, detectQualifications, STATES, CITIES, normCity, stateOf, invalidate: () => cache.clear(), cacheStats: () => cache.stats() };
