// Job recommendation engine (SRS 3.3.2): hybrid of content-based matching (engine.js) and
// collaborative filtering learned from platform behaviour (views, saves, applications).
//  - Item-item neighbourhood CF on the implicit user x job matrix (sparse, stored as Maps).
//  - Matrix factorisation (implicit, SGD with negative sampling) for latent preferences.
// The two CF signals are blended, then mixed with the content score by the admin's cf_blend setting.
const { all, run, db } = require('../../db');
const settings = require('../settings');
const engine = require('./engine');

const EVENT_WEIGHT = { view_job: 1, save_job: 3, apply: 5, click_rec: 2 };
let model = { trainedAt: null, users: new Map(), items: new Map(), U: new Map(), V: new Map(), itemNorm: new Map(), k: 8, loss: null, interactions: 0 };

function interactions() {
  const rows = all(`SELECT user_id, job_id, event, COUNT(*) c FROM activity_events
                    WHERE user_id IS NOT NULL AND job_id IS NOT NULL AND event IN ('view_job','save_job','apply','click_rec')
                    GROUP BY user_id, job_id, event`);
  const apps = all('SELECT seeker_id user_id, job_id FROM applications');
  const m = new Map(); // user -> Map(job -> weight)
  const add = (u, j, w) => { if (!m.has(u)) m.set(u, new Map()); const r = m.get(u); r.set(j, Math.min(10, (r.get(j) || 0) + w)); };
  for (const r of rows) add(r.user_id, r.job_id, (EVENT_WEIGHT[r.event] || 1) * Math.min(3, r.c));
  for (const a of apps) add(a.user_id, a.job_id, EVENT_WEIGHT.apply);
  return m;
}

function rand() { return (Math.random() - 0.5) * 0.1; }
function train({ epochs = 25, k = 8, lr = 0.05, reg = 0.02 } = {}) {
  const t = Date.now();
  const R = interactions();
  const items = new Map(); // job -> Map(user -> w)
  for (const [u, row] of R) for (const [j, w] of row) { if (!items.has(j)) items.set(j, new Map()); items.get(j).set(u, w); }
  const U = new Map(), V = new Map();
  for (const u of R.keys()) U.set(u, Array.from({ length: k }, rand));
  for (const j of items.keys()) V.set(j, Array.from({ length: k }, rand));
  const itemIds = [...items.keys()];
  let loss = 0;
  for (let e = 0; e < epochs && itemIds.length; e++) {
    loss = 0;
    for (const [u, row] of R) {
      const pu = U.get(u);
      const samples = [...row.entries()].map(([j, w]) => [j, 1, 1 + Math.log(1 + w)]);
      for (let s = 0; s < row.size; s++) { const j = itemIds[(Math.random() * itemIds.length) | 0]; if (!row.has(j)) samples.push([j, 0, 1]); }
      for (const [j, y, c] of samples) {
        const qi = V.get(j); let dot = 0; for (let f = 0; f < k; f++) dot += pu[f] * qi[f];
        const p = 1 / (1 + Math.exp(-dot)); const err = (y - p) * c; loss += c * (y - p) ** 2;
        for (let f = 0; f < k; f++) { const a = pu[f], b = qi[f]; pu[f] += lr * (err * b - reg * a); qi[f] += lr * (err * a - reg * b); }
      }
    }
  }
  const itemNorm = new Map(); for (const [j, us] of items) { let s = 0; for (const w of us.values()) s += w * w; itemNorm.set(j, Math.sqrt(s)); }
  model = { trainedAt: new Date().toISOString(), users: R, items, U, V, itemNorm, k, loss: Number(loss.toFixed(3)), interactions: [...R.values()].reduce((s, r) => s + r.size, 0), trainMs: Date.now() - t };
  return info();
}
const info = () => ({ trainedAt: model.trainedAt, users: model.users.size, items: model.items.size, interactions: model.interactions, latentFactors: model.k, loss: model.loss, trainMs: model.trainMs });

function itemItemScore(userId, jobId) {
  const row = model.users.get(userId); const target = model.items.get(jobId);
  if (!row || !target) return 0;
  let s = 0, n = 0;
  for (const [j, w] of row) {
    if (j === jobId) continue; const other = model.items.get(j); if (!other) continue;
    let dot = 0; const [a, b] = other.size < target.size ? [other, target] : [target, other];
    for (const [u, x] of a) { const y = b.get(u); if (y) dot += x * y; }
    const sim = dot / ((model.itemNorm.get(j) || 1) * (model.itemNorm.get(jobId) || 1));
    s += sim * Math.min(1, w / 5); n++;
  }
  return n ? Math.min(1, s / Math.sqrt(n)) : 0;
}
function mfScore(userId, jobId) {
  const pu = model.U.get(userId), qi = model.V.get(jobId); if (!pu || !qi) return 0;
  let dot = 0; for (let f = 0; f < model.k; f++) dot += pu[f] * qi[f];
  return 1 / (1 + Math.exp(-dot));
}
// Popularity prior from historical click-through: applications / views (smoothed).
function ctrPrior(job) { const apps = job._apps || 0; return (apps + 1) / ((job.views || 0) + 10); }

function recommendForSeeker(seeker, { n = 12, excludeApplied = true } = {}) {
  if (!model.trainedAt) train();
  const applied = new Set(excludeApplied ? all('SELECT job_id FROM applications WHERE seeker_id = ?', seeker.id).map((r) => r.job_id) : []);
  const pool = engine.topJobsForSeeker(seeker, { n: n * 3, excludeIds: applied });
  const blend = Number(settings.get('cf_blend'));
  const appCounts = new Map(all("SELECT job_id, COUNT(*) c FROM applications GROUP BY job_id").map((r) => [r.job_id, r.c]));
  const recs = pool.map((r) => {
    r.job._apps = appCounts.get(r.job.id) || 0;
    const cf = model.users.has(seeker.id) ? 0.6 * itemItemScore(seeker.id, r.job.id) + 0.4 * (mfScore(seeker.id, r.job.id) - 0.5) * 2 : 0;
    const finalScore = (1 - blend) * r.score + blend * 100 * Math.max(0, cf) + 5 * Math.min(1, ctrPrior(r.job) * 5);
    return { ...r, cf: Number(cf.toFixed(3)), rank: Number(Math.min(100, finalScore).toFixed(1)) };
  }).sort((a, b) => b.rank - a.rank).slice(0, n);
  persist(seeker.id, recs);
  return recs;
}

const upsert = db.prepare(`INSERT INTO recommendations(seeker_id, job_id, score, breakdown, computed_at) VALUES(?,?,?,?,datetime('now'))
  ON CONFLICT(seeker_id, job_id) DO UPDATE SET score=excluded.score, breakdown=excluded.breakdown, computed_at=excluded.computed_at`);
const persist = db.transaction((sid, recs) => {
  run('DELETE FROM recommendations WHERE seeker_id = ?', sid);
  for (const r of recs) upsert.run(sid, r.job.id, r.score, JSON.stringify({ strengths: r.strengths, gaps: r.gaps }));
});

module.exports = { train, info, recommendForSeeker, itemItemScore, mfScore };
