import { useState } from 'react';
import { CheckCircle2, DatabaseBackup, Mail, MessageSquare, Search, Send, ShieldCheck, XCircle } from 'lucide-react';
import { api, qs, ago } from '../../lib/api';
import { useAsync, useToast, Spinner, ErrorBox, Empty, Tabs, Pager } from '../../components/ui';
import { PageHead } from '../../components/Layout';

const when = (d) => <span className="whitespace-nowrap text-ink-soft" title={d}>{ago(d)}</span>;
const SEV = { high: 'chip-red', critical: 'chip-red', medium: 'chip-gold', low: 'chip' };
const Load = ({ s, children }) => (s.loading && !s.data ? <Spinner /> : s.error ? <ErrorBox error={s.error} onRetry={s.reload} /> : children(s.data));
const Table = ({ head, min = 640, children }) => (
  <div className="card overflow-x-auto"><table className="table" style={{ minWidth: min }}><thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>
);

function Audit() {
  const toast = useToast();
  const [f, setF] = useState({ action: '', page: 1 }); const [q, setQ] = useState(''); const [chain, setChain] = useState(null); const [busy, setBusy] = useState(false);
  const s = useAsync(() => api(`/admin/audit${qs(f)}`), [f.action, f.page]);
  const verify = async () => { setBusy(true); try { setChain(await api('/admin/audit/verify')); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); } };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <form role="search" className="relative min-w-[220px] flex-1" onSubmit={(e) => { e.preventDefault(); setF({ action: q.trim(), page: 1 }); }}>
          <label className="sr-only" htmlFor="aq">Filter by action</label><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-faint" aria-hidden />
          <input id="aq" className="input pl-9" placeholder="Filter by action, for example user.ban" value={q} onChange={(e) => setQ(e.target.value)} /></form>
        <button className="btn-outline" disabled={busy} onClick={verify}><ShieldCheck className="h-4 w-4" aria-hidden />Verify chain</button>
      </div>
      {chain && (
        <div className={`flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm ${chain.valid ? 'border-teal-100 bg-teal-50' : 'border-orange-200 bg-orange-50'}`} role="status">
          {chain.valid ? <CheckCircle2 className="h-5 w-5 text-teal-700" aria-hidden /> : <XCircle className="h-5 w-5 text-rose-600" aria-hidden />}
          <span className="font-medium">{chain.valid ? `Chain intact across ${chain.total} entries` : `Chain broken at entry #${chain.brokenAt} of ${chain.total}`}</span>
          {chain.head && <code className="ml-auto break-all text-xs text-ink-soft" title={chain.head}>head {chain.head.slice(0, 16)}…</code>}
        </div>
      )}
      <Load s={s}>{(d) => !d.items.length ? <Empty title="No audit entries" /> : (<>
        <Table head={['When', 'Actor', 'Action', 'Entity', 'Details', 'IP']} min={760}>
          {d.items.map((a) => <tr key={a.id}><td>{when(a.created_at)}</td><td>{a.actor_name || 'System'}<p className="text-xs text-ink-faint">{a.actor_role}</p></td><td><code className="text-xs">{a.action}</code></td>
            <td className="text-ink-soft">{a.entity}{a.entity_id ? ` #${a.entity_id}` : ''}</td><td className="max-w-xs truncate text-xs text-ink-faint" title={a.details ? JSON.stringify(a.details) : ''}>{a.details ? JSON.stringify(a.details) : '–'}</td><td className="text-xs text-ink-faint">{a.ip || '–'}</td></tr>)}
        </Table>
        <Pager page={d.page} total={d.total} size={d.pageSize} onPage={(p) => setF({ ...f, page: p })} /></>)}</Load>
    </div>
  );
}

function Access() {
  const [ev, setEv] = useState('');
  const s = useAsync(() => api(`/admin/access-logs${qs({ event: ev })}`), [ev]);
  return <Load s={s}>{(d) => (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" aria-label="Events in the last 7 days">
        <button className={ev ? 'chip' : 'chip-teal'} onClick={() => setEv('')} aria-pressed={!ev}>All</button>
        {d.byEvent.map((b) => <button key={b.event} aria-pressed={ev === b.event} className={ev === b.event ? 'chip-teal' : /fail|lock/.test(b.event) ? 'chip-gold' : 'chip'} onClick={() => setEv(b.event)}>{b.event.replace(/_/g, ' ')} <strong>{b.c}</strong></button>)}
      </div>
      {!d.items.length ? <Empty title="No access events" /> : (
        <Table head={['When', 'Event', 'User', 'IP', 'Device']} min={700}>
          {d.items.map((l) => <tr key={l.id}><td>{when(l.created_at)}</td><td><span className={/fail|lock/.test(l.event) ? 'chip-gold' : 'chip'}>{l.event.replace(/_/g, ' ')}</span></td><td>{l.email || (l.user_id ? `#${l.user_id}` : '–')}</td><td className="text-xs">{l.ip}</td><td className="max-w-[240px] truncate text-xs text-ink-faint" title={l.user_agent}>{l.user_agent}</td></tr>)}
        </Table>)}
    </div>)}</Load>;
}

function Events() {
  const s = useAsync(() => api('/admin/security-events'), []);
  return <Load s={s}>{(d) => (<div className="space-y-3">
    {d.byType.length > 0 && <div className="flex flex-wrap gap-1.5">{d.byType.map((b) => <span key={b.type + b.severity} className={SEV[b.severity] || 'chip'}>{b.type.replace(/_/g, ' ')}, {b.severity} <strong>{b.c}</strong></span>)}</div>}
    {!d.items.length ? <Empty icon={ShieldCheck} title="No security events">Rate limiting, lockouts and suspicious input appear here.</Empty> : (
      <Table head={['When', 'Type', 'Severity', 'IP', 'Detail']}>{d.items.map((e) => <tr key={e.id}><td>{when(e.created_at)}</td><td>{e.type.replace(/_/g, ' ')}</td><td><span className={SEV[e.severity] || 'chip'}>{e.severity}</span></td><td className="text-xs">{e.ip}</td><td className="text-xs text-ink-soft">{e.detail}</td></tr>)}</Table>)}
  </div>)}</Load>;
}

function Errors() {
  const s = useAsync(() => api('/admin/error-logs'), []);
  return <Load s={s}>{(d) => !d.items.length ? <Empty icon={CheckCircle2} title="No server errors logged" /> : (
    <Table head={['When', 'Reference', 'Request', 'Message']}>{d.items.map((e) => <tr key={e.id}><td>{when(e.created_at)}</td><td><code className="text-xs">{e.ref}</code></td><td className="text-xs"><span className="font-semibold">{e.method}</span> {e.path}</td><td className="text-xs text-rose-600">{e.message}</td></tr>)}</Table>)}</Load>;
}

function Outbox() {
  const toast = useToast();
  const [ch, setCh] = useState(''); const [busy, setBusy] = useState('');
  const s = useAsync(() => api(`/admin/outbox${qs({ channel: ch })}`), [ch]);
  const act = async (k, path, msg) => { setBusy(k); try { const r = await api(path, { method: 'POST' }); toast(msg(r)); s.reload(); } catch (e) { toast(e.message, 'error'); } finally { setBusy(''); } };
  const ST = { sent: 'chip-teal', queued: 'chip-gold', failed: 'chip-red', digest: 'chip' };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs tabs={[['', 'All'], ['email', 'Email'], ['sms', 'SMS']]} value={ch} onChange={setCh} />
        <div className="ml-auto flex gap-2"><button className="btn-outline btn-sm" disabled={!!busy} onClick={() => act('p', '/admin/outbox/process', (r) => `${r.sent} messages sent`)}><Send className="h-3.5 w-3.5" aria-hidden />Process now</button>
          <button className="btn-outline btn-sm" disabled={!!busy} onClick={() => act('d', '/admin/outbox/digest', (r) => `${r.digests} digests sent`)}><Mail className="h-3.5 w-3.5" aria-hidden />Send digests</button></div>
      </div>
      <Load s={s}>{(d) => (<>
        <div className="flex flex-wrap gap-1.5">{d.stats.map((x) => <span key={x.channel + x.status} className={ST[x.status] || 'chip'}>{x.channel} {x.status} <strong>{x.c}</strong></span>)}</div>
        {!d.items.length ? <Empty icon={Mail} title="Outbox is empty" /> : (
          <Table head={['Created', 'Channel', 'To', 'Message', 'Status']} min={760}>
            {d.items.map((m) => <tr key={m.id}><td>{when(m.created_at)}</td>
              <td><span className="inline-flex items-center gap-1">{m.channel === 'sms' ? <MessageSquare className="h-3.5 w-3.5" aria-hidden /> : <Mail className="h-3.5 w-3.5" aria-hidden />}{m.channel.toUpperCase()}</span>{m.dlt_template_id && <p className="text-xs text-ink-faint">DLT {m.dlt_template_id}</p>}</td>
              <td className="text-xs">{m.to_addr}</td><td className="max-w-sm"><p className="text-sm font-medium">{m.subject || m.template || '–'}</p><p className="line-clamp-2 text-xs text-ink-soft">{m.body}</p></td>
              <td><span className={ST[m.status] || 'chip'}>{m.status}</span>{m.attempts > 0 && <p className="text-xs text-ink-faint">{m.attempts} attempts</p>}</td></tr>)}
          </Table>)}</>)}</Load>
    </div>
  );
}

function Backups() {
  const toast = useToast(); const [busy, setBusy] = useState(false);
  const s = useAsync(() => api('/admin/backups'), []);
  const create = async () => { setBusy(true); try { const b = await api('/admin/backups', { method: 'POST' }); toast(`Backup ${b.file} created${b.verified ? ' and verified' : ''}`); s.reload(); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); } };
  const size = (b) => (b == null ? '–' : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><button className="btn-primary btn-sm" disabled={busy} onClick={create}><DatabaseBackup className="h-3.5 w-3.5" aria-hidden />{busy ? 'Creating…' : 'Create backup'}</button></div>
      <Load s={s}>{(d) => !d.items.length ? <Empty icon={DatabaseBackup} title="No backups yet" /> : (
        <Table head={['Created', 'File', 'Kind', 'Size', 'SHA-256', 'Integrity']}>
          {d.items.map((b) => <tr key={b.id}><td>{when(b.created_at)}</td><td className="text-xs">{b.file}</td><td className="capitalize">{b.kind}</td><td>{size(b.size_bytes)}</td><td><code className="text-xs" title={b.sha256}>{b.sha256 ? `${b.sha256.slice(0, 12)}…` : '–'}</code></td>
            <td>{b.verified ? <span className="chip-teal"><CheckCircle2 className="h-3 w-3" aria-hidden />Verified</span> : <span className="chip-gold">Unverified</span>}</td></tr>)}
        </Table>)}</Load>
    </div>
  );
}

const TABS = [['audit', 'Audit log', Audit], ['access', 'Access logs', Access], ['events', 'Security events', Events], ['errors', 'Errors', Errors], ['outbox', 'Outbox', Outbox], ['backups', 'Backups', Backups]];
export default function Security() {
  const [tab, setTab] = useState('audit');
  const Cur = TABS.find((t) => t[0] === tab)[2];
  return (
    <div className="space-y-4">
      <PageHead title="Security and audit" sub="Tamper-evident audit trail, access monitoring, messaging and backups" />
      <Tabs tabs={TABS.map(([k, l]) => [k, l])} value={tab} onChange={setTab} />
      <Cur />
    </div>
  );
}
