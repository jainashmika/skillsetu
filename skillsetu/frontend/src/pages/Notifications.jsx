import { Link } from 'react-router-dom';
import { Bell, Check, Trash2 } from 'lucide-react';
import { api, ago } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAsync, Spinner, Empty, useToast } from '../components/ui';
import { PageHead } from '../components/Layout';

export default function Notifications() {
  const { setUnread } = useAuth(); const toast = useToast();
  const { data, loading, reload } = useAsync(() => api('/notifications'), []);
  const readAll = async () => { await api('/notifications/read-all', { method: 'POST' }); setUnread(0); reload(); toast('All marked as read'); };
  const read = async (n) => { if (!n.read_at) { await api(`/notifications/${n.id}/read`, { method: 'POST' }); setUnread((u) => Math.max(0, u - 1)); } };
  const del = async (n) => { await api(`/notifications/${n.id}`, { method: 'DELETE' }); if (!n.read_at) setUnread((u) => Math.max(0, u - 1)); reload(); };
  return (
    <>
      <PageHead title="Notifications" sub="Live updates about applications, matches and alerts." action={data?.unread > 0 && <button className="btn-outline btn-sm" onClick={readAll}><Check className="h-4 w-4" />Mark all as read</button>} />
      {loading && !data ? <Spinner /> : data?.items.length ? (
        <ul className="card divide-y divide-line">{data.items.map((n) => (
          <li key={n.id} className={`flex items-start gap-3 p-4 ${n.read_at ? '' : 'bg-teal-50/50'}`}>
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? 'bg-transparent' : 'bg-marigold-500'}`} aria-hidden />
            <div className="min-w-0 flex-1">
              {n.link ? <Link to={n.link} onClick={() => read(n)} className="font-semibold hover:text-teal-700">{n.title}</Link> : <p className="font-semibold">{n.title}</p>}
              {n.body && <p className="text-sm text-ink-soft">{n.body}</p>}<p className="mt-1 text-xs text-ink-faint">{ago(n.created_at)}{!n.read_at && ' · unread'}</p>
            </div>
            <button className="btn-ghost p-2" onClick={() => del(n)} aria-label="Delete notification"><Trash2 className="h-4 w-4" /></button>
          </li>))}</ul>
      ) : <Empty icon={Bell} title="You're all caught up">New matches and application updates will appear here.</Empty>}
    </>
  );
}
