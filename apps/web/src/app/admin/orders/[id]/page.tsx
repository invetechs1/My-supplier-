"use client";

import { useParams } from "next/navigation";
import { OrderDetail } from "@/components/Orders";

export default function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <OrderDetail id={id} perspective="admin" backHref="/admin/orders" />;
}
