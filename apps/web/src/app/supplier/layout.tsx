"use client";

import React from "react";
import { SidebarLayout, supplierNav } from "@/components/SidebarLayout";

export default function SupplierLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarLayout items={supplierNav} allow={["SUPPLIER"]} title="Supplier">
      {children}
    </SidebarLayout>
  );
}
