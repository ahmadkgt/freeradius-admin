import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, type AdminMe, type Permission } from "./api";

const TOKEN_STORAGE_KEY = "freeradius-admin-token";
const USERNAME_STORAGE_KEY = "freeradius-admin-username";

export interface AuthUser {
  username: string;
  is_root?: boolean;
  effective_permissions?: string[];
  id?: number;
  full_name?: string | null;
  parent_id?: number | null;
  balance?: string;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  hasPermission: (perm: Permission) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function clearStoredAuth(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(USERNAME_STORAGE_KEY);
}

function meToUser(me: AdminMe): AuthUser {
  return {
    id: me.id,
    username: me.username,
    full_name: me.full_name,
    is_root: me.is_root,
    parent_id: me.parent_id,
    balance: me.balance,
    effective_permissions: me.effective_permissions ?? [],
  };
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
      .get<AdminMe>("/auth/me")
      .then((res) => {
        if (cancelled) return;
        const next = meToUser(res.data);
        setUser(next);
        localStorage.setItem(USERNAME_STORAGE_KEY, next.username);
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
    // Hydrate full /me asynchronously so permissions are available right after login.
    try {
      const me = await api.get<AdminMe>("/auth/me");
      setUser(meToUser(me.data));
    } catch {
      // Ignore — /me will be retried on next mount.
    }
  }, []);

  const logout = useCallback(() => {
    clearStoredAuth();
    setToken(null);
    setUser(null);
  }, []);

  const hasPerm = useCallback(
    (perm: Permission): boolean => {
      const list = user?.effective_permissions;
      if (!list) return false;
      if (list.includes("*")) return true;
      return list.includes(perm);
    },
    [user],
  );

  const value = useMemo<AuthState>(
    () => ({ token, user, loading, login, logout, hasPermission: hasPerm }),
    [token, user, loading, login, logout, hasPerm],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
