import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api';

const Ctx = createContext(null);
export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: !!getToken(), user: null, company: null, portal: null, unread: 0 });
  const refresh = useCallback(async () => {
    if (!getToken()) { setState({ loading: false, user: null }); return null; }
    try { const me = await api('/auth/me'); setState({ loading: false, ...me }); return me; }
    catch { setToken(null); setState({ loading: false, user: null }); return null; }
  }, []);
  useEffect(() => { refresh(); const f = () => setState({ loading: false, user: null }); window.addEventListener('ss:logout', f); return () => window.removeEventListener('ss:logout', f); }, [refresh]);
  const signIn = async (token) => { setToken(token); return refresh(); };
  const signOut = async () => { try { await api('/auth/logout', { method: 'POST' }); } catch { /* ignore */ } setToken(null); setState({ loading: false, user: null }); };
  return <Ctx.Provider value={{ ...state, refresh, signIn, signOut, setUnread: (n) => setState((s) => ({ ...s, unread: typeof n === 'function' ? n(s.unread) : n })) }}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);
export const homeFor = (role) => ({ seeker: '/seeker', employer: '/employer', portal: '/portal', admin: '/admin' }[role] || '/');
