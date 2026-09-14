"use client";
import React from "react";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Role } from "@mysupplier/shared";
import { homeForRole, useAuth } from "@/lib/auth";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/format";
import { LoadingBlock } from "./ui";

export interface NavItem {
  href: string;
  labelKey: TranslationKey;
  exact?: boolean;
  icon: React.ReactNode;
}

const I = {
  home: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />,
  doc: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6M7.5 3.75h9A1.5 1.5 0 0118 5.25v13.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 016 18.75V5.25a1.5 1.5 0 011.5-1.5z" />,
  plus: <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />,
  box: <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />,
  bell: <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />,
  store: <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72" />,
  gavel: <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971z" />,
  tag: <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z M6 6h.008v.008H6V6z" />,
  users: <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />,
  building: <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />,
  grid: <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />,
  upload: <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />,
  cart: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />,
  rss: <path strokeLinecap="round" strokeLinejoin="round" d="M12.75 19.5v-.75a7.5 7.5 0 00-7.5-7.5H4.5m0-6.75h.75c7.87 0 14.25 6.38 14.25 14.25v.75M6 18.75a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />,
};

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5 shrink-0" aria-hidden>
      {children}
    </svg>
  );
}

export const buyerNav: NavItem[] = [
  { href: "/dashboard", labelKey: "dash.overview", exact: true, icon: <Icon>{I.home}</Icon> },
  { href: "/dashboard/rfqs", labelKey: "dash.rfqs", icon: <Icon>{I.doc}</Icon> },
  { href: "/dashboard/rfqs/new", labelKey: "dash.newRfq", exact: true, icon: <Icon>{I.plus}</Icon> },
  { href: "/dashboard/orders", labelKey: "dash.orders", icon: <Icon>{I.box}</Icon> },
  { href: "/dashboard/notifications", labelKey: "dash.notifications", icon: <Icon>{I.bell}</Icon> },
];

export const supplierNav: NavItem[] = [
  { href: "/supplier", labelKey: "dash.overview", exact: true, icon: <Icon>{I.home}</Icon> },
  { href: "/supplier/marketplace", labelKey: "sup.marketplace", icon: <Icon>{I.store}</Icon> },
  { href: "/supplier/bids", labelKey: "sup.bids", icon: <Icon>{I.gavel}</Icon> },
  { href: "/supplier/prices", labelKey: "sup.prices", icon: <Icon>{I.tag}</Icon> },
  { href: "/supplier/catalog", labelKey: "sup.catalog", icon: <Icon>{I.cart}</Icon> },
  { href: "/supplier/orders", labelKey: "sup.orders", icon: <Icon>{I.box}</Icon> },
  { href: "/supplier/notifications", labelKey: "dash.notifications", icon: <Icon>{I.bell}</Icon> },
];

export const adminNav: NavItem[] = [
  { href: "/admin", labelKey: "dash.overview", exact: true, icon: <Icon>{I.home}</Icon> },
  { href: "/admin/users", labelKey: "admin.users", icon: <Icon>{I.users}</Icon> },
  { href: "/admin/companies", labelKey: "admin.companies", icon: <Icon>{I.building}</Icon> },
  { href: "/admin/materials", labelKey: "admin.materials", icon: <Icon>{I.grid}</Icon> },
  { href: "/admin/categories", labelKey: "admin.categories", icon: <Icon>{I.tag}</Icon> },
  { href: "/admin/imports", labelKey: "admin.imports", icon: <Icon>{I.upload}</Icon> },
  { href: "/admin/feeds", labelKey: "admin.feeds", icon: <Icon>{I.rss}</Icon> },
];

interface SidebarLayoutProps {
  items: NavItem[];
  /** Roles allowed to view this area. ADMIN can view all areas. */
  allow: Role[];
  title: string;
  children: React.ReactNode;
}

export function SidebarLayout({ items, allow, title, children }: SidebarLayoutProps) {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const permitted = !!user && (allow.includes(user.role) || user.role === "ADMIN");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    } else if (!permitted) {
      router.replace(homeForRole(user.role));
    }
  }, [loading, user, permitted, router, pathname]);

  useEffect(() => setOpen(false), [pathname]);

  if (loading || !user || !permitted) {
    return <LoadingBlock label={t("common.loading")} className="min-h-[60vh]" />;
  }

  const navList = (
    <nav className="flex flex-col gap-1" aria-label={title}>
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
              active ? "bg-brand-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
          >
            {item.icon}
            {t(item.labelKey)}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <aside className="hidden w-60 shrink-0 lg:block">
        <div className="sticky top-24 rounded-xl border border-slate-200 bg-white p-3 shadow-card">
          <div className="mb-3 px-3 pt-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</p>
            <p className="truncate text-sm font-medium text-slate-900">{user.company?.name ?? user.name}</p>
          </div>
          {navList}
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="mb-4 lg:hidden">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-card"
            aria-expanded={open}
          >
            {title} menu
            <svg viewBox="0 0 20 20" fill="currentColor" className={cn("h-4 w-4 transition", open && "rotate-180")} aria-hidden>
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </button>
          {open && <div className="mt-2 rounded-xl border border-slate-200 bg-white p-2 shadow-card">{navList}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}
