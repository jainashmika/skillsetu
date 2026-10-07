import { useState } from 'react';
import { BookOpen, Cable, Download, FileClock, Inbox, Landmark, Plus, RotateCcw, X } from 'lucide-react';
import { api, ago } from '../../lib/api';
import { useAsync, useToast, Spinner, ErrorBox, Empty, Field, Modal, StatusChip } from '../../components/ui';
import { PageHead } from '../../components/Layout';

const HEALTH = { healthy: 'chip-teal', degraded: 'chip-gold', failing: 'chip-red' };
const BRK = { closed: 'chip-teal', 'half-open': 'chip-gold', open: 'chip-red' };
const ADAPTERS = ['generic', 'naukri', 'foundit', 'ncs'];

function Portal({ p, onChange }) {
  const toast = useToast();
  const [busy, setBusy] = useState(''); const [pull, setPull] = useState(null); const [logs, setLogs] = useState(null); const [rate, setRate] = useState(String(p.rateLimitPerMin));
  const run = async (k, fn, msg) => { setBusy(k); try { const r = await fn(); if (msg) toast(msg); return r; } catch (e) { toast(e.message, 'error'); return null; } finally { setBusy(''); } };
  const patch = (body, msg) => run('patch', () => api(`/admin/portals/${p.id}`, { method: 'PATCH', body }), msg).then((r) => r && onChange());
  const h = p.health;
  return (
    <article className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h3 className="text-base font-semibold">{p.name}</h3><p className="text-xs text-ink-faint">{p.slug} · {p.adapter} adapter{p.apiKeyPrefix ? ` · key ${p.apiKeyPrefix}…` : ''}</p></div>
        <div className="flex gap-1.5"><span className={HEALTH[h.status] || 'chip'}>{h.status}</span><StatusChip s={p.status} /></div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        {[['Success, 7d', `${h.successRate}%`], ['Calls, 7d', h.total7d], ['Avg time', `${h.avgMs} ms`], ['Active jobs', h.activeJobs], ['Dead letters', h.deadLetters], ['Last sync', h.lastSyncAt ? ago(h.lastSyncAt) : 'Never']].map(([k, v]) => (
          <div key={k}><dt className="text-xs text-ink-faint">{k}</dt><dd className="font-medium">{v}</dd></div>))}
      </dl>
      {p.owner && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-mist/60 px-3 py-2 text-sm">
          <span className="text-ink-soft">Owner: <strong className="text-ink">{p.owner.name}</strong> · {p.owner.email}</span><StatusChip s={p.owner.status} />
          {p.owner.status === 'pending_approval' && <button className="btn-primary btn-sm ml-auto" disabled={!!busy} onClick={() => run('approve', () => api(`/admin/users/${p.owner.id}`, { method: 'PATCH', body: { status: 'active' } }), 'Owner approved').then((r) => r && onChange())}>Approve owner</button>}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); patch({ rateLimitPerMin: Number(rate) }, 'Rate limit updated'); }}>
          <label className="text-xs text-ink-faint">Requests per minute<input type="number" min={1} max={6000} className="input mt-1 w-28 py-1.5" value={rate} onChange={(e) => setRate(e.target.value)} /></label>
          <button className="btn-outline btn-sm" disabled={!!busy || Number(rate) === p.rateLimitPerMin}>Save</button>
        </form>
        <div className="ml-auto flex flex-wrap gap-1.5">
          <button className="btn-outline btn-sm" disabled={!!busy} onClick={async () => { const r = await run('pull', () => api(`/admin/portals/${p.id}/pull`, { method: 'POST' })); if (r) { setPull(r); onChange(); } }}><Download className="h-3.5 w-3.5" aria-hidden />{busy === 'pull' ? 'Pulling…' : 'Pull now'}</button>
          <button className="btn-ghost btn-sm" onClick={async () => setLogs(await run('logs', () => api(`/admin/portals/${p.id}/logs`)))}><FileClock className="h-3.5 w-3.5" aria-hidden />Logs</button>
          {p.status === 'active' ? <button className="btn-danger btn-sm" disabled={!!busy} onClick={() => patch({ status: 'suspended' }, 'Portal suspended')}>Suspend</button>
            : <button className="btn-primary btn-sm" disabled={!!busy} onClick={() => patch({ status: 'active' }, 'Portal activated')}>Activate</button>}
        </div>
      </div>
      {pull && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-line p-3 text-sm" role="status">
          <span>Fetched <strong>{pull.fetched}</strong></span><span className="chip-teal">{pull.ok} saved</span>{pull.failed > 0 && <span className="chip-red">{pull.failed} failed</span>}
          <button className="btn-ghost btn-sm ml-auto p-1" onClick={() => setPull(null)} aria-label="Dismiss"><X className="h-4 w-4" /></button>
        </div>
      )}
      <Modal open={!!logs} onClose={() => setLogs(null)} title={`Sync logs: ${p.name}`} wide>
        {logs && (logs.items.length ? (
          <div className="overflow-x-auto"><table className="table min-w-[620px]"><thead><tr><th>When</th><th>Direction</th><th>Operation</th><th>External ID</th><th>Result</th><th>Time</th></tr></thead>
            <tbody>{logs.items.map((l) => <tr key={l.id}><td className="whitespace-nowrap text-ink-soft">{ago(l.created_at)}</td><td>{l.direction}</td><td>{l.operation}</td><td><code className="text-xs">{l.external_id || '–'}</code></td>
              <td><span className={l.ok ? 'chip-teal' : 'chip-red'}>{l.status_code}</span>{l.message && <p className="mt-0.5 text-xs text-ink-faint">{l.message}</p>}</td><td>{l.duration_ms} ms</td></tr>)}</tbody></table></div>
        ) : <Empty title="No sync activity yet" />)}
      </Modal>
    </article>
  );
}

export default function Integrations() {
  const toast = useToast();
  const portals = useAsync(() => api('/admin/portals'), []);
  const dlq = useAsync(() => api('/admin/dead-letters'), []);
  const gov = useAsync(() => api('/admin/integrations/government'), []);
  const [add, setAdd] = useState(null);
  const create = async (e) => {
    e.preventDefault();
    try { await api('/admin/portals', { method: 'POST', body: { name: add.name, adapter: add.adapter, rateLimitPerMin: Number(add.rate) } }); toast('Portal created'); setAdd(null); portals.reload(); }
    catch (err) { setAdd((a) => ({ ...a, err: err.message })); }
  };
  const dl = async (d, action) => { try { const r = await api(`/admin/dead-letters/${d.id}/${action}`, { method: 'POST' }); toast(action === 'discard' ? 'Discarded' : r.ok ? 'Retry succeeded' : `Retry failed: ${r.result?.message || 'unknown error'}`, action === 'retry' && !r.ok ? 'error' : 'ok'); dlq.reload(); portals.reload(); } catch (e) { toast(e.message, 'error'); } };

  return (
    <div className="space-y-6">
      <PageHead title="Integrations" sub="Partner job portals, failed sync recovery and government services"
        action={<div className="flex gap-2"><a href="/api/docs" target="_blank" rel="noreferrer" className="btn-outline"><BookOpen className="h-4 w-4" aria-hidden />API docs</a><button className="btn-primary" onClick={() => setAdd({ name: '', adapter: 'generic', rate: '60' })}><Plus className="h-4 w-4" aria-hidden />Add portal</button></div>} />

      {portals.loading && !portals.data ? <Spinner /> : portals.error ? <ErrorBox error={portals.error} onRetry={portals.reload} /> : !portals.data.items.length ? <Empty icon={Cable} title="No partner portals yet" /> : (
        <div className="grid gap-4 xl:grid-cols-2">{portals.data.items.map((p) => <Portal key={`${p.id}-${p.rateLimitPerMin}`} p={p} onChange={() => { portals.reload(); dlq.reload(); }} />)}</div>
      )}

      <section className="card p-4 sm:p-5" aria-label="Dead letter queue">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><Inbox className="h-5 w-5 text-teal-600" aria-hidden />Dead letter queue</h2>
        {dlq.loading && !dlq.data ? <Spinner /> : dlq.error ? <ErrorBox error={dlq.error} onRetry={dlq.reload} /> : !dlq.data.items.length ? <p className="text-sm text-ink-faint">No failed syncs to recover.</p> : (
          <div className="overflow-x-auto"><table className="table min-w-[720px]"><thead><tr><th>Portal</th><th>Operation</th><th>Error</th><th>Attempts</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{dlq.data.items.map((d) => (
              <tr key={d.id}><td className="font-medium">{d.portal}<p className="text-xs font-normal text-ink-faint">{ago(d.last_attempt_at)}</p></td><td>{d.operation}<p className="text-xs text-ink-faint">{d.payload?.external_id || d.payload?.id || ''}</p></td>
                <td className="max-w-xs text-xs text-rose-600">{d.error}</td><td>{d.attempts}</td><td><span className={d.status === 'pending' ? 'chip-gold' : d.status === 'resolved' ? 'chip-teal' : 'chip'}>{d.status}</span></td>
                <td>{d.status === 'pending' && <div className="flex justify-end gap-1.5"><button className="btn-outline btn-sm" onClick={() => dl(d, 'retry')}><RotateCcw className="h-3.5 w-3.5" aria-hidden />Retry</button><button className="btn-ghost btn-sm" onClick={() => dl(d, 'discard')}>Discard</button></div>}</td></tr>))}</tbody></table></div>
        )}
      </section>

      <section className="card p-4 sm:p-5" aria-label="Government services">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><Landmark className="h-5 w-5 text-teal-600" aria-hidden />Government services</h2>
        {gov.loading && !gov.data ? <Spinner /> : gov.error ? <ErrorBox error={gov.error} onRetry={gov.reload} /> : (<>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{gov.data.services.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-2 rounded-xl border border-line p-3"><div><p className="text-sm font-medium">{s.name}</p><p className="text-xs text-ink-faint">{s.failures} recent failures</p></div><span className={BRK[s.state] || 'chip'}>{s.state}</span></div>))}</div>
          <h3 className="mb-2 mt-5 text-sm font-semibold">Recent verifications</h3>
          {gov.data.recent.length ? <ul className="divide-y divide-line/70 text-sm">{gov.data.recent.map((r, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 py-2"><code className="rounded bg-mist px-1.5 py-0.5 text-xs">{r.action}</code><span className="text-ink-soft">#{r.entity_id}</span>
              <span className="text-xs text-ink-faint">{Object.entries(r.details || {}).slice(0, 3).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ')}</span><span className="ml-auto text-xs text-ink-faint">{ago(r.created_at)}</span></li>))}</ul>
            : <p className="text-sm text-ink-faint">No verifications yet.</p>}
        </>)}
      </section>

      <Modal open={!!add} onClose={() => setAdd(null)} title="Add partner portal">
        {add && (
          <form onSubmit={create} className="space-y-4">
            <Field id="pn" label="Portal name"><input id="pn" required minLength={2} className="input" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field id="pa" label="Adapter"><select id="pa" className="input" value={add.adapter} onChange={(e) => setAdd({ ...add, adapter: e.target.value })}>{ADAPTERS.map((a) => <option key={a}>{a}</option>)}</select></Field>
              <Field id="pr" label="Requests per minute"><input id="pr" type="number" min={1} max={6000} required className="input" value={add.rate} onChange={(e) => setAdd({ ...add, rate: e.target.value })} /></Field>
            </div>
            {add.err && <p className="text-sm text-rose-600" role="alert">{add.err}</p>}
            <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setAdd(null)}>Cancel</button><button className="btn-primary">Create portal</button></div>
          </form>
        )}
      </Modal>
    </div>
  );
}
