"use client";

import Link from "next/link";
import { useState } from "react";
import type { Bid } from "@mysupplier/shared";
import { api, errorMessage } from "@/lib/api";
import { useAsync, useFlash } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { formatDateTime, formatSar } from "@/lib/format";
import { Alert, Button, Card, EmptyState, FlashMessage, LinkButton, LoadingBlock, PageHeader, Pagination, Select, StatusBadge, Table, type Column } from "@/components/ui";

const STATUSES = ["SUBMITTED", "ACCEPTED", "REJECTED", "WITHDRAWN"];

export default function SupplierBidsPage() {
  const { t, lang } = useI18n();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const state = useAsync(() => api.bids({ status: status || undefined, page }), [status, page]);
  const [flash, setFlash] = useFlash();
  const [busy, setBusy] = useState<string | null>(null);

  const withdraw = async (b: Bid) => {
    if (!window.confirm("Withdraw this bid?")) return;
    setBusy(b.id);
    try {
      await api.withdrawBid(b.id);
      setFlash({ kind: "success", message: "Bid withdrawn." });
      state.reload();
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const columns: Column<Bid>[] = [
    { key: "rfq", header: "RFQ", render: (b) => (
      <div>
        <Link href={`/supplier/marketplace/${b.rfqId}`} className="font-medium text-brand-700 hover:underline">{b.rfq?.title ?? b.rfqId}</Link>
        <p className="text-xs text-slate-500">{b.rfq?.reference}{b.rfq ? ` · ${b.rfq.deliveryCity}` : ""}</p>
      </div>
    ) },
    { key: "rfqStatus", header: "RFQ status", render: (b) => (b.rfq ? <StatusBadge status={b.rfq.status} /> : "—") },
    { key: "total", header: "My total", align: "end", render: (b) => <span className="font-semibold tabular-nums">{formatSar(b.totalPrice, lang)}</span> },
    { key: "delivery", header: "Delivery", align: "end", render: (b) => `${b.deliveryDays} d` },
    { key: "valid", header: "Valid until", render: (b) => <span className="text-slate-500">{formatDateTime(b.validUntil, lang)}</span> },
    { key: "status", header: t("common.status"), render: (b) => <StatusBadge status={b.status} /> },
    { key: "actions", header: "", align: "end", render: (b) => (
      <div className="flex justify-end gap-2">
        {b.status === "SUBMITTED" && b.rfq?.status === "OPEN" && (
          <>
            <LinkButton href={`/supplier/marketplace/${b.rfqId}`} size="sm" variant="outline">Edit</LinkButton>
            <Button size="sm" variant="ghost" className="text-red-600" onClick={() => withdraw(b)} loading={busy === b.id}>Withdraw</Button>
          </>
        )}
      </div>
    ) },
  ];

  return (
    <div>
      <PageHeader title={t("sup.bids")} action={<Select name="status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder="All statuses" options={STATUSES.map((s) => ({ value: s, label: s }))} />} />
      <FlashMessage flash={flash} className="mb-4" />
      {state.loading ? <LoadingBlock /> : state.error ? <Alert onRetry={state.reload}>{state.error}</Alert> : (
        <Card>
          <Table columns={columns} rows={state.data?.data ?? []} rowKey={(b) => b.id} empty={<EmptyState title="No bids" action={<LinkButton href="/supplier/marketplace">Browse open RFQs</LinkButton>} />} />
          {state.data && <Pagination page={state.data.page} pageSize={state.data.pageSize} total={state.data.total} onChange={setPage} />}
        </Card>
      )}
    </div>
  );
}
