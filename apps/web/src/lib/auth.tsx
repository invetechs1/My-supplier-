"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AuthResponse, Role, User } from "@mysupplier/shared";
import { api, getToken, setToken as persistToken } from "./api";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (auth: AuthResponse) => void;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function homeForRole(role: Role | undefined | null): string {
  switch (role) {
    case "ADMIN":
      return "/admin";
    case "SUPPLIER":
      return "/supplier";
    case "BUYER":
      return "/dashboard";
    default:
      return "/";
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const stored = getToken();
    if (!stored) {
      setUser(null);
      setTokenState(null);
      setLoading(false);
      return;
    }
    setTokenState(stored);
    try {
      const me = await api.me();
      setUser(me);
    } catch (err) {
      // Only drop the token if the server rejected it; keep it on network failures.
      const status = (err as { status?: number }).status;
      if (status === 401 || status === 403) {
        persistToken(null);
        setTokenState(null);
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback((auth: AuthResponse) => {
    persistToken(auth.token);
    setTokenState(auth.token);
    setUser(auth.user);
    setLoading(false);
  }, []);

  const logout = useCallback(() => {
    persistToken(null);
    setTokenState(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, token, loading, login, logout, refresh }),
    [user, token, loading, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
