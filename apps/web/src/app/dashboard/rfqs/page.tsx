"use client";

import Link from "next/link";
import { useState } from "react";
import type { Rfq } from "@mysupplier/shared";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { formatDateTime, formatSar } from "@/lib/format";
import { Alert, Card, EmptyState, LinkButton, LoadingBlock, PageHeader, Pagination, Select, StatusBadge, Table, type Column } from "@/components/ui";

const STATUSES = ["OPEN", "CLOSED", "AWARDED", "CANCELLED"];

export default function BuyerRfqsPage() {
  const { t, lang } = useI18n();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const state = useAsync(() => api.rfqs({ status: status || undefined, page }), [status, page]);

  const columns: Column<Rfq>[] = [
    { key: "ref", header: "Reference", render: (r) => <Link href={`/dashboard/rfqs/${r.id}`} className="font-medium text-brand-700 hover:underline">{r.reference}</Link> },
    { key: "title", header: "Title", render: (r) => <span className="font-medium text-slate-900">{r.title}</span> },
    { key: "items", header: "Items", align: "end", render: (r) => r.items?.length ?? 0 },
    { key: "city", header: t("common.city"), render: (r) => r.deliveryCity },
    { key: "bids", header: "Bids", align: "end", render: (r) => r.bidCount ?? 0 },
    { key: "lowest", header: "Lowest bid", align: "end", render: (r) => <span className="tabular-nums">{formatSar(r.lowestBid, lang)}</span> },
    { key: "status", header: t("common.status"), render: (r) => <StatusBadge status={r.status} /> },
    { key: "closes", header: "Closes", render: (r) => <span className="text-slate-500">{formatDateTime(r.closesAt, lang)}</span> },
  ];

  return (
    <div>
      <PageHeader
        title={t("dash.rfqs")}
        action={
          <>
            <Select name="status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder="All statuses" options={STATUSES.map((s) => ({ value: s, label: s }))} />
            <LinkButton href="/dashboard/rfqs/new" variant="accent">+ {t("dash.newRfq")}</LinkButton>
          </>
        }
      />
      {state.loading ? (
        <LoadingBlock />
      ) : state.error ? (
        <Alert onRetry={state.reload}>{state.error}</Alert>
      ) : (
        <Card>
          <Table columns={columns} rows={state.data?.data ?? []} rowKey={(r) => r.id} empty={<EmptyState title="No RFQs" description="Nothing matches this filter." action={<LinkButton href="/dashboard/rfqs/new">Create RFQ</LinkButton>} />} />
          {state.data && <Pagination page={state.data.page} pageSize={state.data.pageSize} total={state.data.total} onChange={setPage} />}
        </Card>
      )}
    </div>
  );
}
