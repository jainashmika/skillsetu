import { useEffect, useState } from 'react';
import { Cpu, Pencil, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { api, ago } from '../../lib/api';
import { useAsync, useToast, Spinner, ErrorBox, Empty, Field, Modal, Tabs, MatchMeter, MatchRing } from '../../components/ui';
import { PageHead } from '../../components/Layout';

const KEYS = ['skills', 'education', 'experience', 'location', 'salary'];
const pctOf = (w) => { const s = KEYS.reduce((a, k) => a + (w[k] || 0), 0) || 1; return Object.fromEntries(KEYS.map((k) => [k, Math.round(((w[k] || 0) / s) * 100)])); };
const norm = (w) => { const s = KEYS.reduce((a, k) => a + (w[k] || 0), 0) || 1; return Object.fromEntries(KEYS.map((k) => [k, Number(((w[k] || 0) / s).toFixed(3))])); };

function Slider({ id, label, value, display, min = 0, max = 100, step = 1, onChange }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm"><label htmlFor={id} className="font-medium capitalize">{label}</label><span className="font-semibold text-teal-700">{display}</span></div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-teal-600" />
    </div>
  );
}

const FORMS = {
  skills: [['name', 'Name'], ['category', 'Category'], ['synonyms', 'Synonyms (comma separated)', 'list']],
  sectors: [['name', 'Name']],
  occupations: [['title', 'Title'], ['nco_code', 'NCO code'], ['sector', 'Sector'], ['skill_ids', 'Skills', 'skills']],
  trainings: [['title', 'Title'], ['provider', 'Provider'], ['url', 'URL'], ['duration', 'Duration'], ['skill_ids', 'Skills', 'skills']],
};

function Taxonomy() {
  const toast = useToast();
  const [kind, setKind] = useState('skills');
  const [edit, setEdit] = useState(null);
  const { data, loading, error, reload } = useAsync(() => api(`/admin/taxonomy/${kind}`), [kind]);
  const skills = useAsync(() => api('/admin/taxonomy/skills'), []);
  const skillName = (id) => skills.data?.items.find((s) => s.id === id)?.name || `#${id}`;
  const label = (x) => x.name || x.title;

  const save = async (e) => {
    e.preventDefault();
    const body = {}; for (const [k, , t] of FORMS[kind]) { const v = edit[k]; body[k] = t === 'list' ? String(v || '').split(',').map((s) => s.trim()).filter(Boolean) : t === 'skills' ? (v || []) : (v === '' ? null : v); }
    try { await api(`/admin/taxonomy/${kind}${edit.id ? `/${edit.id}` : ''}`, { method: edit.id ? 'PUT' : 'POST', body }); toast('Saved'); setEdit(null); reload(); if (kind === 'skills') skills.reload(); }
    catch (err) { setEdit((x) => ({ ...x, _err: err.fields || {}, _msg: err.message })); }
  };
  const remove = async (x) => { if (!window.confirm(`Delete "${label(x)}"?`)) return; try { await api(`/admin/taxonomy/${kind}/${x.id}`, { method: 'DELETE' }); toast('Deleted'); reload(); } catch (err) { toast(err.message, 'error'); } };
  const openEdit = (x) => setEdit(x ? { ...x, synonyms: (x.synonyms || []).join(', ') } : Object.fromEntries(FORMS[kind].map(([k, , t]) => [k, t === 'skills' ? [] : ''])));

  return (
    <section className="card p-4 sm:p-5" aria-label="Taxonomy">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Taxonomy</h2><button className="btn-primary btn-sm" onClick={() => openEdit(null)}><Plus className="h-3.5 w-3.5" aria-hidden />Add entry</button></div>
      <Tabs tabs={[['skills', 'Skills'], ['sectors', 'Sectors'], ['occupations', 'Occupations'], ['trainings', 'Trainings']]} value={kind} onChange={setKind} />
      <div className="mt-4">
        {loading && !data ? <Spinner /> : error ? <ErrorBox error={error} onRetry={reload} /> : !data.items.length ? <Empty title="No entries yet" /> : (
          <div className="max-h-[480px] overflow-auto">
            <table className="table min-w-[640px]">
              <thead className="sticky top-0 bg-white"><tr><th>{kind === 'occupations' || kind === 'trainings' ? 'Title' : 'Name'}</th><th>Details</th>{kind === 'skills' && <><th>Jobs (demand)</th><th>Seekers (supply)</th></>}<th className="text-right"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {data.items.map((x) => (
                  <tr key={x.id}>
                    <td className="font-medium">{label(x)}</td>
                    <td className="text-xs text-ink-soft">
                      {kind === 'skills' && <><span className="chip mr-1 py-0.5">{x.category}</span>{x.synonyms.join(', ')}</>}
                      {kind === 'occupations' && [x.nco_code && `NCO ${x.nco_code}`, x.sector].filter(Boolean).join(' · ')}
                      {kind === 'trainings' && [x.provider, x.duration].filter(Boolean).join(' · ')}
                      {x.skill_ids?.length > 0 && <p className="mt-0.5 text-ink-faint">{x.skill_ids.map(skillName).join(', ')}</p>}
                    </td>
                    {kind === 'skills' && <><td>{x.jobs}</td><td>{x.seekers}</td></>}
                    <td><div className="flex justify-end gap-1"><button className="btn-ghost btn-sm" onClick={() => openEdit(x)} aria-label={`Edit ${label(x)}`}><Pencil className="h-3.5 w-3.5" /></button><button className="btn-ghost btn-sm text-rose-600" onClick={() => remove(x)} aria-label={`Delete ${label(x)}`}><Trash2 className="h-3.5 w-3.5" /></button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data?.cache && <p className="mt-2 text-xs text-ink-faint">Taxonomy cache: {data.cache.size} entries, {data.cache.hits} hits, {data.cache.misses} misses</p>}
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={`${edit?.id ? 'Edit' : 'Add'} ${kind.slice(0, -1)}`}>
        {edit && (
          <form onSubmit={save} className="space-y-3">
            {FORMS[kind].map(([k, l, t], i) => (
              <Field key={k} id={`tx-${k}`} label={l} error={edit._err?.[k]}>
                {t === 'skills' ? (
                  <select id={`tx-${k}`} multiple className="input h-40" value={(edit[k] || []).map(String)} onChange={(e) => setEdit({ ...edit, [k]: [...e.target.selectedOptions].map((o) => Number(o.value)) })}>
                    {skills.data?.items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                ) : <input id={`tx-${k}`} required={i === 0 || k === 'provider'} className="input" value={edit[k] ?? ''} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />}
              </Field>
            ))}
            {edit._msg && <p className="text-sm text-rose-600" role="alert">{edit._msg}</p>}
            <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn-primary">Save</button></div>
          </form>
        )}
      </Modal>
    </section>
  );
}

export default function Matching() {
  const toast = useToast();
  const info = useAsync(() => api('/admin/matching/info'), []);
  const sample = useAsync(() => api('/admin/matching/sample'), []);
  const [w, setW] = useState(null); const [th, setTh] = useState(60); const [cf, setCf] = useState(0.2);
  const [busy, setBusy] = useState(''); const [pair, setPair] = useState({ seekerId: '', jobId: '' }); const [preview, setPreview] = useState(null);
  useEffect(() => { if (info.data && !w) { setW(Object.fromEntries(KEYS.map((k) => [k, Math.round((info.data.weights[k] || 0) * 100)]))); setTh(info.data.threshold); setCf(info.data.cfBlend); } }, [info.data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (info.loading && !info.data) return <Spinner />;
  if (info.error) return <ErrorBox error={info.error} onRetry={info.reload} />;
  const shown = w ? pctOf(w) : {};
  const run = async (key, fn) => { setBusy(key); try { await fn(); } catch (e) { toast(e.message, 'error'); } finally { setBusy(''); } };
  const save = () => run('save', async () => { await api('/admin/settings', { method: 'PUT', body: { match_weights: norm(w), match_threshold: th, cf_blend: cf } }); toast('Matching settings saved'); info.reload(); });
  const retrain = () => run('train', async () => { const r = await api('/admin/matching/retrain', { method: 'POST' }); info.setData((d) => ({ ...d, ...r })); toast('Models retrained'); });
  const test = (e) => { e.preventDefault(); run('test', async () => setPreview(await api('/admin/matching/preview', { method: 'POST', body: { seekerId: Number(pair.seekerId), jobId: Number(pair.jobId), weights: norm(w) } }))); };
  const { engine: en, recommender: rc } = info.data;

  return (
    <div className="space-y-6">
      <PageHead title="AI matching" sub="Tune how match scores are weighted, then test on real profiles" action={<button className="btn-primary" disabled={busy === 'save' || !w} onClick={save}><Save className="h-4 w-4" aria-hidden />Save settings</button>} />
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="card space-y-4 p-4 sm:p-5" aria-label="Weights">
          <h2 className="text-lg font-semibold">Component weights</h2>
          <p className="-mt-2 text-xs text-ink-faint">Weights are normalised to 100% when saved.</p>
          {w && KEYS.map((k) => <Slider key={k} id={`w-${k}`} label={k} value={w[k]} display={`${shown[k]}%`} onChange={(v) => setW({ ...w, [k]: v })} />)}
          <hr className="border-line" />
          <Slider id="th" label="Match threshold" value={th} display={`${th}%`} onChange={setTh} />
          <Slider id="cf" label="Collaborative filtering blend" value={cf} max={0.8} step={0.05} display={`${Math.round(cf * 100)}%`} onChange={setCf} />
        </section>
        <section className="card p-4 sm:p-5" aria-label="Engine">
          <div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 text-lg font-semibold"><Cpu className="h-5 w-5 text-teal-600" aria-hidden />Engine</h2>
            <button className="btn-outline btn-sm" disabled={busy === 'train'} onClick={retrain}><RefreshCw className={`h-3.5 w-3.5 ${busy === 'train' ? 'animate-spin' : ''}`} aria-hidden />Retrain</button></div>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            {[['Index version', en.version], ['Jobs indexed', en.jobs], ['Vocabulary', en.vocab], ['Build time', `${en.buildMs ?? '–'} ms`], ['Index built', en.builtAt ? ago(en.builtAt) : '–'],
              ['CF users', rc.users], ['CF items', rc.items], ['Interactions', rc.interactions], ['Latent factors', rc.latentFactors], ['Loss', rc.loss != null ? Number(rc.loss).toFixed(4) : '–'], ['Train time', `${rc.trainMs ?? '–'} ms`], ['Trained', rc.trainedAt ? ago(rc.trainedAt) : 'Not yet']].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-mist/60 px-3 py-2"><dt className="text-xs text-ink-faint">{k}</dt><dd className="font-medium">{v ?? '–'}</dd></div>))}
          </dl>
        </section>
      </div>

      <section className="card p-4 sm:p-5" aria-label="Test a match">
        <h2 className="mb-3 text-lg font-semibold">Test a match</h2>
        <form onSubmit={test} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field id="ps" label="Job seeker"><select id="ps" required className="input" value={pair.seekerId} onChange={(e) => setPair({ ...pair, seekerId: e.target.value })}><option value="">Choose a seeker</option>{sample.data?.seekers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field id="pj" label="Job"><select id="pj" required className="input" value={pair.jobId} onChange={(e) => setPair({ ...pair, jobId: e.target.value })}><option value="">Choose a job</option>{sample.data?.jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}</select></Field>
          <button className="btn-accent" disabled={busy === 'test'}>Score with current sliders</button>
        </form>
        {preview && (
          <div className="mt-5 rounded-xl border border-line p-4" aria-live="polite">
            <div className="mb-4 flex items-center gap-4"><MatchRing score={preview.result.score} size={64} />
              <div><p className="font-semibold">{preview.seeker.name} for {preview.job.title}</p>
                <p className="text-sm text-ink-soft">{preview.result.aboveThreshold ? <span className="chip-teal">Above threshold</span> : <span className="chip-gold">Below threshold</span>} <span className="ml-1 text-xs">Confidence {Math.round(preview.result.confidence * 100)}%</span></p></div></div>
            <MatchMeter breakdown={preview.result.breakdown} />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div><h3 className="mb-1 text-sm font-semibold text-teal-700">Strengths</h3><ul className="list-disc space-y-0.5 pl-5 text-sm text-ink-soft">{preview.result.strengths.length ? preview.result.strengths.map((s) => <li key={s}>{s}</li>) : <li>None found</li>}</ul></div>
              <div><h3 className="mb-1 text-sm font-semibold text-marigold-700">Gaps</h3><ul className="list-disc space-y-0.5 pl-5 text-sm text-ink-soft">{preview.result.gaps.length ? preview.result.gaps.map((s) => <li key={s}>{s}</li>) : <li>No gaps</li>}</ul></div>
            </div>
          </div>
        )}
      </section>
      <Taxonomy />
    </div>
  );
}
