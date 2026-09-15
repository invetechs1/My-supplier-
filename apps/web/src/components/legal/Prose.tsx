import Link from "next/link";
import React from "react";

/** Shared shell for legal / informational pages (server-compatible: no hooks). */
export function ProsePage({
  title,
  subtitle,
  updated,
  children,
  aside,
}: {
  title: string;
  subtitle?: string;
  updated?: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-2 text-base text-slate-600">{subtitle}</p>}
        {updated && <p className="mt-2 text-xs font-medium uppercase tracking-wide text-slate-400">Last updated {updated}</p>}
      </div>
      <div className={aside ? "grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]" : ""}>
        <article className="prose-ms max-w-3xl">{children}</article>
        {aside && <aside className="space-y-4">{aside}</aside>}
      </div>
    </div>
  );
}

export function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-8 scroll-mt-24">
      <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700 [&_li]:ms-5 [&_li]:list-disc [&_strong]:text-slate-900">{children}</div>
    </section>
  );
}

export function LegalNav() {
  const links = [
    { href: "/terms", label: "Terms of Service" },
    { href: "/privacy", label: "Privacy Policy" },
    { href: "/refund-policy", label: "Refund & Cancellation" },
    { href: "/about", label: "About MySupplier" },
    { href: "/help", label: "Help & FAQ" },
    { href: "/contact", label: "Contact" },
  ];
  return (
    <nav className="rounded-xl border border-slate-200 bg-white p-4 shadow-card" aria-label="Legal">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Legal & trust</p>
      <ul className="space-y-1 text-sm">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="block rounded-lg px-2 py-1.5 text-slate-700 hover:bg-slate-50 hover:text-brand-700">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export const COMPANY = {
  name: "MySupplier",
  legalName: "MySupplier Trading Co. (LLC)",
  city: "Riyadh, Kingdom of Saudi Arabia",
  address: "King Fahd Road, Al Olaya District, Riyadh 12211, Saudi Arabia",
  supportEmail: "support@mysupplier.sa",
  legalEmail: "legal@mysupplier.sa",
  privacyEmail: "privacy@mysupplier.sa",
  phone: "+966 11 000 0000",
  whatsapp: "+966 5X XXX XXXX",
  crNumber: "10XXXXXXXX",
  vatNumber: "3XXXXXXXXXXXXX3",
  hours: "Sunday – Thursday, 9:00 – 18:00 (AST, UTC+3)",
};
