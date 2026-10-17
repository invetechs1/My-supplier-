"use client";

import { OrdersList } from "@/components/Orders";
import { useI18n } from "@/lib/i18n";

export default function AdminOrdersPage() {
  const { t } = useI18n();
  return <OrdersList perspective="admin" basePath="/admin/orders" title={t("admin.orders")} subtitle={t("admin.orders.subtitle")} filters />;
}
