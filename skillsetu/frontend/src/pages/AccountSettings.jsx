import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, ShieldCheck } from 'lucide-react';
import { api, download } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAsync, Field, Modal, useToast } from '../components/ui';
import { PageHead } from '../components/Layout';

export default function AccountSettings() {
  const { user, refresh, signOut } = useAuth(); const toast = useToast(); const nav = useNavigate();
  const prefs = useAsync(() => api('/notifications/prefs'), []);
  const [pw, setPw] = useState({ current: '', next: '' }); const [pwErr, setPwErr] = useState('');
  const [del, setDel] = useState(false); const [delPw, setDelPw] = useState(''); const [delErr, setDelErr] = useState('');
  const savePrefs = async (p) => { prefs.setData(p); try { await api('/notifications/prefs', { method: 'PUT', body: p }); toast('Notification preferences saved'); } catch (e) { toast(e.message, 'error'); } };
  const p = prefs.data;
  return (
    <>
      <PageHead title="Settings" sub={`${user.email} · ${user.phone}`} />
      {user.passwordExpired && <p className="mb-4 rounded-xl bg-marigold-50 p-3 text-sm text-marigold-700">Your password has expired under the security policy. Please set a new one below.</p>}
      <section className="card p-6"><h2 className="text-lg font-semibold">Notifications</h2>
        {p && <div className="mt-4 space-y-4">
          <Field id="em" label="Email"><select id="em" className="input" value={p.emailMode} onChange={(e) => savePrefs({ ...p, emailMode: e.target.value })}><option value="immediate">Send right away</option><option value="digest">Daily digest</option><option value="off">Off</option></select></Field>
          {[['inApp', 'In-app notifications'], ['smsOptIn', 'SMS for interviews and offers (OTPs are always sent)'], ['jobAlerts', 'Job alerts from saved searches']].map(([k, l]) => (
            <label key={k} className="flex items-center justify-between gap-4 text-sm"><span>{l}</span><input type="checkbox" className="h-5 w-5 accent-teal-600" checked={p[k]} onChange={(e) => savePrefs({ ...p, [k]: e.target.checked })} /></label>))}
        </div>}
      </section>
      <section className="card mt-4 p-6"><h2 className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck className="h-5 w-5 text-teal-600" />Security</h2>
        <label className="mt-4 flex items-center justify-between gap-4 text-sm"><span>Two-step verification (code by SMS at sign-in)</span>
          <input type="checkbox" className="h-5 w-5 accent-teal-600" checked={user.mfaEnabled || user.role === 'admin'} disabled={user.role === 'admin'} onChange={async (e) => { try { await api('/auth/mfa', { method: 'PUT', body: { enabled: e.target.checked } }); await refresh(); toast(e.target.checked ? 'Two-step verification on' : 'Two-step verification off'); } catch (x) { toast(x.message, 'error'); } }} /></label>
        <form className="mt-6 grid gap-3 sm:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); setPwErr(''); try { await api('/auth/password/change', { method: 'POST', body: pw }); setPw({ current: '', next: '' }); await refresh(); toast('Password changed'); } catch (x) { setPwErr(x.message); } }}>
          <Field id="cp" label="Current password"><input id="cp" type="password" className="input" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
          <Field id="np" label="New password"><input id="np" type="password" className="input" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
          {pwErr && <p className="text-sm text-rose-600 sm:col-span-2" role="alert">{pwErr}</p>}
          <div className="sm:col-span-2"><button className="btn-primary">Change password</button></div>
        </form>
      </section>
      <section className="card mt-4 p-6"><h2 className="text-lg font-semibold">Your data</h2><p className="mt-1 text-sm text-ink-soft">Under the DPDP Act, 2023 you can download everything we hold about you, or erase your account permanently.</p>
        <div className="mt-4 flex flex-wrap gap-2"><button className="btn-outline" onClick={() => download('/auth/account/export', 'skillsetu-my-data.json')}><Download className="h-4 w-4" />Download my data</button>
          {user.role !== 'admin' && <button className="btn-danger" onClick={() => setDel(true)}>Delete my account</button>}</div>
      </section>
      <Modal open={del} onClose={() => setDel(false)} title="Delete your account?">
        <p className="text-sm text-ink-soft">This permanently deletes your profile, applications, resume and activity. It cannot be undone.</p>
        <Field id="dp" label="Enter your password to confirm" error={delErr}><input id="dp" type="password" className="input" value={delPw} onChange={(e) => setDelPw(e.target.value)} /></Field>
        <div className="mt-5 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setDel(false)}>Keep my account</button>
          <button className="btn-danger" onClick={async () => { try { await api('/auth/account', { method: 'DELETE', body: { password: delPw } }); await signOut(); toast('Your account was deleted'); nav('/'); } catch (x) { setDelErr(x.message); } }}>Delete permanently</button></div>
      </Modal>
    </>
  );
}
