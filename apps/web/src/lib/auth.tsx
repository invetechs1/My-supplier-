"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AuthResponse, CompanyRole, Role, User } from "@mysupplier/shared";
import { api, getToken, setToken as persistToken, type AppUser } from "./api";

interface AuthContextValue {
  user: AppUser | null;
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

/**
 * Accept a `next` / `redirect` query value only when it is a same-origin relative path
 * (`/dashboard?x=1#y`). Absolute URLs, protocol-relative `//host`, `/\host` and `javascript:` are rejected.
 */
export function safeNext(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  try {
    const url = new URL(value, "http://x");
    if (url.origin !== "http://x") return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

/** Per-user browser state cleared on logout (keys owned by lib/cart.tsx, app/boq, components/shop/ProductReviews.tsx). */
const USER_STORAGE_KEYS = ["ms_cart", "ms_boq_draft", "ms_helpful_reviews", "ms_delivery_city"] as const;

export const COMPANY_ROLES: CompanyRole[] = ["OWNER", "MANAGER", "SALES", "WAREHOUSE"];

export const COMPANY_ROLE_LABEL: Record<CompanyRole, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  SALES: "Sales",
  WAREHOUSE: "Warehouse",
};

export const COMPANY_ROLE_DESCRIPTION: Record<CompanyRole, string> = {
  OWNER: "Full access, including team, finance, bank details and verification documents.",
  MANAGER: "Everything an owner can do except transferring ownership.",
  SALES: "Prices, catalogue, bids, orders and buyer messages. No team, finance or documents.",
  WAREHOUSE: "Inventory, branches and order fulfilment status only.",
};

/** The caller's role inside their company. Older API builds omit it – treat missing as OWNER. */
export function companyRoleOf(user: Pick<AppUser, "companyRole" | "role"> | null | undefined): CompanyRole {
  if (!user) return "OWNER";
  return user.companyRole ?? "OWNER";
}

/** Supplier-portal areas gated by company role. */
export type SupplierArea = "overview" | "sell" | "orders" | "inventory" | "branches" | "company" | "team" | "documents" | "finance" | "notifications" | "account";

const AREA_ROLES: Record<SupplierArea, CompanyRole[]> = {
  overview: ["OWNER", "MANAGER", "SALES", "WAREHOUSE"],
  sell: ["OWNER", "MANAGER", "SALES"],
  orders: ["OWNER", "MANAGER", "SALES", "WAREHOUSE"],
  inventory: ["OWNER", "MANAGER", "SALES", "WAREHOUSE"],
  branches: ["OWNER", "MANAGER", "SALES", "WAREHOUSE"],
  company: ["OWNER", "MANAGER", "SALES"],
  team: ["OWNER", "MANAGER"],
  documents: ["OWNER", "MANAGER"],
  finance: ["OWNER", "MANAGER"],
  notifications: ["OWNER", "MANAGER", "SALES", "WAREHOUSE"],
  account: ["OWNER", "MANAGER", "SALES", "WAREHOUSE"],
};

export function canAccessArea(role: CompanyRole, area: SupplierArea): boolean {
  return AREA_ROLES[area].includes(role);
}

/** OWNER / MANAGER can edit company-level settings; everyone else is read-only. */
export function canManageCompany(role: CompanyRole): boolean {
  return role === "OWNER" || role === "MANAGER";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
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
    try {
      USER_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
    } catch {
      /* ignore storage failures */
    }
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
