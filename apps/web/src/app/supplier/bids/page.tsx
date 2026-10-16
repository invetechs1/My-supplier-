"use client";

import Link from "next/link";
import { useState } from "react";
import type { Bid } from "@mysupplier/shared";
import { api, errorMessage } from "@/lib/api";
import { useAsync, useFlash } from "@/lib/hooks";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { formatDateTime, formatSar } from "@/lib/format";
import { Alert, Button, Card, EmptyState, FlashMessage, LinkButton, LoadingBlock, PageHeader, Pagination, Select, StatusBadge, Table, type Column } from "@/components/ui";

const STATUSES: Array<{ value: string; labelKey: TranslationKey }> = [
  { value: "SUBMITTED", labelKey: "sup.bids.stSubmitted" },
  { value: "ACCEPTED", labelKey: "sup.bids.stAccepted" },
  { value: "REJECTED", labelKey: "sup.bids.stRejected" },
  { value: "WITHDRAWN", labelKey: "sup.bids.stWithdrawn" },
];

export default function SupplierBidsPage() {
  const { t, lang } = useI18n();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const state = useAsync(() => api.bids({ status: status || undefined, page }), [status, page]);
  const [flash, setFlash] = useFlash();
  const [busy, setBusy] = useState<string | null>(null);

  const withdraw = async (b: Bid) => {
    if (!window.confirm(t("sup.bids.confirmWithdraw"))) return;
    setBusy(b.id);
    try {
      await api.withdrawBid(b.id);
      setFlash({ kind: "success", message: t("sup.bids.withdrawn") });
      state.reload();
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const columns: Column<Bid>[] = [
    { key: "rfq", header: t("sup.bids.rfq"), render: (b) => (
      <div>
        <Link href={`/supplier/marketplace/${b.rfqId}`} className="font-medium text-brand-700 hover:underline">{b.rfq?.title ?? b.rfqId}</Link>
        <p className="text-xs text-slate-500">{b.rfq?.reference}{b.rfq ? ` · ${b.rfq.deliveryCity}` : ""}</p>
      </div>
    ) },
    { key: "rfqStatus", header: t("sup.bids.rfqStatus"), render: (b) => (b.rfq ? <StatusBadge status={b.rfq.status} /> : "—") },
    { key: "total", header: t("sup.bids.myTotal"), align: "end", render: (b) => <span className="font-semibold tabular-nums">{formatSar(b.totalPrice, lang)}</span> },
    { key: "delivery", header: t("order.delivery"), align: "end", render: (b) => `${b.deliveryDays} ${t("common.dayShort")}` },
    { key: "valid", header: t("sup.bids.validUntil"), render: (b) => <span className="text-slate-500">{formatDateTime(b.validUntil, lang)}</span> },
    { key: "status", header: t("common.status"), render: (b) => <StatusBadge status={b.status} /> },
    { key: "actions", header: "", align: "end", render: (b) => (
      <div className="flex justify-end gap-2">
        {b.status === "SUBMITTED" && b.rfq?.status === "OPEN" && (
          <>
            <LinkButton href={`/supplier/marketplace/${b.rfqId}`} size="sm" variant="outline">{t("common.edit")}</LinkButton>
            <Button size="sm" variant="ghost" className="text-red-600" onClick={() => withdraw(b)} loading={busy === b.id}>{t("sup.bids.withdraw")}</Button>
          </>
        )}
      </div>
    ) },
  ];

  return (
    <div>
      <PageHeader title={t("sup.bids")} action={<Select name="status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder={t("orders.allStatuses")} options={STATUSES.map((s) => ({ value: s.value, label: t(s.labelKey) }))} />} />
      <FlashMessage flash={flash} className="mb-4" />
      {state.loading ? <LoadingBlock /> : state.error ? <Alert onRetry={state.reload}>{state.error}</Alert> : (
        <Card>
          <Table columns={columns} rows={state.data?.data ?? []} rowKey={(b) => b.id} empty={<EmptyState title={t("sup.bids.none")} action={<LinkButton href="/supplier/marketplace">{t("sup.bids.browse")}</LinkButton>} />} />
          {state.data && <Pagination page={state.data.page} pageSize={state.data.pageSize} total={state.data.total} onChange={setPage} />}
        </Card>
      )}
    </div>
  );
}
