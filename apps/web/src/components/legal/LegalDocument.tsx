"use client";

import React from "react";
import type { LegalDocumentKey } from "@mysupplier/shared";
import { useI18n } from "@/lib/i18n";
import { TermsEn } from "@/content/legal/terms.en";
import { TermsAr } from "@/content/legal/terms.ar";
import { PrivacyEn } from "@/content/legal/privacy.en";
import { PrivacyAr } from "@/content/legal/privacy.ar";
import { ReturnsEn } from "@/content/legal/returns.en";
import { ReturnsAr } from "@/content/legal/returns.ar";
import { SupplierAgreementEn } from "@/content/legal/supplier-agreement.en";
import { SupplierAgreementAr } from "@/content/legal/supplier-agreement.ar";

const DOCS: Record<LegalDocumentKey, { en: React.ComponentType; ar: React.ComponentType }> = {
  TERMS: { en: TermsEn, ar: TermsAr },
  PRIVACY: { en: PrivacyEn, ar: PrivacyAr },
  RETURNS_POLICY: { en: ReturnsEn, ar: ReturnsAr },
  SUPPLIER_AGREEMENT: { en: SupplierAgreementEn, ar: SupplierAgreementAr },
};

/** Renders the legal document in the site language (content lives in src/content/legal/*.en.tsx / *.ar.tsx). */
export function LegalDocument({ doc }: { doc: LegalDocumentKey }) {
  const { lang } = useI18n();
  const Content = DOCS[doc][lang];
  return <Content />;
}
