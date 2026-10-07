import { useEffect, useState } from 'react';
import { CalendarClock, Download, Eye, Info, Play, Plus, Trash2 } from 'lucide-react';
import { api, qs, ago, download } from '../../lib/api';
import { useAsync, useToast, Spinner, ErrorBox, Empty, Field, Modal } from '../../components/ui';
import { PageHead } from '../../components/Layout';

const FORMATS = [['csv', 'CSV'], ['pdf', 'PDF'], ['json', 'JSON']];
const blankSchedule = { name: '', format: 'csv', frequency: 'weekly', recipient: '' };

export default function Reports() {
  const toast = useToast();
  const sets = useAsync(() => api('/admin/reports/datasets'), []);
  const tax = useAsync(() => api('/public/taxonomy'), []);
  const sched = useAsync(() => api('/admin/reports/schedules'), []);
  const [ds, setDs] = useState('');
  const [f, setF] = useState({ from: '', to: '', state: '', sector: '' });
  const [prev, setPrev] = useState(null);
  const [busy, setBusy] = useState('');
  const [newS, setNewS] = useState(null);
  useEffect(() => { if (!ds && sets.data?.items.length) setDs(sets.data.items[0].key); }, [sets.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setPrev(null), [ds]);

  const run = async (k, fn) => { setBusy(k); try { await fn(); } catch (e) { toast(e.message, 'error'); } finally { setBusy(''); } };
  const preview = () => run('preview', async () => setPrev(await api(`/admin/reports/${ds}/preview${qs(f)}`)));
  const exp = (format) => run(format, async () => { await download(`/admin/reports/${ds}/export${qs({ ...f, format })}`, `skillsetu-${ds}-${new Date().toISOString().slice(0, 10)}.${format}`); toast(`${format.toUpperCase()} downloaded`); });
  const runDue = () => run('due', async () => { const r = await api('/admin/reports/schedules/run', { method: 'POST' }); toast(r.ran ? `${r.ran} scheduled report${r.ran > 1 ? 's' : ''} queued for email` : 'No schedules are due'); sched.reload(); });
  const delS = (s) => run(`d${s.id}`, async () => { if (!window.confirm(`Delete schedule "${s.name}"?`)) return; await api(`/admin/reports/schedules/${s.id}`, { method: 'DELETE' }); toast('Schedule deleted'); sched.reload(); });
  const createS = async (e) => {
    e.preventDefault();
    const filters = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
    const { name, format, frequency, recipient } = newS;
    try { await api('/admin/reports/schedules', { method: 'POST', body: { name, format, frequency, recipient, dataset: ds, filters } }); toast('Schedule created'); setNewS(null); sched.reload(); }
    catch (err) { setNewS((s) => ({ ...s, _err: err.fields || {}, _msg: err.message })); }
  };
  const jsonUrl = `${window.location.origin}/api/admin/reports/${ds || '<dataset>'}/export${qs({ ...f, format: 'json' })}`;
  const label = (k) => sets.data?.items.find((x) => x.key === k)?.label || k;

  if (sets.loading && !sets.data) return <Spinner />;
  if (sets.error) return <ErrorBox error={sets.error} onRetry={sets.reload} />;
  const sel = (k, opts, ph) => <select id={`rf-${k}`} className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}><option value="">{ph}</option>{(opts || []).map((o) => <option key={o}>{o}</option>)}</select>;

  return (
    <div className="space-y-6">
      <PageHead title="Reports" sub="Build, preview and export datasets, or schedule them by email" />

      <section className="card p-4 sm:p-5" aria-label="Report builder">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field id="rds" label="Dataset"><select id="rds" className="input" value={ds} onChange={(e) => setDs(e.target.value)}>{sets.data.items.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}</select></Field>
          <Field id="rf-from" label="From"><input id="rf-from" type="date" className="input" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
          <Field id="rf-to" label="To"><input id="rf-to" type="date" className="input" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
          <Field id="rf-state" label="State">{sel('state', tax.data?.states, 'All states')}</Field>
          <Field id="rf-sector" label="Sector">{sel('sector', tax.data?.sectors, 'All sectors')}</Field>
        </div>
        <p className="mt-2 text-xs text-ink-faint">Columns: {sets.data.items.find((d) => d.key === ds)?.columns.join(', ')}. Some datasets ignore filters that do not apply to them.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-primary" disabled={!ds || busy === 'preview'} onClick={preview}><Eye className="h-4 w-4" aria-hidden />Preview</button>
          {FORMATS.map(([k, l]) => <button key={k} className="btn-outline" disabled={!ds || busy === k} onClick={() => exp(k)}><Download className="h-4 w-4" aria-hidden />{busy === k ? 'Preparing…' : `Export ${l}`}</button>)}
          <button className="btn-ghost" disabled={!ds} onClick={() => setNewS({ ...blankSchedule, name: label(ds) })}><CalendarClock className="h-4 w-4" aria-hidden />Schedule this</button>
        </div>
      </section>

      {busy === 'preview' && <Spinner label="Building preview" />}
      {prev && busy !== 'preview' && (
        <section className="card p-4 sm:p-5" aria-label="Preview">
          <h2 className="mb-3 text-base font-semibold">Preview <span className="text-sm font-normal text-ink-faint">first {prev.rows.length} rows</span></h2>
          {prev.rows.length ? (
            <div className="max-h-[440px] overflow-auto"><table className="table whitespace-nowrap"><thead className="sticky top-0 bg-white"><tr>{prev.columns.map((c) => <th key={c}>{c.replace(/_/g, ' ')}</th>)}</tr></thead>
              <tbody>{prev.rows.map((r, i) => <tr key={i}>{prev.columns.map((c) => <td key={c}>{r[c] ?? '–'}</td>)}</tr>)}</tbody></table></div>
          ) : <Empty title="No rows for these filters" />}
        </section>
      )}

      <section className="flex gap-3 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 text-sm" aria-label="Power BI">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-indigo-500" aria-hidden />
        <div className="min-w-0"><p className="font-medium">Connect Power BI</p>
          <p className="mt-1 text-ink-soft">In Power BI choose Get data, then Web, then Advanced. Use the JSON export URL below and add an <code>Authorization</code> header with <code>Bearer &lt;admin token&gt;</code>. Rows are under the <code>rows</code> field.</p>
          <code className="mt-2 block break-all rounded-lg bg-white px-3 py-2 text-xs">{jsonUrl}</code></div>
      </section>

      <section className="card p-4 sm:p-5" aria-label="Schedules">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Scheduled reports</h2>
          <div className="flex gap-2"><button className="btn-outline btn-sm" disabled={busy === 'due'} onClick={runDue}><Play className="h-3.5 w-3.5" aria-hidden />Run due schedules now</button><button className="btn-primary btn-sm" disabled={!ds} onClick={() => setNewS({ ...blankSchedule, name: label(ds) })}><Plus className="h-3.5 w-3.5" aria-hidden />New schedule</button></div></div>
        {sched.loading && !sched.data ? <Spinner /> : sched.error ? <ErrorBox error={sched.error} onRetry={sched.reload} /> : !sched.data.items.length ? <Empty icon={CalendarClock} title="No schedules yet">Schedules email a ready report on a daily, weekly or monthly cycle.</Empty> : (
          <div className="overflow-x-auto"><table className="table min-w-[700px]"><thead><tr><th>Name</th><th>Dataset</th><th>Frequency</th><th>Recipient</th><th>Last run</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{sched.data.items.map((s) => (
              <tr key={s.id}><td className="font-medium">{s.name}<p className="text-xs font-normal text-ink-faint">{Object.entries(s.filters).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p></td>
                <td>{label(s.dataset)} <span className="chip ml-1 py-0.5 uppercase">{s.format}</span></td><td className="capitalize">{s.frequency}</td><td className="text-ink-soft">{s.recipient}</td>
                <td className="text-ink-soft">{s.last_run_at ? ago(s.last_run_at) : 'Never'}</td>
                <td className="text-right"><button className="btn-ghost btn-sm text-rose-600" disabled={busy === `d${s.id}`} onClick={() => delS(s)} aria-label={`Delete ${s.name}`}><Trash2 className="h-3.5 w-3.5" /></button></td></tr>))}</tbody></table></div>
        )}
      </section>

      <Modal open={!!newS} onClose={() => setNewS(null)} title="Schedule a report">
        {newS && (
          <form onSubmit={createS} className="space-y-4">
            <p className="text-sm text-ink-soft">Dataset: <strong>{label(ds)}</strong>. The current filters are saved with the schedule.</p>
            <Field id="sn" label="Name" error={newS._err?.name}><input id="sn" required className="input" value={newS.name} onChange={(e) => setNewS({ ...newS, name: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field id="sfreq" label="Frequency"><select id="sfreq" className="input" value={newS.frequency} onChange={(e) => setNewS({ ...newS, frequency: e.target.value })}>{['daily', 'weekly', 'monthly'].map((x) => <option key={x} value={x}>{x[0].toUpperCase() + x.slice(1)}</option>)}</select></Field>
              <Field id="sfmt" label="Format"><select id="sfmt" className="input" value={newS.format} onChange={(e) => setNewS({ ...newS, format: e.target.value })}><option value="csv">CSV</option><option value="pdf">PDF</option></select></Field>
            </div>
            <Field id="srec" label="Recipient email" error={newS._err?.recipient}><input id="srec" type="email" required className="input" value={newS.recipient} onChange={(e) => setNewS({ ...newS, recipient: e.target.value })} /></Field>
            {newS._msg && !newS._err?.name && !newS._err?.recipient && <p className="text-sm text-rose-600" role="alert">{newS._msg}</p>}
            <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setNewS(null)}>Cancel</button><button className="btn-primary">Create schedule</button></div>
          </form>
        )}
      </Modal>
    </div>
  );
}
