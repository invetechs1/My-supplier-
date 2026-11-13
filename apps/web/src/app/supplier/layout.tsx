"use client";

import React from "react";
import { SidebarLayout, supplierNav } from "@/components/SidebarLayout";
import { SupplierAgreementGate } from "@/components/legal/SupplierAgreementGate";

export default function SupplierLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarLayout items={supplierNav} allow={["SUPPLIER"]} title="Supplier">
      <SupplierAgreementGate>{children}</SupplierAgreementGate>
    </SidebarLayout>
  );
}
