"use client";

import { OrdersList } from "@/components/Orders";

export default function AdminOrdersPage() {
  return <OrdersList perspective="admin" basePath="/admin/orders" title="Orders" subtitle="Every order on the platform. Filter by fulfilment or payment status; open one to refund, track shipments or report its e-invoice." filters />;
}
