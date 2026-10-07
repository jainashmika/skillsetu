// Reporting & analytics (SRS 3.5). Aggregations are computed with indexed SQL; this plays the role
// of the OLAP layer for state/sector/time slicing at the volumes in NFR-18..20.
const { one, all } = require('../db');
const settings = require('./settings');
const taxonomy = require('./taxonomy');

function where({ from, to, state, sector } = {}, alias = 'j') {
  const c = []; const p = [];
  if (from) { c.push(`${alias}.created_at >= ?`); p.push(from); }
  if (to) { c.push(`${alias}.created_at < date(?, '+1 day')`); p.push(to); }
  if (state) { c.push(`${alias}.state = ?`); p.push(state); }
  if (sector) { c.push(`${alias}.sector = ?`); p.push(sector); }
  return { sql: c.length ? ` AND ${c.join(' AND ')}` : '', p };
}

function overview() {
  const n = (sql, ...p) => one(sql, ...p).c;
  return {
    seekers: n("SELECT COUNT(*) c FROM users WHERE role='seeker' AND status<>'banned'"),
    employers: n('SELECT COUNT(*) c FROM companies'),
    verifiedEmployers: n("SELECT COUNT(*) c FROM companies WHERE verification_status='verified'"),
    activeJobs: n("SELECT COUNT(*) c FROM jobs WHERE status='active'"),
    openings: n("SELECT COALESCE(SUM(openings),0) c FROM jobs WHERE status='active'"),
    applications: n('SELECT COUNT(*) c FROM applications'),
    hires: n("SELECT COUNT(*) c FROM applications WHERE status='hired'"),
    portals: n("SELECT COUNT(*) c FROM portals WHERE status='active'"),
    pendingVerifications: n("SELECT COUNT(*) c FROM companies WHERE verification_status IN ('pending','manual_review')"),
    newUsers7d: n("SELECT COUNT(*) c FROM users WHERE created_at > datetime('now','-7 days')"),
    newJobs7d: n("SELECT COUNT(*) c FROM jobs WHERE created_at > datetime('now','-7 days')"),
  };
}

function employment(f = {}) {
  const w = where(f);
  const monthly = all(`SELECT strftime('%Y-%m', a.created_at) month, COUNT(*) applications, SUM(a.status='hired') hires, SUM(a.status IN ('shortlisted','interview','offered','hired')) progressed
                       FROM applications a JOIN jobs j ON j.id=a.job_id WHERE 1=1 ${w.sql} GROUP BY month ORDER BY month`, ...w.p)
    .map((r) => ({ ...r, hiringRate: r.applications ? Number(((r.hires / r.applications) * 100).toFixed(1)) : 0 }));
  const ctc = all(`SELECT strftime('%Y-%m', COALESCE(j.published_at, j.created_at)) month, ROUND(AVG(j.ctc_min)) avgMin, ROUND(AVG(j.ctc_max)) avgMax, COUNT(*) jobs
                   FROM jobs j WHERE j.ctc_min IS NOT NULL ${w.sql} GROUP BY month ORDER BY month`, ...w.p);
  const ctcBySector = all(`SELECT j.sector, ROUND(AVG((COALESCE(j.ctc_min,0)+COALESCE(j.ctc_max,j.ctc_min,0))/2.0)) avgCtc, COUNT(*) jobs FROM jobs j WHERE j.sector IS NOT NULL AND j.ctc_min IS NOT NULL ${w.sql} GROUP BY j.sector ORDER BY avgCtc DESC`, ...w.p);
  const byState = all(`SELECT j.state, COUNT(*) jobs, COALESCE(SUM(j.openings),0) openings,
                         (SELECT COUNT(*) FROM seeker_profiles sp WHERE sp.state=j.state) seekers,
                         (SELECT COUNT(*) FROM applications a JOIN jobs j2 ON j2.id=a.job_id WHERE j2.state=j.state AND a.status='hired') hires
                       FROM jobs j WHERE j.state IS NOT NULL ${w.sql} GROUP BY j.state ORDER BY jobs DESC`, ...w.p);
  const bySector = all(`SELECT j.sector, COUNT(*) jobs, SUM(j.status='active') active FROM jobs j WHERE j.sector IS NOT NULL ${w.sql} GROUP BY j.sector ORDER BY jobs DESC`, ...w.p);
  const funnel = ['applied', 'shortlisted', 'interview', 'offered', 'hired'].map((s, i, arr) => ({
    stage: s, count: one(`SELECT COUNT(*) c FROM applications a JOIN jobs j ON j.id=a.job_id WHERE a.status IN (${arr.slice(i).map(() => '?').join(',')}) ${w.sql}`, ...arr.slice(i), ...w.p).c,
  }));
  return { monthly, ctc, ctcBySector, byState, bySector, funnel };
}

function skillGap(limit = 15) {
  const demand = all(`SELECT s.id, s.name, s.category, COUNT(*) demand FROM job_skills js JOIN jobs j ON j.id=js.job_id JOIN skills s ON s.id=js.skill_id WHERE j.status='active' GROUP BY s.id`);
  const supply = new Map(all('SELECT skill_id, COUNT(*) c FROM seeker_skills GROUP BY skill_id').map((r) => [r.skill_id, r.c]));
  const totalSeekers = one("SELECT COUNT(*) c FROM users WHERE role='seeker'").c || 1;
  const totalJobs = one("SELECT COUNT(*) c FROM jobs WHERE status='active'").c || 1;
  return demand.map((d) => {
    const s = supply.get(d.id) || 0; const dShare = d.demand / totalJobs; const sShare = s / totalSeekers;
    return { skill: d.name, category: d.category, demand: d.demand, supply: s, demandShare: Number((dShare * 100).toFixed(1)), supplyShare: Number((sShare * 100).toFixed(1)), gap: Number(((dShare - sShare) * 100).toFixed(1)),
      trainings: taxonomy.trainings().filter((t) => t.skill_ids.includes(d.id)).map((t) => t.title) };
  }).sort((a, b) => b.gap - a.gap).slice(0, limit);
}

function activity(days = 14) {
  const daily = all(`SELECT date(created_at) day, event, COUNT(*) c FROM activity_events WHERE created_at > datetime('now', ?) GROUP BY day, event ORDER BY day`, `-${days} days`);
  const byDay = {};
  for (const r of daily) { byDay[r.day] = byDay[r.day] || { day: r.day }; byDay[r.day][r.event] = r.c; }
  const topSearches = all(`SELECT LOWER(json_extract(meta,'$.q')) q, COUNT(*) c FROM activity_events WHERE event='search' AND json_extract(meta,'$.q') <> '' AND created_at > datetime('now','-30 days') GROUP BY q ORDER BY c DESC LIMIT 10`);
  const byRole = all(`SELECT COALESCE(role,'guest') role, COUNT(*) c FROM activity_events WHERE created_at > datetime('now', ?) GROUP BY role`, `-${days} days`);
  const activeUsers = one(`SELECT COUNT(DISTINCT user_id) c FROM activity_events WHERE user_id IS NOT NULL AND created_at > datetime('now','-7 days')`).c;
  const guests = one(`SELECT COUNT(DISTINCT guest_id) c FROM activity_events WHERE guest_id IS NOT NULL AND user_id IS NULL AND created_at > datetime('now','-7 days')`).c;
  return { daily: Object.values(byDay), topSearches, byRole, activeUsers7d: activeUsers, guests7d: guests };
}

// How well do match scores predict employer decisions? (SRS 3.5.3 "AI match accuracy")
function matchAccuracy() {
  const threshold = settings.get('match_threshold');
  const rows = all(`SELECT status, match_score FROM applications WHERE match_score IS NOT NULL AND status IN ('shortlisted','interview','offered','hired','rejected')`);
  const pos = rows.filter((r) => r.status !== 'rejected'); const neg = rows.filter((r) => r.status === 'rejected');
  const tp = pos.filter((r) => r.match_score >= threshold).length; const fp = neg.filter((r) => r.match_score >= threshold).length;
  const fn = pos.length - tp; const tn = neg.length - fp;
  const avg = (a) => (a.length ? Number((a.reduce((s, r) => s + r.match_score, 0) / a.length).toFixed(1)) : null);
  const buckets = [0, 20, 40, 60, 80].map((lo) => { const b = rows.filter((r) => r.match_score >= lo && r.match_score < lo + 20); return { range: `${lo}-${lo + 20}`, total: b.length, progressed: b.filter((r) => r.status !== 'rejected').length }; });
  return { threshold, evaluated: rows.length, precision: tp + fp ? Number(((tp / (tp + fp)) * 100).toFixed(1)) : null, recall: tp + fn ? Number(((tp / (tp + fn)) * 100).toFixed(1)) : null,
    accuracy: rows.length ? Number((((tp + tn) / rows.length) * 100).toFixed(1)) : null, avgScoreProgressed: avg(pos), avgScoreRejected: avg(neg), buckets };
}

module.exports = { overview, employment, skillGap, activity, matchAccuracy, where };
