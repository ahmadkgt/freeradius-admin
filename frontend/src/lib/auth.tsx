import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api";

const TOKEN_STORAGE_KEY = "freeradius-admin-token";
const USERNAME_STORAGE_KEY = "freeradius-admin-username";

export interface AuthUser {
  username: string;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function clearStoredAuth(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(USERNAME_STORAGE_KEY);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [user, setUser] = useState<AuthUser | null>(() => {
    const u = localStorage.getItem(USERNAME_STORAGE_KEY);
    return u ? { username: u } : null;
  });
  const [loading, setLoading] = useState<boolean>(!!getStoredToken());

  // Validate the token on first load by hitting /auth/me.
  useEffect(() => {
    let cancelled = false;
    const stored = getStoredToken();
    if (!stored) {
      setLoading(false);
      return;
    }
    api
      .get<{ username: string }>("/auth/me")
      .then((res) => {
        if (cancelled) return;
        setUser({ username: res.data.username });
        localStorage.setItem(USERNAME_STORAGE_KEY, res.data.username);
      })
      .catch(() => {
        if (cancelled) return;
        clearStoredAuth();
        setToken(null);
        setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Listen for the global "auth:logout" event raised by the axios 401 interceptor.
  useEffect(() => {
    const handler = () => {
      clearStoredAuth();
      setToken(null);
      setUser(null);
    };
    window.addEventListener("auth:logout", handler);
    return () => window.removeEventListener("auth:logout", handler);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.post<{ access_token: string; username: string }>("/auth/login", {
      username,
      password,
    });
    localStorage.setItem(TOKEN_STORAGE_KEY, res.data.access_token);
    localStorage.setItem(USERNAME_STORAGE_KEY, res.data.username);
    setToken(res.data.access_token);
    setUser({ username: res.data.username });
  }, []);

  const logout = useCallback(() => {
    clearStoredAuth();
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ token, user, loading, login, logout }),
    [token, user, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
