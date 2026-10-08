// Custom report generation (SRS 3.5.4): parameterised datasets streamed row-by-row to CSV (no full
// materialisation in memory), PDF summaries via pdfkit, and JSON for BI tools such as Power BI.
const PDFDocument = require('pdfkit');
const { db, all, run, one } = require('../db');
const analytics = require('./analytics');
const taxonomy = require('./taxonomy');

const DATASETS = {
  jobs: { label: 'Job postings', columns: ['id', 'title', 'company', 'sector', 'city', 'state', 'contract_type', 'work_format', 'ctc_min', 'ctc_max', 'status', 'source', 'applications', 'published_at'],
    query: (f) => { const w = analytics.where(f); return [`SELECT j.id, j.title, COALESCE(c.name, j.external_company) company, j.sector, j.city, j.state, j.contract_type, j.work_format, j.ctc_min, j.ctc_max, j.status, j.source,
      (SELECT COUNT(*) FROM applications a WHERE a.job_id=j.id) applications, j.published_at FROM jobs j LEFT JOIN companies c ON c.id=j.company_id WHERE 1=1 ${w.sql} ORDER BY j.id`, w.p]; } },
  applications: { label: 'Applications (pseudonymised)', columns: ['id', 'job_id', 'job_title', 'sector', 'state', 'candidate_ref', 'status', 'match_score', 'created_at'],
    query: (f) => { const w = analytics.where(f); return [`SELECT a.id, a.job_id, j.title job_title, j.sector, j.state, 'C-' || printf('%06d', a.seeker_id) candidate_ref, a.status, a.match_score, a.created_at FROM applications a JOIN jobs j ON j.id=a.job_id WHERE 1=1 ${w.sql} ORDER BY a.id`, w.p]; } },
  employers: { label: 'Employers', columns: ['id', 'name', 'industry', 'city', 'state', 'verification_status', 'active_jobs', 'hires', 'created_at'],
    query: (f) => { const c = []; const p = []; if (f.state) { c.push('co.state=?'); p.push(f.state); } return [`SELECT co.id, co.name, co.industry, co.city, co.state, co.verification_status,
      (SELECT COUNT(*) FROM jobs j WHERE j.company_id=co.id AND j.status='active') active_jobs, (SELECT COUNT(*) FROM applications a JOIN jobs j ON j.id=a.job_id WHERE j.company_id=co.id AND a.status='hired') hires, co.created_at
      FROM companies co ${c.length ? `WHERE ${c.join(' AND ')}` : ''} ORDER BY co.id`, p]; } },
  seekers_by_state: { label: 'Job seekers by state & education', columns: ['state', 'education', 'seekers', 'avg_experience', 'hired'],
    query: () => [`SELECT COALESCE(sp.state,'Unspecified') state, sp.education_level education, COUNT(*) seekers, ROUND(AVG(sp.experience_years),1) avg_experience,
      SUM(EXISTS(SELECT 1 FROM applications a WHERE a.seeker_id=sp.user_id AND a.status='hired')) hired FROM seeker_profiles sp GROUP BY state, education ORDER BY state, education`, []],
    map: (r) => ({ ...r, education: taxonomy.EDU_LEVELS[r.education]?.label }) },
  skill_gap: { label: 'Skill gap analysis', columns: ['skill', 'category', 'demand', 'supply', 'demandShare', 'supplyShare', 'gap'], rows: () => analytics.skillGap(100) },
  state_employment: { label: 'State-wise employment', columns: ['state', 'jobs', 'openings', 'seekers', 'hires'], rows: (f) => analytics.employment(f).byState },
  activity: { label: 'Platform activity (daily)', columns: ['day', 'event', 'count'],
    query: (f) => [`SELECT date(created_at) day, event, COUNT(*) count FROM activity_events WHERE created_at >= COALESCE(?, date('now','-30 days')) GROUP BY day, event ORDER BY day`, [f.from || null]] },
};

const csvCell = (v) => { if (v == null) return ''; const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

function* rowsOf(name, filters = {}) {
  const ds = DATASETS[name]; if (!ds) throw new Error('Unknown dataset');
  if (ds.rows) { yield* ds.rows(filters); return; }
  const [sql, p] = ds.query(filters);
  for (const r of db.prepare(sql).iterate(...p)) yield ds.map ? ds.map(r) : r;
}

function streamCsv(res, name, filters) {
  const ds = DATASETS[name];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="skillsetu-${name}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.write('﻿' + ds.columns.join(',') + '\n');
  let n = 0;
  for (const r of rowsOf(name, filters)) { res.write(ds.columns.map((c) => csvCell(r[c])).join(',') + '\n'); n++; }
  res.end();
  return n;
}

function pdf(res, name, filters) {
  const ds = DATASETS[name];
  const doc = new PDFDocument({ size: 'A4', layout: ds.columns.length > 7 ? 'landscape' : 'portrait', margin: 36 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="skillsetu-${name}-${new Date().toISOString().slice(0, 10)}.pdf"`);
  doc.pipe(res);
  doc.fillColor('#0F6E6E').fontSize(18).text('SkillSetu', { continued: true }).fillColor('#14213D').text(`  ${ds.label}`);
  doc.fontSize(9).fillColor('#5B6475').text(`Generated ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST${Object.entries(filters).filter(([, v]) => v).map(([k, v]) => ` | ${k}: ${v}`).join('')}`);
  doc.moveDown();
  const width = doc.page.width - 72; const colW = width / ds.columns.length;
  const drawRow = (vals, bold) => {
    if (doc.y > doc.page.height - 60) doc.addPage();
    const y = doc.y; doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5).fillColor(bold ? '#14213D' : '#2B3445');
    vals.forEach((v, i) => doc.text(String(v ?? '').slice(0, 40), 36 + i * colW, y, { width: colW - 4, height: 11, ellipsis: true }));
    doc.y = y + 13;
  };
  drawRow(ds.columns, true);
  let n = 0;
  for (const r of rowsOf(name, filters)) { drawRow(ds.columns.map((c) => r[c])); if (++n >= 2000) { doc.text('… truncated at 2,000 rows. Use CSV for the full dataset.'); break; } }
  doc.end();
  return n;
}

function preview(name, filters, limit = 50) {
  const out = []; for (const r of rowsOf(name, filters)) { out.push(r); if (out.length >= limit) break; }
  return { columns: DATASETS[name].columns, rows: out };
}

async function runSchedules(notify) {
  const due = await all(`SELECT * FROM report_schedules WHERE last_run_at IS NULL
                   OR (frequency='daily' AND last_run_at < datetime('now','-1 day'))
                   OR (frequency='weekly' AND last_run_at < datetime('now','-7 days'))
                   OR (frequency='monthly' AND last_run_at < datetime('now','-1 month'))`);
  for (const s of due) {
    let rows = 0; for (const _ of rowsOf(s.dataset, JSON.parse(s.filters || '{}'))) rows++; // eslint-disable-line no-unused-vars
    await run("INSERT INTO outbox(channel,to_addr,subject,body,template,status) VALUES('email',?,?,?,?,'queued')", s.recipient, `Scheduled report: ${s.name}`, `Your scheduled report "${s.name}" (${DATASETS[s.dataset].label}) is ready with ${rows} rows. Download it from Admin > Reports.`, 'report');
    await run("UPDATE report_schedules SET last_run_at=datetime('now') WHERE id=?", s.id);
  }
  return due.length;
}

module.exports = { DATASETS, streamCsv, pdf, preview, rowsOf, runSchedules, _one: one };
