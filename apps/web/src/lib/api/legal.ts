// Legal documents client: published versions, the caller's acceptance state and recording acceptances.
// See docs/API.md → "Legal documents".
import type { LegalAcceptPayload, LegalAcceptance, LegalDocumentsInfo, MyLegalAcceptances } from "@mysupplier/shared";
import { request } from "@/lib/api";

export const legalApi = {
  documents: () => request<LegalDocumentsInfo>("/legal/documents"),
  acceptancesMe: () => request<MyLegalAcceptances>("/legal/acceptances/me"),
  accept: (body: LegalAcceptPayload) => request<MyLegalAcceptances>("/legal/accept", { method: "POST", body }),
  adminCompanyAcceptances: (companyId: string) => request<LegalAcceptance[]>(`/admin/companies/${encodeURIComponent(companyId)}/acceptances`),
};
