"use client";

import { useSearchParams } from "next/navigation";
import React, { Suspense } from "react";
import { ReturnsWorkspace } from "@/components/returns/ReturnsWorkspace";
import { LoadingBlock } from "@/components/ui";

function AdminReturnsInner() {
  const params = useSearchParams();
  return <ReturnsWorkspace mode="admin" initialId={params.get("id")} />;
}

export default function AdminReturnsPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <AdminReturnsInner />
    </Suspense>
  );
}
