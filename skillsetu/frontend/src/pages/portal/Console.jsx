import { useEffect, useState } from 'react';
import { Check, Clock, Copy, ExternalLink, KeyRound, RotateCw } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { api, qs, ago, ctc } from '../../lib/api';
import { useAsync, useToast, Spinner, ErrorBox, Empty, Tabs, Stat, StatusChip, Field } from '../../components/ui';
import { PageHead } from '../../components/Layout';

const HEALTH = { healthy: 'chip-teal', degraded: 'chip-gold', failing: 'chip-red' };
const OkChip = ({ ok }) => <span className={ok ? 'chip-teal' : 'chip-red'}>{ok ? 'OK' : 'Failed'}</span>;
const pretty = (o) => JSON.stringify(o, null, 2);
function useCopy() {
  const toast = useToast(); const [done, setDone] = useState(false);
  return [done, async (t) => { try { await navigator.clipboard.writeText(t); setDone(true); setTimeout(() => setDone(false), 1500); } catch { toast('Copy failed. Select the text and copy it manually.', 'error'); } }];
}

function LogTable({ items }) {
  if (!items.length) return <p className="p-4 text-sm text-ink-soft">No submissions yet.</p>;
  return (
    <div className="overflow-x-auto"><table className="table">
      <thead><tr><th scope="col">When</th><th scope="col">Operation</th><th scope="col">External ID</th><th scope="col">Result</th><th scope="col">Code</th><th scope="col">Time</th><th scope="col">Message</th></tr></thead>
      <tbody>{items.map((l) => (
        <tr key={l.id}><td className="whitespace-nowrap text-ink-soft">{ago(l.created_at)}</td><td>{l.direction} · {l.operation}</td><td className="font-mono text-xs">{l.external_id || '–'}</td><td><OkChip ok={l.ok} /></td><td>{l.status_code ?? '–'}</td><td className="whitespace-nowrap">{l.duration_ms != null ? `${l.duration_ms} ms` : '–'}</td><td className="max-w-xs truncate text-ink-soft" title={l.message}>{l.message}</td></tr>
      ))}</tbody>
    </table></div>
  );
}

function Overview({ d }) {
  const h = d.health;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3"><span className={`${HEALTH[h.status]} px-3 py-1.5 text-sm capitalize`}>{h.status}</span><span className="text-sm text-ink-soft">Last sync {h.lastSyncAt ? ago(h.lastSyncAt) : 'never'}</span></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Success rate (7 days)" value={`${h.successRate}%`} sub={`${h.success7d} of ${h.total7d} calls`} />
        <Stat label="Average response" value={`${h.avgMs} ms`} />
        <Stat label="Active jobs" value={h.activeJobs} />
        <Stat label="Failed submissions" value={h.deadLetters} tone={h.deadLetters ? 'gold' : 'teal'} sub="Waiting for retry" />
      </div>
      <section className="card p-5"><h2 className="text-lg font-semibold">Daily submissions, last 14 days</h2>
        {d.daily.length ? <div className="mt-4 h-56"><ResponsiveContainer width="100%" height="100%">
          <BarChart data={d.daily.map((x) => ({ day: x.day.slice(5), Succeeded: x.ok, Failed: x.failed }))} margin={{ left: -20, right: 8 }}>
            <CartesianGrid stroke="#E2E7DF" vertical={false} /><XAxis dataKey="day" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} /><Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Succeeded" stackId="a" fill="#0F6E6E" /><Bar dataKey="Failed" stackId="a" fill="#F2A900" radius={[4, 4, 0, 0]} />
          </BarChart></ResponsiveContainer></div> : <p className="mt-3 text-sm text-ink-soft">No activity yet. Send your first job with the API.</p>}
      </section>
      <section className="card overflow-hidden"><h2 className="p-5 pb-2 text-lg font-semibold">Recent activity</h2><LogTable items={d.recent} /></section>
    </div>
  );
}

function ApiAccess({ d }) {
  const toast = useToast(); const [key, setKey] = useState(null); const [busy, setBusy] = useState(false); const [copied, copy] = useCopy();
  const [adapter, setAdapter] = useState(d.portal.adapter);
  const rotate = async () => {
    if (d.portal.hasKey && !window.confirm('Create a new key? The current key stops working immediately.')) return;
    setBusy(true); try { setKey(await api('/portal/api-key/rotate', { method: 'POST' })); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const curl = `curl -X POST ${location.origin}/api/v1/portal/jobs \\\n  -H "X-API-Key: ${key?.apiKey || 'YOUR_API_KEY'}" \\\n  -H "Content-Type: application/json" \\\n  -H "Idempotency-Key: abc123" \\\n  -d '${JSON.stringify(d.adapters[adapter]?.sample || {}).replace(/'/g, "'\\''")}'`;
  return (
    <div className="space-y-5">
      <section className="card p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><KeyRound className="h-5 w-5 text-teal-600" aria-hidden />API key</h2>
        <p className="mt-1 text-sm text-ink-soft">{d.portal.hasKey ? <>Current key starts with <code className="font-mono">{d.portal.apiKeyPrefix}…</code>. Rate limit {d.portal.rateLimitPerMin} requests per minute.</> : 'You have not created a key yet.'}</p>
        {key && (
          <div className="mt-3 rounded-xl border-2 border-marigold-400 bg-marigold-50 p-3" role="status">
            <p className="text-sm font-semibold">{key.message}</p>
            <div className="mt-2 flex items-center gap-2"><code className="flex-1 select-all break-all rounded-lg bg-white px-3 py-2 font-mono text-sm">{key.apiKey}</code>
              <button className="btn-outline btn-sm" onClick={() => copy(key.apiKey)} aria-label="Copy key">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button></div>
            <p className="mt-1 text-xs text-ink-soft">Client ID: <code>{key.clientId}</code></p>
          </div>
        )}
        <button className="btn-primary mt-4" onClick={rotate} disabled={busy}><RotateCw className="h-4 w-4" aria-hidden />{busy ? 'Creating…' : d.portal.hasKey ? 'Rotate key' : 'Create key'}</button>
      </section>
      <section className="card p-5">
        <div className="flex flex-wrap items-end justify-between gap-3"><h2 className="text-lg font-semibold">Example request</h2>
          <label className="text-sm"><span className="sr-only">Adapter</span><select className="input py-1.5" value={adapter} onChange={(e) => setAdapter(e.target.value)}>{Object.entries(d.adapters).map(([k, a]) => <option key={k} value={k}>{a.label}</option>)}</select></label></div>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-ink p-4 text-xs leading-relaxed text-teal-50"><code>{curl}</code></pre>
        <div className="mt-3 flex flex-wrap gap-2"><button className="btn-outline btn-sm" onClick={() => copy(curl)}><Copy className="h-3.5 w-3.5" aria-hidden />Copy command</button>
          <a href="/api/docs" target="_blank" rel="noreferrer" className="btn-ghost btn-sm"><ExternalLink className="h-3.5 w-3.5" aria-hidden />Full API reference</a></div>
      </section>
    </div>
  );
}

function Settings({ d, onSaved }) {
  const toast = useToast(); const p = d.portal;
  const [adapter, setAdapter] = useState(p.adapter); const [ips, setIps] = useState(p.ipWhitelist.join('\n'));
  const [map, setMap] = useState(Object.entries(p.fieldMapping).map(([k, v]) => `${k}=${v}`).join('\n'));
  const [payload, setPayload] = useState(pretty(d.adapters[p.adapter]?.sample || {})); const [test, setTest] = useState(null); const [errs, setErrs] = useState({}); const [busy, setBusy] = useState('');
  useEffect(() => { setPayload(pretty(d.adapters[adapter]?.sample || {})); setTest(null); }, [adapter]); // eslint-disable-line react-hooks/exhaustive-deps
  const mapping = () => Object.fromEntries(map.split('\n').map((l) => l.trim()).filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
  const save = async (e) => {
    e.preventDefault(); setBusy('save'); setErrs({});
    try { await api('/portal/settings', { method: 'PUT', body: { adapter, ipWhitelist: ips.split('\n').map((s) => s.trim()).filter(Boolean), fieldMapping: mapping() } }); toast('Settings saved.'); onSaved(); }
    catch (err) { setErrs(err.fields || {}); toast(err.message, 'error'); } finally { setBusy(''); }
  };
  const run = async () => {
    let body; try { body = JSON.parse(payload); } catch { setTest({ parseError: 'The payload is not valid JSON.' }); return; }
    setBusy('test'); try { setTest(await api('/portal/test-mapping', { method: 'POST', body: { payload: body, adapter, fieldMapping: mapping() } })); } catch (e) { toast(e.message, 'error'); } finally { setBusy(''); }
  };
  const ipErr = Object.entries(errs).find(([k]) => k.startsWith('ipWhitelist'))?.[1];
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <form onSubmit={save} className="card space-y-4 p-5">
        <h2 className="text-lg font-semibold">Integration settings</h2>
        <Field label="Feed format" id="s-ad"><select id="s-ad" className="input" value={adapter} onChange={(e) => setAdapter(e.target.value)}>{Object.entries(d.adapters).map(([k, a]) => <option key={k} value={k}>{a.label}</option>)}</select></Field>
        <Field label="Allowed IP addresses" id="s-ip" error={ipErr} hint="One IPv4, IPv6 or CIDR range per line. Leave empty to allow any address."><textarea id="s-ip" rows={4} className="input font-mono" value={ips} onChange={(e) => setIps(e.target.value)} placeholder="203.0.113.10&#10;198.51.100.0/24" /></Field>
        <Field label="Field mapping" id="s-map" error={errs.fieldMapping} hint="One per line as your_field=skillsetu_field, for example jobHeading=title"><textarea id="s-map" rows={5} className="input font-mono" value={map} onChange={(e) => setMap(e.target.value)} /></Field>
        <button className="btn-primary" disabled={busy === 'save'}>{busy === 'save' ? 'Saving…' : 'Save settings'}</button>
      </form>
      <section className="card space-y-3 p-5">
        <h2 className="text-lg font-semibold">Test mapping</h2>
        <p className="text-sm text-ink-soft">Dry run a payload with the format and mapping above. Nothing is saved.</p>
        <label htmlFor="s-payload" className="label">Sample payload (JSON)</label>
        <textarea id="s-payload" rows={10} className="input font-mono text-xs" value={payload} onChange={(e) => setPayload(e.target.value)} spellCheck={false} />
        <button type="button" className="btn-outline" onClick={run} disabled={busy === 'test'}>{busy === 'test' ? 'Testing…' : 'Test mapping'}</button>
        {test?.parseError && <p className="text-sm text-rose-600" role="alert">{test.parseError}</p>}
        {test && !test.parseError && (
          <div role="status">
            <p className="mb-2">{test.valid ? <span className="chip-teal">Valid job</span> : <span className="chip-red">Needs fixes</span>}</p>
            {test.errors && <ul className="mb-2 list-inside list-disc text-sm text-rose-600">{test.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
            <pre className="max-h-72 overflow-auto rounded-xl bg-mist p-3 text-xs">{pretty(test.transformed)}</pre>
          </div>
        )}
      </section>
    </div>
  );
}

function Logs() {
  const [ok, setOk] = useState('');
  const { data, loading, error, reload } = useAsync(() => api(`/portal/logs${qs({ ok })}`), [ok]);
  return (
    <div className="space-y-3">
      <Tabs tabs={[['', 'All'], ['true', 'Succeeded'], ['false', 'Failed']]} value={ok} onChange={setOk} />
      <section className="card overflow-hidden">{loading && !data ? <Spinner /> : error ? <ErrorBox error={error} onRetry={reload} /> : <><p className="px-4 pt-3 text-xs text-ink-faint">{data.total} entries, latest 50 shown</p><LogTable items={data.items} /></>}</section>
    </div>
  );
}

function DeadLetters({ onChange }) {
  const toast = useToast(); const [busy, setBusy] = useState(null);
  const { data, loading, error, reload } = useAsync(() => api('/portal/dead-letters'), []);
  const act = async (d, what) => {
    setBusy(d.id);
    try { const r = await api(`/portal/dead-letters/${d.id}/${what}`, { method: 'POST' }); toast(what === 'discard' ? 'Submission discarded.' : r.ok ? 'Retry succeeded.' : 'Retry failed again.', what === 'retry' && !r.ok ? 'error' : 'ok'); reload(); onChange(); }
    catch (e) { toast(e.message, 'error'); } finally { setBusy(null); }
  };
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data.items.length) return <Empty icon={Check} title="No failed submissions">Everything you sent was processed.</Empty>;
  return (
    <ul className="space-y-3">{data.items.map((d) => (
      <li key={d.id} className="card p-4">
        <div className="flex flex-wrap items-center gap-2"><StatusChip s={d.status} /><span className="font-medium">{d.operation}</span><span className="text-xs text-ink-faint">{d.attempts} attempt{d.attempts === 1 ? '' : 's'} · last {ago(d.last_attempt_at)}</span></div>
        <p className="mt-2 text-sm text-rose-600">{d.error}</p>
        <details className="mt-2 text-sm"><summary className="cursor-pointer text-ink-soft">Payload</summary><pre className="mt-2 max-h-60 overflow-auto rounded-xl bg-mist p-3 text-xs">{pretty(d.payload)}</pre></details>
        {d.status === 'pending' && <div className="mt-3 flex gap-2"><button className="btn-primary btn-sm" disabled={busy === d.id} onClick={() => act(d, 'retry')}>Retry</button><button className="btn-danger btn-sm" disabled={busy === d.id} onClick={() => act(d, 'discard')}>Discard</button></div>}
      </li>))}</ul>
  );
}

function SyncedJobs() {
  const { data, loading, error, reload } = useAsync(() => api('/portal/jobs'), []);
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data.items.length) return <Empty title="No jobs synced yet">Jobs you send with the API show here.</Empty>;
  return (
    <section className="card overflow-x-auto"><table className="table">
      <thead><tr><th scope="col">External ID</th><th scope="col">Title</th><th scope="col">Company</th><th scope="col">Location</th><th scope="col">Salary</th><th scope="col">Status</th></tr></thead>
      <tbody>{data.items.map((j) => <tr key={j.id}><td className="font-mono text-xs">{j.externalId}</td><td className="font-medium">{j.title}</td><td>{j.company}</td><td>{j.city || '–'}</td><td className="whitespace-nowrap">{ctc(j.ctcMin, j.ctcMax)}</td><td><StatusChip s={j.status} /></td></tr>)}</tbody>
    </table></section>
  );
}

export default function Console() {
  const [tab, setTab] = useState('overview');
  const { data, loading, error, reload } = useAsync(() => api('/portal/overview'), []);
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const { portal } = data;
  if (portal.status !== 'active') return (
    <div><PageHead title={portal.name} sub="Job portal integration" />
      <Empty icon={Clock} title="Awaiting admin approval">Your integration request is <StatusChip s={portal.status} />. An administrator will review it soon. You can create API keys once it is approved.</Empty></div>
  );
  return (
    <div className="space-y-5">
      <PageHead title={portal.name} sub="Job portal integration console" action={<span className={`${HEALTH[data.health.status]} px-3 py-1.5 text-sm capitalize`}>{data.health.status}</span>} />
      <Tabs tabs={[['overview', 'Overview'], ['api', 'API access'], ['settings', 'Settings'], ['logs', 'Logs'], ['dead', 'Failed submissions', data.health.deadLetters || null], ['jobs', 'Synced jobs', data.health.activeJobs]]} value={tab} onChange={setTab} />
      {tab === 'overview' && <Overview d={data} />}
      {tab === 'api' && <ApiAccess d={data} />}
      {tab === 'settings' && <Settings d={data} onSaved={reload} />}
      {tab === 'logs' && <Logs />}
      {tab === 'dead' && <DeadLetters onChange={reload} />}
      {tab === 'jobs' && <SyncedJobs />}
    </div>
  );
}
