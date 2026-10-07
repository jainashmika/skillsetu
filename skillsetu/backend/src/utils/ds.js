// Small data structures used by the matching engine and caches.

// LRU cache with TTL (NFR-15). Map preserves insertion order, so the first key is least recently used.
class LRU {
  constructor(max = 500, ttlMs = 5 * 60 * 1000) { this.max = max; this.ttl = ttlMs; this.map = new Map(); this.hits = 0; this.misses = 0; }
  get(k) {
    const e = this.map.get(k);
    if (!e || e.exp < Date.now()) { if (e) this.map.delete(k); this.misses++; return undefined; }
    this.map.delete(k); this.map.set(k, e); this.hits++;
    return e.v;
  }
  set(k, v) {
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, { v, exp: Date.now() + this.ttl });
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
  }
  del(prefix) { for (const k of [...this.map.keys()]) if (k.startsWith(prefix)) this.map.delete(k); }
  clear() { this.map.clear(); }
  stats() { return { size: this.map.size, hits: this.hits, misses: this.misses }; }
}

// Bounded min-heap that keeps the Top-N items by score in O(n log N) (SRS 3.3.3).
class TopN {
  constructor(n) { this.n = n; this.h = []; }
  push(item, score) {
    const h = this.h;
    if (h.length < this.n) { h.push({ item, score }); this._up(h.length - 1); }
    else if (score > h[0].score) { h[0] = { item, score }; this._down(0); }
  }
  _up(i) { const h = this.h; while (i > 0) { const p = (i - 1) >> 1; if (h[p].score <= h[i].score) break; [h[p], h[i]] = [h[i], h[p]]; i = p; } }
  _down(i) {
    const h = this.h;
    for (;;) {
      const l = 2 * i + 1, r = l + 1; let m = i;
      if (l < h.length && h[l].score < h[m].score) m = l;
      if (r < h.length && h[r].score < h[m].score) m = r;
      if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m;
    }
  }
  sorted() { return [...this.h].sort((a, b) => b.score - a.score); }
}

// Token bucket rate limiter (SRS 3.1.3, NFR-48).
class TokenBucket {
  constructor() { this.buckets = new Map(); }
  take(key, capacityPerMin) {
    const now = Date.now();
    const rate = capacityPerMin / 60000;
    let b = this.buckets.get(key);
    if (!b) { b = { tokens: capacityPerMin, last: now }; this.buckets.set(key, b); }
    b.tokens = Math.min(capacityPerMin, b.tokens + (now - b.last) * rate);
    b.last = now;
    if (b.tokens >= 1) { b.tokens -= 1; return { ok: true, remaining: Math.floor(b.tokens) }; }
    return { ok: false, remaining: 0, retryAfterSec: Math.ceil((1 - b.tokens) / rate / 1000) };
  }
}

module.exports = { LRU, TopN, TokenBucket };
