import { useState } from 'react';
import { Copy, KeyRound, UserPlus } from 'lucide-react';
import { api, ago } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useAsync, useToast, Spinner, ErrorBox, Field, StatusChip } from '../../components/ui';
import { PageHead } from '../../components/Layout';

const EMPTY = { name: '', email: '', phone: '' };

export default function Team() {
  const { user } = useAuth(); const toast = useToast(); const isOwner = user?.companyRole === 'owner';
  const { data, loading, error, reload } = useAsync(() => api('/employer/team'), []);
  const [f, setF] = useState(EMPTY); const [errs, setErrs] = useState({}); const [busy, setBusy] = useState(false); const [created, setCreated] = useState(null);

  const add = async (e) => {
    e.preventDefault(); setBusy(true); setErrs({});
    try { const r = await api('/employer/team', { method: 'POST', body: f }); setCreated({ ...r, email: f.email, name: f.name }); setF(EMPTY); reload(); }
    catch (err) { setErrs(err.fields || {}); toast(err.message, 'error'); } finally { setBusy(false); }
  };
  const remove = async (m) => {
    if (!window.confirm(`Remove ${m.name}? They will lose access immediately.`)) return;
    try { await api(`/employer/team/${m.id}`, { method: 'DELETE' }); toast(`${m.name} removed.`); reload(); } catch (err) { toast(err.message, 'error'); }
  };
  const copy = async (t) => { try { await navigator.clipboard.writeText(t); toast('Copied.'); } catch { toast('Copy failed. Select the text and copy it manually.', 'error'); } };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="space-y-6">
      <PageHead title="Team" sub="HR users who can post jobs and manage applicants for your company" />
      <div className={`grid gap-6 ${isOwner ? 'lg:grid-cols-[1.6fr_1fr]' : ''}`}>
        <section className="card overflow-hidden" aria-label="Team members">
          {loading && !data ? <Spinner /> : error ? <div className="p-4"><ErrorBox error={error} onRetry={reload} /></div> : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th scope="col">Name</th><th scope="col">Contact</th><th scope="col">Role</th><th scope="col">Last sign-in</th>{isOwner && <th scope="col"><span className="sr-only">Actions</span></th>}</tr></thead>
                <tbody>
                  {data.items.map((m) => (
                    <tr key={m.id}>
                      <td className="font-medium">{m.name}{m.id === user?.id && <span className="ml-1 text-xs text-ink-faint">(you)</span>}</td>
                      <td className="text-ink-soft"><div>{m.email}</div><div className="text-xs">{m.phone}</div></td>
                      <td><span className={m.role === 'owner' ? 'chip-gold' : 'chip'}>{m.role === 'owner' ? 'Owner' : 'HR'}</span>{m.status !== 'active' && <span className="ml-1"><StatusChip s={m.status} /></span>}</td>
                      <td className="whitespace-nowrap text-ink-soft">{m.last_login_at ? ago(m.last_login_at) : 'Never'}</td>
                      {isOwner && <td className="text-right">{m.role === 'hr' && <button className="btn-danger btn-sm" onClick={() => remove(m)}>Remove</button>}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {isOwner && (
          <div className="space-y-4">
            {created && (
              <div className="rounded-2xl border-2 border-marigold-400 bg-marigold-50 p-4" role="status">
                <p className="flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4 text-marigold-700" aria-hidden />Temporary password for {created.name}</p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 select-all rounded-lg bg-white px-3 py-2 font-mono text-base">{created.temporaryPassword}</code>
                  <button className="btn-outline btn-sm" onClick={() => copy(created.temporaryPassword)} aria-label="Copy password"><Copy className="h-4 w-4" /></button>
                </div>
                <p className="mt-2 text-xs text-ink-soft">{created.message} It is shown only once. They sign in with {created.email}.</p>
                <button className="mt-2 text-xs font-medium underline" onClick={() => setCreated(null)}>I have shared it</button>
              </div>
            )}
            <form onSubmit={add} className="card space-y-3 p-5" noValidate>
              <h2 className="flex items-center gap-2 text-lg font-semibold"><UserPlus className="h-5 w-5 text-teal-600" aria-hidden />Add HR user</h2>
              <Field label="Full name" id="t-name" error={errs.name}><input id="t-name" className="input" value={f.name} onChange={set('name')} required /></Field>
              <Field label="Work email" id="t-email" error={errs.email}><input id="t-email" type="email" className="input" value={f.email} onChange={set('email')} required /></Field>
              <Field label="Mobile number" id="t-phone" error={errs.phone}><input id="t-phone" type="tel" inputMode="tel" className="input" placeholder="10-digit mobile" value={f.phone} onChange={set('phone')} required /></Field>
              <button className="btn-primary w-full" disabled={busy}>{busy ? 'Adding…' : 'Add HR user'}</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
