import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  clearToken,
  getStoredUser,
  getToken,
  setStoredUser,
  setToken,
} from '../api/client';
import * as api from '../api/endpoints';
import type { User } from '../api/endpoints';

export interface AuthState {
  user: User | null;
  token: string | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  // Re-fetch /auth/me and update the in-memory user. Call after a profile
  // edit (avatar upload, username change, etc.) so subscribers like the
  // Topbar avatar re-render with fresh data without a full reload.
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => getStoredUser<User>());
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const t = getToken();
      if (!t) {
        if (!cancelled) setReady(true);
        return;
      }
      try {
        const fresh = await api.me();
        if (cancelled) return;
        setUser(fresh);
        setStoredUser(fresh);
      } catch {
        if (cancelled) return;
        clearToken();
        setUser(null);
        setTokenState(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.login({ username, password });
    setToken(res.access_token);
    setStoredUser(res.user);
    setTokenState(res.access_token);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    setTokenState(null);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!getToken()) return;
    try {
      const fresh = await api.me();
      setUser(fresh);
      setStoredUser(fresh);
    } catch {
      // Swallow — surface state mismatch on the next protected nav instead
      // of breaking the in-progress save flow.
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, ready, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}
