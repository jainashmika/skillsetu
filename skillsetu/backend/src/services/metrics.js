// In-process instrumentation for SRS 3.5.3 / NFR-133: latency percentiles per route, error counts,
// match engine timings and resource utilisation.
const os = require('os');
const started = Date.now();
const routes = new Map();
const series = []; // per-minute rollups for charts
let current = { t: minute(), count: 0, errors: 0, totalMs: 0 };
const timings = { match: [], search: [], parse: [] };

function minute() { return Math.floor(Date.now() / 60000) * 60000; }
function pct(arr, p) { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] * 10) / 10; }
function pushCapped(arr, v, cap = 500) { arr.push(v); if (arr.length > cap) arr.shift(); }

function record(route, ms, status) {
  let r = routes.get(route);
  if (!r) { r = { count: 0, errors: 0, samples: [] }; routes.set(route, r); }
  r.count++; if (status >= 500) r.errors++;
  pushCapped(r.samples, ms, 200);
  const m = minute();
  if (m !== current.t) { series.push(current); if (series.length > 120) series.shift(); current = { t: m, count: 0, errors: 0, totalMs: 0 }; }
  current.count++; current.totalMs += ms; if (status >= 500) current.errors++;
}
const time = (kind, ms) => pushCapped(timings[kind], ms);

let lastCpu = process.cpuUsage(); let lastT = Date.now();
function cpuPercent() {
  const now = Date.now(); const u = process.cpuUsage(lastCpu); const el = (now - lastT) * 1000;
  lastCpu = process.cpuUsage(); lastT = now;
  return el ? Math.min(100, ((u.user + u.system) / el) * 100) : 0;
}

function snapshot() {
  const mem = process.memoryUsage();
  const all = [...routes.entries()].map(([route, r]) => ({ route, count: r.count, errors: r.errors, p50: pct(r.samples, 50), p95: pct(r.samples, 95) }))
    .sort((a, b) => b.count - a.count);
  const allSamples = [...routes.values()].flatMap((r) => r.samples);
  return {
    uptimeSec: Math.round((Date.now() - started) / 1000),
    requests: all.reduce((s, r) => s + r.count, 0),
    errors: all.reduce((s, r) => s + r.errors, 0),
    p50: pct(allSamples, 50), p95: pct(allSamples, 95), p99: pct(allSamples, 99),
    routes: all.slice(0, 25),
    engine: Object.fromEntries(Object.entries(timings).map(([k, v]) => [k, { n: v.length, p50: pct(v, 50), p95: pct(v, 95) }])),
    resources: {
      cpuPercent: Number(cpuPercent().toFixed(1)),
      rssMb: Math.round(mem.rss / 1048576), heapUsedMb: Math.round(mem.heapUsed / 1048576), heapTotalMb: Math.round(mem.heapTotal / 1048576),
      systemMemPercent: Number((((os.totalmem() - os.freemem()) / os.totalmem()) * 100).toFixed(1)),
      loadAvg: os.loadavg().map((x) => Number(x.toFixed(2))), cores: os.cpus().length,
    },
    series: [...series, current].map((s) => ({ t: s.t, rpm: s.count, errors: s.errors, avgMs: s.count ? Math.round(s.totalMs / s.count) : 0 })),
  };
}
module.exports = { record, time, snapshot };
