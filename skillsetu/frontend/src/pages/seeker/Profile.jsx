import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { BadgeCheck, Copy, FileUp, Plus, Trash2, X } from 'lucide-react';
import { api, inr } from '../../lib/api';
import { useAsync, useToast, Spinner, ErrorBox, Field } from '../../components/ui';
import { PageHead } from '../../components/Layout';

const LANGS = ['English', 'Hindi', 'Kannada', 'Tamil', 'Telugu', 'Marathi', 'Bengali', 'Gujarati', 'Malayalam', 'Punjabi', 'Odia', 'Urdu'];
const VIS = [['public', 'Public', 'Anyone with your link can see your profile. Contact details stay hidden.'], ['employers', 'Employers only', 'Only signed-in, registered employers can find and view you.'], ['private', 'Private', 'Hidden from search. Employers see you only when you apply.']];
const ANCHOR = { city: 'basics', headline: 'basics', education_level: 'basics', skills: 'skills', educations: 'education', languages: 'preferences', experience: 'experience', expected_ctc: 'preferences', preferred_locations: 'preferences', resume: 'resume', verification: 'verification' };
const Section = ({ id, title, sub, children, action }) => (
  <section id={id} className="card scroll-mt-24 p-5" aria-labelledby={`${id}-h`}>
    <div className="mb-4 flex flex-wrap items-start justify-between gap-2"><div><h2 id={`${id}-h`} className="text-lg font-semibold">{title}</h2>{sub && <p className="text-sm text-ink-soft">{sub}</p>}</div>{action}</div>
    {children}
  </section>
);
const conf = (c) => (c >= 0.8 ? 'chip-teal' : c >= 0.6 ? 'chip-gold' : 'chip');

export default function Profile() {
  const toast = useToast();
  const me = useAsync(() => api('/seeker/profile'), []);
  const tax = useAsync(() => api('/public/taxonomy'), []);
  const [busy, setBusy] = useState('');
  const call = async (key, path, opts, msg) => {
    setBusy(key);
    try { const r = await api(path, opts); if (r.profile) me.setData({ profile: r.profile, completion: r.completion }); if (msg) toast(msg); return r; }
    catch (e) { toast(e.message, 'error'); return null; } finally { setBusy(''); }
  };
  useEffect(() => { const k = location.hash.slice(1); if (me.data && k) document.getElementById(ANCHOR[k] || k)?.scrollIntoView({ behavior: 'smooth' }); }, [!!me.data]); // eslint-disable-line

  if ((me.loading && !me.data) || (tax.loading && !tax.data)) return <Spinner />;
  if (me.error || tax.error) return <ErrorBox error={me.error || tax.error} onRetry={() => { me.reload(); tax.reload(); }} />;
  const { profile: p, completion: c } = me.data; const t = tax.data;
  const props = { p, t, call, busy };
  return (
    <div className="space-y-5">
      <PageHead title="Your profile" sub="Build it step by step. Each level unlocks better matches." />
      <div className="card p-4">
        <div className="flex justify-between text-sm"><span className="font-medium">Level {c.level} of 3</span><span>{c.percent}% complete</span></div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-mist" role="progressbar" aria-valuenow={c.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Profile completion"><div className="h-full bg-teal-600" style={{ width: `${c.percent}%` }} /></div>
        {c.missing.length > 0 && <p className="mt-2 text-xs text-ink-soft">Next: {c.missing.slice(0, 3).map((m) => m.label.toLowerCase()).join(', ')}.</p>}
      </div>
      <Resume {...props} />
      <Basics key={`b${p.name}|${p.headline}|${p.city}|${p.educationLevel}|${p.experienceYears}`} {...props} />
      <Skills key={`s${p.skills.map((x) => x.id + x.level).join()}`} {...props} />
      <ListSection kind="education" {...props} />
      <ListSection kind="experience" {...props} />
      <Preferences key={`p${p.languages.join()}|${p.visibility}`} {...props} />
      <div className="grid gap-5 md:grid-cols-2"><Verification {...props} /><Share p={p} /></div>
    </div>
  );
}

function Resume({ p, call, busy }) {
  const [parsed, setParsed] = useState(null); const [sel, setSel] = useState({});
  const upload = async (file) => {
    if (!file) return; const form = new FormData(); form.append('file', file);
    const r = await call('resume', '/seeker/resume', { method: 'POST', form }, 'Resume uploaded. Review what we found below.');
    if (!r) return; setParsed(r.parsed);
    setSel({ ...Object.fromEntries(r.parsed.skills.map((s) => [`s${s.id}`, !s.alreadyAdded && s.confidence >= 0.6])), ...Object.fromEntries(r.parsed.educations.map((_, i) => [`e${i}`, true])), ...Object.fromEntries(r.parsed.experiences.map((_, i) => [`x${i}`, true])), years: r.parsed.experienceYears != null, city: !!r.parsed.city });
  };
  const apply = async () => {
    const x = parsed; const body = { skills: x.skills.filter((s) => sel[`s${s.id}`]).map(({ id, confidence }) => ({ id, confidence })), educations: x.educations.filter((_, i) => sel[`e${i}`]), experiences: x.experiences.filter((_, i) => sel[`x${i}`]).map(({ title, company, start_date, end_date, current }) => ({ title, company, start_date, end_date, current })), educationLevel: x.educationLevel, headline: x.headline, languages: x.languages };
    if (sel.years) body.experienceYears = x.experienceYears; if (sel.city) body.city = x.city;
    if (await call('apply', '/seeker/resume/apply', { method: 'POST', body }, 'Added to your profile')) setParsed(null);
  };
  const box = (k, children) => <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!sel[k]} onChange={(e) => setSel({ ...sel, [k]: e.target.checked })} />{children}</label>;
  return (
    <Section id="resume" title="Resume" sub="Upload a PDF, DOCX or TXT. We read it and suggest details for you to confirm.">
      <div className="flex flex-wrap items-center gap-3">
        <label className="btn-outline cursor-pointer"><FileUp className="h-4 w-4" aria-hidden />{busy === 'resume' ? 'Reading resume…' : p.hasResume ? 'Replace resume' : 'Upload resume'}
          <input type="file" className="sr-only" accept=".pdf,.docx,.txt" disabled={busy === 'resume'} onChange={(e) => { upload(e.target.files[0]); e.target.value = ''; }} /></label>
        {p.resumeName && <span className="text-sm text-ink-soft">Current: {p.resumeName}</span>}
      </div>
      {parsed && (
        <div className="mt-5 space-y-4 rounded-xl bg-mist/60 p-4">
          {parsed.skills.length > 0 && <fieldset><legend className="label">Skills found</legend><div className="flex flex-wrap gap-2">{parsed.skills.map((s) => (
            <label key={s.id} className={`${conf(s.confidence)} cursor-pointer gap-1.5`}><input type="checkbox" disabled={s.alreadyAdded} checked={!!sel[`s${s.id}`]} onChange={(e) => setSel({ ...sel, [`s${s.id}`]: e.target.checked })} />{s.name} <span className="opacity-70">{Math.round(s.confidence * 100)}%{s.alreadyAdded ? ' · added' : ''}</span></label>))}</div></fieldset>}
          {parsed.educations.length > 0 && <fieldset className="space-y-1"><legend className="label">Education</legend>{parsed.educations.map((e, i) => box(`e${i}`, <>{e.qualification}{e.institution ? `, ${e.institution}` : ''}{e.year ? ` (${e.year})` : ''}</>))}</fieldset>}
          {parsed.experiences.length > 0 && <fieldset className="space-y-1"><legend className="label">Experience</legend>{parsed.experiences.map((e, i) => box(`x${i}`, <>{e.title}{e.company ? ` at ${e.company}` : ''} ({e.start_date?.slice(0, 4)} to {e.current ? 'now' : e.end_date?.slice(0, 4)})</>))}</fieldset>}
          <div className="flex flex-wrap gap-4">{parsed.experienceYears != null && box('years', <>{parsed.experienceYears} years of experience</>)}{parsed.city && box('city', <>City: {parsed.city}</>)}</div>
          <div className="flex gap-2"><button className="btn-primary" onClick={apply} disabled={busy === 'apply'}>Add selected to profile</button><button className="btn-ghost" onClick={() => setParsed(null)}>Dismiss</button></div>
        </div>
      )}
    </Section>
  );
}

function Basics({ p, t, call, busy }) {
  const [f, setF] = useState({ name: p.name || '', headline: p.headline || '', about: p.about || '', city: p.city || '', educationLevel: p.educationLevel ?? 0, experienceYears: p.experienceYears ?? 0, fresher: p.experienceYears === 0 && p.profileLevel >= 3 });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = (e) => { e.preventDefault(); const { fresher, experienceYears, ...rest } = f; call('basics', '/seeker/profile', { method: 'PUT', body: { ...rest, city: rest.city || null, ...(fresher ? { fresher: true } : { experienceYears: Number(experienceYears) }) } }, 'Basics saved'); };
  return (
    <Section id="basics" title="Basics">
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" id="b-name"><input id="b-name" className="input" required minLength={2} value={f.name} onChange={set('name')} /></Field>
        <Field label="Headline" id="b-head" hint="One line, e.g. Electrician with 3 years in solar installs"><input id="b-head" className="input" maxLength={140} value={f.headline} onChange={set('headline')} /></Field>
        <div className="sm:col-span-2"><Field label="About you" id="b-about"><textarea id="b-about" className="input min-h-24" maxLength={2000} value={f.about} onChange={set('about')} /></Field></div>
        <Field label="City" id="b-city"><select id="b-city" className="input" value={f.city} onChange={set('city')}><option value="">Select city</option>{t.cities.map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Highest education" id="b-edu"><select id="b-edu" className="input" value={f.educationLevel} onChange={set('educationLevel')}>{t.educationLevels.map((x) => <option key={x.level} value={x.level}>{x.label}</option>)}</select></Field>
        <Field label="Years of experience" id="b-exp"><input id="b-exp" type="number" min={0} max={50} step={0.5} className="input" disabled={f.fresher} value={f.experienceYears} onChange={set('experienceYears')} /></Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={f.fresher} onChange={set('fresher')} />I am a fresher</label>
        <div className="sm:col-span-2"><button className="btn-primary" disabled={busy === 'basics'}>Save basics</button></div>
      </form>
    </Section>
  );
}

function Skills({ p, t, call, busy }) {
  const [list, setList] = useState(p.skills.map(({ id, name, level }) => ({ id, name, level }))); const [q, setQ] = useState('');
  const hits = useMemo(() => (q.trim().length < 1 ? [] : t.skills.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()) && !list.some((l) => l.id === s.id)).slice(0, 8)), [q, list, t.skills]);
  return (
    <Section id="skills" title="Skills" sub="Add at least 3. Matching weighs skills the most." action={<button className="btn-primary btn-sm" disabled={busy === 'skills'} onClick={() => call('skills', '/seeker/skills', { method: 'PUT', body: { skills: list.map(({ id, level }) => ({ id, level })) } }, 'Skills saved')}>Save skills</button>}>
      <Field label="Search skills" id="sk-q"><input id="sk-q" className="input" placeholder="e.g. Welding, Excel, Python" value={q} onChange={(e) => setQ(e.target.value)} /></Field>
      {hits.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{hits.map((s) => <button key={s.id} type="button" className="chip hover:bg-teal-50" onClick={() => { setList([...list, { id: s.id, name: s.name, level: 'intermediate' }]); setQ(''); }}><Plus className="h-3 w-3" aria-hidden />{s.name}</button>)}</div>}
      <ul className="mt-4 divide-y divide-line">{list.map((s, i) => (
        <li key={s.id} className="flex items-center gap-3 py-2"><span className="flex-1 text-sm font-medium">{s.name}</span>
          <select aria-label={`Level for ${s.name}`} className="input w-auto py-1 text-sm" value={s.level} onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, level: e.target.value } : x)))}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="expert">Expert</option></select>
          <button className="btn-ghost p-1.5" aria-label={`Remove ${s.name}`} onClick={() => setList(list.filter((_, j) => j !== i))}><X className="h-4 w-4" /></button></li>))}
        {!list.length && <li className="py-2 text-sm text-ink-faint">No skills yet.</li>}</ul>
    </Section>
  );
}

function ListSection({ kind, p, t, call, busy }) {
  const edu = kind === 'education'; const blank = edu ? { qualification: '', level: '', field: '', institution: '', year: '' } : { title: '', company: '', start_date: '', end_date: '', current: false };
  const [f, setF] = useState(null); const items = edu ? p.educations : p.experiences; const base = edu ? '/seeker/educations' : '/seeker/experiences';
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const add = async (e) => { e.preventDefault(); const body = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '')); if (await call(kind, base, { method: 'POST', body }, `${edu ? 'Education' : 'Experience'} added`)) setF(null); };
  return (
    <Section id={kind} title={edu ? 'Education' : 'Experience'} sub={edu ? 'Verified certificates rank higher with employers.' : 'Freshers can skip this and tick "I am a fresher" above.'} action={!f && <button className="btn-outline btn-sm" onClick={() => setF(blank)}><Plus className="h-4 w-4" aria-hidden />Add</button>}>
      <ul className="space-y-2">{items.map((x) => (
        <li key={x.id} className="flex items-start gap-3 rounded-xl border border-line p-3">
          <div className="flex-1 text-sm"><p className="font-medium">{edu ? x.qualification : x.title}{edu && x.verified ? <BadgeCheck className="ml-1 inline h-4 w-4 text-teal-600" aria-label="Verified" /> : null}</p>
            <p className="text-ink-soft">{edu ? [x.field, x.institution, x.year].filter(Boolean).join(' · ') : [x.company, `${x.start_date?.slice(0, 7) || '?'} to ${x.current ? 'present' : x.end_date?.slice(0, 7) || '?'}`].filter(Boolean).join(' · ')}</p></div>
          <button className="btn-ghost p-1.5 text-rose-600" aria-label="Delete" disabled={busy === kind} onClick={() => call(kind, `${base}/${x.id}`, { method: 'DELETE' }, 'Removed')}><Trash2 className="h-4 w-4" /></button></li>))}
        {!items.length && !f && <li className="text-sm text-ink-faint">Nothing added yet.</li>}</ul>
      {f && (
        <form onSubmit={add} className="mt-4 grid gap-3 rounded-xl bg-mist/60 p-4 sm:grid-cols-2">
          {edu ? (<>
            <Field label="Qualification" id="ed-q"><input id="ed-q" className="input" required minLength={2} placeholder="e.g. B.Tech, ITI, 12th" value={f.qualification} onChange={set('qualification')} /></Field>
            <Field label="Level" id="ed-l"><select id="ed-l" className="input" value={f.level} onChange={set('level')}><option value="">Detect automatically</option>{t.educationLevels.map((x) => <option key={x.level} value={x.level}>{x.label}</option>)}</select></Field>
            <Field label="Field of study" id="ed-f"><input id="ed-f" className="input" value={f.field} onChange={set('field')} /></Field>
            <Field label="Institution" id="ed-i"><input id="ed-i" className="input" value={f.institution} onChange={set('institution')} /></Field>
            <Field label="Year of passing" id="ed-y"><input id="ed-y" type="number" min={1960} max={2035} className="input" value={f.year} onChange={set('year')} /></Field>
          </>) : (<>
            <Field label="Job title" id="ex-t"><input id="ex-t" className="input" required minLength={2} value={f.title} onChange={set('title')} /></Field>
            <Field label="Company" id="ex-c"><input id="ex-c" className="input" value={f.company} onChange={set('company')} /></Field>
            <Field label="Start date" id="ex-s"><input id="ex-s" type="date" className="input" value={f.start_date} onChange={set('start_date')} /></Field>
            <Field label="End date" id="ex-e"><input id="ex-e" type="date" className="input" disabled={f.current} value={f.end_date} onChange={set('end_date')} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.current} onChange={set('current')} />I work here now</label>
          </>)}
          <div className="flex gap-2 sm:col-span-2"><button className="btn-primary" disabled={busy === kind}>Add</button><button type="button" className="btn-ghost" onClick={() => setF(null)}>Cancel</button></div>
        </form>
      )}
    </Section>
  );
}

function Preferences({ p, t, call, busy }) {
  const [f, setF] = useState({ expectedCtcMin: p.expectedCtcMin ?? '', expectedCtcMax: p.expectedCtcMax ?? '', preferredLocations: p.preferredLocations || [], preferredWorkFormat: p.preferredWorkFormat || 'any', languages: p.languages || [], visibility: p.visibility || 'employers' });
  const toggle = (k, v) => setF({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] });
  const num = (v) => (v === '' ? null : Number(v));
  const save = (e) => { e.preventDefault(); call('prefs', '/seeker/profile', { method: 'PUT', body: { ...f, expectedCtcMin: num(f.expectedCtcMin), expectedCtcMax: num(f.expectedCtcMax) } }, 'Preferences saved'); };
  return (
    <Section id="preferences" title="Preferences and privacy">
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <Field label="Expected salary, minimum (₹ per year)" id="p-min" hint={inr(num(f.expectedCtcMin)) || undefined}><input id="p-min" type="number" min={0} step={10000} className="input" value={f.expectedCtcMin} onChange={(e) => setF({ ...f, expectedCtcMin: e.target.value })} /></Field>
        <Field label="Expected salary, maximum (₹ per year)" id="p-max" hint={inr(num(f.expectedCtcMax)) || undefined}><input id="p-max" type="number" min={0} step={10000} className="input" value={f.expectedCtcMax} onChange={(e) => setF({ ...f, expectedCtcMax: e.target.value })} /></Field>
        <Field label="Preferred locations (up to 10)" id="p-loc"><select id="p-loc" className="input" value="" onChange={(e) => e.target.value && f.preferredLocations.length < 10 && toggle('preferredLocations', e.target.value)}><option value="">Add a city</option>{t.cities.filter((x) => !f.preferredLocations.includes(x)).map((x) => <option key={x}>{x}</option>)}</select>
          <div className="mt-2 flex flex-wrap gap-1.5">{f.preferredLocations.map((x) => <button type="button" key={x} className="chip-teal" onClick={() => toggle('preferredLocations', x)} aria-label={`Remove ${x}`}>{x}<X className="h-3 w-3" aria-hidden /></button>)}</div></Field>
        <Field label="Work format" id="p-wf"><select id="p-wf" className="input" value={f.preferredWorkFormat} onChange={(e) => setF({ ...f, preferredWorkFormat: e.target.value })}><option value="any">Any</option><option value="onsite">On-site</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option></select></Field>
        <fieldset className="sm:col-span-2"><legend className="label">Languages you speak</legend><div className="flex flex-wrap gap-2">{LANGS.map((l) => <label key={l} className={`${f.languages.includes(l) ? 'chip-teal' : 'chip'} cursor-pointer`}><input type="checkbox" className="sr-only" checked={f.languages.includes(l)} onChange={() => toggle('languages', l)} />{l}</label>)}</div></fieldset>
        <fieldset className="sm:col-span-2"><legend className="label">Who can see your profile</legend><div className="grid gap-2 sm:grid-cols-3">{VIS.map(([v, l, d]) => (
          <label key={v} className={`cursor-pointer rounded-xl border p-3 text-sm ${f.visibility === v ? 'border-teal-500 bg-teal-50' : 'border-line'}`}><span className="flex items-center gap-2 font-medium"><input type="radio" name="vis" value={v} checked={f.visibility === v} onChange={() => setF({ ...f, visibility: v })} />{l}</span><span className="mt-1 block text-ink-soft">{d}</span></label>))}</div></fieldset>
        <div className="sm:col-span-2"><button className="btn-primary" disabled={busy === 'prefs'}>Save preferences</button></div>
      </form>
    </Section>
  );
}

function Verification({ p, call, busy }) {
  const [aadhaar, setA] = useState(''); const [consent, setC] = useState(false); const [docs, setDocs] = useState(null);
  const ekyc = async (e) => { e.preventDefault(); if (await call('ekyc', '/seeker/verify/ekyc', { method: 'POST', body: { aadhaar: aadhaar.replace(/\s/g, ''), consent } }, 'Aadhaar verified')) setA(''); };
  const dl = async () => { const r = await call('dl', '/seeker/verify/digilocker', { method: 'POST' }, 'DigiLocker check complete'); if (r) setDocs(r.documents); };
  return (
    <Section id="verification" title="Verification" sub="Verified profiles get a badge and more employer views.">
      {p.ekycVerified ? <p className="chip-teal"><BadgeCheck className="h-4 w-4" aria-hidden />Aadhaar verified {p.aadhaarMasked}</p> : (
        <form onSubmit={ekyc} className="space-y-3">
          <Field label="Aadhaar number" id="v-aad" hint="12 digits. We store it encrypted and show only the last 4. Sandbox test number: 2341 2341 2346"><input id="v-aad" className="input" inputMode="numeric" autoComplete="off" maxLength={14} value={aadhaar} onChange={(e) => setA(e.target.value)} required /></Field>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setC(e.target.checked)} />I consent to verify my identity with UIDAI e-KYC.</label>
          <button className="btn-primary" disabled={!consent || busy === 'ekyc'}>{busy === 'ekyc' ? 'Verifying…' : 'Verify with e-KYC'}</button>
        </form>)}
      <div className="mt-5 border-t border-line pt-4">
        <p className="text-sm font-medium">DigiLocker certificates {p.digilockerVerified && <span className="chip-teal ml-1">Verified</span>}</p>
        <p className="text-sm text-ink-soft">Fetch your education certificates to verify them.</p>
        <button className="btn-outline btn-sm mt-2" onClick={dl} disabled={busy === 'dl'}>{busy === 'dl' ? 'Fetching…' : 'Fetch from DigiLocker'}</button>
        {docs && <ul className="mt-2 space-y-1 text-sm">{docs.map((d, i) => <li key={i} className={d.verified ? 'text-teal-700' : 'text-ink-soft'}>{d.qualification} ({d.issuer}): {d.verified ? 'verified' : d.reason || 'not found'}</li>)}</ul>}
      </div>
    </Section>
  );
}

function Share({ p }) {
  const toast = useToast(); const url = `${location.origin}/p/${p.slug}`;
  const copy = async () => { try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { toast('Could not copy. Select the link and copy it.', 'error'); } };
  return (
    <Section id="share" title="Share your profile" sub="Add the link to your resume or show the QR code at job fairs.">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="rounded-xl border border-line bg-white p-3"><QRCodeSVG value={url} size={128} fgColor="#0F6E6E" title="QR code for your public profile" /></div>
        <div className="min-w-0 flex-1 space-y-2">
          <a href={url} target="_blank" rel="noreferrer" className="block break-all text-sm text-teal-700 hover:underline">{url}</a>
          <button className="btn-outline btn-sm" onClick={copy}><Copy className="h-4 w-4" aria-hidden />Copy link</button>
          {p.visibility !== 'public' && <p className="text-xs text-marigold-700">Your profile is not public, so others may not be able to open this link. Change it under privacy.</p>}
        </div>
      </div>
    </Section>
  );
}
