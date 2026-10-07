// Retry with exponential backoff + jitter for transient failures (NFR-69) and a simple circuit breaker (NFR-05).
class TransientError extends Error { constructor(m) { super(m); this.transient = true; } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn, { retries = 3, baseMs = 80, onRetry } = {}) {
  let attempt = 0;
  for (;;) {
    try { return await fn(attempt); }
    catch (err) {
      if (!err.transient || attempt >= retries) { err.attempts = attempt + 1; throw err; }
      attempt++;
      if (onRetry) onRetry(err, attempt);
      await sleep(baseMs * 2 ** (attempt - 1) + Math.random() * baseMs);
    }
  }
}

class CircuitBreaker {
  constructor(name, { threshold = 5, cooldownMs = 30000 } = {}) { Object.assign(this, { name, threshold, cooldownMs, failures: 0, openedAt: 0 }); }
  get state() { if (this.failures < this.threshold) return 'closed'; return Date.now() - this.openedAt > this.cooldownMs ? 'half-open' : 'open'; }
  async exec(fn) {
    if (this.state === 'open') { const e = new Error(`${this.name} is temporarily unavailable`); e.circuitOpen = true; throw e; }
    try { const r = await fn(); this.failures = 0; return r; }
    catch (e) { this.failures++; if (this.failures >= this.threshold) this.openedAt = Date.now(); throw e; }
  }
}
module.exports = { withRetry, TransientError, CircuitBreaker, sleep };
