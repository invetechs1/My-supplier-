/**
 * Legal documents (terms, privacy, supplier agreement, returns policy): current versions and proof of
 * acceptance. Registration and the supplier portal call recordAcceptances(); the web pages read
 * LEGAL_VERSIONS so a user is re-prompted when a document changes. Versions, paths and fees live in
 * packages/shared/src/legal.ts so the web renders exactly what the API enforces.
 */
import type { LegalDocument, Role } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { LEGAL_PATHS, LEGAL_REQUIRED_BY_ROLE, LEGAL_VERSIONS } from "@mysupplier/shared";
import { prisma } from "../lib/prisma";
import { HttpError } from "../lib/errors";

export { LEGAL_PATHS, LEGAL_VERSIONS };

/** Documents a user in this role must accept (BUYER: terms + privacy; SUPPLIER: also the supplier agreement). */
export const requiredDocumentsFor = (role: Role): LegalDocument[] => LEGAL_REQUIRED_BY_ROLE[role] as LegalDocument[];

/** Store one acceptance row per document (idempotent per user+document+version). */
export async function recordAcceptances(input: { userId: string; companyId?: string | null; documents: LegalDocument[]; locale?: string; req?: Request }) {
  const ip = input.req ? (input.req.ip ?? null) : null;
  const userAgent = input.req ? (input.req.get("user-agent")?.slice(0, 300) ?? null) : null;
  for (const document of input.documents) {
    const version = LEGAL_VERSIONS[document];
    const existing = await prisma.legalAcceptance.findFirst({ where: { userId: input.userId, document, version } });
    if (existing) continue;
    await prisma.legalAcceptance.create({ data: { userId: input.userId, companyId: input.companyId ?? null, document, version, locale: input.locale ?? "en", ip, userAgent } });
  }
}

/** Documents whose current version this user has not accepted yet. */
export async function pendingAcceptances(userId: string, required: LegalDocument[]): Promise<LegalDocument[]> {
  if (required.length === 0) return [];
  const rows = await prisma.legalAcceptance.findMany({ where: { userId, document: { in: required } }, select: { document: true, version: true } });
  return required.filter((d) => !rows.some((r) => r.document === d && r.version === LEGAL_VERSIONS[d]));
}

/**
 * The current supplier agreement counts as accepted for a company when a user who is (or is treated as) an
 * OWNER of that company accepted it. Users without a company role are owners (see services/portal.ts).
 */
export async function companySupplierAgreement(companyId: string) {
  const row = await prisma.legalAcceptance.findFirst({
    where: {
      document: "SUPPLIER_AGREEMENT",
      version: LEGAL_VERSIONS.SUPPLIER_AGREEMENT,
      user: { companyId, OR: [{ companyRole: "OWNER" }, { companyRole: null }] },
    },
    orderBy: { acceptedAt: "asc" },
    include: { user: { select: { id: true, name: true, email: true, companyRole: true } } },
  });
  return row ? { accepted: true as const, acceptedBy: { name: row.user.name, acceptedAt: row.acceptedAt }, row } : { accepted: false as const, acceptedBy: null, row: null };
}

/**
 * Throws 403 `SUPPLIER_AGREEMENT_REQUIRED` unless an owner of the caller's company accepted the current supplier
 * agreement. Admins and non-supplier users pass. Applied to every route that creates or updates PriceListings.
 */
export async function requireSupplierAgreement(req: Request): Promise<void> {
  const user = req.user;
  if (!user || user.role !== "SUPPLIER" || !user.companyId) return;
  const { accepted } = await companySupplierAgreement(user.companyId);
  if (accepted) return;
  throw new HttpError(403, "The company owner must accept the current supplier agreement before listing prices", {
    code: "SUPPLIER_AGREEMENT_REQUIRED",
    document: "SUPPLIER_AGREEMENT",
    version: LEGAL_VERSIONS.SUPPLIER_AGREEMENT,
    path: LEGAL_PATHS.SUPPLIER_AGREEMENT,
    messageAr: "يجب أن يقبل مالك الشركة اتفاقية المورد الحالية قبل نشر الأسعار",
  });
}

/** Express middleware form of requireSupplierAgreement(). */
export const supplierAgreementGuard = (req: Request, _res: Response, next: NextFunction) => requireSupplierAgreement(req).then(() => next(), next);

/** Payload of GET /legal/acceptances/me. */
export async function myAcceptances(user: { id: string; role: Role; companyId: string | null }) {
  const required = requiredDocumentsFor(user.role);
  const [acceptances, pending, me] = await Promise.all([
    prisma.legalAcceptance.findMany({ where: { userId: user.id }, orderBy: { acceptedAt: "desc" } }),
    pendingAcceptances(user.id, required),
    prisma.user.findUnique({ where: { id: user.id }, select: { companyRole: true } }),
  ]);
  let company = null;
  if (user.role === "SUPPLIER" && user.companyId) {
    const agreement = await companySupplierAgreement(user.companyId);
    company = { id: user.companyId, isOwner: (me?.companyRole ?? "OWNER") === "OWNER", supplierAgreementAccepted: agreement.accepted, acceptedBy: agreement.acceptedBy };
  }
  return { acceptances, required, pending, versions: LEGAL_VERSIONS, company };
}
