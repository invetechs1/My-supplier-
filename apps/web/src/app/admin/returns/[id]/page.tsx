"use client";

import { useParams } from "next/navigation";
import React from "react";
import { ReturnsWorkspace } from "@/components/returns/ReturnsWorkspace";

export default function AdminReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <ReturnsWorkspace mode="admin" initialId={id} />;
}
