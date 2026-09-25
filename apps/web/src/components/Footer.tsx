"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/format";
import { LangToggle, Logo } from "./Header";

type Health = "checking" | "ok" | "down";

/** Small live status indicator fed by GET /health every 60s. */
export function ApiStatusDot({ className }: { className?: string }) {
  const { t } = useI18n();
  const [health, setHealth] = useState<Health>("checking");
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const check = () =>
      api
        .health()
        .then((h) => {
          if (!active) return;
          setHealth(h && h.ok !== false && h.db !== "down" ? "ok" : "down");
          setVersion(h?.version ?? null);
        })
        .catch(() => {
          if (active) setHealth("down");
        });
    void check();
    const timer = setInterval(check, 60_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const label = health === "ok" ? t("footer.statusOk") : health === "down" ? t("footer.statusDown") : t("footer.statusChecking");
  return (
    <span className={cn("inline-flex items-center gap-2 text-xs text-slate-500", className)} title={version ? `API ${version}` : undefined} role="status" aria-live="polite">
      <span className="relative flex h-2.5 w-2.5">
        {health === "ok" && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
        <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", health === "ok" ? "bg-emerald-500" : health === "down" ? "bg-red-500" : "bg-slate-300")} />
      </span>
      <span className="font-medium">{t("footer.live")}</span>
      <span className="hidden sm:inline">· {label}</span>
    </span>
  );
}

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="mt-auto border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-5 lg:px-8">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-slate-500">{t("footer.tagline")}</p>
          <p className="mt-3 max-w-sm text-xs text-slate-400">{t("footer.pricesNote")}</p>
          <div className="mt-4">
            <LangToggle />
          </div>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-slate-900">{t("footer.marketplace")}</h4>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li><Link href="/shop" className="hover:text-brand-600">{t("nav.shop")}</Link></li>
            <li><Link href="/materials" className="hover:text-brand-600">{t("nav.materials")}</Link></li>
            <li><Link href="/suppliers" className="hover:text-brand-600">{t("nav.suppliers")}</Link></li>
            <li><Link href="/compare" className="hover:text-brand-600">{t("nav.compare")}</Link></li>
            <li><Link href="/boq" className="hover:text-brand-600">{t("nav.boq")}</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-slate-900">{t("footer.account")}</h4>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li><Link href="/login" className="hover:text-brand-600">{t("nav.login")}</Link></li>
            <li><Link href="/register" className="hover:text-brand-600">{t("nav.register")}</Link></li>
            <li><Link href="/register?role=SUPPLIER" className="hover:text-brand-600">{t("sup.catalog")}</Link></li>
            <li><Link href="/dashboard" className="hover:text-brand-600">{t("nav.dashboard")}</Link></li>
            <li><Link href="/account" className="hover:text-brand-600">{t("nav.account")}</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-slate-900">{t("footer.company")}</h4>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li><Link href="/about" className="hover:text-brand-600">{t("footer.about")}</Link></li>
            <li><Link href="/help" className="hover:text-brand-600">{t("footer.help")}</Link></li>
            <li><Link href="/contact" className="hover:text-brand-600">{t("footer.contact")}</Link></li>
            <li><Link href="/terms" className="hover:text-brand-600">{t("footer.terms")}</Link></li>
            <li><Link href="/privacy" className="hover:text-brand-600">{t("footer.privacy")}</Link></li>
            <li><Link href="/refund-policy" className="hover:text-brand-600">{t("footer.refund")}</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-100">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-slate-400 sm:flex-row sm:px-6 lg:px-8">
          <p>© 2026 MySupplier · {t("brand.tagline")} · {t("footer.copyright")}</p>
          <ApiStatusDot />
        </div>
      </div>
    </footer>
  );
}
