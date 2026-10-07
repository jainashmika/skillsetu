import { useState } from 'react';
import { Copy, KeyRound, Lock, Search, Trash2, UserPlus, Users as UsersIcon } from 'lucide-react';
import { api, qs, ago } from '../../lib/api';
import { useAsync, useToast, Spinner, ErrorBox, Empty, Field, Modal, StatusChip, Pager } from '../../components/ui';
import { PageHead } from '../../components/Layout';

const ROLES = [['', 'All roles'], ['seeker', 'Job seekers'], ['employer', 'Employers'], ['portal', 'Portal partners'], ['admin', 'Administrators']];
const STATUSES = [['', 'Any status'], ['active', 'Active'], ['pending_approval', 'Pending approval'], ['banned', 'Banned']];

function TempPassword({ value, onClose }) {
  const toast = useToast();
  return (
    <Modal open={!!value} onClose={onClose} title="Temporary password">
      <p className="text-sm text-ink-soft">Share this securely. The user must change it at the next sign-in.</p>
      <div className="mt-4 flex items-center gap-2 rounded-xl bg-mist p-3"><code className="flex-1 break-all font-mono text-base">{value}</code>
        <button className="btn-outline btn-sm" onClick={() => { navigator.clipboard?.writeText(value); toast('Copied'); }}><Copy className="h-3.5 w-3.5" aria-hidden />Copy</button></div>
      <div className="mt-5 text-right"><button className="btn-primary" onClick={onClose}>Done</button></div>
    </Modal>
  );
}

export default function Users() {
  const toast = useToast();
  const [f, setF] = useState({ role: '', status: '', q: '', page: 1 });
  const [q, setQ] = useState('');
  const [temp, setTemp] = useState(null);
  const [del, setDel] = useState(null);
  const [add, setAdd] = useState(null);
  const [busy, setBusy] = useState(false);
  const { data, loading, error, reload } = useAsync(() => api(`/admin/users${qs(f)}`), [f.role, f.status, f.q, f.page]);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v, page: k === 'page' ? v : 1 }));

  const act = async (fn, msg) => { setBusy(true); try { const r = await fn(); if (msg) toast(msg); reload(); return r; } catch (e) { toast(e.message, 'error'); return null; } finally { setBusy(false); } };
  const setStatus = (u, status) => act(() => api(`/admin/users/${u.id}`, { method: 'PATCH', body: { status } }), status === 'banned' ? `${u.name} banned` : `${u.name} activated`);
  const unlock = (u) => act(() => api(`/admin/users/${u.id}/unlock`, { method: 'POST' }), 'Account unlocked');
  const reset = async (u) => { const r = await act(() => api(`/admin/users/${u.id}/reset-password`, { method: 'POST' })); if (r) setTemp(r.temporaryPassword); };
  const remove = async () => { await act(() => api(`/admin/users/${del.id}`, { method: 'DELETE' }), 'User deleted'); setDel(null); };
  const create = async (e) => {
    e.preventDefault(); setBusy(true);
    try { const r = await api('/admin/users', { method: 'POST', body: add }); setAdd(null); setTemp(r.temporaryPassword); reload(); toast('Administrator created'); }
    catch (err) { setAdd((a) => ({ ...a, _err: err.fields, _msg: err.message })); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <PageHead title="Users" sub="Manage accounts, approvals and access" action={<button className="btn-primary" onClick={() => setAdd({ name: '', email: '', phone: '' })}><UserPlus className="h-4 w-4" aria-hidden />Add administrator</button>} />

      <form className="card mb-4 grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto_auto]" onSubmit={(e) => { e.preventDefault(); set('q', q.trim()); }} role="search">
        <label className="relative"><span className="sr-only">Search by name or email</span>
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-faint" aria-hidden />
          <input className="input pl-9" placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <select className="input" aria-label="Role" value={f.role} onChange={(e) => set('role', e.target.value)}>{ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select className="input" aria-label="Status" value={f.status} onChange={(e) => set('status', e.target.value)}>{STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <button className="btn-outline">Search</button>
      </form>

      {loading && !data ? <Spinner /> : error ? <ErrorBox error={error} onRetry={reload} /> : !data.items.length ? <Empty icon={UsersIcon} title="No users found">Try a different filter.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[860px]">
            <thead><tr><th>User</th><th>Role</th><th>Organisation</th><th>Status</th><th>Last sign-in</th><th className="text-right">Actions</th></tr></thead>
            <tbody>
              {data.items.map((u) => (
                <tr key={u.id}>
                  <td><p className="font-medium">{u.name}</p><p className="text-xs text-ink-faint">{u.email}{u.phone ? ` · ${u.phone}` : ''}</p></td>
                  <td className="capitalize">{u.role}{u.mfa_enabled ? <span className="chip-teal ml-1.5 py-0.5">MFA</span> : null}</td>
                  <td className="text-ink-soft">{u.org || '–'}</td>
                  <td><div className="flex flex-wrap gap-1"><StatusChip s={u.status} />{u.locked && <span className="chip-red"><Lock className="h-3 w-3" aria-hidden />Locked</span>}</div>
                    {u.failed_attempts > 0 && <p className="mt-1 text-xs text-ink-faint">{u.failed_attempts} failed attempts</p>}</td>
                  <td className="text-ink-soft">{u.last_login_at ? ago(u.last_login_at) : 'Never'}</td>
                  <td>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {u.status !== 'active' && <button disabled={busy} className="btn-primary btn-sm" onClick={() => setStatus(u, 'active')}>{u.status === 'pending_approval' ? 'Approve' : 'Activate'}</button>}
                      {u.status !== 'banned' && <button disabled={busy} className="btn-outline btn-sm" onClick={() => setStatus(u, 'banned')}>Ban</button>}
                      {u.locked && <button disabled={busy} className="btn-outline btn-sm" onClick={() => unlock(u)}>Unlock</button>}
                      <button disabled={busy} className="btn-ghost btn-sm" onClick={() => reset(u)} aria-label={`Reset password for ${u.name}`}><KeyRound className="h-3.5 w-3.5" aria-hidden />Reset</button>
                      <button disabled={busy} className="btn-danger btn-sm" onClick={() => setDel(u)} aria-label={`Delete ${u.name}`}><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pager page={data.page} total={data.total} size={data.pageSize} onPage={(p) => set('page', p)} />}

      <TempPassword value={temp} onClose={() => setTemp(null)} />

      <Modal open={!!del} onClose={() => setDel(null)} title="Delete user?">
        <p className="text-sm text-ink-soft">This permanently erases <strong>{del?.name}</strong> ({del?.email}) and their activity data. This cannot be undone.</p>
        <div className="mt-5 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setDel(null)}>Cancel</button><button className="btn-danger" disabled={busy} onClick={remove}>Delete user</button></div>
      </Modal>

      <Modal open={!!add} onClose={() => setAdd(null)} title="Add administrator">
        {add && (
          <form onSubmit={create} className="space-y-4">
            {[['name', 'Full name', 'text'], ['email', 'Email', 'email'], ['phone', 'Mobile number', 'tel']].map(([k, l, t]) => (
              <Field key={k} id={`adm-${k}`} label={l} error={add._err?.[k]}>
                <input id={`adm-${k}`} type={t} required className="input" value={add[k]} onChange={(e) => setAdd({ ...add, [k]: e.target.value })} />
              </Field>
            ))}
            {add._msg && !add._err?.name && !add._err?.email && !add._err?.phone && <p className="text-sm text-rose-600" role="alert">{add._msg}</p>}
            <p className="text-xs text-ink-faint">A temporary password is generated. MFA is enabled for administrators by default.</p>
            <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setAdd(null)}>Cancel</button><button className="btn-primary" disabled={busy}>Create</button></div>
          </form>
        )}
      </Modal>
    </div>
  );
}
