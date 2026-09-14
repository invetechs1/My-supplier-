"use client";

import { useParams } from "next/navigation";
import { OrderDetail } from "@/components/Orders";

export default function SupplierOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <OrderDetail id={id} perspective="supplier" backHref="/supplier/orders" />;
}
