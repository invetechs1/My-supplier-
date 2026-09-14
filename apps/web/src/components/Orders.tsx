"use client";

import Link from "next/link";
import { useState } from "react";
import type { Order, OrderStatus } from "@mysupplier/shared";
import { api, errorMessage } from "@/lib/api";
import { useAsync, useFlash } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { cn, formatDateTime, formatSar } from "@/lib/format";
import { Alert, Button, Card, CardHeader, EmptyState, FlashMessage, LoadingBlock, PageHeader, Pagination, StatusBadge, Table, type Column } from "./ui";

export type OrderPerspective = "buyer" | "supplier" | "admin";

const FLOW: OrderStatus[] = ["PENDING", "CONFIRMED", "IN_TRANSIT", "DELIVERED"];

export function OrderStatusTimeline({ status }: { status: OrderStatus }) {
  const cancelled = status === "CANCELLED";
  const idx = FLOW.indexOf(status);
  return (
    <ol className="flex items-center gap-2">
      {FLOW.map((s, i) => {
        const done = !cancelled && i <= idx;
        const current = !cancelled && i === idx;
        return (
          <li key={s} className="flex flex-1 items-center gap-2">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ring-2",
                  done ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-400 ring-slate-200",
                  current && "ring-amber-500",
                )}
              >
                {done && !current ? "✓" : i + 1}
              </span>
              <span className={cn("mt-1 whitespace-nowrap text-[10px] font-medium uppercase tracking-wide", done ? "text-brand-700" : "text-slate-400")}>{s.replace("_", " ")}</span>
            </div>
            {i < FLOW.length - 1 && <span className={cn("mb-4 h-0.5 flex-1 rounded", !cancelled && i < idx ? "bg-brand-600" : "bg-slate-200")} />}
          </li>
        );
      })}
      {cancelled && (
        <li className="ms-2">
          <StatusBadge status="CANCELLED" />
        </li>
      )}
    </ol>
  );
}

export function OrdersList({ perspective, basePath }: { perspective: OrderPerspective; basePath: string }) {
  const { t, lang } = useI18n();
  const [page, setPage] = useState(1);
  const state = useAsync(() => api.orders(page), [page]);

  const columns: Column<Order>[] = [
    { key: "ref", header: "Reference", render: (o) => <Link href={`${basePath}/${o.id}`} className="font-medium text-brand-700 hover:underline">{o.reference}</Link> },
    { key: "rfq", header: "RFQ", render: (o) => o.rfq?.title ?? o.rfqId },
    perspective === "buyer"
      ? { key: "supplier", header: "Supplier", render: (o) => o.company?.name ?? o.companyId }
      : { key: "buyer", header: "Buyer", render: (o) => o.rfq?.buyer?.name ?? o.buyerId },
    { key: "total", header: "Total", align: "end", render: (o) => <span className="font-semibold tabular-nums">{formatSar(o.total, lang)}</span> },
    { key: "status", header: t("common.status"), render: (o) => <StatusBadge status={o.status} /> },
    { key: "updated", header: "Updated", render: (o) => <span className="text-slate-500">{formatDateTime(o.updatedAt, lang)}</span> },
  ];

  return (
    <div>
      <PageHeader title={t("dash.orders")} subtitle="Orders created from awarded RFQs." />
      {state.loading ? (
        <LoadingBlock />
      ) : state.error ? (
        <Alert onRetry={state.reload}>{state.error}</Alert>
      ) : (
        <Card>
          <Table columns={columns} rows={state.data?.data ?? []} rowKey={(o) => o.id} empty={<EmptyState title="No orders yet" description="Orders appear here once a bid has been accepted." />} />
          {state.data && <Pagination page={state.data.page} pageSize={state.data.pageSize} total={state.data.total} onChange={setPage} />}
        </Card>
      )}
    </div>
  );
}

export function OrderDetail({ id, perspective, backHref }: { id: string; perspective: OrderPerspective; backHref: string }) {
  const { lang } = useI18n();
  const state = useAsync(() => api.order(id), [id]);
  const [flash, setFlash] = useFlash();
  const [busy, setBusy] = useState<OrderStatus | null>(null);

  const setStatus = async (status: OrderStatus) => {
    if (status === "CANCELLED" && !window.confirm("Cancel this order?")) return;
    setBusy(status);
    try {
      const updated = await api.updateOrderStatus(id, status);
      state.setData((prev) => (prev ? { ...prev, ...updated } : updated));
      setFlash({ kind: "success", message: `Order marked ${status.replace("_", " ").toLowerCase()}.` });
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  if (state.loading) return <LoadingBlock />;
  if (state.error || !state.data) return <Alert onRetry={state.reload}>{state.error ?? "Order not found"}</Alert>;
  const o = state.data;

  const supplierNext: Partial<Record<OrderStatus, OrderStatus>> = { PENDING: "CONFIRMED", CONFIRMED: "IN_TRANSIT", IN_TRANSIT: "DELIVERED" };
  const nextStatus = supplierNext[o.status];
  const canSupplierAct = (perspective === "supplier" || perspective === "admin") && nextStatus;
  const canBuyerCancel = (perspective === "buyer" || perspective === "admin") && o.status === "PENDING";

  const items = o.bid?.items ?? [];
  const rfqItems = o.rfq?.items ?? [];

  return (
    <div>
      <nav className="mb-4 text-sm text-slate-500" aria-label="Breadcrumb">
        <Link href={backHref} className="hover:text-brand-700">Orders</Link>
        <span className="mx-2">/</span>
        <span className="text-slate-700">{o.reference}</span>
      </nav>
      <PageHeader
        title={o.reference}
        subtitle={o.rfq ? `${o.rfq.title} · ${o.rfq.reference}` : undefined}
        action={
          <>
            <StatusBadge status={o.status} />
            {canSupplierAct && nextStatus && (
              <Button onClick={() => setStatus(nextStatus)} loading={busy === nextStatus}>
                Mark {nextStatus.replace("_", " ").toLowerCase()}
              </Button>
            )}
            {canBuyerCancel && (
              <Button variant="danger" onClick={() => setStatus("CANCELLED")} loading={busy === "CANCELLED"}>
                Cancel order
              </Button>
            )}
          </>
        }
      />
      <FlashMessage flash={flash} className="mb-4" />

      <Card className="p-5">
        <OrderStatusTimeline status={o.status} />
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Line items" subtitle={`${items.length || rfqItems.length} items`} />
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-start">Item</th>
                  <th className="px-4 py-3 text-end">Qty</th>
                  <th className="px-4 py-3 text-end">Unit price</th>
                  <th className="px-4 py-3 text-end">Line total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.length > 0
                  ? items.map((bi) => {
                      const ri = rfqItems.find((r) => r.id === bi.rfqItemId);
                      return (
                        <tr key={bi.id}>
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-900">{ri?.material?.name ?? ri?.description ?? bi.rfqItemId}</p>
                            {ri?.material && <p className="text-xs text-slate-500">{ri.description}</p>}
                          </td>
                          <td className="px-4 py-3 text-end tabular-nums">{bi.quantity} {ri?.unit ?? ""}</td>
                          <td className="px-4 py-3 text-end tabular-nums">{formatSar(bi.unitPrice, lang)}</td>
                          <td className="px-4 py-3 text-end font-medium tabular-nums">{formatSar(bi.unitPrice * bi.quantity, lang)}</td>
                        </tr>
                      );
                    })
                  : rfqItems.map((ri) => (
                      <tr key={ri.id}>
                        <td className="px-4 py-3 font-medium text-slate-900">{ri.material?.name ?? ri.description}</td>
                        <td className="px-4 py-3 text-end tabular-nums">{ri.quantity} {ri.unit}</td>
                        <td className="px-4 py-3 text-end text-slate-400">—</td>
                        <td className="px-4 py-3 text-end text-slate-400">—</td>
                      </tr>
                    ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50">
                  <td colSpan={3} className="px-4 py-3 text-end text-sm font-semibold text-slate-700">Order total</td>
                  <td className="px-4 py-3 text-end text-base font-bold tabular-nums text-brand-700">{formatSar(o.total, lang)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title={perspective === "buyer" ? "Supplier" : "Buyer"} />
            <dl className="space-y-2 px-5 py-4 text-sm">
              {perspective === "buyer" ? (
                <>
                  <div><dt className="text-slate-500">Company</dt><dd className="font-medium text-slate-900">{o.company ? <Link href={`/suppliers/${o.company.id}`} className="hover:text-brand-700">{o.company.name}</Link> : o.companyId}</dd></div>
                  {o.company?.phone && <div><dt className="text-slate-500">Phone</dt><dd className="font-medium text-slate-900" dir="ltr">{o.company.phone}</dd></div>}
                  {o.company && <div><dt className="text-slate-500">City</dt><dd className="font-medium text-slate-900">{o.company.city}</dd></div>}
                </>
              ) : (
                <>
                  <div><dt className="text-slate-500">Name</dt><dd className="font-medium text-slate-900">{o.rfq?.buyer?.name ?? o.buyerId}</dd></div>
                  {o.rfq?.buyer?.company && <div><dt className="text-slate-500">Company</dt><dd className="font-medium text-slate-900">{o.rfq.buyer.company.name}</dd></div>}
                </>
              )}
            </dl>
          </Card>
          <Card>
            <CardHeader title="Delivery" />
            <dl className="space-y-2 px-5 py-4 text-sm">
              <div><dt className="text-slate-500">City</dt><dd className="font-medium text-slate-900">{o.rfq?.deliveryCity ?? "—"}</dd></div>
              <div><dt className="text-slate-500">Address</dt><dd className="font-medium text-slate-900">{o.rfq?.deliveryAddress ?? "—"}</dd></div>
              <div><dt className="text-slate-500">Requested date</dt><dd className="font-medium text-slate-900">{o.rfq?.deliveryDate ? formatDateTime(o.rfq.deliveryDate, lang) : "—"}</dd></div>
              {o.bid && <div><dt className="text-slate-500">Promised delivery</dt><dd className="font-medium text-slate-900">{o.bid.deliveryDays} days</dd></div>}
              <div><dt className="text-slate-500">Created</dt><dd className="font-medium text-slate-900">{formatDateTime(o.createdAt, lang)}</dd></div>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
