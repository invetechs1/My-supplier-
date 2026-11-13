"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";
import { LEGAL_PATHS, LEGAL_VERSIONS, SUPPLIER_FEES, type MyLegalAcceptances } from "@mysupplier/shared";
import { errorMessage } from "@/lib/api";
import { legalApi } from "@/lib/api/legal";
import { useAuth } from "@/lib/auth";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { Alert, Button, Modal } from "@/components/ui";
import { arabicProseClass } from "./Prose";

const SUMMARY_KEYS: TranslationKey[] = ["legal.gate.s.fees", "legal.gate.s.payout", "legal.gate.s.sla", "legal.gate.s.listings", "legal.gate.s.returns", "legal.gate.s.nonCircumvention", "legal.gate.s.term", "legal.gate.s.language"];

/**
 * Supplier-portal gate for the Supplier Agreement. Owners who have not accepted the current version see a blocking
 * modal (summary, link to the full text, checkbox, Accept → POST /legal/accept); other team members see a banner until
 * an owner accepts. The API enforces the same rule on every route that creates or updates price listings.
 */
export function SupplierAgreementGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const [state, setState] = useState<MyLegalAcceptances | null>(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justAccepted, setJustAccepted] = useState(false);
  const isSupplier = user?.role === "SUPPLIER";

  const load = useCallback(async () => {
    if (!isSupplier) return;
    try {
      setState(await legalApi.acceptancesMe());
    } catch {
      setState(null); // never block the portal on a lookup failure; the API still enforces listing routes
    }
  }, [isSupplier]);
  useEffect(() => { void load(); }, [load]);

  const company = state?.company;
  const needsOwner = !!company && !company.supplierAgreementAccepted && company.isOwner;
  const needsBanner = !!company && !company.supplierAgreementAccepted && !company.isOwner;
  const version = LEGAL_VERSIONS.SUPPLIER_AGREEMENT;
  const fill = (s: string) => s.replace("{fee}", String(SUPPLIER_FEES.successFeePct)).replace("{card}", String(SUPPLIER_FEES.cardProcessingPct)).replace("{days}", String(SUPPLIER_FEES.payoutDays));

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await legalApi.accept({ documents: ["SUPPLIER_AGREEMENT", "TERMS", "PRIVACY"], locale: lang });
      setState(next);
      setJustAccepted(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {needsBanner && (
        <Alert kind="warning" className="mb-4">
          <p className="font-semibold">{t("legal.gate.ownerBanner")}</p>
          <Link href={LEGAL_PATHS.SUPPLIER_AGREEMENT} className="mt-1 inline-block text-sm font-semibold underline underline-offset-2">{t("legal.gate.readFull")}</Link>
        </Alert>
      )}
      {justAccepted && <Alert kind="success" className="mb-4">{t("legal.gate.accepted")}</Alert>}
      {children}
      <Modal
        open={needsOwner}
        onClose={() => undefined}
        title={<span>{t("legal.gate.title")} <span className="ms-2 text-xs font-normal text-slate-500">{t("legal.gate.versionLabel")} <span dir="ltr" className="font-mono">{version}</span></span></span>}
        wide
        footer={
          <>
            <Link href={LEGAL_PATHS.SUPPLIER_AGREEMENT} target="_blank" className="me-auto text-sm font-semibold text-brand-700 hover:underline">{t("legal.gate.readFull")} ↗</Link>
            <Button onClick={accept} loading={busy} disabled={!agree}>{t("legal.gate.accept")}</Button>
          </>
        }
      >
        <div className={lang === "ar" ? `space-y-4 ${arabicProseClass}` : "space-y-4"} dir={lang === "ar" ? "rtl" : "ltr"}>
          <p className="text-sm text-slate-700">{t("legal.gate.intro")}</p>
          <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("legal.gate.summaryTitle")}</p>
            <ol className="space-y-2 [&_li]:ms-5 [&_li]:list-decimal">
              {SUMMARY_KEYS.map((k) => <li key={k}>{fill(t(k))}</li>)}
            </ol>
          </div>
          <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm text-slate-800">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600" />
            <span>{t("legal.gate.checkbox")}</span>
          </label>
          {error && <Alert>{error}</Alert>}
        </div>
      </Modal>
    </>
  );
}
