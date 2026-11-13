"use client";

import React, { useEffect, useState } from "react";
import type { BankDetails, BankTransferProofResult, EInvoiceRecord, EInvoiceStatus, OrderExtended, PaymentRecord, PaymentRecordStatus, RefundResult } from "@mysupplier/shared";
import { api, einvoiceXmlPath, errorMessage, openDownload, paymentProofPath } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { formatDate, formatDateTime, formatSar } from "@/lib/format";
import { Alert, Badge, Button, Card, CardHeader, Input, LoadingBlock, Modal, Textarea } from "./ui";

const PROVIDER_LABEL: Record<string, string> = { MOYASAR: "Card (Moyasar)", MANUAL: "Manual" };
const METHOD_KEY: Record<string, TranslationKey> = { COD: "checkout.cod", BANK_TRANSFER: "checkout.bank", CARD: "checkout.card", CREDIT: "orders.creditNet" };
const RECORD_TONE: Record<string, "green" | "amber" | "red" | "purple" | "slate" | "blue"> = { PAID: "green", INITIATED: "amber", AUTHORIZED: "blue", CAPTURED: "green", SUBMITTED: "amber", FAILED: "red", REFUNDED: "purple" };
const RECORD_STATUS_KEY: Record<PaymentRecordStatus, TranslationKey> = { INITIATED: "pay.status.INITIATED", AUTHORIZED: "pay.status.AUTHORIZED", CAPTURED: "pay.status.CAPTURED", SUBMITTED: "pay.status.SUBMITTED", PAID: "pay.status.PAID", FAILED: "pay.status.FAILED", REFUNDED: "pay.status.REFUNDED" };

/** Localised badge for a ledger row status (INITIATED / SUBMITTED / PAID …). */
export function PaymentRecordBadge({ status }: { status: PaymentRecordStatus | string }) {
  const { t } = useI18n();
  const key = RECORD_STATUS_KEY[status as PaymentRecordStatus];
  return <Badge tone={RECORD_TONE[status] ?? "slate"}>{key ? t(key) : status}</Badge>;
}

/** Payment records for the order (GET /payments/:orderId); refunds show as REFUNDED rows, bank-transfer proofs as SUBMITTED. */
export function PaymentsList({ orderId, refreshKey = 0 }: { orderId: string; refreshKey?: number }) {
  const { t, lang } = useI18n();
  const state = useAsync(() => api.payments(orderId), [orderId, refreshKey]);
  if (state.loading) return <LoadingBlock className="py-3" label="Loading payments…" />;
  if (state.error) return <p className="text-xs text-slate-400">Payment history unavailable.</p>;
  const records = state.data ?? [];
  if (records.length === 0) return <p className="text-xs text-slate-400">No payment records yet.</p>;
  return (
    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
      {records.map((p: PaymentRecord) => (
        <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <div className="min-w-0">
            <p className="font-medium text-slate-900">
              {p.method && METHOD_KEY[p.method] ? t(METHOD_KEY[p.method]) : PROVIDER_LABEL[p.provider] ?? p.provider}
              {p.provider === "MOYASAR" && p.method && <span className="ms-1 text-xs text-slate-400">· Moyasar</span>}
              {p.providerPaymentId && <span className="ms-2 font-mono text-xs text-slate-400" dir="ltr">{p.providerPaymentId.slice(0, 12)}{p.providerPaymentId.length > 12 ? "…" : ""}</span>}
              {p.reference && <span className="ms-2 font-mono text-xs text-slate-500" dir="ltr">{t("pay.reference")} {p.reference}</span>}
            </p>
            <p className="text-xs text-slate-500">
              {formatDateTime(p.createdAt, lang)}
              {p.paidAt && p.status === "SUBMITTED" && <> · {t("pay.transferDate")}: {formatDate(p.paidAt, lang)}</>}
              {p.hasProof && (
                <>
                  {" · "}
                  <button type="button" onClick={() => void openDownload(paymentProofPath(orderId, p.id))} className="font-medium text-brand-700 hover:underline">{t("pay.viewReceipt")} ↗</button>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`font-semibold tabular-nums ${p.status === "REFUNDED" ? "text-violet-700" : "text-slate-900"}`}>{p.amount < 0 ? "−" : ""}{formatSar(Math.abs(p.amount), lang)}</span>
            <PaymentRecordBadge status={p.status} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Supplier / platform account to transfer to, with the order reference the buyer must quote. */
export function BankDetailsList({ bank, order }: { bank: BankDetails; order: Pick<OrderExtended, "reference" | "total"> }) {
  const { t, lang } = useI18n();
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      <div><dt className="text-slate-500">{t("pay.beneficiary")}</dt><dd className="font-medium text-slate-900">{bank.beneficiary || "—"}<span className="block text-xs font-normal text-slate-500">{bank.source === "supplier" ? t("pay.supplierAccount") : t("pay.platformAccount")}</span></dd></div>
      <div><dt className="text-slate-500">{t("orders.bank")}</dt><dd className="font-medium text-slate-900">{bank.bankName || "—"}</dd></div>
      <div><dt className="text-slate-500">{t("orders.iban")}</dt><dd className="font-mono font-medium text-slate-900" dir="ltr">{bank.iban || "—"}</dd></div>
      <div><dt className="text-slate-500">{t("orders.amount")}</dt><dd className="font-semibold tabular-nums text-brand-700">{formatSar(order.total, lang)}</dd></div>
      <div className="sm:col-span-2"><dt className="text-slate-500">{t("orders.paymentReference")}</dt><dd className="font-mono font-semibold text-slate-900" dir="ltr">{order.reference}</dd></div>
    </dl>
  );
}

/** Buyer form → POST /orders/:id/payments/bank-transfer (reference, amount, date, optional receipt file). */
export function BankTransferProofForm({ order, onSubmitted }: { order: OrderExtended; onSubmitted: (result: BankTransferProofResult) => void }) {
  const { t } = useI18n();
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState(String(order.total));
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (reference.trim().length < 2) return setError(t("pay.errReference"));
    if (!Number.isFinite(value) || value <= 0) return setError(t("pay.errAmount"));
    setBusy(true);
    setError(null);
    try {
      const result = await api.submitBankTransfer(order.id, { reference: reference.trim(), amount: Math.round(value * 100) / 100, paidAt: paidAt || undefined, note: note.trim() || undefined }, file);
      onSubmitted(result);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-slate-900">{t("pay.bankProofTitle")}</p>
        <p className="text-xs text-slate-500">{t("pay.bankProofSubtitle")}</p>
      </div>
      {error && <Alert>{error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Input label={t("pay.transferReference")} name="transferReference" value={reference} onChange={(e) => setReference(e.target.value)} dir="ltr" maxLength={64} required />
        <Input label={t("pay.amountTransferred")} name="transferAmount" type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} dir="ltr" required />
        <Input label={t("pay.transferDate")} name="transferDate" type="date" value={paidAt} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setPaidAt(e.target.value)} dir="ltr" />
      </div>
      <Input label={t("pay.receiptFile")} name="transferFile" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <Textarea label={t("pay.noteOptional")} name="transferNote" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      <Button type="submit" loading={busy}>{t("pay.submitProof")}</Button>
    </form>
  );
}

/** Refund button + modal (supplier owner/manager, admin) for PAID orders → POST /payments/:orderId/refund. */
export function RefundButton({ order, onRefunded }: { order: OrderExtended; onRefunded: (result: RefundResult) => void }) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(order.total));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount(String(order.total));
      setReason("");
      setError(null);
    }
  }, [open, order.total]);

  const submit = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return setError("Enter a refund amount greater than zero.");
    if (value > order.total + 0.005) return setError(`The refund cannot exceed the paid total of ${formatSar(order.total, lang)}.`);
    if (reason.trim().length < 3) return setError("A reason is required (shown to the buyer and on the order timeline).");
    setBusy(true);
    setError(null);
    try {
      const result = await api.refund(order.id, { amount: Math.abs(value - order.total) < 0.005 ? undefined : Math.round(value * 100) / 100, reason: reason.trim() });
      onRefunded(result);
      setOpen(false);
    } catch (err) {
      setError(errorMessage(err, "Refund failed"));
    } finally {
      setBusy(false);
    }
  };

  const isCard = order.paymentMethod === "CARD";

  return (
    <>
      <Button variant="outline" className="border-violet-300 text-violet-700 hover:bg-violet-50" onClick={() => setOpen(true)}>
        Refund
      </Button>
      <Modal
        open={open}
        title={`Refund ${order.reference}`}
        onClose={() => (busy ? undefined : setOpen(false))}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>{t("common.cancel")}</Button>
            <Button variant="danger" onClick={submit} loading={busy}>Refund {formatSar(Number(amount) || 0, lang)}</Button>
          </>
        }
      >
        <div className="space-y-4 text-sm text-slate-600">
          <Alert kind={isCard ? "info" : "warning"}>
            {isCard
              ? "Card payments are refunded through Moyasar to the original card; it usually appears on the buyer's statement within 5–10 business days."
              : "This was paid by bank transfer or cash. The refund is recorded here — transfer the money to the buyer separately."}
          </Alert>
          {error && <Alert>{error}</Alert>}
          <Input label="Amount (SAR)" name="refundAmount" type="number" min={0.01} max={order.total} step="0.01" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} hint={`Paid total ${formatSar(order.total, lang)} · leave as is for a full refund`} required />
          <Textarea label="Reason" name="refundReason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Damaged goods, short delivery, cancelled by buyer…" required />
          <p className="text-xs text-slate-500">The order&apos;s payment status becomes REFUNDED, an event is added and the buyer is notified.</p>
        </div>
      </Modal>
    </>
  );
}

const EINVOICE_TONE: Record<EInvoiceStatus, "green" | "amber" | "red" | "blue" | "slate" | "purple"> = {
  GENERATED: "blue",
  REPORTED: "green",
  CLEARED: "green",
  REJECTED: "red",
  PENDING_CONFIG: "amber",
};
const EINVOICE_LABEL: Record<EInvoiceStatus, string> = {
  GENERATED: "Generated",
  REPORTED: "Reported to ZATCA",
  CLEARED: "Cleared by ZATCA",
  REJECTED: "Rejected by ZATCA",
  PENDING_CONFIG: "Awaiting ZATCA setup",
};

function short(value: string | null | undefined, head = 8, tail = 6): string {
  if (!value) return "—";
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** "E-invoice (ZATCA)" card from GET /orders/:id/einvoice; admins can submit it to ZATCA reporting. */
export function EInvoiceCard({ orderId, isAdmin, onToast }: { orderId: string; isAdmin: boolean; onToast: (flash: { kind: "success" | "error"; message: string }) => void }) {
  const { lang } = useI18n();
  const state = useAsync(() => api.einvoice(orderId), [orderId]);
  const [reporting, setReporting] = useState(false);

  const report = async (record: EInvoiceRecord) => {
    setReporting(true);
    try {
      const updated = await api.adminReportEinvoice(record.id);
      state.setData(updated);
      if (updated.status === "PENDING_CONFIG") {
        onToast({ kind: "error", message: "ZATCA credentials not configured yet — the invoice is queued and will be reported once ZATCA_* settings are set on the API." });
      } else if (updated.status === "REJECTED") {
        onToast({ kind: "error", message: "ZATCA rejected the invoice. Check the response details on the API logs." });
      } else {
        onToast({ kind: "success", message: `Invoice ${updated.invoiceNumber} ${updated.status === "CLEARED" ? "cleared" : "reported"} to ZATCA.` });
      }
    } catch (err) {
      onToast({ kind: "error", message: errorMessage(err, "Reporting failed") });
    } finally {
      setReporting(false);
    }
  };

  const record = state.data;
  return (
    <Card>
      <CardHeader
        title="E-invoice (ZATCA)"
        subtitle="UBL 2.1 XML with chained hash — phase 2 integration"
        action={record ? <Badge tone={EINVOICE_TONE[record.status] ?? "slate"}>{EINVOICE_LABEL[record.status] ?? record.status}</Badge> : undefined}
      />
      {state.loading ? (
        <LoadingBlock className="py-6" />
      ) : state.error || !record ? (
        <div className="px-5 py-4">
          <Alert kind="info" onRetry={state.reload}>{state.error ?? "E-invoice not generated yet."}</Alert>
        </div>
      ) : (
        <div className="space-y-3 px-5 py-4 text-sm">
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <div><dt className="text-slate-500">Invoice number</dt><dd className="font-mono font-medium text-slate-900" dir="ltr">{record.invoiceNumber}</dd></div>
            <div><dt className="text-slate-500">Counter</dt><dd className="font-medium text-slate-900">#{record.counter}</dd></div>
            <div><dt className="text-slate-500">UUID</dt><dd className="font-mono text-xs text-slate-900" dir="ltr" title={record.uuid}>{short(record.uuid, 8, 4)}</dd></div>
            <div><dt className="text-slate-500">Hash</dt><dd className="font-mono text-xs text-slate-900" dir="ltr" title={record.invoiceHash}>{short(record.invoiceHash, 10, 6)}</dd></div>
            <div><dt className="text-slate-500">Previous hash</dt><dd className="font-mono text-xs text-slate-900" dir="ltr" title={record.previousInvoiceHash}>{short(record.previousInvoiceHash, 10, 6)}</dd></div>
            <div><dt className="text-slate-500">Generated</dt><dd className="font-medium text-slate-900">{formatDateTime(record.createdAt, lang)}</dd></div>
          </dl>
          {record.status === "PENDING_CONFIG" && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">ZATCA credentials not configured yet. The invoice is valid and stored; it will be reported once the platform is onboarded with ZATCA.</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void openDownload(einvoiceXmlPath(orderId))} className="inline-flex h-8 items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50">
              Download XML ↗
            </button>
            {isAdmin && (record.status === "GENERATED" || record.status === "PENDING_CONFIG" || record.status === "REJECTED") && (
              <Button size="sm" onClick={() => report(record)} loading={reporting}>Report to ZATCA</Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
