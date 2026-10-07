import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Briefcase, Building2, Cable, KeyRound, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth, homeFor } from '../lib/auth';
import { useT } from '../lib/i18n';
import { Field, Logo, useToast } from '../components/ui';

const Frame = ({ title, sub, children }) => (
  <div className="mx-auto flex max-w-md flex-col px-4 py-12">
    <div className="card p-6 shadow-lift sm:p-8"><Logo /><h1 className="mt-6 text-2xl font-semibold">{title}</h1>{sub && <p className="mt-1 text-sm text-ink-soft">{sub}</p>}<div className="mt-6">{children}</div></div>
  </div>
);
function OtpStep({ to, devCode, onSubmit, onResend, busy, error }) {
  const [code, setCode] = useState('');
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(code); }} className="space-y-4">
      <p className="text-sm text-ink-soft">Enter the 6-digit code sent to <strong>{to}</strong>.</p>
      {devCode && <p className="rounded-lg bg-marigold-50 px-3 py-2 text-xs text-marigold-700">Demo mode (no SMS gateway): your code is <strong className="font-mono text-sm">{devCode}</strong></p>}
      <Field id="otp" label="Verification code" error={error}><input id="otp" className="input text-center font-mono text-2xl tracking-[0.5em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus /></Field>
      <button className="btn-primary w-full py-3" disabled={busy || code.length < 6}>{busy ? 'Verifying…' : 'Verify'}</button>
      <button type="button" className="btn-ghost w-full" onClick={onResend}>Send a new code</button>
    </form>
  );
}

export function Login() {
  const { signIn } = useAuth(); const nav = useNavigate(); const [sp] = useSearchParams(); const toast = useToast(); const { t } = useT();
  const [f, setF] = useState({ identifier: '', password: '' }); const [err, setErr] = useState({}); const [busy, setBusy] = useState(false);
  const [mfa, setMfa] = useState(null); const [act, setAct] = useState(null); const [dl, setDl] = useState(false);
  const done = async (token) => { const me = await signIn(token); nav(sp.get('next') || homeFor(me?.user?.role)); toast(`Welcome back, ${me?.user?.name.split(' ')[0]}`); };
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr({});
    try {
      const r = await api('/auth/login', { method: 'POST', body: f });
      if (r.mfaRequired) setMfa(r); else if (r.needsActivation) setAct(r); else await done(r.token);
    } catch (x) { setErr({ form: x.message, ...x.fields }); } finally { setBusy(false); }
  };
  const demo = [['Job seeker', 'priya@example.in', 'Seeker@123'], ['Employer', 'hr@finlytics.in', 'Employer@123'], ['Job portal', 'api@naukri-demo.in', 'Portal@123'], ['Admin', 'admin@skillsetu.in', 'Admin@123']];
  if (mfa) return <Frame title="Two-step verification" sub="For your security we sent a code to your mobile."><OtpStep to={mfa.otpSentTo} devCode={mfa.devCode} busy={busy} error={err.otp}
    onSubmit={async (code) => { setBusy(true); try { const r = await api('/auth/mfa/verify', { method: 'POST', body: { mfaToken: mfa.mfaToken, code } }); await done(r.token); } catch (x) { setErr({ otp: x.message }); } finally { setBusy(false); } }}
    onResend={async () => { const r = await api('/auth/mfa/resend', { method: 'POST', body: { mfaToken: mfa.mfaToken } }); setMfa({ ...mfa, devCode: r.devCode }); toast('New code sent'); }} /></Frame>;
  if (act) return <Frame title="Verify your mobile" sub="Finish activating your account."><OtpStep to={act.otpSentTo} devCode={act.devCode} busy={busy} error={err.otp}
    onSubmit={async (code) => { setBusy(true); try { const r = await api('/auth/verify-otp', { method: 'POST', body: { userId: act.userId, code } }); if (r.token) await done(r.token); else { toast(r.message); setAct(null); } } catch (x) { setErr({ otp: x.message }); } finally { setBusy(false); } }}
    onResend={async () => { const r = await api('/auth/resend-otp', { method: 'POST', body: { userId: act.userId } }); setAct({ ...act, devCode: r.devCode }); }} /></Frame>;
  if (dl) return <DigiLocker onBack={() => setDl(false)} onDone={done} />;
  return (
    <Frame title={t('signin')} sub="Use your email or mobile number.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {err.form && <p className="rounded-lg bg-orange-50 px-3 py-2 text-sm text-rose-600" role="alert">{err.form}</p>}
        <Field id="id" label="Email or mobile number"><input id="id" className="input" autoComplete="username" value={f.identifier} onChange={(e) => setF({ ...f, identifier: e.target.value })} /></Field>
        <Field id="pw" label="Password"><input id="pw" type="password" className="input" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        <button className="btn-primary w-full py-3" disabled={busy}>{busy ? 'Signing in…' : t('signin')}</button>
      </form>
      <button className="btn-outline mt-3 w-full" onClick={() => setDl(true)}><ShieldCheck className="h-4 w-4 text-teal-600" />Continue with DigiLocker</button>
      <p className="mt-5 text-center text-sm text-ink-soft">New here? <Link to="/register" className="font-semibold text-teal-700">Create an account</Link></p>
      <div className="mt-6 border-t border-line pt-4">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink-faint"><KeyRound className="h-3.5 w-3.5" />Demo accounts</p>
        <div className="grid grid-cols-2 gap-2">{demo.map(([r, e, p]) => <button key={r} type="button" className="rounded-lg border border-line px-2 py-1.5 text-left text-xs hover:border-teal-500" onClick={() => setF({ identifier: e, password: p })}><span className="font-semibold">{r}</span><br /><span className="text-ink-faint">{e}</span></button>)}</div>
      </div>
    </Frame>
  );
}

function DigiLocker({ onBack, onDone }) {
  const [f, setF] = useState({ name: '', email: '', phone: '' }); const [err, setErr] = useState(''); const [ok, setOk] = useState(false);
  return (
    <Frame title="Continue with DigiLocker" sub="Sandbox sign-in: in production this redirects to DigiLocker's OpenID Connect consent page.">
      <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); try { const r = await api('/auth/oauth/digilocker', { method: 'POST', body: { ...f, consent: true } }); await onDone(r.token); } catch (x) { setErr(x.message); } }}>
        {err && <p className="text-sm text-rose-600" role="alert">{err}</p>}
        <Field id="dn" label="Name as on DigiLocker"><input id="dn" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field id="de" label="Email"><input id="de" type="email" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field id="dp" label="Mobile linked to Aadhaar"><input id="dp" className="input" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />I allow SkillSetu to read my name and verified documents from DigiLocker.</label>
        <button className="btn-primary w-full" disabled={!ok}>Allow and continue</button><button type="button" className="btn-ghost w-full" onClick={onBack}>Back</button>
      </form>
    </Frame>
  );
}

export function Register() {
  const [sp] = useSearchParams(); const { signIn } = useAuth(); const nav = useNavigate(); const toast = useToast(); const { lang } = useT();
  const [role, setRole] = useState(sp.get('role') || 'seeker');
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '', companyName: '', portalName: '', consent: false });
  const [err, setErr] = useState({}); const [busy, setBusy] = useState(false); const [otp, setOtp] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr({});
    try { const r = await api('/auth/register', { method: 'POST', body: { ...f, role, language: lang, consent: f.consent || undefined } }); setOtp(r); }
    catch (x) { setErr({ form: x.message, ...x.fields }); } finally { setBusy(false); }
  };
  if (otp) return <Frame title="Verify your mobile" sub="Step 2 of 2"><OtpStep to={otp.otpSentTo} devCode={otp.devCode} busy={busy} error={err.otp}
    onSubmit={async (code) => { setBusy(true); try { const r = await api('/auth/verify-otp', { method: 'POST', body: { userId: otp.userId, code } }); if (r.pendingApproval) { toast(r.message); nav('/login'); return; } const me = await signIn(r.token); toast('Account created'); nav(me.user.role === 'seeker' ? '/seeker/profile' : me.user.role === 'employer' ? '/employer/company' : homeFor(me.user.role)); } catch (x) { setErr({ otp: x.message }); } finally { setBusy(false); } }}
    onResend={async () => { const r = await api('/auth/resend-otp', { method: 'POST', body: { userId: otp.userId } }); setOtp({ ...otp, devCode: r.devCode }); }} /></Frame>;
  const roles = [['seeker', 'I want a job', Briefcase], ['employer', 'I am hiring', Building2], ['portal', 'Job portal', Cable]];
  return (
    <Frame title="Create your account" sub="Free for job seekers. Takes about a minute.">
      <fieldset className="mb-5"><legend className="label">Account type</legend>
        <div className="grid grid-cols-3 gap-2">{roles.map(([k, l, I]) => (
          <label key={k} className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border p-3 text-center text-xs font-medium ${role === k ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-line hover:border-teal-500'}`}>
            <input type="radio" name="role" value={k} checked={role === k} onChange={() => setRole(k)} className="sr-only" /><I className="h-5 w-5" aria-hidden />{l}</label>))}</div>
      </fieldset>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {err.form && <p className="rounded-lg bg-orange-50 px-3 py-2 text-sm text-rose-600" role="alert">{err.form}</p>}
        <Field id="n" label="Full name" error={err.name}><input id="n" className="input" autoComplete="name" value={f.name} onChange={set('name')} /></Field>
        {role === 'employer' && <Field id="c" label="Company name" error={err.companyName}><input id="c" className="input" value={f.companyName} onChange={set('companyName')} /></Field>}
        {role === 'portal' && <Field id="pn" label="Job portal name" error={err.portalName}><input id="pn" className="input" value={f.portalName} onChange={set('portalName')} /></Field>}
        <Field id="e" label="Email" error={err.email}><input id="e" type="email" className="input" autoComplete="email" value={f.email} onChange={set('email')} /></Field>
        <Field id="p" label="Mobile number" error={err.phone} hint="We will send a one-time code to verify it."><div className="flex"><span className="flex items-center rounded-l-xl border border-r-0 border-line bg-mist px-3 text-sm text-ink-soft">+91</span><input id="p" className="input rounded-l-none" inputMode="tel" autoComplete="tel-national" value={f.phone} onChange={set('phone')} /></div></Field>
        <Field id="pw" label="Password" error={err.password} hint="8+ characters with upper and lower case, a number and a symbol."><input id="pw" type="password" className="input" autoComplete="new-password" value={f.password} onChange={set('password')} /></Field>
        <label className="flex items-start gap-2 text-sm text-ink-soft"><input type="checkbox" className="mt-1" checked={f.consent} onChange={set('consent')} /><span>I agree that SkillSetu may process my data to match me with jobs, as described in the <Link to="/help?category=Privacy" className="text-teal-700 underline">privacy notice</Link> (DPDP Act, 2023).</span></label>
        {err.consent && <p className="text-xs text-rose-600">{err.consent}</p>}
        <button className="btn-primary w-full py-3" disabled={busy}>{busy ? 'Creating…' : 'Continue'}</button>
      </form>
      <p className="mt-5 text-center text-sm text-ink-soft">Already registered? <Link to="/login" className="font-semibold text-teal-700">Sign in</Link></p>
    </Frame>
  );
}
