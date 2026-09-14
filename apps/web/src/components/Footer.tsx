"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { Logo } from "./Header";

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="mt-auto border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-4 lg:px-8">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-slate-500">{t("footer.tagline")}</p>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-slate-900">Marketplace</h4>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li><Link href="/shop" className="hover:text-brand-600">{t("nav.shop")}</Link></li>
            <li><Link href="/materials" className="hover:text-brand-600">{t("nav.materials")}</Link></li>
            <li><Link href="/suppliers" className="hover:text-brand-600">{t("nav.suppliers")}</Link></li>
            <li><Link href="/compare" className="hover:text-brand-600">{t("nav.compare")}</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-slate-900">Account</h4>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li><Link href="/login" className="hover:text-brand-600">{t("nav.login")}</Link></li>
            <li><Link href="/register" className="hover:text-brand-600">{t("nav.register")}</Link></li>
            <li><Link href="/dashboard" className="hover:text-brand-600">{t("nav.dashboard")}</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-100 py-4 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} MySupplier · Riyadh, Saudi Arabia · Prices in SAR
      </div>
    </footer>
  );
}
