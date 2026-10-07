// TF-IDF vector space over job and profile text. Vectors are L2-normalised sparse maps, so cosine
// similarity is a dot product over the smaller map: O(min(|a|,|b|)).
const { tokenize } = require('../../utils/text');

class Vectorizer {
  constructor() { this.df = new Map(); this.n = 0; }
  fit(docs) {
    this.df = new Map(); this.n = docs.length;
    for (const d of docs) for (const t of new Set(tokenize(d))) this.df.set(t, (this.df.get(t) || 0) + 1);
    return this;
  }
  idf(t) { return Math.log((this.n + 1) / ((this.df.get(t) || 0) + 1)) + 1; }
  vector(text, boost = null) {
    const tf = new Map();
    for (const t of tokenize(text)) tf.set(t, (tf.get(t) || 0) + 1);
    if (boost) for (const [t, w] of boost) tf.set(t, (tf.get(t) || 0) + w);
    const v = new Map(); let norm = 0;
    for (const [t, c] of tf) { const w = (1 + Math.log(c)) * this.idf(t); v.set(t, w); norm += w * w; }
    norm = Math.sqrt(norm) || 1;
    for (const [t, w] of v) v.set(t, w / norm);
    return v;
  }
}
function cosine(a, b) {
  if (!a || !b) return 0;
  const [s, l] = a.size < b.size ? [a, b] : [b, a];
  let dot = 0; for (const [t, w] of s) { const o = l.get(t); if (o) dot += w * o; }
  return dot;
}
module.exports = { Vectorizer, cosine };
