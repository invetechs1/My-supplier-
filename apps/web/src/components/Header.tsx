"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { homeForRole, useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/format";

export function Logo({ light }: { light?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 11h.01M15 11h.01" />
        </svg>
      </span>
      <span className={cn("text-lg font-semibold tracking-tight", light ? "text-white" : "text-slate-900")}>
        My<span className="text-brand-600">Supplier</span>
      </span>
    </Link>
  );
}

export function LangToggle({ className }: { className?: string }) {
  const { lang, toggle } = useI18n();
  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        "inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50",
        className,
      )}
      aria-label="Toggle language"
      title={lang === "en" ? "التبديل إلى العربية" : "Switch to English"}
    >
      <span className={cn(lang === "en" ? "text-brand-600" : "text-slate-400")}>EN</span>
      <span className="text-slate-300">|</span>
      <span className={cn(lang === "ar" ? "text-brand-600" : "text-slate-400")}>عربي</span>
    </button>
  );
}

export function NotificationBell() {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) {
      setUnread(0);
      return;
    }
    let active = true;
    const load = () =>
      api
        .notifications(true)
        .then((r) => {
          if (active) setUnread(r.unread || r.items.filter((n) => !n.read).length);
        })
        .catch(() => undefined);
    void load();
    const timer = setInterval(load, 60_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [user]);

  if (!user) return null;
  const href = `${homeForRole(user.role)}/notifications`;
  return (
    <Link href={href} className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100" aria-label="Notifications">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
      </svg>
      {unread > 0 && (
        <span className="absolute -end-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-slate-900">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}

export function CartButton({ className }: { className?: string }) {
  const { count } = useCart();
  const { t } = useI18n();
  return (
    <Link
      href="/cart"
      className={cn("relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100", className)}
      aria-label={`${t("nav.cart")}${count ? ` (${count})` : ""}`}
      title={t("nav.cart")}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
      </svg>
      {count > 0 && (
        <span className="absolute -end-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}

export function HeaderSearch({ className, autoFocus }: { className?: string; autoFocus?: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      className={cn("relative", className)}
      onSubmit={(e) => {
        e.preventDefault();
        const term = q.trim();
        router.push(term ? `/shop/products?q=${encodeURIComponent(term)}` : "/shop/products");
      }}
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden>
        <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
      </svg>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("nav.searchPlaceholder")}
        aria-label={t("nav.searchPlaceholder")}
        autoFocus={autoFocus}
        className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 ps-9 pe-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20"
      />
    </form>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (!user) return null;
  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 hover:bg-slate-50"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-[11px] font-semibold text-white">{initials || "U"}</span>
        <span className="hidden max-w-[120px] truncate text-sm font-medium text-slate-700 sm:block">{user.name}</span>
      </button>
      {open && (
        <div role="menu" className="absolute end-0 z-40 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="truncate text-sm font-medium text-slate-900">{user.name}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-brand-600">{user.role}</p>
          </div>
          <Link href={homeForRole(user.role)} className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={() => setOpen(false)}>
            {t("nav.dashboard")}
          </Link>
          <button
            type="button"
            className="block w-full px-4 py-2 text-start text-sm text-red-600 hover:bg-red-50"
            onClick={() => {
              setOpen(false);
              logout();
              router.push("/");
            }}
          >
            {t("nav.logout")}
          </button>
        </div>
      )}
    </div>
  );
}

export function Header() {
  const { t } = useI18n();
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const nav: Array<{ href: string; label: string; highlight?: boolean }> = [
    { href: "/shop", label: t("nav.shop") },
    { href: "/materials", label: t("nav.materials") },
    { href: "/suppliers", label: t("nav.suppliers") },
    { href: "/compare", label: t("nav.compare") },
    { href: "/boq", label: t("nav.boq"), highlight: true },
    { href: "/#how-it-works", label: t("nav.howItWorks") },
  ];

  useEffect(() => setMobileOpen(false), [pathname]);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-6">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {nav.map((item) => {
              const active = pathname === item.href || (item.href !== "/" && !item.href.includes("#") && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm font-medium transition",
                    active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                    item.highlight && !active && "text-brand-700",
                  )}
                >
                  {item.label}
                  {item.highlight && <span className="ms-1.5 rounded-full bg-amber-500 px-1.5 py-px text-[10px] font-bold text-slate-900">NEW</span>}
                </Link>
              );
            })}
          </nav>
        </div>
        <HeaderSearch className="hidden w-full max-w-xs flex-1 lg:block" />
        <div className="flex items-center gap-2">
          <LangToggle className="hidden sm:inline-flex" />
          <CartButton />
          <NotificationBell />
          {!loading && !user && (
            <>
              <Link href="/login" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 sm:block">
                {t("nav.login")}
              </Link>
              <Link href="/register" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700">
                {t("nav.register")}
              </Link>
            </>
          )}
          {user && <UserMenu />}
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 md:hidden"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label="Menu"
            aria-expanded={mobileOpen}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
              {mobileOpen ? <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /> : <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>
      {mobileOpen && (
        <div className="border-t border-slate-200 bg-white px-4 py-3 md:hidden">
          <HeaderSearch className="mb-3" />
          <nav className="flex flex-col gap-1" aria-label="Mobile">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                {item.label}
              </Link>
            ))}
            <Link href="/cart" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
              {t("nav.cart")}
            </Link>
            {!user && (
              <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                {t("nav.login")}
              </Link>
            )}
          </nav>
          <div className="mt-3 flex items-center justify-between">
            <LangToggle />
          </div>
        </div>
      )}
    </header>
  );
}
