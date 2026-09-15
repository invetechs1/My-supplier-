"use client";

import React from "react";
import { canAccessArea, companyRoleOf, useAuth, COMPANY_ROLE_LABEL, type SupplierArea } from "@/lib/auth";
import { Alert, LinkButton } from "./ui";

/**
 * Gates a supplier-portal page by company role. ADMIN users and roles listed for the area pass;
 * everyone else sees an explanation instead of the page (the sidebar already hides the link).
 */
export function RoleGuard({ area, children }: { area: SupplierArea; children: React.ReactNode }) {
  const { user } = useAuth();
  const role = companyRoleOf(user);
  if (user?.role === "ADMIN" || canAccessArea(role, area)) return <>{children}</>;
  return (
    <div className="mx-auto max-w-xl py-12">
      <Alert kind="warning">
        <p className="font-semibold">This area is not available to your role ({COMPANY_ROLE_LABEL[role]}).</p>
        <p className="mt-1">Ask an owner or manager of your company to change your role if you need access.</p>
      </Alert>
      <div className="mt-4">
        <LinkButton href="/supplier" variant="outline">Back to overview</LinkButton>
      </div>
    </div>
  );
}
