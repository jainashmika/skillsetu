// Thin fetch wrapper: JWT, guest id for anonymous analytics, JSON errors with field details.
const TOKEN = 'ss_token';
export const getToken = () => { try { return localStorage.getItem(TOKEN); } catch { return null; } };
export const setToken = (t) => { try { t ? localStorage.setItem(TOKEN, t) : localStorage.removeItem(TOKEN); } catch { /* storage unavailable */ } };
function guestId() {
  try { let g = localStorage.getItem('ss_guest'); if (!g) { g = crypto.randomUUID(); localStorage.setItem('ss_guest', g); } return g; } catch { return 'anon'; }
}
export class ApiError extends Error { constructor(status, body) { super(body?.message || 'Request failed'); this.status = status; this.body = body; this.fields = body?.fields || (body?.details?.field ? { [body.details.field]: body.message } : {}); } }

export async function api(path, { method = 'GET', body, form, raw } = {}) {
  const headers = { 'X-Guest-Id': guestId() };
  const t = getToken(); if (t) headers.Authorization = `Bearer ${t}`;
  let payload;
  if (form) payload = form; else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  let res;
  try { res = await fetch(`/api${path}`, { method, headers, body: payload }); }
  catch { throw new ApiError(0, { message: 'You appear to be offline. Check your connection and try again.' }); }
  if (raw) { if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({}))); return res; }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && t && !path.startsWith('/auth/login')) { setToken(null); window.dispatchEvent(new Event('ss:logout')); }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}
export const qs = (o) => { const p = new URLSearchParams(); Object.entries(o).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, v); }); const s = p.toString(); return s ? `?${s}` : ''; };
export async function download(path, filename) {
  const res = await api(path, { raw: true }); const blob = await res.blob();
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export const inr = (n) => (n == null ? null : n >= 100000 ? `₹${(n / 100000).toFixed(n % 100000 ? 1 : 0)}L` : `₹${Math.round(n / 1000)}k`);
export const ctc = (a, b) => (a || b ? `${inr(a) || ''}${b && b !== a ? `–${inr(b)}` : ''} /yr` : 'Not disclosed');
export const ago = (d) => { if (!d) return ''; const s = (Date.now() - new Date(`${d.replace(' ', 'T')}Z`).getTime()) / 1000; if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`; if (s < 86400) return `${Math.round(s / 3600)}h ago`; return `${Math.round(s / 86400)}d ago`; };
export const LABEL = {
  full_time: 'Full-time', part_time: 'Part-time', contract: 'Contract', internship: 'Internship', apprenticeship: 'Apprenticeship',
  onsite: 'On-site', remote: 'Remote', hybrid: 'Hybrid', applied: 'Applied', shortlisted: 'Shortlisted', interview: 'Interview', offered: 'Offered', hired: 'Hired', rejected: 'Not selected', withdrawn: 'Withdrawn',
  draft: 'Draft', active: 'Active', paused: 'Paused', expired: 'Expired', archived: 'Archived',
};
