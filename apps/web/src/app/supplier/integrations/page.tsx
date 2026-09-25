"use client";

import React from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { IntegrationsConsole } from "@/components/integrations/IntegrationsConsole";

export default function SupplierIntegrationsPage() {
  return (
    <RoleGuard area="company">
      <IntegrationsConsole perspective="supplier" />
    </RoleGuard>
  );
}
