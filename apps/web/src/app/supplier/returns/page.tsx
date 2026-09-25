"use client";

import { useSearchParams } from "next/navigation";
import React, { Suspense } from "react";
import { ReturnsWorkspace } from "@/components/returns/ReturnsWorkspace";
import { LoadingBlock } from "@/components/ui";
import { RoleGuard } from "@/components/RoleGuard";

function SupplierReturnsInner() {
  const params = useSearchParams();
  return <ReturnsWorkspace mode="supplier" initialId={params.get("id")} />;
}

export default function SupplierReturnsPage() {
  return (
    <RoleGuard area="orders">
      <Suspense fallback={<LoadingBlock />}>
        <SupplierReturnsInner />
      </Suspense>
    </RoleGuard>
  );
}
