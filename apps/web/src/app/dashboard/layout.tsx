"use client";
import React from "react";

import { SidebarLayout, buyerNav } from "@/components/SidebarLayout";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarLayout items={buyerNav} allow={["BUYER"]} title="Buyer">
      {children}
    </SidebarLayout>
  );
}
