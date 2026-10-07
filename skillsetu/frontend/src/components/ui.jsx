import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, Bookmark, BookmarkCheck, Briefcase, IndianRupee, Loader2, MapPin, X } from 'lucide-react';
import { ctc, LABEL, ago } from '../lib/api';

// ---------- data hook ----------
export function useAsync(fn, deps = []) {
  const [s, set] = useState({ loading: true, data: null, error: null });
  const run = useCallback(async () => {
    set((p) => ({ ...p, loading: true }));
    try { const data = await fn(); set({ loading: false, data, error: null }); return data; }
    catch (error) { set({ loading: false, data: null, error }); return null; }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { run(); }, [run]);
  return { ...s, reload: run, setData: (d) => set((p) => ({ ...p, data: typeof d === 'function' ? d(p.data) : d })) };
}

// ---------- toasts (NFR-75 feedback) ----------
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((msg, kind = 'ok') => { const id = Math.random(); setItems((x) => [...x, { id, msg, kind }]); setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4500); }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`rounded-xl border px-4 py-3 text-sm shadow-lift ${t.kind === 'error' ? 'border-orange-200 bg-orange-50 text-rose-600' : 'border-teal-100 bg-white text-ink'}`}>{t.msg}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ---------- primitives ----------
export const Spinner = ({ label = 'Loading' }) => <div className="flex items-center justify-center gap-2 py-16 text-ink-faint" role="status"><Loader2 className="h-5 w-5 animate-spin" aria-hidden />{label}…</div>;
export const ErrorBox = ({ error, onRetry }) => error ? <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-rose-600" role="alert">{error.message}{onRetry && <button className="ml-3 underline" onClick={onRetry}>Try again</button>}</div> : null;
export function Empty({ icon: Icon = Briefcase, title, children, action }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-white/60 px-6 py-12 text-center">
      <Icon className="mb-3 h-8 w-8 text-teal-500" aria-hidden />
      <p className="font-display text-lg font-semibold">{title}</p>
      {children && <p className="mt-1 max-w-md text-sm text-ink-soft">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
export function Field({ label, error, hint, children, id }) {
  return (
    <div>
      {label && <label htmlFor={id} className="label">{label}</label>}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
      {error && <p className="mt-1 text-xs text-rose-600" role="alert">{error}</p>}
    </div>
  );
}
export function Modal({ open, onClose, title, children, wide }) {
  const ref = useRef(null);
  useEffect(() => { if (!open) return; const k = (e) => e.key === 'Escape' && onClose(); document.addEventListener('keydown', k); ref.current?.focus(); return () => document.removeEventListener('keydown', k); }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={`max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-6 shadow-lift sm:rounded-2xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}>
        <div className="mb-4 flex items-start justify-between gap-4"><h2 className="text-xl font-semibold">{title}</h2><button className="btn-ghost -m-2 p-2" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button></div>
        {children}
      </div>
    </div>
  );
}
export function Stat({ label, value, sub, tone = 'teal' }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium text-ink-faint">{label}</p>
      <p className={`mt-1 font-display text-3xl font-semibold ${tone === 'gold' ? 'text-marigold-700' : 'text-ink'}`}>{value ?? '–'}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-soft">{sub}</p>}
    </div>
  );
}
export function Logo({ className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2 font-display text-xl font-bold text-ink ${className}`}>
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden><rect width="32" height="32" rx="9" fill="#0F6E6E" /><path d="M6.5 21c4.2-8.5 14.8-8.5 19 0" stroke="#F2A900" strokeWidth="3.4" fill="none" strokeLinecap="round" /><circle cx="6.5" cy="22" r="2" fill="#fff" /><circle cx="25.5" cy="22" r="2" fill="#fff" /></svg>
      Skill<span className="-ml-2 text-teal-600">Setu</span>
    </span>
  );
}
export const Tabs = ({ tabs, value, onChange }) => (
  <div className="flex gap-1 overflow-x-auto rounded-xl bg-mist p-1" role="tablist">
    {tabs.map(([k, l, n]) => (
      <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${value === k ? 'bg-white text-ink shadow-sm' : 'text-ink-soft hover:text-ink'}`}>
        {l}{n != null && <span className="ml-1.5 text-xs text-ink-faint">{n}</span>}
      </button>
    ))}
  </div>
);
export const StatusChip = ({ s }) => {
  const tone = { active: 'chip-teal', hired: 'chip-teal', offered: 'chip-teal', shortlisted: 'chip-gold', interview: 'chip-gold', paused: 'chip-gold', pending: 'chip-gold', manual_review: 'chip-gold', pending_approval: 'chip-gold', rejected: 'chip-red', banned: 'chip-red', expired: 'chip-red', verified: 'chip-teal' }[s] || 'chip';
  return <span className={tone}>{LABEL[s] || String(s).replace(/_/g, ' ')}</span>;
};

// ---------- signature element: segmented match meter ----------
const SEG = [['skills', '#0F6E6E'], ['education', '#3B4BA8'], ['experience', '#6B8F3A'], ['location', '#F2A900'], ['salary', '#C2410C']];
export function MatchRing({ score, size = 52 }) {
  const r = (size - 8) / 2; const c = 2 * Math.PI * r; const v = Math.max(0, Math.min(100, score || 0));
  const color = v >= 75 ? '#0F6E6E' : v >= 55 ? '#F2A900' : '#7A8496';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-label={`${Math.round(v)}% match`} role="img">
      <svg width={size} height={size} className="-rotate-90"><circle cx={size / 2} cy={size / 2} r={r} stroke="#E2E7DF" strokeWidth="5" fill="none" /><circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="5" fill="none" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} /></svg>
      <span className="absolute inset-0 flex items-center justify-center font-display text-sm font-bold">{Math.round(v)}<span className="text-[9px]">%</span></span>
    </div>
  );
}
export function MatchMeter({ breakdown, compact }) {
  if (!breakdown) return null;
  const total = SEG.reduce((s, [k]) => s + (breakdown[k]?.weight || 0), 0) || 1;
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-mist" aria-hidden>
        {SEG.map(([k, col]) => { const b = breakdown[k]; if (!b) return null; return (
          <div key={k} className="relative h-full border-r-2 border-white last:border-r-0" style={{ width: `${(b.weight / total) * 100}%`, background: '#EDF2EC' }}>
            <div className="h-full" style={{ width: `${b.score}%`, background: col }} />
          </div>); })}
      </div>
      {!compact && (
        <dl className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(92px,1fr))] gap-x-4 gap-y-2">
          {SEG.map(([k, col]) => breakdown[k] && (
            <div key={k} className="text-xs">
              <dt className="flex items-center gap-1.5 capitalize text-ink-faint"><span className="h-2 w-2 rounded-full" style={{ background: col }} />{k}</dt>
              <dd className="font-semibold text-ink">{breakdown[k].score}% <span className="font-normal text-ink-faint">· weight {breakdown[k].weight}%</span></dd>
            </div>))}
        </dl>
      )}
    </div>
  );
}

export function CompanyMark({ name, logo, size = 44 }) {
  if (logo) return <img src={logo} alt="" className="shrink-0 rounded-xl border border-line object-cover" style={{ width: size, height: size }} />;
  const hue = [...(name || 'x')].reduce((s, c) => s + c.charCodeAt(0), 0) % 4;
  const bg = ['#E7F4F2', '#FFF6DE', '#EAECF7', '#F1F4E8'][hue]; const fg = ['#0B5656', '#A36F00', '#3B4BA8', '#4A6B23'][hue];
  return <span className="flex shrink-0 items-center justify-center rounded-xl font-display font-bold" style={{ width: size, height: size, background: bg, color: fg, fontSize: size * 0.38 }} aria-hidden>{(name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>;
}

export function JobCard({ job, onSave, showMatch = true }) {
  return (
    <article className="card group relative flex gap-4 p-4 transition-colors hover:border-teal-500/50 sm:p-5">
      <CompanyMark name={job.company} logo={job.logo} />
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-semibold leading-snug sm:text-lg"><Link to={`/jobs/${job.id}`} className="after:absolute after:inset-0 hover:text-teal-700">{job.title}</Link></h3>
        <p className="mt-0.5 flex items-center gap-1 text-sm text-ink-soft">{job.company}{job.companyVerified && <BadgeCheck className="h-4 w-4 text-teal-600" aria-label="Verified employer" />}{job.source && job.source !== 'direct' && <span className="chip ml-1 py-0.5">via {job.source.replace('portal:', '')}</span>}</p>
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-soft">
          <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden />{job.workFormat === 'remote' ? 'Remote' : job.city}{job.workFormat === 'hybrid' && ' · Hybrid'}</span>
          <span className="inline-flex items-center gap-1"><IndianRupee className="h-3.5 w-3.5" aria-hidden />{ctc(job.ctcMin, job.ctcMax)}</span>
          <span>{LABEL[job.contractType]}</span>
          {job.experienceMin > 0 ? <span>{job.experienceMin}+ yrs</span> : <span>Freshers welcome</span>}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">{job.skills?.slice(0, 4).map((s) => <span key={s.id} className="chip">{s.name}</span>)}</div>
      </div>
      <div className="relative z-10 flex flex-col items-end justify-between gap-2">
        {showMatch && job.match ? <MatchRing score={job.match.score} /> : <span className="text-xs text-ink-faint">{ago(job.publishedAt)}</span>}
        {onSave && (
          <button onClick={() => onSave(job)} className="btn-ghost p-2" aria-label={job.saved ? 'Remove from saved' : 'Save job'} aria-pressed={!!job.saved}>
            {job.saved ? <BookmarkCheck className="h-5 w-5 text-teal-600" /> : <Bookmark className="h-5 w-5" />}
          </button>
        )}
      </div>
    </article>
  );
}

export function Pager({ page, total, size, onPage }) {
  const pages = Math.ceil(total / size); if (pages <= 1) return null;
  return (
    <nav className="mt-6 flex items-center justify-center gap-2" aria-label="Pagination">
      <button className="btn-outline btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
      <span className="text-sm text-ink-soft">Page {page} of {pages}</span>
      <button className="btn-outline btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
    </nav>
  );
}
