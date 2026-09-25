"use client";
import React from "react";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { CompanyRole, Role } from "@mysupplier/shared";
import { canAccessArea, companyRoleOf, homeForRole, useAuth, COMPANY_ROLE_LABEL, type SupplierArea } from "@/lib/auth";
import { fileUrl } from "@/lib/api";
import { usePageTitle } from "@/lib/hooks";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/format";
import { LoadingBlock, VerificationBadge } from "./ui";

export interface NavItem {
  href: string;
  labelKey: TranslationKey;
  exact?: boolean;
  icon: React.ReactNode;
  /** Small pill rendered after the label, e.g. "AI". */
  badge?: string;
  /** Group heading (translation key); consecutive items with the same group are rendered under one heading. */
  group?: TranslationKey;
  /** Supplier-portal area used for company-role gating (see canAccessArea). */
  area?: SupplierArea;
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
  sparkle: <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />,
  receipt: <path strokeLinecap="round" strokeLinejoin="round" d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185zM9.75 9h.008v.008H9.75V9zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 4.5h.008v.008h-.008V13.5zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />,
  megaphone: <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" />,
  user: <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />,
  archive: <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />,
  pin: <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />,
  shield: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />,
  wallet: <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />,
  chart: <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />,
  star: <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />,
  ticket: <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" />,
  inbox: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z" />,
  card: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />,
  clock: <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />,
  cog: <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />,
  storefront: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />,
  truck: <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />,
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
  { href: "/dashboard/quotations", labelKey: "dash.quotations", icon: <Icon>{I.receipt}</Icon>, badge: "AI" },
  { href: "/dashboard/orders", labelKey: "dash.orders", icon: <Icon>{I.box}</Icon> },
  { href: "/dashboard/notifications", labelKey: "dash.notifications", icon: <Icon>{I.bell}</Icon> },
  { href: "/account", labelKey: "nav.account", icon: <Icon>{I.user}</Icon> },
];

export const supplierNav: NavItem[] = [
  { href: "/supplier", labelKey: "dash.overview", exact: true, icon: <Icon>{I.home}</Icon>, area: "overview" },
  { href: "/supplier/products", labelKey: "sup.products", icon: <Icon>{I.grid}</Icon>, group: "sup.group.sell", area: "sell" },
  { href: "/supplier/marketplace", labelKey: "sup.marketplace", icon: <Icon>{I.store}</Icon>, group: "sup.group.sell", area: "sell" },
  { href: "/supplier/bids", labelKey: "sup.bids", icon: <Icon>{I.gavel}</Icon>, group: "sup.group.sell", area: "sell" },
  { href: "/supplier/prices", labelKey: "sup.prices", icon: <Icon>{I.tag}</Icon>, group: "sup.group.sell", area: "sell" },
  { href: "/supplier/imports", labelKey: "sup.imports", icon: <Icon>{I.sparkle}</Icon>, badge: "AI", group: "sup.group.sell", area: "sell" },
  { href: "/supplier/catalog", labelKey: "sup.catalog", icon: <Icon>{I.cart}</Icon>, group: "sup.group.sell", area: "sell" },
  { href: "/supplier/orders", labelKey: "sup.orders", icon: <Icon>{I.box}</Icon>, group: "sup.group.operations", area: "orders" },
  { href: "/supplier/inventory", labelKey: "sup.inventory", icon: <Icon>{I.archive}</Icon>, group: "sup.group.operations", area: "inventory" },
  { href: "/supplier/branches", labelKey: "sup.branches", icon: <Icon>{I.pin}</Icon>, group: "sup.group.operations", area: "branches" },
  { href: "/supplier/company", labelKey: "sup.company", icon: <Icon>{I.storefront}</Icon>, group: "sup.group.company", area: "company" },
  { href: "/supplier/team", labelKey: "sup.team", icon: <Icon>{I.users}</Icon>, group: "sup.group.company", area: "team" },
  { href: "/supplier/documents", labelKey: "sup.documents", icon: <Icon>{I.shield}</Icon>, group: "sup.group.company", area: "documents" },
  { href: "/supplier/finance", labelKey: "sup.finance", icon: <Icon>{I.wallet}</Icon>, group: "sup.group.company", area: "finance" },
  { href: "/supplier/notifications", labelKey: "dash.notifications", icon: <Icon>{I.bell}</Icon>, area: "notifications" },
  { href: "/account", labelKey: "nav.account", icon: <Icon>{I.user}</Icon>, area: "account" },
];

/** Items of the supplier nav visible to a given company role. */
export function navForRole(items: NavItem[], role: CompanyRole): NavItem[] {
  return items.filter((item) => !item.area || canAccessArea(role, item.area));
}

export const adminNav: NavItem[] = [
  { href: "/admin", labelKey: "dash.overview", exact: true, icon: <Icon>{I.home}</Icon>, group: "admin.group.overview" },
  { href: "/admin/reports", labelKey: "admin.reports", icon: <Icon>{I.chart}</Icon>, group: "admin.group.overview" },
  { href: "/admin/orders", labelKey: "admin.orders", icon: <Icon>{I.box}</Icon>, group: "admin.group.commerce" },
  { href: "/admin/payments", labelKey: "admin.payments", icon: <Icon>{I.card}</Icon>, group: "admin.group.commerce" },
  { href: "/admin/coupons", labelKey: "admin.coupons", icon: <Icon>{I.ticket}</Icon>, group: "admin.group.commerce" },
  { href: "/admin/reviews", labelKey: "admin.reviews", icon: <Icon>{I.star}</Icon>, group: "admin.group.commerce" },
  { href: "/admin/support", labelKey: "admin.support", icon: <Icon>{I.inbox}</Icon>, group: "admin.group.commerce" },
  { href: "/admin/materials", labelKey: "admin.materials", icon: <Icon>{I.grid}</Icon>, group: "admin.group.catalogue" },
  { href: "/admin/categories", labelKey: "admin.categories", icon: <Icon>{I.tag}</Icon>, group: "admin.group.catalogue" },
  { href: "/admin/imports", labelKey: "admin.imports", icon: <Icon>{I.sparkle}</Icon>, badge: "AI", group: "admin.group.catalogue" },
  { href: "/admin/outreach", labelKey: "admin.outreach", icon: <Icon>{I.megaphone}</Icon>, group: "admin.group.catalogue" },
  { href: "/admin/feeds", labelKey: "admin.feeds", icon: <Icon>{I.rss}</Icon>, group: "admin.group.catalogue" },
  { href: "/admin/users", labelKey: "admin.users", icon: <Icon>{I.users}</Icon>, group: "admin.group.partners" },
  { href: "/admin/companies", labelKey: "admin.companies", icon: <Icon>{I.building}</Icon>, group: "admin.group.partners" },
  { href: "/admin/payouts", labelKey: "admin.payouts", icon: <Icon>{I.wallet}</Icon>, group: "admin.group.partners" },
  { href: "/admin/shipping", labelKey: "admin.shipping", icon: <Icon>{I.truck}</Icon>, group: "admin.group.partners" },
  { href: "/admin/announcements", labelKey: "admin.announcements", icon: <Icon>{I.bell}</Icon>, group: "admin.group.system" },
  { href: "/admin/audit", labelKey: "admin.audit", icon: <Icon>{I.clock}</Icon>, group: "admin.group.system" },
  { href: "/admin/settings", labelKey: "admin.settings", icon: <Icon>{I.cog}</Icon>, group: "admin.group.system" },
];

interface SidebarLayoutProps {
  items: NavItem[];
  /** Roles allowed to view this area. ADMIN can view all areas. */
  allow: Role[];
  title: string;
  children: React.ReactNode;
}

export function SidebarLayout({ items: allItems, allow, title, children }: SidebarLayoutProps) {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const permitted = !!user && (allow.includes(user.role) || user.role === "ADMIN");
  const companyRole = companyRoleOf(user);
  const isSupplierArea = user?.role === "SUPPLIER" && allow.includes("SUPPLIER");
  const items = isSupplierArea ? navForRole(allItems, companyRole) : allItems;
  const activeItem = items.find((item) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`)));
  usePageTitle(activeItem ? `${t(activeItem.labelKey)} · ${title}` : title);

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
    <nav className="flex flex-col gap-0.5" aria-label={title}>
      {items.map((item, index) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const previous = index > 0 ? items[index - 1] : undefined;
        const showGroup = item.group && item.group !== previous?.group;
        const groupEnded = !item.group && previous?.group;
        return (
          <React.Fragment key={item.href}>
            {showGroup && item.group && (
              <p className="mb-1 mt-3 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 first:mt-0">{t(item.group)}</p>
            )}
            {groupEnded && <span className="my-2 block h-px bg-slate-100" aria-hidden />}
            <Link
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                active ? "bg-brand-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              )}
            >
              {item.icon}
              <span className="flex-1">{t(item.labelKey)}</span>
              {item.badge && (
                <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide", active ? "bg-white/20 text-white" : "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-600/20")}>
                  {item.badge}
                </span>
              )}
            </Link>
          </React.Fragment>
        );
      })}
    </nav>
  );

  const company = user.company ?? null;
  const logo = fileUrl(company?.logoUrl ?? null);
  const verificationStatus = company ? company.verificationStatus ?? (company.verified ? "VERIFIED" : "PENDING") : null;
  const header = isSupplierArea && company ? (
    <div className="mb-3 flex items-center gap-3 px-2 pt-1">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="h-10 w-10 shrink-0 rounded-xl border border-slate-200 bg-white object-contain" />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-sm font-semibold text-white">{company.name.slice(0, 2).toUpperCase()}</span>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900" title={company.name}>{company.name}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1">
          {verificationStatus && <VerificationBadge status={verificationStatus} />}
          <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{COMPANY_ROLE_LABEL[companyRole]}</span>
        </div>
      </div>
    </div>
  ) : (
    <div className="mb-3 px-3 pt-1">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      <p className="truncate text-sm font-medium text-slate-900">{user.company?.name ?? user.name}</p>
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <aside className="hidden w-60 shrink-0 lg:block">
        <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-card">
          {header}
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
