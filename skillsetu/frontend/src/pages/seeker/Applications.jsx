import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ClipboardList, MapPin, XCircle } from 'lucide-react';
import { api, ago, LABEL } from '../../lib/api';
import { useAsync, useToast, Spinner, ErrorBox, Empty, Tabs, StatusChip, CompanyMark, MatchRing } from '../../components/ui';
import { PageHead } from '../../components/Layout';

const STAGES = ['applied', 'shortlisted', 'interview', 'offered', 'hired'];
const FILTERS = [['all', 'All'], ['active', 'In progress'], ['shortlisted', 'Shortlisted'], ['interview', 'Interview'], ['offered', 'Offers'], ['closed', 'Closed']];
const matches = (f, s) => f === 'all' || (f === 'active' ? ['applied', 'shortlisted', 'interview', 'offered'].includes(s) : f === 'closed' ? ['hired', 'rejected', 'withdrawn'].includes(s) : f === 'offered' ? ['offered', 'hired'].includes(s) : f === s);

function Timeline({ app }) {
  const ended = ['rejected', 'withdrawn'].includes(app.status);
  // Furthest positive stage reached, from the event history (falls back to current status).
  const reached = Math.max(STAGES.indexOf(app.status), ...app.timeline.map((e) => STAGES.indexOf(e.status)), 0);
  const at = (s) => app.timeline.filter((e) => e.status === s).pop()?.at;
  return (
    <ol className="mt-4 flex items-start" aria-label="Application progress">
      {STAGES.map((s, i) => {
        const done = i <= reached; const current = !ended && i === reached;
        return (
          <li key={s} className="relative flex flex-1 flex-col items-center text-center" aria-current={current ? 'step' : undefined}>
            {i > 0 && <span className={`absolute right-1/2 top-3 h-0.5 w-full ${i <= reached ? (ended ? 'bg-ink-faint/50' : 'bg-teal-500') : 'bg-line'}`} aria-hidden />}
            <span className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 ${done ? (ended ? 'border-ink-faint bg-ink-faint text-white' : 'border-teal-600 bg-teal-600 text-white') : 'border-line bg-white'} ${current ? 'ring-4 ring-teal-100' : ''}`}>
              {done && <Check className="h-3.5 w-3.5" aria-hidden />}
            </span>
            <span className={`mt-1.5 text-[11px] leading-tight sm:text-xs ${current ? 'font-semibold text-teal-700' : done ? 'text-ink' : 'text-ink-faint'}`}>{LABEL[s]}</span>
            {done && at(s) && <span className="hidden text-[10px] text-ink-faint sm:block">{ago(at(s))}</span>}
            <span className="sr-only">{done ? 'reached' : 'not reached'}</span>
          </li>
        );
      })}
      {ended && (
        <li className="relative flex flex-1 flex-col items-center text-center">
          <span className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full ${app.status === 'rejected' ? 'bg-rose-600' : 'bg-ink-soft'} text-white`}><XCircle className="h-4 w-4" aria-hidden /></span>
          <span className={`mt-1.5 text-[11px] font-semibold sm:text-xs ${app.status === 'rejected' ? 'text-rose-600' : 'text-ink-soft'}`}>{LABEL[app.status]}</span>
        </li>
      )}
    </ol>
  );
}

export default function Applications() {
  const toast = useToast();
  const { data, loading, error, reload, setData } = useAsync(() => api('/seeker/applications'), []);
  const [tab, setTab] = useState('all');
  const [busy, setBusy] = useState(null);

  const withdraw = async (a) => {
    if (!window.confirm(`Withdraw your application for ${a.title}? This cannot be undone.`)) return;
    setBusy(a.id);
    try {
      await api(`/seeker/applications/${a.id}/withdraw`, { method: 'POST' });
      setData((d) => ({ ...d, items: d.items.map((x) => (x.id === a.id ? { ...x, status: 'withdrawn', timeline: [...x.timeline, { status: 'withdrawn', note: 'Withdrawn by candidate', at: new Date().toISOString().slice(0, 19).replace('T', ' ') }] } : x)) }));
      toast('Application withdrawn');
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(null); }
  };

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const items = data.items; const shown = items.filter((a) => matches(tab, a.status));

  return (
    <div>
      <PageHead title="My applications" sub="Track where each application stands." action={<Link to="/jobs" className="btn-outline">Find more jobs</Link>} />
      {!items.length ? (
        <Empty icon={ClipboardList} title="No applications yet" action={<Link to="/jobs" className="btn-primary">Browse jobs</Link>}>When you apply for a job, you can follow its progress here.</Empty>
      ) : (
        <>
          <Tabs tabs={FILTERS.map(([k, l]) => [k, l, items.filter((a) => matches(k, a.status)).length])} value={tab} onChange={setTab} />
          <div className="mt-4 space-y-3">
            {!shown.length && <p className="py-8 text-center text-sm text-ink-soft">No applications in this view.</p>}
            {shown.map((a) => {
              const last = a.timeline[a.timeline.length - 1];
              const canWithdraw = !['hired', 'withdrawn', 'rejected'].includes(a.status);
              return (
                <article key={a.id} className={`card p-4 sm:p-5 ${['rejected', 'withdrawn'].includes(a.status) ? 'opacity-80' : ''}`}>
                  <div className="flex gap-4">
                    <CompanyMark name={a.company} logo={a.logo} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold sm:text-lg"><Link to={`/jobs/${a.jobId}`} className="hover:text-teal-700">{a.title}</Link></h2>
                        <StatusChip s={a.status} />
                      </div>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-ink-soft">
                        <span>{a.company}</span>
                        <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden />{a.workFormat === 'remote' ? 'Remote' : a.city}</span>
                        <span>Applied {ago(a.createdAt)}</span>
                        {a.jobStatus !== 'active' && <span className="chip py-0.5">Job {LABEL[a.jobStatus]?.toLowerCase() || a.jobStatus}</span>}
                      </p>
                    </div>
                    {a.matchScore != null && <MatchRing score={a.matchScore} />}
                  </div>
                  <Timeline app={a} />
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                    <p className="text-sm text-ink-soft">{last ? <>Latest: {last.note || LABEL[last.status]} <span className="text-ink-faint">· {ago(last.at)}</span></> : `Updated ${ago(a.updatedAt)}`}</p>
                    {canWithdraw && <button className="btn-ghost btn-sm text-rose-600" onClick={() => withdraw(a)} disabled={busy === a.id}>{busy === a.id ? 'Withdrawing…' : 'Withdraw'}</button>}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
