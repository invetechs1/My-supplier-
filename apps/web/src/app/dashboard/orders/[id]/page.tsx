"use client";

import { useParams } from "next/navigation";
import { OrderDetail } from "@/components/Orders";

export default function BuyerOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <OrderDetail id={id} perspective="buyer" backHref="/dashboard/orders" />;
}
