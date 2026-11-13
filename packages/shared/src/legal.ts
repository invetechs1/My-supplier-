// Legal documents shared by the API (acceptance records, enforcement) and the web (legal pages,
// consent prompts). Keep this file dependency-free.

export type LegalDocumentKey = "TERMS" | "PRIVACY" | "SUPPLIER_AGREEMENT" | "RETURNS_POLICY";
export const LEGAL_DOCUMENTS: readonly LegalDocumentKey[] = ["TERMS", "PRIVACY", "SUPPLIER_AGREEMENT", "RETURNS_POLICY"] as const;

/** Bump a version (YYYY-MM-DD) whenever the published text changes materially; users are re-prompted. */
export const LEGAL_VERSIONS: Record<LegalDocumentKey, string> = {
  TERMS: "2026-11-13",
  PRIVACY: "2026-09-01",
  SUPPLIER_AGREEMENT: "2026-11-13",
  RETURNS_POLICY: "2026-11-13",
};

export const LEGAL_PATHS: Record<LegalDocumentKey, string> = {
  TERMS: "/terms",
  PRIVACY: "/privacy",
  SUPPLIER_AGREEMENT: "/supplier-agreement",
  RETURNS_POLICY: "/refund-policy",
};

export const LEGAL_TITLES: Record<LegalDocumentKey, { en: string; ar: string }> = {
  TERMS: { en: "Terms & Conditions", ar: "الشروط والأحكام" },
  PRIVACY: { en: "Privacy Policy", ar: "سياسة الخصوصية" },
  SUPPLIER_AGREEMENT: { en: "Supplier Agreement", ar: "اتفاقية المورد" },
  RETURNS_POLICY: { en: "Returns & Refund Policy", ar: "سياسة الإرجاع والاسترداد" },
};

/** Documents a user must have accepted (current version) to use the platform in that role. */
export const LEGAL_REQUIRED_BY_ROLE: Record<"BUYER" | "SUPPLIER" | "ADMIN", LegalDocumentKey[]> = {
  BUYER: ["TERMS", "PRIVACY"],
  SUPPLIER: ["TERMS", "PRIVACY", "SUPPLIER_AGREEMENT"],
  ADMIN: [],
};

/** Commercial terms rendered in the supplier agreement and returned by GET /legal/documents. */
export const SUPPLIER_FEES = {
  /** Platform success fee, % of the order value excluding VAT. */
  successFeePct: 3,
  /** Card / wallet processing fee passed through at cost, % of the amount charged. */
  cardProcessingPct: 2.5,
  /** Payout T+N days after confirmed delivery. */
  payoutDays: 7,
  /** Supplier must respond to a return or claim within this many business days. */
  claimResponseBusinessDays: 2,
  /** Order confirmation SLA (business hours) and hard limit (hours). */
  confirmWithinHours: 1,
  confirmHardLimitHours: 4,
  /** Listings older than this are hidden from buyers until refreshed. */
  listingRefreshDays: 30,
  /** Non-circumvention period for platform-originated buyers, months. */
  nonCircumventionMonths: 12,
  /** Termination notice, days. */
  terminationNoticeDays: 30,
} as const;

/** Format "2026-11-13" as a human date in the given language. */
export function formatLegalDate(version: string, lang: "en" | "ar" = "en"): string {
  const [y, m, d] = version.split("-").map(Number);
  if (!y || !m || !d) return version;
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

export interface LegalAcceptance {
  id: string;
  userId: string;
  companyId?: string | null;
  document: LegalDocumentKey;
  version: string;
  locale: string;
  ip?: string | null;
  userAgent?: string | null;
  acceptedAt: string;
  user?: { id: string; name: string; email?: string; companyRole?: string | null } | null;
}

/** `GET /legal/documents` */
export interface LegalDocumentsInfo {
  versions: Record<LegalDocumentKey, string>;
  paths: Record<LegalDocumentKey, string>;
  fees: typeof SUPPLIER_FEES;
  requiredByRole: typeof LEGAL_REQUIRED_BY_ROLE;
}

/** `GET /legal/acceptances/me` */
export interface MyLegalAcceptances {
  acceptances: LegalAcceptance[];
  required: LegalDocumentKey[];
  /** Documents (current version) this user has not accepted yet. */
  pending: LegalDocumentKey[];
  versions: Record<LegalDocumentKey, string>;
  /** Suppliers: whether an OWNER of the company accepted the current supplier agreement, and who. */
  company?: { id: string; isOwner: boolean; supplierAgreementAccepted: boolean; acceptedBy?: { name: string; acceptedAt: string } | null } | null;
}

export interface LegalAcceptPayload {
  documents: LegalDocumentKey[];
  locale?: "en" | "ar";
}
