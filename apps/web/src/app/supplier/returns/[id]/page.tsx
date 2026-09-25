"use client";

import { useParams } from "next/navigation";
import React from "react";
import { ReturnsWorkspace } from "@/components/returns/ReturnsWorkspace";
import { RoleGuard } from "@/components/RoleGuard";

/** Deep link used by notifications (`/supplier/returns/:id`): the workspace with that return preselected. */
export default function SupplierReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RoleGuard area="orders">
      <ReturnsWorkspace mode="supplier" initialId={id} />
    </RoleGuard>
  );
}
