"use client";

import Link from "next/link";
import React from "react";
import { Noto_Naskh_Arabic } from "next/font/google";
import { LEGAL_PATHS, LEGAL_VERSIONS, formatLegalDate, type LegalDocumentKey } from "@mysupplier/shared";
import { useI18n, type Lang, type TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/format";
import { COMPANY } from "./company";

/** Re-exported for client components; server components import "./company" directly (client re-exports are proxied). */
export { COMPANY };

/** Formal Arabic typeface for legal text (the site font has no Arabic glyphs of its own). */
const naskh = Noto_Naskh_Arabic({ subsets: ["arabic"], weight: ["400", "500", "700"], display: "swap" });

/** Class applied to Arabic legal prose: Naskh face, generous leading. */
export const arabicProseClass = cn(naskh.className, "leading-loose");

/** English | العربية switch that drives the site language (shared with the header toggle). */
export function LegalLanguageSwitch({ className }: { className?: string }) {
  const { lang, setLang } = useI18n();
  const item = (value: Lang, label: string) => (
    <button
      type="button"
      onClick={() => setLang(value)}
      aria-pressed={lang === value}
      lang={value}
      className={cn("rounded-md px-2.5 py-1 text-xs font-semibold transition", lang === value ? "bg-brand-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100")}
    >
      {label}
    </button>
  );
  return (
    <div className={cn("inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1", className)} role="group" aria-label="Language">
      {item("en", "English")}
      <span className="text-slate-300" aria-hidden>|</span>
      {item("ar", "العربية")}
    </div>
  );
}

/**
 * Shared shell for legal / informational pages. Renders in the site language: `dir` follows the language, Arabic
 * pages use a Naskh face, and the "Updated … · version …" line reads LEGAL_VERSIONS so the page, the API and the
 * acceptance records always agree.
 */
export function ProsePage({
  doc,
  title,
  subtitle,
  updated,
  children,
  aside,
}: {
  /** Legal document key; prints the version line and marks the page for acceptance tracking. */
  doc?: LegalDocumentKey;
  title: string;
  subtitle?: string;
  /** Free-text date for pages that are not versioned legal documents (about, help). */
  updated?: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  const { lang, t } = useI18n();
  const ar = lang === "ar";
  const version = doc ? LEGAL_VERSIONS[doc] : null;
  return (
    <div dir={ar ? "rtl" : "ltr"} lang={lang} className={cn("mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8", ar && arabicProseClass)}>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <h1 className={cn("font-semibold tracking-tight text-slate-900", ar ? "text-3xl leading-snug" : "text-3xl")}>{title}</h1>
          {subtitle && <p className="mt-2 text-base text-slate-600">{subtitle}</p>}
          {version && (
            <p className="mt-2 text-xs font-medium text-slate-500">
              {t("legal.updated")} {formatLegalDate(version, lang)} · {t("legal.version")} <span dir="ltr" className="font-mono">{version}</span>
            </p>
          )}
          {!version && updated && <p className="mt-2 text-xs font-medium uppercase tracking-wide text-slate-400">{t("legal.updated")} {updated}</p>}
        </div>
        <LegalLanguageSwitch />
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
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700 [&_li]:ms-5 [&_li]:list-disc [&_ol>li]:list-decimal [&_strong]:text-slate-900 [&_a]:font-semibold [&_a]:text-brand-700 [&_a:hover]:underline">{children}</div>
    </section>
  );
}

/** Simple bordered table for legal schedules (fees, returns policy). */
export function LegalTable({ head, rows, className }: { head: React.ReactNode[]; rows: React.ReactNode[][]; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-slate-200", className)}>
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
          <tr>{head.map((h, i) => <th key={i} className="px-3 py-2 text-start align-bottom">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <tr key={i} className="align-top">{r.map((c, j) => <td key={j} className="px-3 py-2 text-slate-700 [&_li]:ms-4 [&_li]:list-disc">{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const NAV: Array<{ href: string; key: TranslationKey }> = [
  { href: LEGAL_PATHS.TERMS, key: "legal.nav.terms" },
  { href: LEGAL_PATHS.PRIVACY, key: "legal.nav.privacy" },
  { href: LEGAL_PATHS.RETURNS_POLICY, key: "legal.nav.returns" },
  { href: LEGAL_PATHS.SUPPLIER_AGREEMENT, key: "legal.nav.supplierAgreement" },
  { href: "/about", key: "legal.nav.about" },
  { href: "/help", key: "legal.nav.help" },
  { href: "/contact", key: "legal.nav.contact" },
];

export function LegalNav() {
  const { t } = useI18n();
  return (
    <nav className="rounded-xl border border-slate-200 bg-white p-4 shadow-card" aria-label={t("legal.nav.title")}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t("legal.nav.title")}</p>
      <ul className="space-y-1 text-sm">
        {NAV.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="block rounded-lg px-2 py-1.5 text-slate-700 hover:bg-slate-50 hover:text-brand-700">
              {t(l.key)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
