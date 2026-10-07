import { useState } from 'react';
import { Building2, CheckCircle2, FileText, XCircle } from 'lucide-react';
import { api, qs, ago } from '../../lib/api';
import { useAsync, useToast, Spinner, ErrorBox, Empty, Field, Modal, StatusChip, Tabs } from '../../components/ui';
import { PageHead } from '../../components/Layout';

const FILTERS = [['', 'All'], ['manual_review', 'Manual review'], ['pending', 'Pending'], ['verified', 'Verified'], ['rejected', 'Rejected'], ['unverified', 'Unverified']];
const DECISIONS = [['verified', 'Verify', 'Company details and documents check out.'], ['manual_review', 'Keep in review', 'Needs more information before a decision.'], ['rejected', 'Reject', 'Details could not be confirmed.']];

function Gstin({ c }) {
  if (!c.gstin) return <span className="text-ink-faint">Not provided</span>;
  const ok = c.gstinCheck?.valid;
  return (
    <div>
      <code className="text-xs">{c.gstin}</code>
      <p className={`mt-0.5 flex items-center gap-1 text-xs ${ok ? 'text-teal-700' : 'text-rose-600'}`}>
        {ok ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <XCircle className="h-3.5 w-3.5" aria-hidden />}
        {ok ? `Valid${c.gstinCheck.state ? `, ${c.gstinCheck.state}` : ''}` : c.gstinCheck?.reason || 'Invalid'}
      </p>
    </div>
  );
}

export default function Employers() {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState({ decision: 'verified', note: '' });
  const [busy, setBusy] = useState(false);
  const { data, loading, error, reload } = useAsync(() => api(`/admin/companies${qs({ status })}`), [status]);

  const open = (c) => { setSel(c); setForm({ decision: c.verification_status === 'rejected' ? 'rejected' : 'verified',note: c.verification_notes || '' }); };
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await api(`/admin/companies/${sel.id}/verify`, { method: 'POST', body: { decision: form.decision, note: form.note.trim() || undefined } }); toast(`${sel.name}: ${form.decision.replace('_', ' ')}`); setSel(null); reload(); }
    catch (err) { toast(err.message, 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <PageHead title="Employers" sub="Company verification with manual fallback when automated GSTIN and MCA checks are inconclusive" />
      <div className="mb-4"><Tabs tabs={FILTERS} value={status} onChange={setStatus} /></div>

      {loading && !data ? <Spinner /> : error ? <ErrorBox error={error} onRetry={reload} /> : !data.items.length ? <Empty icon={Building2} title="No companies here" /> : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[820px]">
            <thead><tr><th>Company</th><th>GSTIN</th><th>CIN</th><th>Documents</th><th>Jobs</th><th>Status</th><th className="text-right"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {data.items.map((c) => (
                <tr key={c.id}>
                  <td><p className="font-medium">{c.name}</p><p className="text-xs text-ink-faint">{[c.industry, c.city, c.state].filter(Boolean).join(' · ')} · joined {ago(c.created_at)}</p></td>
                  <td><Gstin c={c} /></td>
                  <td><code className="text-xs">{c.cin || '–'}</code></td>
                  <td><span className="inline-flex items-center gap-1 text-ink-soft"><FileText className="h-3.5 w-3.5" aria-hidden />{c.documents}</span></td>
                  <td className="text-ink-soft">{c.jobs} <span className="text-xs text-ink-faint">· {c.users} users</span></td>
                  <td><StatusChip s={c.verification_status} />{c.verification_notes && <p className="mt-1 max-w-[200px] text-xs text-ink-faint">{c.verification_notes}</p>}</td>
                  <td className="text-right"><button className={c.verification_status === 'verified' ? 'btn-outline btn-sm' : 'btn-primary btn-sm'} onClick={() => open(c)}>Review</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!sel} onClose={() => setSel(null)} title={`Verify ${sel?.name || ''}`}>
        {sel && (
          <form onSubmit={submit} className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 rounded-xl bg-mist/60 p-3 text-sm">
              <div><dt className="text-xs text-ink-faint">GSTIN</dt><dd><Gstin c={sel} /></dd></div>
              <div><dt className="text-xs text-ink-faint">CIN</dt><dd className="break-all">{sel.cin || '–'}</dd></div>
              <div><dt className="text-xs text-ink-faint">Website</dt><dd className="break-all">{sel.website ? <a href={sel.website} target="_blank" rel="noreferrer" className="text-teal-700 underline">{sel.website}</a> : '–'}</dd></div>
              <div><dt className="text-xs text-ink-faint">Documents uploaded</dt><dd>{sel.documents}</dd></div>
            </dl>
            <fieldset>
              <legend className="label">Decision</legend>
              <div className="space-y-2">
                {DECISIONS.map(([k, l, d]) => (
                  <label key={k} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${form.decision === k ? 'border-teal-500 bg-teal-50' : 'border-line'}`}>
                    <input type="radio" name="decision" value={k} checked={form.decision === k} onChange={() => setForm({ ...form, decision: k })} className="mt-1 accent-teal-600" />
                    <span><span className="block text-sm font-medium">{l}</span><span className="text-xs text-ink-soft">{d}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Field id="vnote" label="Note to employer" hint="Optional. Sent with the notification. Up to 300 characters.">
              <textarea id="vnote" className="input" rows={3} maxLength={300} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </Field>
            <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setSel(null)}>Cancel</button><button className="btn-primary" disabled={busy}>Save decision</button></div>
          </form>
        )}
      </Modal>
    </div>
  );
}
