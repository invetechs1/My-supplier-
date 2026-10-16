"use client";

import React from "react";
import type { CompanyRole } from "@mysupplier/shared";
import { canAccessArea, companyRoleOf, useAuth, type SupplierArea } from "@/lib/auth";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { Alert, LinkButton } from "./ui";

/** Translated company-role names (mirrors COMPANY_ROLE_LABEL in lib/auth). */
export const COMPANY_ROLE_KEY: Record<CompanyRole, TranslationKey> = {
  OWNER: "sup.team.role.OWNER",
  MANAGER: "sup.team.role.MANAGER",
  SALES: "sup.team.role.SALES",
  WAREHOUSE: "sup.team.role.WAREHOUSE",
};

/**
 * Gates a supplier-portal page by company role. ADMIN users and roles listed for the area pass;
 * everyone else sees an explanation instead of the page (the sidebar already hides the link).
 */
export function RoleGuard({ area, children }: { area: SupplierArea; children: React.ReactNode }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const role = companyRoleOf(user);
  if (user?.role === "ADMIN" || canAccessArea(role, area)) return <>{children}</>;
  return (
    <div className="mx-auto max-w-xl py-12">
      <Alert kind="warning">
        <p className="font-semibold">{t("sup.team.guardTitle")} ({t(COMPANY_ROLE_KEY[role])}).</p>
        <p className="mt-1">{t("sup.team.guardBody")}</p>
      </Alert>
      <div className="mt-4">
        <LinkButton href="/supplier" variant="outline">{t("sup.dash.backToOverview")}</LinkButton>
      </div>
    </div>
  );
}
