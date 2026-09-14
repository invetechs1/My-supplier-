"use client";

import { OrdersList } from "@/components/Orders";

export default function SupplierOrdersPage() {
  return <OrdersList perspective="supplier" basePath="/supplier/orders" />;
}
