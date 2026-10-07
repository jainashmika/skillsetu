import { useState } from 'react';
import { HelpCircle, Newspaper, Pencil, Plus, Trash2, Video } from 'lucide-react';
import { api, ago } from '../../lib/api';
import { useAsync, useToast, Spinner, ErrorBox, Empty, Field, Modal, Tabs } from '../../components/ui';
import { PageHead } from '../../components/Layout';

const blankNews = { title: '', summary: '', body: '', category: 'Update', tags: '', status: 'draft' };
const blankFaq = { question: '', answer: '', category: 'General', context: '', video_url: '' };

function useCrud(base, reload) {
  const toast = useToast();
  const [edit, setEdit] = useState(null);
  const save = async (e, body) => {
    e.preventDefault();
    try { await api(edit.id ? `${base}/${edit.id}` : base, { method: edit.id ? 'PUT' : 'POST', body }); toast(edit.id ? 'Changes saved' : 'Created'); setEdit(null); reload(); }
    catch (err) { setEdit((x) => ({ ...x, _err: err.fields || {}, _msg: err.message })); }
  };
  const remove = async (x, name) => { if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return; try { await api(`${base}/${x.id}`, { method: 'DELETE' }); toast('Deleted'); reload(); } catch (err) { toast(err.message, 'error'); } };
  return { edit, setEdit, save, remove };
}

const Txt = ({ id, label, edit, setEdit, k, area, rows = 3, hint, ...rest }) => (
  <Field id={id} label={label} error={edit._err?.[k]} hint={hint}>
    {area ? <textarea id={id} rows={rows} className="input" value={edit[k] ?? ''} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} {...rest} />
      : <input id={id} className="input" value={edit[k] ?? ''} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} {...rest} />}
  </Field>
);
const Foot = ({ edit, onCancel }) => (<>
  {edit._msg && !Object.keys(edit._err || {}).length && <p className="text-sm text-rose-600" role="alert">{edit._msg}</p>}
  <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button><button className="btn-primary">Save</button></div>
</>);

function News() {
  const s = useAsync(() => api('/admin/news'), []);
  const { edit, setEdit, save, remove } = useCrud('/admin/news', s.reload);
  const submit = (e) => save(e, { title: edit.title, summary: edit.summary || null, body: edit.body, category: edit.category || 'Update', tags: String(edit.tags || '').split(',').map((t) => t.trim()).filter(Boolean), status: edit.status });
  return (
    <div>
      <div className="mb-3 flex justify-end"><button className="btn-primary btn-sm" onClick={() => setEdit({ ...blankNews })}><Plus className="h-3.5 w-3.5" aria-hidden />New article</button></div>
      {s.loading && !s.data ? <Spinner /> : s.error ? <ErrorBox error={s.error} onRetry={s.reload} /> : !s.data.items.length ? <Empty icon={Newspaper} title="No articles yet" /> : (
        <ul className="space-y-3">{s.data.items.map((n) => (
          <li key={n.id} className="card flex flex-wrap items-start gap-3 p-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-semibold">{n.title}</h3><span className={n.status === 'published' ? 'chip-teal' : 'chip-gold'}>{n.status === 'published' ? 'Published' : 'Draft'}</span></div>
              {n.summary && <p className="mt-1 text-sm text-ink-soft">{n.summary}</p>}
              <p className="mt-1.5 text-xs text-ink-faint">{n.category}{n.tags.length ? ` · ${n.tags.join(', ')}` : ''} · {n.author || 'Admin'} · {ago(n.published_at || n.created_at)}</p>
            </div>
            <div className="flex gap-1"><button className="btn-ghost btn-sm" onClick={() => setEdit({ ...n, tags: n.tags.join(', ') })} aria-label={`Edit ${n.title}`}><Pencil className="h-3.5 w-3.5" /></button><button className="btn-ghost btn-sm text-rose-600" onClick={() => remove(n, n.title)} aria-label={`Delete ${n.title}`}><Trash2 className="h-3.5 w-3.5" /></button></div>
          </li>))}</ul>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit article' : 'New article'} wide>
        {edit && (
          <form onSubmit={submit} className="space-y-4">
            <Txt id="nt" label="Title" k="title" edit={edit} setEdit={setEdit} required minLength={5} maxLength={160} />
            <Txt id="ns" label="Summary" k="summary" edit={edit} setEdit={setEdit} area rows={2} maxLength={300} hint="Shown in lists. Up to 300 characters." />
            <Txt id="nb" label="Body" k="body" edit={edit} setEdit={setEdit} area rows={10} required minLength={20} hint="Plain text. Blank lines start new paragraphs." />
            <div className="grid gap-3 sm:grid-cols-3">
              <Txt id="nc" label="Category" k="category" edit={edit} setEdit={setEdit} maxLength={40} />
              <Txt id="ntg" label="Tags" k="tags" edit={edit} setEdit={setEdit} hint="Comma separated" />
              <Field id="nst" label="Status"><select id="nst" className="input" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="draft">Draft</option><option value="published">Published</option></select></Field>
            </div>
            <Foot edit={edit} onCancel={() => setEdit(null)} />
          </form>
        )}
      </Modal>
    </div>
  );
}

function Faq() {
  const s = useAsync(() => api('/admin/faqs'), []);
  const { edit, setEdit, save, remove } = useCrud('/admin/faqs', s.reload);
  const submit = (e) => save(e, { question: edit.question, answer: edit.answer, category: edit.category || 'General', context: edit.context || null, video_url: edit.video_url || '' });
  const groups = (s.data?.items || []).reduce((m, f) => { (m[f.category] = m[f.category] || []).push(f); return m; }, {});
  return (
    <div>
      <div className="mb-3 flex justify-end"><button className="btn-primary btn-sm" onClick={() => setEdit({ ...blankFaq })}><Plus className="h-3.5 w-3.5" aria-hidden />New question</button></div>
      {s.loading && !s.data ? <Spinner /> : s.error ? <ErrorBox error={s.error} onRetry={s.reload} /> : !s.data.items.length ? <Empty icon={HelpCircle} title="No FAQs yet" /> : (
        <div className="space-y-5">{Object.entries(groups).map(([cat, items]) => (
          <section key={cat} aria-label={cat}><h3 className="mb-2 text-sm font-semibold text-ink-soft">{cat} <span className="font-normal text-ink-faint">{items.length}</span></h3>
            <ul className="card divide-y divide-line/70">{items.map((f) => (
              <li key={f.id} className="flex items-start gap-3 p-4">
                <div className="min-w-0 flex-1"><p className="font-medium">{f.question}</p><p className="mt-1 line-clamp-2 text-sm text-ink-soft">{f.answer}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">{f.context && <span className="chip py-0.5">Page: {f.context}</span>}{f.video_url && <span className="chip-teal py-0.5"><Video className="h-3 w-3" aria-hidden />Video</span>}</div></div>
                <div className="flex gap-1"><button className="btn-ghost btn-sm" onClick={() => setEdit({ ...f, context: f.context || '', video_url: f.video_url || '' })} aria-label="Edit question"><Pencil className="h-3.5 w-3.5" /></button><button className="btn-ghost btn-sm text-rose-600" onClick={() => remove(f, f.question)} aria-label="Delete question"><Trash2 className="h-3.5 w-3.5" /></button></div>
              </li>))}</ul></section>))}</div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit question' : 'New question'} wide>
        {edit && (
          <form onSubmit={submit} className="space-y-4">
            <Txt id="fq" label="Question" k="question" edit={edit} setEdit={setEdit} required minLength={5} maxLength={300} />
            <Txt id="fa" label="Answer" k="answer" edit={edit} setEdit={setEdit} area rows={6} required minLength={5} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Txt id="fc" label="Category" k="category" edit={edit} setEdit={setEdit} maxLength={60} />
              <Txt id="fx" label="Page context" k="context" edit={edit} setEdit={setEdit} maxLength={200} hint="Page key for in-context help, for example seeker.profile" />
              <Txt id="fv" label="Video URL" k="video_url" edit={edit} setEdit={setEdit} type="url" placeholder="https://" />
            </div>
            <Foot edit={edit} onCancel={() => setEdit(null)} />
          </form>
        )}
      </Modal>
    </div>
  );
}

export default function Content() {
  const [tab, setTab] = useState('news');
  return (
    <div className="space-y-4">
      <PageHead title="Content" sub="News articles and help centre questions" />
      <Tabs tabs={[['news', 'News'], ['faq', 'FAQ']]} value={tab} onChange={setTab} />
      {tab === 'news' ? <News /> : <Faq />}
    </div>
  );
}
