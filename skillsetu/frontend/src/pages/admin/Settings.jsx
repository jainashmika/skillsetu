import { useEffect, useState } from 'react';
import { Lock, RotateCcw, Save } from 'lucide-react';
import { api, ago } from '../../lib/api';
import { useAsync, useToast, Spinner, ErrorBox, Field } from '../../components/ui';
import { PageHead } from '../../components/Layout';

const KEYS = ['session_timeout_minutes', 'lockout_attempts', 'lockout_minutes', 'password_policy', 'mfa_required_roles', 'job_default_validity_days', 'log_retention_days', 'maintenance_banner'];
const NUM = {
  session_timeout_minutes: ['Session timeout', 'minutes', 5, 1440],
  lockout_attempts: ['Failed attempts before lockout', 'attempts', 3, 20],
  lockout_minutes: ['Lockout duration', 'minutes', 1, 1440],
  job_default_validity_days: ['Default job validity', 'days', 1, 180],
  log_retention_days: ['Log retention', 'days', 90, 3650],
};
const ROLES = [['admin', 'Administrators'], ['employer', 'Employers'], ['seeker', 'Job seekers'], ['portal', 'Portal partners']];
const RULES = [['upper', 'Uppercase letter'], ['lower', 'Lowercase letter'], ['digit', 'Number'], ['symbol', 'Symbol']];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function Card({ title, sub, children }) {
  return <section className="card p-4 sm:p-5" aria-label={title}><h2 className="text-lg font-semibold">{title}</h2>{sub && <p className="mb-4 text-sm text-ink-soft">{sub}</p>}<div className={sub ? '' : 'mt-4'}>{children}</div></section>;
}

export default function Settings() {
  const toast = useToast();
  const { data, loading, error, reload } = useAsync(() => api('/admin/settings'), []);
  const [v, setV] = useState(null); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setV(Object.fromEntries(KEYS.map((k) => [k, data.settings[k]]))); }, [data]);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!v) return null;

  const changed = KEYS.filter((k) => !same(v[k], data.settings[k]));
  const set = (k, val) => { setV({ ...v, [k]: val }); setErr(null); };
  const pp = (k, val) => set('password_policy', { ...v.password_policy, [k]: val });
  const updated = (k) => data.meta?.find((m) => m.key === k)?.updated_at;

  const save = async (e) => {
    e.preventDefault(); if (!changed.length) return;
    setBusy(true); setErr(null);
    try { await api('/admin/settings', { method: 'PUT', body: Object.fromEntries(changed.map((k) => [k, k === 'mfa_required_roles' ? [...new Set(['admin', ...v[k]])] : v[k]])) }); toast(`${changed.length} setting${changed.length > 1 ? 's' : ''} saved`); reload(); }
    catch (ex) { setErr(ex); reload(); }
    finally { setBusy(false); }
  };
  const num = (k) => { const [label, unit, min, max] = NUM[k]; return (
    <Field key={k} id={k} label={label} hint={`${min} to ${max} ${unit}${updated(k) ? `. Changed ${ago(updated(k))}` : ''}`}>
      <div className="flex items-center gap-2"><input id={k} type="number" required min={min} max={max} step={1} className="input w-32" value={v[k]} onChange={(e) => set(k, e.target.value === '' ? '' : Number(e.target.value))} /><span className="text-sm text-ink-soft">{unit}</span></div>
    </Field>); };

  return (
    <form onSubmit={save} className="space-y-6">
      <PageHead title="Settings" sub="Security, retention and platform defaults"
        action={<div className="flex gap-2">{changed.length > 0 && <button type="button" className="btn-ghost" onClick={() => { setV(Object.fromEntries(KEYS.map((k) => [k, data.settings[k]]))); setErr(null); }}><RotateCcw className="h-4 w-4" aria-hidden />Discard</button>}
          <button className="btn-primary" disabled={busy || !changed.length}><Save className="h-4 w-4" aria-hidden />{changed.length ? `Save ${changed.length} change${changed.length > 1 ? 's' : ''}` : 'Saved'}</button></div>} />

      {err && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-rose-600" role="alert">
          <p className="font-medium">{err.message}</p>
          {Object.entries(err.fields || {}).filter(([, m]) => m !== err.message).map(([f, m]) => <p key={f} className="mt-1">{f === '_' ? m : `${f}: ${m}`}</p>)}
          <p className="mt-1 text-xs text-ink-soft">Settings listed before the invalid one may already have been saved. The form now shows the stored values.</p>
        </div>
      )}

      <Card title="Sessions and sign-in" sub="Applies to new sign-ins. Lockouts protect against password guessing.">
        <div className="grid gap-4 sm:grid-cols-3">{['session_timeout_minutes', 'lockout_attempts', 'lockout_minutes'].map(num)}</div>
      </Card>

      <Card title="Password policy" sub="Checked when users register or change their password">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="pmin" label="Minimum length" hint="8 to 64 characters"><input id="pmin" type="number" min={8} max={64} required className="input w-32" value={v.password_policy.minLength} onChange={(e) => pp('minLength', Number(e.target.value))} /></Field>
          <Field id="page" label="Expire after" hint="0 to 730 days. 0 means passwords never expire."><div className="flex items-center gap-2"><input id="page" type="number" min={0} max={730} required className="input w-32" value={v.password_policy.maxAgeDays} onChange={(e) => pp('maxAgeDays', Number(e.target.value))} /><span className="text-sm text-ink-soft">days</span></div></Field>
        </div>
        <fieldset className="mt-4"><legend className="label">Must include</legend>
          <div className="flex flex-wrap gap-2">{RULES.map(([k, l]) => (
            <label key={k} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${v.password_policy[k] ? 'border-teal-500 bg-teal-50' : 'border-line bg-white'}`}>
              <input type="checkbox" className="accent-teal-600" checked={!!v.password_policy[k]} onChange={(e) => pp(k, e.target.checked)} />{l}</label>))}</div>
        </fieldset>
      </Card>

      <Card title="Multi-factor authentication" sub="Roles that must use a one-time code at sign-in. Required for administrators at all times.">
        <fieldset><legend className="sr-only">Roles requiring MFA</legend>
          <div className="grid gap-2 sm:grid-cols-2">{ROLES.map(([k, l]) => { const locked = k === 'admin'; const on = locked || v.mfa_required_roles.includes(k); return (
            <label key={k} className={`flex items-center gap-3 rounded-xl border p-3 text-sm ${on ? 'border-teal-500 bg-teal-50' : 'border-line bg-white'} ${locked ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
              <input type="checkbox" className="accent-teal-600" checked={on} disabled={locked} aria-describedby={locked ? 'mfa-lock' : undefined}
                onChange={(e) => set('mfa_required_roles', e.target.checked ? [...new Set([...v.mfa_required_roles, k])] : v.mfa_required_roles.filter((r) => r !== k))} />
              <span className="flex-1 font-medium">{l}</span>{locked && <span id="mfa-lock" className="flex items-center gap-1 text-xs text-ink-faint"><Lock className="h-3 w-3" aria-hidden />Always on</span>}
            </label>); })}</div>
        </fieldset>
      </Card>

      <Card title="Jobs and data retention">
        <div className="grid gap-4 sm:grid-cols-2">{['job_default_validity_days', 'log_retention_days'].map(num)}</div>
      </Card>

      <Card title="Maintenance banner" sub="Shown to all users at the top of every page. Leave empty to hide it.">
        <Field id="banner" hint={`${(v.maintenance_banner || '').length} of 240 characters`}>
          <textarea id="banner" rows={2} maxLength={240} className="input" placeholder="For example: Scheduled maintenance on Sunday from 2 to 4 AM IST" value={v.maintenance_banner || ''} onChange={(e) => set('maintenance_banner', e.target.value)} />
        </Field>
        {v.maintenance_banner && <div className="mt-3 rounded-xl bg-marigold-50 px-4 py-2.5 text-sm text-ink" aria-label="Banner preview">{v.maintenance_banner}</div>}
      </Card>
    </form>
  );
}
