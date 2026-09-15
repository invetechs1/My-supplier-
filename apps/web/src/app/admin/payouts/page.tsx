"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import React, { Suspense, useState } from "react";
import type { Payout, PayoutStatus } from "@mysupplier/shared";
import { api, errorMessage } from "@/lib/api";
import { useAsync, useFlash } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatDateTime, formatSar } from "@/lib/format";
import { Alert, Badge, Button, Card, EmptyState, FlashMessage, Input, LoadingBlock, Modal, PageHeader, Pagination, Select, Table, type Column } from "@/components/ui";

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function AdminPayoutsInner() {
  const { t, lang } = useI18n();
  const params = useSearchParams();
  const [status, setStatus] = useState<PayoutStatus | "">(() => (params.get("status") === "PENDING" || params.get("status") === "PAID" ? (params.get("status") as PayoutStatus) : ""));
  const [page, setPage] = useState(1);
  const state = useAsync(() => api.adminPayouts({ status: status || undefined, page }), [status, page]);
  const settings = useAsync(() => api.adminSettings(), []);
  const [flash, setFlash] = useFlash(8000);

  const [genOpen, setGenOpen] = useState(false);
  const [gen, setGen] = useState(() => {
    const end = new Date();
    const start = new Date(end.getTime() - 7 * 86400000);
    return { periodStart: isoDay(start), periodEnd: isoDay(end), companyId: "" };
  });
  const [generating, setGenerating] = useState(false);

  const [payTarget, setPayTarget] = useState<Payout | null>(null);
  const [reference, setReference] = useState("");
  const [paying, setPaying] = useState(false);

  const generate = async () => {
    if (!gen.periodStart || !gen.periodEnd || gen.periodStart > gen.periodEnd) {
      setFlash({ kind: "error", message: "Choose a valid period (start before end)." });
      return;
    }
    setGenerating(true);
    try {
      const res = await api.adminGeneratePayouts({ periodStart: gen.periodStart, periodEnd: gen.periodEnd, companyId: gen.companyId.trim() || undefined });
      const total = res.created.reduce((s, p) => s + p.amount, 0);
      setFlash({ kind: "success", message: res.created.length ? `${res.created.length} payout${res.created.length === 1 ? "" : "s"} created totalling ${formatSar(total, lang)}.` : "Nothing to pay out for this period." });
      setGenOpen(false);
      setStatus("");
      setPage(1);
      state.reload();
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setGenerating(false);
    }
  };

  const markPaid = async () => {
    if (!payTarget) return;
    setPaying(true);
    try {
      const updated = await api.adminUpdatePayout(payTarget.id, { status: "PAID", reference: reference.trim() || undefined });
      state.setData((prev) => (prev ? { ...prev, data: prev.data.map((p) => (p.id === updated.id ? updated : p)) } : prev));
      setFlash({ kind: "success", message: `Payout to ${payTarget.company?.name ?? payTarget.companyId} marked paid. The supplier has been notified.` });
      setPayTarget(null);
      setReference("");
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setPaying(false);
    }
  };

  const columns: Column<Payout>[] = [
    { key: "company", header: "Company", render: (p) => <Link href={`/admin/companies/${p.companyId}`} className="font-medium text-brand-700 hover:underline">{p.company?.name ?? p.companyId}</Link> },
    { key: "period", header: "Period", render: (p) => <span className="text-slate-700">{formatDate(p.periodStart, lang)} – {formatDate(p.periodEnd, lang)}</span> },
    { key: "orders", header: "Orders", align: "end", render: (p) => p.orderCount },
    { key: "amount", header: "Amount", align: "end", render: (p) => <span className="font-semibold tabular-nums">{formatSar(p.amount, lang)}</span> },
    { key: "status", header: t("common.status"), render: (p) => <Badge tone={p.status === "PAID" ? "green" : "amber"}>{p.status}</Badge> },
    { key: "ref", header: "Reference", render: (p) => <span className="font-mono text-xs" dir="ltr">{p.reference ?? "—"}</span> },
    { key: "paid", header: "Paid at", render: (p) => <span className="text-slate-500">{p.paidAt ? formatDateTime(p.paidAt, lang) : formatDateTime(p.createdAt, lang)}</span> },
    { key: "actions", header: "", align: "end", render: (p) => p.status === "PENDING" ? <Button size="sm" onClick={() => { setPayTarget(p); setReference(""); }}>Mark paid</Button> : null },
  ];

  const rows = state.data?.data ?? [];
  const pendingTotal = rows.filter((p) => p.status === "PENDING").reduce((s, p) => s + p.amount, 0);

  return (
    <div>
      <PageHeader
        title={t("admin.payouts")}
        subtitle={`Net of paid + delivered orders, minus commission${settings.data ? ` (default ${settings.data.commissionPct}%)` : ""}. Generate a run, transfer the money, then mark each payout paid with the bank reference.`}
        action={
          <>
            <Select name="status" value={status} onChange={(e) => { setStatus(e.target.value as PayoutStatus | ""); setPage(1); }} placeholder="All statuses" options={[{ value: "PENDING", label: "Pending" }, { value: "PAID", label: "Paid" }]} />
            <Button variant="accent" onClick={() => setGenOpen(true)}>Generate payouts</Button>
          </>
        }
      />
      <FlashMessage flash={flash} className="mb-4" />
      {state.loading ? <LoadingBlock /> : state.error ? <Alert onRetry={state.reload}>{state.error}</Alert> : (
        <Card>
          {pendingTotal > 0 && <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-900">Pending on this page: <span className="font-semibold">{formatSar(pendingTotal, lang)}</span></div>}
          <Table columns={columns} rows={rows} rowKey={(p) => p.id} empty={<EmptyState title="No payouts" description="Generate a payout run to create pending payouts for suppliers with paid & delivered orders." action={<Button onClick={() => setGenOpen(true)}>Generate payouts</Button>} />} />
          {state.data && <Pagination page={state.data.page} pageSize={state.data.pageSize} total={state.data.total} onChange={setPage} />}
        </Card>
      )}

      <Modal open={genOpen} title="Generate payouts" onClose={() => setGenOpen(false)} footer={<><Button variant="outline" onClick={() => setGenOpen(false)}>{t("common.cancel")}</Button><Button onClick={generate} loading={generating}>Generate</Button></>}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Creates one PENDING payout per supplier for orders that are paid and delivered within the period and not yet included in a paid payout.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Period start" name="periodStart" type="date" value={gen.periodStart} onChange={(e) => setGen({ ...gen, periodStart: e.target.value })} dir="ltr" required />
            <Input label="Period end" name="periodEnd" type="date" value={gen.periodEnd} onChange={(e) => setGen({ ...gen, periodEnd: e.target.value })} dir="ltr" required />
          </div>
          <Input label="Company ID (optional)" name="companyId" value={gen.companyId} onChange={(e) => setGen({ ...gen, companyId: e.target.value })} dir="ltr" hint="Leave blank to run for every supplier." />
        </div>
      </Modal>

      <Modal open={!!payTarget} title="Mark payout as paid" onClose={() => setPayTarget(null)} footer={<><Button variant="outline" onClick={() => setPayTarget(null)}>{t("common.cancel")}</Button><Button onClick={markPaid} loading={paying}>Confirm paid</Button></>}>
        {payTarget && (
          <div className="space-y-4">
            <dl className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Supplier</dt><dd className="font-medium text-slate-900">{payTarget.company?.name ?? payTarget.companyId}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Period</dt><dd className="font-medium text-slate-900">{formatDate(payTarget.periodStart, lang)} – {formatDate(payTarget.periodEnd, lang)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Amount</dt><dd className="font-semibold tabular-nums text-brand-700">{formatSar(payTarget.amount, lang)}</dd></div>
            </dl>
            <Input label="Bank transfer reference" name="reference" value={reference} onChange={(e) => setReference(e.target.value)} dir="ltr" placeholder="e.g. SARIE-2026-09-15-0042" hint="Shown to the supplier on their finance page." />
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function AdminPayoutsPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <AdminPayoutsInner />
    </Suspense>
  );
}
