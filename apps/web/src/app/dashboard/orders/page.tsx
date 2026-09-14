"use client";

import { OrdersList } from "@/components/Orders";

export default function BuyerOrdersPage() {
  return <OrdersList perspective="buyer" basePath="/dashboard/orders" />;
}
