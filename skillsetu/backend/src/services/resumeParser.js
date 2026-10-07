// AI resume parser (SRS 3.1.1 "AI resume parsing (PDF/DOCX) to auto-fill taxonomies").
// Extracts contact details, skills (taxonomy + synonyms), Indian qualifications, experience and
// location, each with a confidence score so the user can review before applying.
const pdfParse = require('pdf-parse/lib/pdf-parse.js');
const mammoth = require('mammoth');
const taxonomy = require('./taxonomy');
const metrics = require('./metrics');
const { E } = require('../utils/errors');

const MAX_BYTES = 5 * 1024 * 1024;

async function extractText(buffer, mimetype, filename = '') {
  if (buffer.length > MAX_BYTES) throw E.bad('Resume must be 5 MB or smaller.');
  const name = filename.toLowerCase();
  try {
    if (mimetype === 'application/pdf' || name.endsWith('.pdf')) return (await pdfParse(buffer)).text || '';
    if (name.endsWith('.docx') || mimetype.includes('wordprocessingml')) return (await mammoth.extractRawText({ buffer })).value || '';
    if (name.endsWith('.txt') || mimetype.startsWith('text/')) return buffer.toString('utf8');
  } catch (e) {
    // Poorly formatted / scanned PDFs: fail softly with a clear message (SRS 3.3.1 edge cases).
    throw E.bad('We could not read text from this file. If it is a scanned image, please upload a text-based PDF or DOCX.');
  }
  throw E.bad('Upload a PDF, DOCX or TXT resume.');
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec';

function section(text, names) {
  const re = new RegExp(`^\\s*(${names.join('|')})\\b[\\s:]*$`, 'im');
  const m = re.exec(text); if (!m) return '';
  const rest = text.slice(m.index + m[0].length);
  const next = /^\s*(education|experience|work experience|employment|skills|technical skills|projects|certifications|achievements|languages|hobbies|interests|personal details|declaration|summary|objective)\b[\s:]*$/im.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

function parseText(text) {
  const t0 = Date.now();
  const clean = text.replace(/\r/g, '').replace(/[ \t]+/g, ' ');
  const lower = clean.toLowerCase();
  const lines = clean.split('\n').map((l) => l.trim()).filter(Boolean);

  const email = (clean.match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [])[0] || null;
  const phoneM = clean.match(/(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/);
  const phone = phoneM ? phoneM[0].replace(/[^\d]/g, '').slice(-10) : null;
  const name = lines.find((l) => /^[A-Za-z][A-Za-z .]{2,40}$/.test(l) && l.split(' ').length <= 4 && !/resume|curriculum|vitae|profile/i.test(l)) || null;

  // Skills: dictionary match over taxonomy names + synonyms; higher confidence inside a Skills section.
  const skillSec = section(clean, ['skills', 'technical skills', 'key skills', 'core competencies']).toLowerCase();
  const found = new Map();
  for (const [alias, skill] of taxonomy.aliasIndex()) {
    if (alias.length < 2) continue;
    const re = new RegExp(`(^|[^a-z0-9+#])${esc(alias)}($|[^a-z0-9+#])`, 'g');
    const hits = (lower.match(re) || []).length;
    if (!hits) continue;
    const inSec = skillSec && re.test(skillSec);
    const conf = Math.min(0.99, (inSec ? 0.85 : 0.6) + 0.05 * (hits - 1));
    const prev = found.get(skill.id);
    if (!prev || prev.confidence < conf) found.set(skill.id, { id: skill.id, name: skill.name, confidence: Number(conf.toFixed(2)), matchedAs: alias });
  }

  // Education
  const eduSec = section(clean, ['education', 'educational qualifications?', 'academic details', 'academics', 'qualifications?']) || clean;
  const educations = [];
  for (const l of eduSec.split('\n').map((x) => x.trim()).filter(Boolean)) {
    const q = taxonomy.detectQualifications(l)[0];
    if (!q) continue;
    const year = (l.match(/\b(19|20)\d{2}\b(?!.*\b(19|20)\d{2}\b)/) || [])[0];
    const grade = (l.match(/(\d{1,2}(\.\d{1,2})?\s?(cgpa|gpa|\/\s?10))|(\d{2}(\.\d+)?\s?%)/i) || [])[0];
    const inst = (l.match(/(?:from|,|-|–|at)\s*([A-Z][\w .&'()-]*(?:University|Institute|College|School|IIT|NIT|IIIT|Polytechnic|ITI|Vidyalaya)[\w .&'()-]*)/) || [])[1];
    if (!educations.some((e) => e.qualification === q.label)) educations.push({ qualification: q.label, level: q.level, year: year ? Number(year) : null, grade: grade || null, institution: inst ? inst.trim() : null, confidence: 0.8 });
  }
  const allQ = taxonomy.detectQualifications(clean);
  const educationLevel = Math.max(0, ...educations.map((e) => e.level), ...allQ.map((q) => q.level));

  // Experience: explicit "N years" or summed date ranges
  let expYears = null, expConf = 0;
  const explicit = lower.match(/(\d{1,2}(?:\.\d)?)\s*\+?\s*(?:years|yrs)(?:\s+of)?\s+(?:work\s+|professional\s+|industry\s+)?experience/);
  if (explicit) { expYears = Number(explicit[1]); expConf = 0.9; }
  const expSec = section(clean, ['experience', 'work experience', 'professional experience', 'employment history', 'employment']);
  const experiences = [];
  const rangeRe = new RegExp(`((?:${MONTHS})[a-z]*\\.?\\s*)?((?:19|20)\\d{2})\\s*(?:-|–|to)\\s*((?:${MONTHS})[a-z]*\\.?\\s*)?((?:19|20)\\d{2}|present|current|till date|now)`, 'i');
  if (expSec) {
    const el = expSec.split('\n').map((x) => x.trim()).filter(Boolean);
    el.forEach((l, i) => {
      const m = rangeRe.exec(l); if (!m) return;
      const start = Number(m[2]); const current = /present|current|till|now/i.test(m[4]); const end = current ? new Date().getFullYear() : Number(m[4]);
      const titleLine = l.replace(rangeRe, '').replace(/[|,–-]\s*$/, '').trim() || el[i - 1] || 'Role';
      const [title, company] = titleLine.split(/\s+(?:at|@|\||,|–|-)\s+/);
      experiences.push({ title: (title || 'Role').slice(0, 80), company: company ? company.slice(0, 80) : null, start_date: `${start}-01-01`, end_date: current ? null : `${end}-01-01`, current, years: Math.max(0, end - start), confidence: 0.7 });
    });
    if (expYears == null && experiences.length) { expYears = experiences.reduce((s, e) => s + e.years, 0); expConf = 0.65; }
  }
  if (expYears == null && /fresher|fresh graduate|no experience/i.test(lower)) { expYears = 0; expConf = 0.8; }

  // Location: first known Indian city mentioned
  let city = null;
  for (const c of [...Object.keys(taxonomy.CITIES), 'Bangalore', 'Bombay', 'Gurgaon', 'New Delhi', 'Mysore']) {
    if (new RegExp(`\\b${esc(c)}\\b`, 'i').test(clean)) { city = taxonomy.normCity(c); break; }
  }
  const languages = ['English', 'Hindi', 'Kannada', 'Tamil', 'Telugu', 'Marathi', 'Bengali', 'Gujarati', 'Malayalam', 'Punjabi', 'Odia', 'Urdu'].filter((l) => new RegExp(`\\b${l}\\b`, 'i').test(clean));

  const result = {
    name, email, phone, city, state: taxonomy.stateOf(city), languages,
    skills: [...found.values()].sort((a, b) => b.confidence - a.confidence),
    educations, educationLevel, educationLabel: taxonomy.EDU_LEVELS[educationLevel]?.label,
    experienceYears: expYears, experienceConfidence: expConf, experiences: experiences.slice(0, 8),
    headline: experiences[0]?.title || null,
    stats: { characters: clean.length, lines: lines.length },
  };
  metrics.time('parse', Date.now() - t0);
  return result;
}

async function parseResume(buffer, mimetype, filename) {
  const text = await extractText(buffer, mimetype, filename);
  if (text.trim().length < 30) throw E.bad('This resume looks empty or image-only. Please upload a text-based PDF or DOCX.');
  return parseText(text);
}
module.exports = { parseResume, parseText, extractText };
