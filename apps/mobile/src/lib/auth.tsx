import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { CompanyRole, LoginPayload, RegisterPayload, User } from "@mysupplier/shared";
import { api, getStoredToken, setStoredToken, ApiRequestError } from "./api";
import { registerForPushAsync, unregisterPushAsync } from "./push";

interface AuthContextValue {
  token: string | null;
  user: User | null;
  /** true while reading SecureStore + fetching /auth/me on startup */
  loading: boolean;
  isAuthenticated: boolean;
  isBuyer: boolean;
  isSupplier: boolean;
  /** Role inside the supplier company (`/auth/me` `companyRole`); missing means OWNER. */
  companyRole: CompanyRole;
  /** OWNER / MANAGER: may edit the company profile, see finance and manage the team. */
  canManageCompany: boolean;
  login: (payload: LoginPayload) => Promise<User>;
  register: (payload: RegisterPayload) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** `companyRole` is only present on newer API responses; older ones are treated as OWNER. */
export function companyRoleOf(user: User | null | undefined): CompanyRole {
  const role = (user as (User & { companyRole?: CompanyRole | null }) | null | undefined)?.companyRole;
  return role ?? "OWNER";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Bootstrap: read token from SecureStore, then validate it with /auth/me.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await getStoredToken();
        if (!stored) return;
        if (cancelled) return;
        setToken(stored);
        try {
          const me = await api.me();
          if (!cancelled) setUser(me);
          // Best-effort: (re)register this device for push on every app start.
          void registerForPushAsync(stored);
        } catch (err) {
          // Only drop the token when the server says it is invalid; keep it on
          // network errors so an offline start does not log the user out.
          if (err instanceof ApiRequestError && (err.status === 401 || err.status === 403)) {
            await setStoredToken(null);
            if (!cancelled) setToken(null);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyAuth = useCallback(async (nextToken: string, nextUser: User) => {
    await setStoredToken(nextToken);
    setToken(nextToken);
    setUser(nextUser);
    void registerForPushAsync(nextToken);
  }, []);

  const login = useCallback(
    async (payload: LoginPayload) => {
      const res = await api.login(payload);
      await applyAuth(res.token, res.user);
      return res.user;
    },
    [applyAuth],
  );

  const register = useCallback(
    async (payload: RegisterPayload) => {
      const res = await api.register(payload);
      await applyAuth(res.token, res.user);
      return res.user;
    },
    [applyAuth],
  );

  const logout = useCallback(async () => {
    // Remove the push token while the JWT is still valid, then drop the session.
    await unregisterPushAsync();
    await setStoredToken(null);
    setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!token) return null;
    try {
      const me = await api.me();
      setUser(me);
      return me;
    } catch {
      return null;
    }
  }, [token]);

  const value = useMemo<AuthContextValue>(() => {
    const companyRole = companyRoleOf(user);
    return {
      token,
      user,
      loading,
      isAuthenticated: Boolean(token && user),
      isBuyer: user?.role === "BUYER" || user?.role === "ADMIN",
      isSupplier: user?.role === "SUPPLIER",
      companyRole,
      canManageCompany: companyRole === "OWNER" || companyRole === "MANAGER",
      login,
      register,
      logout,
      refreshUser,
      setUser,
    };
  }, [token, user, loading, login, register, logout, refreshUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
