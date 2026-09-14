"use client";

import React from "react";
import { SidebarLayout, adminNav } from "@/components/SidebarLayout";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarLayout items={adminNav} allow={["ADMIN"]} title="Admin">
      {children}
    </SidebarLayout>
  );
}
