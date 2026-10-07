import { useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { api, qs, inr } from '../../lib/api';
import { useAsync, Spinner, ErrorBox, Stat, Tabs } from '../../components/ui';
import { PageHead } from '../../components/Layout';
import { ChartCard } from './Overview';

const TICK = { fontSize: 12, fill: '#7A8496' };
const C = ['#0F6E6E', '#F2A900', '#3B4BA8', '#6B8F3A', '#C2410C', '#7A8496'];
const Grid = (p) => <CartesianGrid vertical={false} stroke="#EEF1EC" {...p} />;
const ax = { tick: TICK, tickLine: false, axisLine: false };
const L = { wrapperStyle: { fontSize: 12 } };
const Load = ({ s, children }) => (s.loading && !s.data ? <Spinner /> : s.error ? <ErrorBox error={s.error} onRetry={s.reload} /> : children(s.data));
const None = () => <p className="text-sm text-ink-faint">No data for this selection.</p>;

function Labour({ f }) {
  const emp = useAsync(() => api(`/admin/analytics/employment${qs(f)}`), [f.from, f.to, f.state, f.sector]);
  const gap = useAsync(() => api('/admin/analytics/skill-gap?limit=20'), []);
  return (
    <div className="space-y-4">
      <Load s={emp}>{(d) => (<>
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Monthly hiring rate (%)">{d.monthly.length ? <ResponsiveContainer><LineChart data={d.monthly} margin={{ left: -16, right: 8 }}><Grid /><XAxis dataKey="month" {...ax} /><YAxis {...ax} unit="%" /><Tooltip formatter={(v) => `${v}%`} /><Line dataKey="hiringRate" name="Hiring rate" stroke={C[0]} strokeWidth={2.5} dot={{ r: 3 }} /></LineChart></ResponsiveContainer> : <None />}</ChartCard>
          <ChartCard title="Average CTC trend">{d.ctc.length ? <ResponsiveContainer><LineChart data={d.ctc} margin={{ left: 4, right: 8 }}><Grid /><XAxis dataKey="month" {...ax} /><YAxis {...ax} tickFormatter={inr} /><Tooltip formatter={(v) => inr(v)} /><Legend {...L} /><Line dataKey="avgMin" name="Average minimum" stroke={C[0]} strokeWidth={2.5} dot={false} /><Line dataKey="avgMax" name="Average maximum" stroke={C[1]} strokeWidth={2.5} dot={false} /></LineChart></ResponsiveContainer> : <None />}</ChartCard>
          <ChartCard title="Average CTC by sector" h={300}>{d.ctcBySector.length ? <ResponsiveContainer><BarChart data={d.ctcBySector} layout="vertical" margin={{ left: 8, right: 8 }}><CartesianGrid horizontal={false} stroke="#EEF1EC" /><XAxis type="number" {...ax} tickFormatter={inr} /><YAxis type="category" dataKey="sector" {...ax} width={120} /><Tooltip formatter={(v) => inr(v)} cursor={{ fill: '#F4F6F2' }} /><Bar dataKey="avgCtc" name="Average CTC" fill={C[0]} radius={[0, 6, 6, 0]} barSize={12} /></BarChart></ResponsiveContainer> : <None />}</ChartCard>
          <ChartCard title="Jobs by sector" h={300}>{d.bySector.length ? <ResponsiveContainer><BarChart data={d.bySector} margin={{ left: -16, right: 8 }}><Grid /><XAxis dataKey="sector" {...ax} interval={0} angle={-25} textAnchor="end" height={70} /><YAxis {...ax} allowDecimals={false} /><Tooltip cursor={{ fill: '#F4F6F2' }} /><Legend {...L} /><Bar dataKey="jobs" name="All jobs" fill={C[0]} radius={[6, 6, 0, 0]} /><Bar dataKey="active" name="Active" fill={C[1]} radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer> : <None />}</ChartCard>
        </div>
        <section className="card p-4 sm:p-5"><h2 className="mb-3 text-base font-semibold">State-wise employment</h2>
          <div className="overflow-x-auto"><table className="table min-w-[520px]"><thead><tr><th>State</th><th>Jobs</th><th>Openings</th><th>Seekers</th><th>Hires</th></tr></thead>
            <tbody>{d.byState.map((s) => <tr key={s.state}><td className="font-medium">{s.state}</td><td>{s.jobs}</td><td>{s.openings}</td><td>{s.seekers}</td><td>{s.hires}</td></tr>)}</tbody></table></div></section>
      </>)}</Load>
      <section className="card p-4 sm:p-5"><h2 className="mb-1 text-base font-semibold">Skill gap analysis</h2><p className="mb-3 text-xs text-ink-faint">Share of active jobs needing a skill compared with share of seekers who have it</p>
        <Load s={gap}>{(d) => (
          <div className="overflow-x-auto"><table className="table min-w-[720px]"><thead><tr><th>Skill</th><th>Demand</th><th>Supply</th><th>Gap</th><th>Suggested trainings</th></tr></thead>
            <tbody>{d.items.map((g) => (
              <tr key={g.skill}><td><p className="font-medium">{g.skill}</p><p className="text-xs text-ink-faint">{g.category}</p></td>
                <td>{g.demandShare}% <span className="text-xs text-ink-faint">({g.demand} jobs)</span></td><td>{g.supplyShare}% <span className="text-xs text-ink-faint">({g.supply})</span></td>
                <td><span className={g.gap > 0 ? 'chip-gold' : 'chip-teal'}>{g.gap > 0 ? '+' : ''}{g.gap} pts</span></td>
                <td className="text-xs text-ink-soft">{g.trainings.length ? g.trainings.join(', ') : '–'}</td></tr>))}</tbody></table></div>)}</Load></section>
    </div>
  );
}

function ActivityTab() {
  const s = useAsync(() => api('/admin/analytics/activity?days=14'), []);
  return <Load s={s}>{(d) => { const evs = [...new Set(d.daily.flatMap((r) => Object.keys(r).filter((k) => k !== 'day')))]; return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Stat label="Active users, 7 days" value={d.activeUsers7d} /><Stat label="Guest visitors, 7 days" value={d.guests7d} />{d.byRole.slice(0, 2).map((r) => <Stat key={r.role} label={`Events by ${r.role}s`} value={r.c} />)}</div>
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <ChartCard title="Daily events, last 14 days" h={300}>{d.daily.length ? <ResponsiveContainer><BarChart data={d.daily} margin={{ left: -16, right: 8 }}><Grid /><XAxis dataKey="day" {...ax} tickFormatter={(v) => v.slice(5)} /><YAxis {...ax} allowDecimals={false} /><Tooltip cursor={{ fill: '#F4F6F2' }} /><Legend {...L} />{evs.map((e, i) => <Bar key={e} dataKey={e} stackId="a" fill={C[i % C.length]} radius={i === evs.length - 1 ? [6, 6, 0, 0] : 0} />)}</BarChart></ResponsiveContainer> : <None />}</ChartCard>
        <section className="card p-4 sm:p-5"><h2 className="mb-3 text-base font-semibold">Top searches, 30 days</h2>
          {d.topSearches.length ? <ol className="space-y-2">{d.topSearches.map((t, i) => <li key={t.q} className="flex items-center gap-3 text-sm"><span className="w-5 text-ink-faint">{i + 1}</span><span className="flex-1 truncate">{t.q}</span><span className="chip">{t.c}</span></li>)}</ol> : <None />}</section>
      </div>
    </div>); }}</Load>;
}

function Accuracy() {
  const s = useAsync(() => api('/admin/analytics/match-accuracy'), []);
  const p = (v) => (v == null ? '–' : `${v}%`);
  return <Load s={s}>{(d) => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Stat label="Precision" value={p(d.precision)} sub={`Threshold ${d.threshold}%`} /><Stat label="Recall" value={p(d.recall)} /><Stat label="Accuracy" value={p(d.accuracy)} sub={`${d.evaluated} decisions evaluated`} /><Stat label="Avg score, progressed vs rejected" value={`${d.avgScoreProgressed ?? '–'} / ${d.avgScoreRejected ?? '–'}`} tone="gold" /></div>
      <ChartCard title="Employer decisions by match score band" h={300}><ResponsiveContainer><BarChart data={d.buckets} margin={{ left: -16, right: 8 }}><Grid /><XAxis dataKey="range" {...ax} /><YAxis {...ax} allowDecimals={false} /><Tooltip cursor={{ fill: '#F4F6F2' }} /><Legend {...L} /><Bar dataKey="total" name="Decided" fill={C[2]} radius={[6, 6, 0, 0]} /><Bar dataKey="progressed" name="Progressed" fill={C[0]} radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></ChartCard>
    </div>)}</Load>;
}

const BRK = { closed: 'chip-teal', half_open: 'chip-gold', 'half-open': 'chip-gold', open: 'chip-red' };
function System() {
  const s = useAsync(() => api('/admin/analytics/system'), []);
  return <Load s={s}>{(d) => { const m = d.metrics; const series = m.series.map((x) => ({ ...x, time: new Date(x.t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) })); return (
    <div className="space-y-4">
      <div className="flex justify-end"><button className="btn-outline btn-sm" onClick={s.reload}>Refresh</button></div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"><Stat label="p50 latency" value={`${m.p50} ms`} /><Stat label="p95 latency" value={`${m.p95} ms`} /><Stat label="p99 latency" value={`${m.p99} ms`} tone={m.p99 > 1000 ? 'gold' : 'teal'} /><Stat label="CPU" value={`${m.resources.cpuPercent}%`} sub={`${m.resources.cores} cores, load ${m.resources.loadAvg[0]}`} /><Stat label="Memory" value={`${m.resources.rssMb} MB`} sub={`Heap ${m.resources.heapUsedMb}/${m.resources.heapTotalMb} MB, system ${m.resources.systemMemPercent}%`} /><Stat label="Database size" value={`${d.dbSizeMb} MB`} /></div>
      <ChartCard title="Requests per minute">{<ResponsiveContainer><LineChart data={series} margin={{ left: -16, right: 8 }}><Grid /><XAxis dataKey="time" {...ax} minTickGap={24} /><YAxis {...ax} allowDecimals={false} /><Tooltip /><Legend {...L} /><Line dataKey="rpm" name="Requests" stroke={C[0]} strokeWidth={2.5} dot={false} /><Line dataKey="errors" name="Errors" stroke={C[1]} strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer>}</ChartCard>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <section className="card p-4"><h2 className="mb-2 text-base font-semibold">Engine timings</h2><ul className="space-y-1.5 text-sm">{Object.entries(m.engine).map(([k, v]) => <li key={k} className="flex justify-between"><span className="capitalize text-ink-soft">{k}</span><span>p50 {v.p50} · p95 {v.p95} ms <span className="text-xs text-ink-faint">n={v.n}</span></span></li>)}</ul></section>
        <section className="card p-4"><h2 className="mb-2 text-base font-semibold">Cache and events</h2><ul className="space-y-1.5 text-sm"><li className="flex justify-between"><span className="text-ink-soft">Cache entries</span>{d.cache.size}</li><li className="flex justify-between"><span className="text-ink-soft">Hit rate</span>{d.cache.hits + d.cache.misses ? Math.round((d.cache.hits / (d.cache.hits + d.cache.misses)) * 100) : 0}%</li><li className="flex justify-between"><span className="text-ink-soft">Events emitted</span>{d.events?.emitted ?? '–'}</li><li className="flex justify-between"><span className="text-ink-soft">Events flushed</span>{d.events?.flushed ?? '–'}</li></ul></section>
        <section className="card p-4"><h2 className="mb-2 text-base font-semibold">Circuit breakers</h2><ul className="space-y-1.5 text-sm">{d.breakers.map((b) => <li key={b.name} className="flex items-center justify-between gap-2"><span className="text-ink-soft">{b.name}</span><span className={BRK[b.state] || 'chip'}>{b.state}</span></li>)}</ul></section>
        <section className="card p-4"><h2 className="mb-2 text-base font-semibold">Outbox</h2>{Object.keys(d.outbox).length ? <ul className="space-y-1.5 text-sm">{Object.entries(d.outbox).map(([k, v]) => <li key={k} className="flex justify-between"><span className="text-ink-soft">{k.replace(':', ', ')}</span>{v}</li>)}</ul> : <None />}</section>
      </div>
    </div>); }}</Load>;
}

export default function Analytics() {
  const [tab, setTab] = useState('labour');
  const [draft, setDraft] = useState({ from: '', to: '', state: '', sector: '' });
  const [f, setF] = useState(draft);
  const tax = useAsync(() => api('/public/taxonomy'), []);
  const sel = (k, opts, ph) => <select aria-label={ph} className="input" value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}><option value="">{ph}</option>{(opts || []).map((o) => <option key={o}>{o}</option>)}</select>;
  return (
    <div className="space-y-4">
      <PageHead title="Analytics" sub="Labour market, platform activity, AI accuracy and system health" />
      <Tabs tabs={[['labour', 'Labour market'], ['activity', 'Activity'], ['ai', 'AI accuracy'], ['system', 'System health']]} value={tab} onChange={setTab} />
      {tab === 'labour' && (
        <form className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[auto_auto_1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); setF(draft); }}>
          <label className="text-xs text-ink-faint">From<input type="date" className="input mt-1" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></label>
          <label className="text-xs text-ink-faint">To<input type="date" className="input mt-1" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} /></label>
          <div className="self-end">{sel('state', tax.data?.states, 'All states')}</div><div className="self-end">{sel('sector', tax.data?.sectors, 'All sectors')}</div>
          <button className="btn-primary self-end">Apply</button>
        </form>
      )}
      {tab === 'labour' && <Labour f={f} />}
      {tab === 'activity' && <ActivityTab />}
      {tab === 'ai' && <Accuracy />}
      {tab === 'system' && <System />}
    </div>
  );
}
