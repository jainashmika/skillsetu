// In-memory inverted index with BM25 ranking for job search (SRS 3.2.2, NFR-02). Queries are
// expanded through the skill taxonomy synonyms ("js" -> javascript, "accounts" -> accounting) so
// search understands intent rather than exact strings. Filters are applied before ranking.
const { tokenize } = require('../../utils/text');
const taxonomy = require('../taxonomy');
const engine = require('./engine');
const metrics = require('../metrics');

let built = -1; let index = null;
const K1 = 1.4, B = 0.75;

function build() {
  const st = engine.ensureIndex();
  if (built === st.version && index) return index;
  const postings = new Map(); const lens = new Map(); let total = 0;
  for (const j of st.jobs.values()) {
    const fields = [[j.title, 3], [j.sector || '', 1.5], [j.company_name || j.external_company || '', 1.5], [j.city || '', 1], [j.description || '', 1],
      [j.skills.map((s) => taxonomy.skillById(s.id)?.name || '').join(' '), 2.5]];
    const tf = new Map(); let len = 0;
    for (const [text, w] of fields) for (const t of tokenize(text)) { tf.set(t, (tf.get(t) || 0) + w); len++; }
    lens.set(j.id, len); total += len;
    for (const [t, f] of tf) { if (!postings.has(t)) postings.set(t, new Map()); postings.get(t).set(j.id, f); }
  }
  index = { postings, lens, avg: total / Math.max(1, lens.size), n: lens.size, jobs: st.jobs };
  built = st.version;
  return index;
}

function expand(q) {
  const terms = new Map();
  const raw = tokenize(q);
  for (const t of raw) terms.set(t, 1);
  // phrase + synonym expansion via taxonomy aliases
  const lower = String(q || '').toLowerCase();
  for (const [alias, skill] of taxonomy.aliasIndex()) {
    if (alias.length < 2) continue;
    const re = new RegExp(`(^|[^a-z0-9])${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`);
    if (re.test(lower)) for (const t of tokenize(skill.name)) if (!terms.has(t)) terms.set(t, 0.8);
  }
  return terms;
}

function search({ q = '', city, state, workFormat, contractType, sector, ctcMin, expMax, eduMax, skills = [], postedWithin, source, page = 1, pageSize = 20, sort = 'relevance' } = {}) {
  const t0 = Date.now();
  const idx = build();
  const filter = (j) => (!city || j.city === taxonomy.normCity(city) || (city === 'Remote' && j.work_format === 'remote'))
    && (!state || j.state === state)
    && (!workFormat || j.work_format === workFormat)
    && (!contractType || j.contract_type === contractType)
    && (!sector || j.sector === sector)
    && (!ctcMin || (j.ctc_max || j.ctc_min || 0) >= Number(ctcMin))
    && (expMax == null || expMax === '' || (j.experience_min || 0) <= Number(expMax))
    && (eduMax == null || eduMax === '' || (j.education_level || 0) <= Number(eduMax))
    && (!source || (source === 'direct' ? j.source === 'direct' : j.source !== 'direct'))
    && (!skills.length || skills.every((sid) => j.skills.some((s) => s.id === Number(sid))))
    && (!postedWithin || (Date.now() - new Date(`${j.published_at}Z`).getTime()) <= Number(postedWithin) * 86400000);

  let scored;
  const terms = expand(q);
  if (terms.size) {
    const scores = new Map();
    for (const [t, boost] of terms) {
      const plist = idx.postings.get(t); if (!plist) continue;
      const idf = Math.log(1 + (idx.n - plist.size + 0.5) / (plist.size + 0.5));
      for (const [id, f] of plist) {
        const len = idx.lens.get(id);
        const s = idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * len) / idx.avg))) * boost;
        scores.set(id, (scores.get(id) || 0) + s);
      }
    }
    scored = [...scores.entries()].map(([id, s]) => ({ job: idx.jobs.get(id), relevance: s })).filter((x) => x.job && filter(x.job));
  } else {
    scored = [...idx.jobs.values()].filter(filter).map((job) => ({ job, relevance: 0 }));
  }
  const fresh = (j) => new Date(`${j.published_at}Z`).getTime() || 0;
  if (sort === 'newest' || !terms.size) scored.sort((a, b) => fresh(b.job) - fresh(a.job));
  else if (sort === 'salary') scored.sort((a, b) => (b.job.ctc_max || 0) - (a.job.ctc_max || 0));
  else scored.sort((a, b) => b.relevance - a.relevance || fresh(b.job) - fresh(a.job));
  const total = scored.length;
  const items = scored.slice((page - 1) * pageSize, page * pageSize);
  // facets for the filter sidebar
  const facets = { city: {}, workFormat: {}, contractType: {}, sector: {} };
  for (const { job } of scored) {
    facets.city[job.city || 'Unspecified'] = (facets.city[job.city || 'Unspecified'] || 0) + 1;
    facets.workFormat[job.work_format] = (facets.workFormat[job.work_format] || 0) + 1;
    facets.contractType[job.contract_type] = (facets.contractType[job.contract_type] || 0) + 1;
    if (job.sector) facets.sector[job.sector] = (facets.sector[job.sector] || 0) + 1;
  }
  const ms = Date.now() - t0; metrics.time('search', ms);
  return { total, page, pageSize, items, facets, tookMs: ms, expandedTerms: [...terms.keys()] };
}

module.exports = { search, build };
