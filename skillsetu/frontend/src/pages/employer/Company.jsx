import { useEffect, useState } from 'react';
import { BadgeCheck, FileText, ShieldCheck, Upload } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useAsync, useToast, Spinner, ErrorBox, Field, StatusChip, CompanyMark } from '../../components/ui';
import { PageHead } from '../../components/Layout';

const SIZES = ['1-10', '11-50', '51-200', '201-1000', '1000+'];
const SAMPLE_GSTIN = '29ABCDE1234F1ZW';
const toForm = (c) => ({ name: c.name || '', industry: c.industry || '', size: c.size || '', website: c.website || '', city: c.city || '', about: c.about || '' });

export default function Company() {
  const toast = useToast(); const { user, refresh } = useAuth();
  const isOwner = user?.companyRole === 'owner';
  const { data, loading, error, reload, setData } = useAsync(() => Promise.all([api('/employer/company'), api('/public/taxonomy')]), []);
  const [form, setForm] = useState(null); const [errs, setErrs] = useState({}); const [busy, setBusy] = useState('');
  const [ver, setVer] = useState({ gstin: '', cin: '' }); const [verErrs, setVerErrs] = useState({}); const [result, setResult] = useState(null);

  useEffect(() => { if (data) { setForm(toForm(data[0].company)); setVer({ gstin: data[0].company.gstin || '', cin: data[0].company.cin || '' }); } }, [data]);
  if (loading || (data && !form)) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const [{ company }, tax] = data;
  const setCompany = (c) => setData(([, t]) => [{ company: c }, t]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault(); setBusy('save'); setErrs({});
    try { const r = await api('/employer/company', { method: 'PUT', body: form }); setCompany(r.company); toast('Company profile saved.'); refresh(); }
    catch (err) { setErrs(err.fields || {}); toast(err.message, 'error'); } finally { setBusy(''); }
  };
  const upload = (kind) => async (e) => {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
    const fd = new FormData(); fd.append('file', file); if (kind === 'documents') fd.append('name', file.name);
    setBusy(kind);
    try { const r = await api(`/employer/company/${kind}`, { method: 'POST', form: fd }); setCompany(r.company); toast(kind === 'logo' ? 'Logo updated.' : 'Document uploaded.'); if (kind === 'logo') refresh(); }
    catch (err) { toast(err.message, 'error'); } finally { setBusy(''); }
  };
  const verify = async (e) => {
    e.preventDefault(); setBusy('verify'); setVerErrs({}); setResult(null);
    try { const r = await api('/employer/company/verify', { method: 'POST', body: ver }); setResult(r); setCompany(r.company); refresh(); toast(r.status === 'verified' ? 'Your company is verified.' : 'Verification submitted.'); }
    catch (err) { setVerErrs(err.fields || {}); toast(err.message, 'error'); } finally { setBusy(''); }
  };

  return (
    <div className="space-y-6">
      <PageHead title="Company profile" sub="This is what candidates see on your jobs and company page"
        action={company.verified && <span className="chip-teal py-1.5 text-sm"><BadgeCheck className="h-4 w-4" aria-hidden />Verified employer</span>} />

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <form onSubmit={save} className="card space-y-4 p-5" noValidate>
          <div className="flex items-center gap-4">
            <CompanyMark name={company.name} logo={company.logo} size={64} />
            <label className={`btn-outline btn-sm cursor-pointer ${!isOwner ? 'pointer-events-none opacity-50' : ''}`}>
              <Upload className="h-4 w-4" aria-hidden />{busy === 'logo' ? 'Uploading…' : 'Upload logo'}
              <input type="file" accept="image/*" className="sr-only" onChange={upload('logo')} disabled={!isOwner} />
            </label>
          </div>
          <Field label="Company name" id="c-name" error={errs.name}><input id="c-name" className="input" value={form.name} onChange={set('name')} required /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Industry" id="c-ind" error={errs.industry}>
              <select id="c-ind" className="input" value={form.industry} onChange={set('industry')}><option value="">Select industry</option>{tax.sectors.map((s) => <option key={s}>{s}</option>)}</select>
            </Field>
            <Field label="Company size" id="c-size" error={errs.size}>
              <select id="c-size" className="input" value={form.size} onChange={set('size')}><option value="">Select size</option>{SIZES.map((s) => <option key={s} value={s}>{s} employees</option>)}</select>
            </Field>
            <Field label="Website" id="c-web" error={errs.website}><input id="c-web" type="url" className="input" placeholder="https://" value={form.website} onChange={set('website')} /></Field>
            <Field label="City" id="c-city" error={errs.city}>
              <input id="c-city" className="input" list="city-list" value={form.city} onChange={set('city')} />
              <datalist id="city-list">{tax.cities.map((c) => <option key={c} value={c} />)}</datalist>
            </Field>
          </div>
          <Field label="About the company" id="c-about" error={errs.about}><textarea id="c-about" rows={5} className="input" value={form.about} onChange={set('about')} /></Field>
          {isOwner ? <button className="btn-primary" disabled={busy === 'save'}>{busy === 'save' ? 'Saving…' : 'Save profile'}</button>
            : <p className="text-sm text-ink-soft">Only the company owner can edit this profile.</p>}
        </form>

        <div className="space-y-6">
          <section className="card p-5" aria-labelledby="ver-h">
            <div className="flex items-center justify-between gap-2">
              <h2 id="ver-h" className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck className="h-5 w-5 text-teal-600" aria-hidden />Verification</h2>
              <StatusChip s={company.verificationStatus} />
            </div>
            {company.verificationNotes && <p className="mt-2 text-sm text-ink-soft">{company.verificationNotes}</p>}
            {company.verified ? (
              <p className="mt-3 text-sm text-ink-soft">Verified with GSTIN <span className="font-mono">{company.gstin}</span>{company.verifiedAt && ` on ${company.verifiedAt.slice(0, 10)}`}.</p>
            ) : (
              <form onSubmit={verify} className="mt-4 space-y-3" noValidate>
                <Field label="GSTIN" id="v-gst" error={verErrs.gstin} hint="15 characters, checked against GSTN records">
                  <input id="v-gst" className="input font-mono uppercase" maxLength={15} value={ver.gstin} onChange={(e) => setVer({ ...ver, gstin: e.target.value.toUpperCase() })} />
                </Field>
                <button type="button" className="text-xs font-medium text-teal-700 underline" onClick={() => setVer({ ...ver, gstin: SAMPLE_GSTIN })}>Use sample GSTIN</button>
                <Field label="CIN (optional)" id="v-cin" error={verErrs.cin} hint="21 characters, checked against MCA21">
                  <input id="v-cin" className="input font-mono uppercase" maxLength={21} value={ver.cin} onChange={(e) => setVer({ ...ver, cin: e.target.value.toUpperCase() })} />
                </Field>
                <button className="btn-primary w-full" disabled={busy === 'verify' || !ver.gstin}>{busy === 'verify' ? 'Checking records…' : 'Verify company'}</button>
              </form>
            )}
            {result && (
              <div className={`mt-4 rounded-xl border p-3 text-sm ${result.status === 'verified' ? 'border-teal-100 bg-teal-50' : result.status === 'rejected' ? 'border-orange-200 bg-orange-50' : 'border-marigold-100 bg-marigold-50'}`} role="status">
                <p className="flex items-center gap-2 font-semibold">Result: <StatusChip s={result.status} /></p>
                {result.note && <p className="mt-1 text-ink-soft">{result.note}</p>}
                <ul className="mt-2 space-y-1 text-xs text-ink-soft">
                  {Object.entries(result.checks).filter(([, c]) => c).map(([k, c]) => (
                    <li key={k}><span className="font-medium uppercase text-ink">{k}</span>: {c.found ? `found (${c.status})` : 'not found'}{c._meta && ` · ${c._meta.attempts} attempt${c._meta.attempts === 1 ? '' : 's'}, ${c._meta.ms} ms${c._meta.sandbox ? ', sandbox' : ''}`}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="card p-5" aria-labelledby="docs-h">
            <h2 id="docs-h" className="text-lg font-semibold">Documents</h2>
            <p className="mt-1 text-sm text-ink-soft">Upload a GST certificate or incorporation certificate to help manual review.</p>
            <ul className="mt-3 space-y-2">
              {company.documents.map((d) => <li key={d.id} className="flex items-center gap-2 text-sm"><FileText className="h-4 w-4 text-ink-faint" aria-hidden /><span className="truncate">{d.name}</span><span className="ml-auto text-xs text-ink-faint">{d.created_at?.slice(0, 10)}</span></li>)}
              {!company.documents.length && <li className="text-sm text-ink-faint">No documents yet.</li>}
            </ul>
            <label className="btn-outline btn-sm mt-4 cursor-pointer">
              <Upload className="h-4 w-4" aria-hidden />{busy === 'documents' ? 'Uploading…' : 'Upload document'}
              <input type="file" accept=".pdf,image/*" className="sr-only" onChange={upload('documents')} />
            </label>
          </section>
        </div>
      </div>
    </div>
  );
}
