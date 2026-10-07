import { Link, useParams } from 'react-router-dom';
import { Newspaper } from 'lucide-react';
import { api } from '../lib/api';
import { useAsync, Spinner, ErrorBox, Empty } from '../components/ui';

const date = (d) => new Date(`${d.replace(' ', 'T')}Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
export function NewsList() {
  const { data, loading } = useAsync(() => api('/public/news'), []);
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-4xl font-semibold">News and updates</h1>
      <p className="mt-2 text-ink-soft">Schemes, hiring trends and guides. Signed-in job seekers see stories about their skills first.</p>
      {loading && !data ? <Spinner /> : data?.items.length ? (
        <div className="mt-8 grid gap-4 md:grid-cols-2">{data.items.map((n) => (
          <Link key={n.id} to={`/news/${n.slug}`} className="card p-6 hover:border-teal-500">
            <div className="flex gap-2"><span className="chip-gold">{n.category}</span>{n.relevant && <span className="chip-teal">For you</span>}</div>
            <h2 className="mt-3 text-xl font-semibold">{n.title}</h2><p className="mt-2 text-sm text-ink-soft">{n.summary}</p><p className="mt-3 text-xs text-ink-faint">{date(n.published_at)}</p>
          </Link>))}</div>
      ) : <div className="mt-8"><Empty icon={Newspaper} title="No news yet" /></div>}
    </div>
  );
}
export function NewsArticle() {
  const { slug } = useParams(); const { data, error, loading } = useAsync(() => api(`/public/news/${slug}`), [slug]);
  if (loading && !data) return <Spinner />;
  if (error) return <div className="mx-auto max-w-3xl p-6"><ErrorBox error={error} /></div>;
  const a = data.article;
  return (
    <article className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Link to="/news" className="text-sm text-ink-faint hover:text-ink">All news</Link>
      <span className="chip-gold mt-4">{a.category}</span>
      <h1 className="mt-3 text-4xl font-semibold leading-tight">{a.title}</h1>
      <p className="mt-2 text-sm text-ink-faint">{date(a.published_at)}</p>
      <div className="mt-8 whitespace-pre-line text-lg leading-relaxed text-ink-soft">{a.body}</div>
      {a.tags.length > 0 && <div className="mt-8 flex flex-wrap gap-2">{a.tags.map((t) => <Link key={t} to={`/jobs?q=${encodeURIComponent(t)}`} className="chip hover:bg-teal-50">{t}</Link>)}</div>}
    </article>
  );
}
