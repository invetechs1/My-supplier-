"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReturnRequest, ReturnStatus } from "@mysupplier/shared";
import { RETURN_STATUSES, commerceApi, returnReasonLabel } from "@/lib/api/commerce";
import { useAsync, usePageTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatSar } from "@/lib/format";
import { ReturnStatusBadge } from "@/components/Orders";
import { Alert, Button, Card, EmptyState, LinkButton, LoadingBlock, PageHeader, Pagination, Select, Table, type Column } from "@/components/ui";

export default function ReturnsPage() {
  const { t, lang } = useI18n();
  usePageTitle(t("dash.returns"));
  const router = useRouter();
  const [status, setStatus] = useState<ReturnStatus | "">("");
  const [page, setPage] = useState(1);
  const state = useAsync(() => commerceApi.returns({ status, page }), [status, page]);
  const rows = state.data?.data ?? [];

  const columns: Column<ReturnRequest>[] = [
    { key: "ref", header: "Reference", render: (r) => <Link href={`/dashboard/returns/${r.id}`} className="font-medium text-brand-700 hover:underline">{r.reference}</Link> },
    {
      key: "order",
      header: "Order",
      render: (r) => (r.order ? <Link href={`/dashboard/orders/${r.order.id}`} className="hover:text-brand-700" onClick={(e) => e.stopPropagation()}>{r.order.reference}</Link> : r.orderId),
    },
    { key: "supplier", header: "Supplier", render: (r) => r.company?.name ?? "—" },
    {
      key: "items",
      header: "Items",
      render: (r) => (
        <span>
          {r.items.length} {r.items.length === 1 ? "line" : "lines"}
          <span className="block max-w-[240px] truncate text-xs text-slate-500">{r.items.map((i) => `${i.quantity} ${i.unit} ${i.name}`).join(", ")}</span>
        </span>
      ),
    },
    { key: "reason", header: "Reason", render: (r) => <span className="text-slate-700">{returnReasonLabel(r.reason)}</span> },
    { key: "refund", header: "Refund", align: "end", render: (r) => <span className="tabular-nums">{typeof r.refundAmount === "number" ? formatSar(r.refundAmount, lang) : "—"}</span> },
    { key: "status", header: t("common.status"), render: (r) => <ReturnStatusBadge status={r.status} /> },
    { key: "created", header: "Requested", render: (r) => <span className="text-slate-500">{formatDate(r.createdAt, lang)}</span> },
  ];

  return (
    <div>
      <PageHeader title={t("dash.returns")} subtitle="Return requests (RMA) on your orders. Open one to follow its progress or cancel it while it is still pending." />
      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-[240px_auto]">
          <Select
            name="returnStatus"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as ReturnStatus | "");
              setPage(1);
            }}
            placeholder="All statuses"
            options={RETURN_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, " ") }))}
          />
          {status && (
            <Button variant="ghost" onClick={() => { setStatus(""); setPage(1); }}>
              Clear filter
            </Button>
          )}
        </div>
      </Card>
      {state.loading ? (
        <LoadingBlock />
      ) : state.error ? (
        <Alert onRetry={state.reload}>{state.error}</Alert>
      ) : (
        <Card>
          <Table
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            onRowClick={(r) => router.push(`/dashboard/returns/${r.id}`)}
            empty={
              <EmptyState
                title={status ? "No returns with this status" : "No return requests"}
                description={status ? "Try another status." : "You can request a return from a shipped or delivered order within 14 days of delivery."}
                action={!status ? <LinkButton href="/dashboard/orders" variant="outline">Go to my orders</LinkButton> : undefined}
              />
            }
          />
          {state.data && <Pagination page={state.data.page} pageSize={state.data.pageSize} total={state.data.total} onChange={setPage} />}
        </Card>
      )}
    </div>
  );
}
