import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Search, X } from 'lucide-react';
import { api, ctc, LABEL } from '../../lib/api';
import { useAsync, useToast, Spinner, ErrorBox, Field } from '../../components/ui';
import { PageHead } from '../../components/Layout';

const BLANK = { title: '', description: '', sector: '', contract_type: 'full_time', work_format: 'onsite', city: '', state: '', ctc_min: '', ctc_max: '', experience_min: 0, experience_max: '', education_level: 0, openings: 1, deadline: '', visibility: 'public', skills: [] };
const fromJob = (j) => ({ title: j.title, description: j.description || '', sector: j.sector || '', contract_type: j.contractType, work_format: j.workFormat, city: j.city || '', state: j.state || '', ctc_min: j.ctcMin ?? '', ctc_max: j.ctcMax ?? '', experience_min: j.experienceMin ?? 0, experience_max: j.experienceMax ?? '', education_level: j.educationLevel ?? 0, openings: j.openings || 1, deadline: j.deadline || '', visibility: j.visibility || 'public', skills: j.skills.map((s) => ({ id: s.id, name: s.name, required: s.required })) });
const num = (v) => (v === '' || v == null ? null : Number(v));

export default function JobForm() {
  const { id } = useParams(); const nav = useNavigate(); const toast = useToast();
  const { data, loading, error, reload } = useAsync(() => Promise.all([api('/public/taxonomy'), id ? api(`/employer/jobs/${id}`) : null]), [id]);
  const [f, setF] = useState(null); const [errs, setErrs] = useState({}); const [busy, setBusy] = useState(''); const [q, setQ] = useState('');
  useEffect(() => { if (data) setF(data[1] ? fromJob(data[1].job) : BLANK); }, [data]);
  const tax = data?.[0]; const job = data?.[1]?.job;
  const suggestions = useMemo(() => {
    if (!tax || !f || q.trim().length < 1) return [];
    const s = q.toLowerCase(); const have = new Set(f.skills.map((k) => k.id));
    return tax.skills.filter((k) => !have.has(k.id) && k.name.toLowerCase().includes(s)).slice(0, 8);
  }, [q, tax, f]);

  if (loading || (data && !f)) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const addSkill = (s) => { setF((p) => ({ ...p, skills: [...p.skills, { id: s.id, name: s.name, required: true }] })); setQ(''); };
  const toggleSkill = (sid) => setF((p) => ({ ...p, skills: p.skills.map((s) => (s.id === sid ? { ...s, required: !s.required } : s)) }));
  const dropSkill = (sid) => setF((p) => ({ ...p, skills: p.skills.filter((s) => s.id !== sid) }));
  const canPublish = !job || ['draft', 'paused', 'expired'].includes(job.status);

  const submit = async (publish) => {
    setBusy(publish ? 'publish' : 'save'); setErrs({});
    const body = { ...f, ctc_min: num(f.ctc_min), ctc_max: num(f.ctc_max), experience_min: num(f.experience_min) ?? 0, experience_max: num(f.experience_max), education_level: Number(f.education_level), openings: Number(f.openings) || 1,
      deadline: f.deadline || null, sector: f.sector || null, city: f.city || null, state: f.state || null, skills: f.skills.map(({ id: sid, required }) => ({ id: sid, required })) };
    try {
      let saved;
      if (id) {
        saved = (await api(`/employer/jobs/${id}`, { method: 'PUT', body })).job;
        if (publish && saved.status !== 'active') saved = (await api(`/employer/jobs/${id}/status`, { method: 'POST', body: { status: 'active' } })).job;
      } else saved = (await api('/employer/jobs', { method: 'POST', body: { ...body, publish } })).job;
      toast(publish ? 'Job published.' : 'Job saved.'); nav(`/employer/jobs/${saved.id}`);
    } catch (e) { setErrs(e.fields || {}); toast(e.message, 'error'); } finally { setBusy(''); }
  };

  const input = (k, label, props = {}) => <Field label={label} id={`f-${k}`} error={errs[k]}><input id={`f-${k}`} className="input" value={f[k]} onChange={set(k)} aria-invalid={!!errs[k]} {...props} /></Field>;
  const select = (k, label, opts) => <Field label={label} id={`f-${k}`} error={errs[k]}><select id={`f-${k}`} className="input" value={f[k]} onChange={set(k)}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>;

  return (
    <div>
      <Link to={id ? `/employer/jobs/${id}` : '/employer/jobs'} className="mb-3 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-teal-700"><ArrowLeft className="h-4 w-4" aria-hidden />Back</Link>
      <PageHead title={id ? 'Edit job' : 'Post a job'} sub={id ? job.title : 'Clear details and skills help us find better matches'} />
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <form className="card space-y-5 p-5" onSubmit={(e) => { e.preventDefault(); submit(false); }} noValidate>
          {input('title', 'Job title', { placeholder: 'e.g. Warehouse supervisor', required: true })}
          <Field label="Description" id="f-description" error={errs.description} hint="At least 30 characters. Describe the role, daily work and who will do well.">
            <textarea id="f-description" rows={7} className="input" value={f.description} onChange={set('description')} aria-invalid={!!errs.description} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            {select('sector', 'Sector', [['', 'Select sector'], ...tax.sectors.map((s) => [s, s])])}
            {select('contract_type', 'Contract type', ['full_time', 'part_time', 'contract', 'internship', 'apprenticeship'].map((v) => [v, LABEL[v]]))}
            {select('work_format', 'Work format', ['onsite', 'remote', 'hybrid'].map((v) => [v, LABEL[v]]))}
            {select('education_level', 'Minimum education', tax.educationLevels.map((e) => [e.level, e.label]))}
            <Field label="City" id="f-city" error={errs.city}>
              <input id="f-city" className="input" list="job-cities" value={f.city} onChange={set('city')} /><datalist id="job-cities">{tax.cities.map((c) => <option key={c} value={c} />)}</datalist>
            </Field>
            {select('state', 'State', [['', 'Detect from city'], ...tax.states.map((s) => [s, s])])}
            {input('ctc_min', 'Minimum CTC (₹ per year)', { type: 'number', min: 0, step: 10000, inputMode: 'numeric' })}
            {input('ctc_max', 'Maximum CTC (₹ per year)', { type: 'number', min: 0, step: 10000, inputMode: 'numeric' })}
            {input('experience_min', 'Minimum experience (years)', { type: 'number', min: 0, max: 40 })}
            {input('experience_max', 'Maximum experience (years)', { type: 'number', min: 0, max: 50 })}
            {input('openings', 'Openings', { type: 'number', min: 1 })}
            {input('deadline', 'Application deadline', { type: 'date', min: new Date().toISOString().slice(0, 10) })}
            {select('visibility', 'Who can see this job', [['public', 'Everyone'], ['registered', 'Registered job seekers only']])}
          </div>

          <fieldset>
            <legend className="label">Skills</legend>
            <p className="mb-2 text-xs text-ink-faint">Add at least one skill to publish. Tap a skill to switch between required and nice to have.</p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-faint" aria-hidden />
              <input className="input pl-9" placeholder="Search skills" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search skills"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (suggestions[0]) addSkill(suggestions[0]); } }} />
              {suggestions.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-line bg-white shadow-lift" role="listbox">
                  {suggestions.map((s) => <li key={s.id}><button type="button" className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-mist" onClick={() => addSkill(s)}>{s.name}<span className="text-xs text-ink-faint">{s.category}</span></button></li>)}
                </ul>
              )}
            </div>
            <ul className="mt-3 flex flex-wrap gap-2">
              {f.skills.map((s) => (
                <li key={s.id} className={s.required ? 'chip-teal' : 'chip'}>
                  <button type="button" onClick={() => toggleSkill(s.id)} aria-pressed={s.required} title="Switch required or nice to have">{s.name} · {s.required ? 'Required' : 'Nice to have'}</button>
                  <button type="button" onClick={() => dropSkill(s.id)} aria-label={`Remove ${s.name}`}><X className="h-3.5 w-3.5" /></button>
                </li>
              ))}
            </ul>
            {errs.skills && <p className="mt-1 text-xs text-rose-600" role="alert">{errs.skills}</p>}
          </fieldset>

          <div className="flex flex-wrap gap-3 border-t border-line pt-4">
            <button type="submit" className="btn-outline" disabled={!!busy}>{busy === 'save' ? 'Saving…' : job && job.status !== 'draft' ? 'Save changes' : 'Save draft'}</button>
            {canPublish && <button type="button" className="btn-primary" disabled={!!busy} onClick={() => submit(true)}>{busy === 'publish' ? 'Publishing…' : 'Publish'}</button>}
          </div>
        </form>

        <aside className="lg:sticky lg:top-6 lg:self-start" aria-label="Preview">
          <p className="mb-2 text-xs font-semibold text-ink-faint">Preview</p>
          <div className="card p-5">
            <h2 className="text-lg font-semibold">{f.title || 'Job title'}</h2>
            <p className="mt-1 text-sm text-ink-soft">{[f.work_format === 'remote' ? 'Remote' : f.city || 'City', LABEL[f.contract_type], ctc(num(f.ctc_min), num(f.ctc_max))].join(' · ')}</p>
            <p className="mt-1 text-sm text-ink-soft">{Number(f.experience_min) > 0 ? `${f.experience_min}${f.experience_max ? `–${f.experience_max}` : '+'} yrs experience` : 'Freshers welcome'}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">{f.skills.map((s) => <span key={s.id} className={s.required ? 'chip-teal' : 'chip'}>{s.name}</span>)}</div>
            <p className="mt-3 line-clamp-6 whitespace-pre-line text-sm text-ink-soft">{f.description || 'Your description will show here.'}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
