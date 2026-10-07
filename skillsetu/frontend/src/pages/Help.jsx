import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HelpCircle, Search } from 'lucide-react';
import { api, qs } from '../lib/api';
import { useAsync, Spinner, Empty } from '../components/ui';

export default function Help() {
  const [sp, setSp] = useSearchParams(); const [q, setQ] = useState(sp.get('q') || ''); const cat = sp.get('category') || '';
  const { data, loading } = useAsync(() => api(`/public/faqs${qs({ q: sp.get('q'), category: cat })}`), [sp.toString()]);
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-4xl font-semibold">Help centre</h1>
      <p className="mt-2 text-ink-soft">Answers about using SkillSetu, your privacy, and Indian labour laws.</p>
      <form className="relative mt-6" role="search" onSubmit={(e) => { e.preventDefault(); setSp(q ? { q } : {}); }}>
        <Search className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-ink-faint" aria-hidden /><label htmlFor="hq" className="sr-only">Search help</label>
        <input id="hq" className="input py-3.5 pl-12 text-base" placeholder="Search, e.g. minimum wage, Aadhaar, verified badge" value={q} onChange={(e) => setQ(e.target.value)} />
      </form>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className={!cat ? 'chip-teal' : 'chip'} onClick={() => setSp({})}>All</button>
        {data?.categories.map((c) => <button key={c.category} className={cat === c.category ? 'chip-teal' : 'chip hover:bg-teal-50'} onClick={() => setSp({ category: c.category })}>{c.category} <span className="text-ink-faint">{c.c}</span></button>)}
      </div>
      <div className="mt-6 space-y-3">
        {loading && !data ? <Spinner /> : data?.items.length ? data.items.map((f) => (
          <details key={f.id} className="card group p-5" open={!!sp.get('q')}>
            <summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-semibold"><span>{f.question}</span><span className="chip shrink-0">{f.category}</span></summary>
            {f.snippet ? <p className="mt-3 text-sm text-ink-soft [&_mark]:bg-marigold-100" dangerouslySetInnerHTML={{ __html: f.snippet.replace(/<(?!\/?mark>)/g, '&lt;') }} /> : null}
            <p className="mt-3 text-sm text-ink-soft">{f.answer}</p>
            {f.video_url && <a href={f.video_url} className="mt-2 inline-block text-sm font-medium text-teal-700 underline">Watch the tutorial</a>}
          </details>
        )) : <Empty icon={HelpCircle} title="No answers found">Try different words, or browse a category.</Empty>}
      </div>
    </div>
  );
}
