"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { OrderEvent, OrderExtended, OrderItem, OrderMessage, OrderStatus, PaymentMethod, PaymentStatus, ReturnReason, ReturnRequest, Review } from "@mysupplier/shared";
import { api, deliveryNoteHtmlPath, errorMessage, invoiceHtmlPath, openDownload } from "@/lib/api";
import { RETURN_REASONS, canRequestReturn, commerceApi, formatAddressLine, returnReasonLabel, returnStatusTone, type OrderWithCommerce } from "@/lib/api/commerce";
import { canManageCompany, companyRoleOf, useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { useAsync, useFlash } from "@/lib/hooks";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { BANK_TRANSFER_DETAILS, usePaymentConfig } from "@/lib/payments";
import { cn, formatDate, formatDateTime, formatSar, timeAgo } from "@/lib/format";
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, FlashMessage, Input, LinkButton, LoadingBlock, Modal, PageHeader, Pagination, Select, Stars, StatusBadge, Table, Textarea, type Column } from "./ui";
import { OrderShipments } from "./OrderShipments";
import { EInvoiceCard, PaymentsList, RefundButton } from "./OrderPayments";

export type OrderPerspective = "buyer" | "supplier" | "admin";

const FLOW: OrderStatus[] = ["PENDING", "CONFIRMED", "IN_TRANSIT", "DELIVERED"];

type Translate = (key: TranslationKey) => string;

const PAYMENT_LABEL_KEY: Record<PaymentMethod, TranslationKey> = { COD: "checkout.cod", BANK_TRANSFER: "checkout.bank", CARD: "checkout.card", CREDIT: "orders.creditNet" };
const ORDER_STATUS_KEY: Record<OrderStatus, TranslationKey> = { PENDING: "orders.stPending", CONFIRMED: "orders.stConfirmed", IN_TRANSIT: "orders.stInTransit", DELIVERED: "orders.stDelivered", CANCELLED: "orders.stCancelled" };
const PAYMENT_STATUS_KEY: Record<PaymentStatus, TranslationKey> = { UNPAID: "checkout.unpaid", PAID: "checkout.paid", REFUNDED: "checkout.refunded" };
const RETURN_STATUS_KEY: Record<string, TranslationKey> = { REQUESTED: "returns.stRequested", APPROVED: "returns.stApproved", RECEIVED: "returns.stReceived", REFUNDED: "returns.stRefunded", REJECTED: "returns.stRejected", CANCELLED: "returns.stCancelled" };
const RETURN_REASON_KEY: Record<string, TranslationKey> = { DAMAGED: "returns.rsDamaged", DEFECTIVE: "returns.rsDefective", WRONG_ITEM: "returns.rsWrongItem", NOT_AS_DESCRIBED: "returns.rsNotAsDescribed", EXCESS: "returns.rsExcess", OTHER: "returns.rsOther" };

/** Human label for an order status (falls back to the raw enum for unknown values). */
export function orderStatusLabel(status: OrderStatus | string, t: Translate): string {
  const key = ORDER_STATUS_KEY[status as OrderStatus];
  return key ? t(key) : status.replace(/_/g, " ");
}
function paymentStatusLabel(status: string, t: Translate): string {
  const key = PAYMENT_STATUS_KEY[status as PaymentStatus];
  return key ? t(key) : status;
}
export function returnStatusLabel(status: string, t: Translate): string {
  const key = RETURN_STATUS_KEY[status];
  return key ? t(key) : status.replace(/_/g, " ");
}
function returnReasonText(reason: string, t: Translate): string {
  const key = RETURN_REASON_KEY[reason];
  return key ? t(key) : returnReasonLabel(reason);
}

/** Orders awarded from RFQs have no `type` on older API builds; infer it defensively. */
export function orderType(o: OrderExtended): "RFQ" | "DIRECT" {
  if (o.type === "RFQ" || o.type === "DIRECT") return o.type;
  return o.rfqId ? "RFQ" : "DIRECT";
}

export function OrderTypeBadge({ order }: { order: OrderExtended }) {
  const { t } = useI18n();
  const type = orderType(order);
  return <Badge tone={type === "DIRECT" ? "green" : "blue"}>{type === "DIRECT" ? t("orders.typeDirect") : t("orders.typeRfq")}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus | string | null | undefined }) {
  const { t } = useI18n();
  if (!status) return <Badge tone="slate">—</Badge>;
  const tone = status === "PAID" ? "green" : status === "REFUNDED" ? "purple" : "amber";
  return <Badge tone={tone}>{paymentStatusLabel(status, t)}</Badge>;
}

export function OrderStatusTimeline({ status }: { status: OrderStatus }) {
  const { t } = useI18n();
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
              <span className={cn("mt-1 whitespace-nowrap text-[10px] font-medium uppercase tracking-wide", done ? "text-brand-700" : "text-slate-400")}>{orderStatusLabel(s, t)}</span>
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

const ORDER_STATUSES: OrderStatus[] = ["PENDING", "CONFIRMED", "IN_TRANSIT", "DELIVERED", "CANCELLED"];
const PAYMENT_STATUSES: PaymentStatus[] = ["UNPAID", "PAID", "REFUNDED"];

export function OrdersList({ perspective, basePath, title, subtitle, filters }: { perspective: OrderPerspective; basePath: string; title?: string; subtitle?: string; filters?: boolean }) {
  const { t, lang } = useI18n();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | "">("");
  const state = useAsync(() => api.orders(filters ? { page, status, paymentStatus } : page), [page, status, paymentStatus, filters]);
  // The contract documents only `?page=`; apply the filters client-side too so they work on every API build.
  const rows = (state.data?.data ?? []).filter((o) => (!status || o.status === status) && (!paymentStatus || o.paymentStatus === paymentStatus));

  const columns: Column<OrderExtended>[] = [
    { key: "ref", header: t("checkout.reference"), render: (o) => <Link href={`${basePath}/${o.id}`} className="font-medium text-brand-700 hover:underline">{o.reference}</Link> },
    { key: "type", header: t("orders.type"), render: (o) => <OrderTypeBadge order={o} /> },
    {
      key: "source",
      header: t("orders.items"),
      render: (o) =>
        orderType(o) === "RFQ" ? (
          <span>{o.rfq?.title ?? o.rfqId}</span>
        ) : (
          <span className="text-slate-700">
            {o.items?.length ?? 0} {o.items?.length === 1 ? t("cart.itemOne") : t("cart.itemMany")}
            {o.items?.[0] && <span className="block max-w-[240px] truncate text-xs text-slate-500">{o.items.map((i) => i.name).join(", ")}</span>}
          </span>
        ),
    },
    ...(perspective === "buyer"
      ? [{ key: "supplier", header: t("product.supplier"), render: (o: OrderExtended) => o.company?.name ?? o.companyId } as Column<OrderExtended>]
      : perspective === "supplier"
        ? [{ key: "buyer", header: t("reviews.buyer"), render: (o: OrderExtended) => o.rfq?.buyer?.name ?? o.contactPhone ?? o.buyerId } as Column<OrderExtended>]
        : [
            { key: "supplier", header: t("product.supplier"), render: (o: OrderExtended) => (o.company ? <Link href={`/admin/companies/${o.company.id}`} className="hover:text-brand-700">{o.company.name}</Link> : o.companyId) } as Column<OrderExtended>,
            { key: "buyer", header: t("reviews.buyer"), render: (o: OrderExtended) => o.rfq?.buyer?.name ?? o.contactPhone ?? o.buyerId } as Column<OrderExtended>,
          ]),
    { key: "total", header: t("common.total"), align: "end", render: (o) => <span className="font-semibold tabular-nums">{formatSar(o.total, lang)}</span> },
    { key: "payment", header: t("orders.payment"), render: (o) => <PaymentStatusBadge status={o.paymentStatus} /> },
    { key: "status", header: t("common.status"), render: (o) => <StatusBadge status={o.status} /> },
    { key: "updated", header: t("orders.updated"), render: (o) => <span className="text-slate-500">{formatDateTime(o.updatedAt, lang)}</span> },
  ];

  return (
    <div>
      <PageHeader title={title ?? t("dash.orders")} subtitle={subtitle ?? t("orders.listSubtitle")} />
      {filters && (
        <Card className="mb-4 p-4">
          <div className="grid gap-3 sm:grid-cols-[220px_220px_auto]">
            <Select name="orderStatus" value={status} onChange={(e) => { setStatus(e.target.value as OrderStatus | ""); setPage(1); }} placeholder={t("orders.allStatuses")} options={ORDER_STATUSES.map((st) => ({ value: st, label: orderStatusLabel(st, t) }))} />
            <Select name="paymentStatusFilter" value={paymentStatus} onChange={(e) => { setPaymentStatus(e.target.value as PaymentStatus | ""); setPage(1); }} placeholder={t("orders.allPayments")} options={PAYMENT_STATUSES.map((ps) => ({ value: ps, label: paymentStatusLabel(ps, t) }))} />
            {(status || paymentStatus) && <Button variant="ghost" onClick={() => { setStatus(""); setPaymentStatus(""); setPage(1); }}>{t("shop.clearFilters")}</Button>}
          </div>
        </Card>
      )}
      {state.loading ? (
        <LoadingBlock />
      ) : state.error ? (
        <Alert onRetry={state.reload}>{state.error}</Alert>
      ) : (
        <Card>
          <Table columns={columns} rows={rows} rowKey={(o) => o.id} empty={<EmptyState title={status || paymentStatus ? t("orders.noMatch") : t("orders.none")} description={status || paymentStatus ? t("orders.noMatchDesc") : t("orders.noneDesc")} />} />
          {state.data && <Pagination page={state.data.page} pageSize={state.data.pageSize} total={state.data.total} onChange={setPage} />}
        </Card>
      )}
    </div>
  );
}

/** Static bank-transfer instructions; the order reference must be quoted so the supplier can match the payment. */
export function BankTransferInstructions({ order }: { order: OrderExtended }) {
  const { t, lang } = useI18n();
  return (
    <Card>
      <CardHeader title={t("orders.bankTitle")} subtitle={t("orders.bankSubtitle")} />
      <dl className="grid gap-x-6 gap-y-3 px-5 py-4 text-sm sm:grid-cols-2">
        <div><dt className="text-slate-500">{t("orders.bank")}</dt><dd className="font-medium text-slate-900">{BANK_TRANSFER_DETAILS.bankName}</dd></div>
        <div><dt className="text-slate-500">{t("orders.accountName")}</dt><dd className="font-medium text-slate-900">{BANK_TRANSFER_DETAILS.accountName}</dd></div>
        <div><dt className="text-slate-500">{t("orders.iban")}</dt><dd className="font-mono font-medium text-slate-900" dir="ltr">{BANK_TRANSFER_DETAILS.iban}</dd></div>
        <div><dt className="text-slate-500">{t("orders.swift")}</dt><dd className="font-mono font-medium text-slate-900" dir="ltr">{BANK_TRANSFER_DETAILS.swift}</dd></div>
        <div><dt className="text-slate-500">{t("orders.amount")}</dt><dd className="font-semibold tabular-nums text-brand-700">{formatSar(order.total, lang)}</dd></div>
        <div><dt className="text-slate-500">{t("orders.paymentReference")}</dt><dd className="font-mono font-semibold text-slate-900" dir="ltr">{order.reference}</dd></div>
      </dl>
      <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
        {t("orders.sendReceiptTo")} <a href="mailto:payments@mysupplier.sa" className="font-semibold text-brand-700 hover:underline">payments@mysupplier.sa</a> {t("orders.quotingReference")}
      </p>
    </Card>
  );
}

/** Compact ZATCA invoice preview (GET /orders/:id/invoice) with a link to the printable HTML version. */
export function InvoicePreview({ orderId }: { orderId: string }) {
  const { t, lang } = useI18n();
  const invoice = useAsync(() => api.invoice(orderId), [orderId]);
  const openInvoice = () => void openDownload(invoiceHtmlPath(orderId));

  return (
    <Card>
      <CardHeader
        title={t("orders.taxInvoice")}
        subtitle={t("orders.taxInvoiceSub")}
        action={
          <Button variant="outline" size="sm" onClick={openInvoice}>
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
              <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clipRule="evenodd" />
              <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clipRule="evenodd" />
            </svg>
            {t("orders.viewInvoice")}
          </Button>
        }
      />
      {invoice.loading ? (
        <LoadingBlock className="py-6" />
      ) : invoice.error || !invoice.data ? (
        <div className="px-5 py-4">
          <Alert kind="info" onRetry={invoice.reload}>{invoice.error ?? t("orders.invoiceNotAvailable")}</Alert>
        </div>
      ) : (
        <div className="flex flex-wrap items-start gap-5 px-5 py-4 text-sm">
          <dl className="min-w-0 flex-1 space-y-2">
            <div><dt className="text-slate-500">{t("orders.invoiceNumber")}</dt><dd className="font-mono font-medium text-slate-900" dir="ltr">{invoice.data.invoiceNumber}</dd></div>
            <div><dt className="text-slate-500">{t("orders.issued")}</dt><dd className="font-medium text-slate-900">{formatDate(invoice.data.issuedAt, lang)}</dd></div>
            <div><dt className="text-slate-500">{t("orders.seller")}</dt><dd className="font-medium text-slate-900">{invoice.data.seller?.name}</dd></div>
            <div><dt className="text-slate-500">{t("orders.sellerVat")}</dt><dd className="font-mono font-medium text-slate-900" dir="ltr">{invoice.data.seller?.vatNumber ?? "—"}</dd></div>
            <div><dt className="text-slate-500">{t("orders.totalInclVat")}</dt><dd className="font-semibold tabular-nums text-slate-900">{formatSar(invoice.data.order?.total, lang)}</dd></div>
          </dl>
          {invoice.data.qrSvg && (
            <div className="shrink-0">
              <div className="h-[120px] w-[120px] overflow-hidden rounded-lg border border-slate-200 bg-white p-1 [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: invoice.data.qrSvg }} aria-label={t("orders.zatcaQrCode")} role="img" />
              <p className="mt-1 text-center text-[10px] text-slate-400">{t("orders.zatcaQr")}</p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}


const EVENT_ICON: Record<OrderEvent["type"], string> = { CREATED: "★", STATUS: "→", PAYMENT: "₨", NOTE: "✎", MESSAGE: "✉", REVIEW: "☆" };
const EVENT_TONE: Record<OrderEvent["type"], string> = {
  CREATED: "bg-brand-600 text-white",
  STATUS: "bg-sky-100 text-sky-700",
  PAYMENT: "bg-emerald-100 text-emerald-700",
  NOTE: "bg-slate-100 text-slate-600",
  MESSAGE: "bg-amber-100 text-amber-800",
  REVIEW: "bg-violet-100 text-violet-700",
};

function eventTitle(e: OrderEvent, t: Translate): string {
  switch (e.type) {
    case "CREATED":
      return t("orders.evPlaced");
    case "STATUS":
      return e.status ? `${t("orders.evStatusChangedTo")} ${orderStatusLabel(e.status, t).toLowerCase()}` : t("orders.evStatusUpdated");
    case "PAYMENT":
      return e.message ?? t("orders.evPaymentUpdated");
    case "MESSAGE":
      return t("orders.evNewMessage");
    case "REVIEW":
      return t("orders.evReviewReceived");
    default:
      return e.message ?? t("orders.evNote");
  }
}

/** Vertical activity timeline from GET /orders/:id/events. */
export function OrderActivity({ orderId, refreshKey = 0 }: { orderId: string; refreshKey?: number }) {
  const { t, lang } = useI18n();
  const state = useAsync(() => api.orderEvents(orderId), [orderId, refreshKey]);
  return (
    <Card>
      <CardHeader title={t("order.activity")} />
      {state.loading ? (
        <LoadingBlock className="py-6" />
      ) : state.error ? (
        <div className="px-5 py-4"><Alert kind="info" onRetry={state.reload}>{state.error}</Alert></div>
      ) : (state.data ?? []).length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-500">{t("orders.noActivity")}</p>
      ) : (
        <ol className="space-y-0 px-5 py-4">
          {(state.data ?? []).map((e, i, all) => (
            <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
              {i < all.length - 1 && <span className="absolute start-[13px] top-7 h-[calc(100%-1.25rem)] w-px bg-slate-200" aria-hidden />}
              <span className={cn("relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold", EVENT_TONE[e.type] ?? "bg-slate-100 text-slate-600")} aria-hidden>{EVENT_ICON[e.type] ?? "•"}</span>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium text-slate-900">{eventTitle(e, t)}</p>
                {e.message && e.type !== "PAYMENT" && e.type !== "NOTE" && <p className="text-slate-600">{e.message}</p>}
                {e.type === "NOTE" && e.message && <p className="text-slate-600">{e.message}</p>}
                <p className="text-xs text-slate-400">{e.user?.name ? `${e.user.name} · ` : ""}{formatDateTime(e.createdAt, lang)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

const MESSAGE_POLL_MS = 20_000;

/** Buyer ↔ supplier thread on an order; polls every 20 s while mounted. */
export function OrderMessages({ orderId, perspective, onActivity }: { orderId: string; perspective: OrderPerspective; onActivity?: () => void }) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const [messages, setMessages] = useState<OrderMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [unseen, setUnseen] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const seenCount = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const load = async () => {
      try {
        const data = await api.orderMessages(orderId, controller.signal);
        if (!active) return;
        setError(null);
        setMessages(data);
        if (seenCount.current !== null && data.length > seenCount.current) {
          const fresh = data.slice(seenCount.current).filter((m) => m.sender.id !== user?.id).length;
          if (fresh > 0) setUnseen((u) => u + fresh);
        }
        seenCount.current = data.length;
      } catch (err) {
        if (!active || (err instanceof DOMException && err.name === "AbortError")) return;
        setError(errorMessage(err));
      }
    };
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, MESSAGE_POLL_MS);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
    };
  }, [orderId, user?.id]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages?.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setSending(true);
    const optimistic: OrderMessage = { id: `tmp-${Date.now()}`, orderId, sender: { id: user?.id ?? "me", name: user?.name ?? t("orders.you"), role: user?.role ?? "BUYER" }, body: text, createdAt: new Date().toISOString() };
    setMessages((prev) => [...(prev ?? []), optimistic]);
    setBody("");
    try {
      const saved = await api.sendOrderMessage(orderId, text);
      setMessages((prev) => (prev ?? []).map((m) => (m.id === optimistic.id ? saved : m)));
      seenCount.current = (seenCount.current ?? 0) + 1;
      onActivity?.();
    } catch (err) {
      setMessages((prev) => (prev ?? []).filter((m) => m.id !== optimistic.id));
      setBody(text);
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const counterpart = perspective === "buyer" ? t("orders.theSupplier") : t("orders.theBuyer");

  return (
    <Card className="flex flex-col">
      <CardHeader
        title={<span className="inline-flex items-center gap-2">{t("order.messages")}{unseen > 0 && <Badge tone="amber">{unseen} {t("orders.new")}</Badge>}</span>}
        subtitle={`${t("orders.askPrefix")} ${counterpart} ${t("orders.askSuffix")}`}
      />
      <div ref={listRef} className="max-h-80 min-h-[120px] space-y-3 overflow-y-auto px-5 py-4" onScroll={() => setUnseen(0)}>
        {messages === null && !error && <LoadingBlock className="py-4" />}
        {error && <Alert kind="info">{error}</Alert>}
        {messages && messages.length === 0 && <p className="py-4 text-center text-sm text-slate-500">{t("orders.noMessages")} {counterpart}.</p>}
        {(messages ?? []).map((m) => {
          const mine = m.sender.id === user?.id || (perspective !== "admin" && m.sender.role === (perspective === "buyer" ? "BUYER" : "SUPPLIER"));
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm", mine ? "rounded-br-sm bg-brand-600 text-white" : "rounded-bl-sm bg-slate-100 text-slate-900", m.id.startsWith("tmp-") && "opacity-60")}>
                {!mine && <p className="mb-0.5 text-[11px] font-semibold text-slate-500">{m.sender.name}</p>}
                <p className="whitespace-pre-line break-words">{m.body}</p>
                <p className={cn("mt-1 text-[10px]", mine ? "text-brand-100" : "text-slate-400")} title={formatDateTime(m.createdAt, lang)}>
                  {timeAgo(m.createdAt)}{mine && m.readAt ? ` · ${t("orders.read")}` : ""}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      {perspective !== "admin" && (
        <form onSubmit={send} className="flex items-end gap-2 border-t border-slate-100 px-4 py-3">
          <Textarea
            name={`msg-${orderId}`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={1}
            placeholder={t("orders.writeMessage")}
            className="flex-1 [&_textarea]:min-h-[40px] [&_textarea]:resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(e);
              }
            }}
            aria-label={t("orders.message")}
          />
          <Button type="submit" loading={sending} disabled={!body.trim()}>{t("orders.send")}</Button>
        </form>
      )}
    </Card>
  );
}

/** Rating block: buyer rates a DELIVERED order once; supplier can reply once; both see the result. */
export function OrderReview({ order, perspective, review, onChange }: { order: OrderExtended; perspective: OrderPerspective; review: Review | null; onChange: (r: Review) => void }) {
  const { t } = useI18n();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canRate = perspective === "buyer" && order.status === "DELIVERED" && !review;
  const canReply = perspective === "supplier" && !!review && !review.reply;
  if (!review && !canRate) return null;

  const submitRating = async () => {
    if (rating < 1) {
      setError(t("orders.pickRating"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onChange(await api.createReview(order.id, { rating, comment: comment.trim() || undefined }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submitReply = async () => {
    if (!review || reply.trim().length < 2) {
      setError(t("orders.writeReply"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onChange(await api.replyToReview(review.id, reply.trim()));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title={review ? t("orders.review") : t("order.rateSupplier")} subtitle={review ? undefined : t("orders.rateSubtitle")} />
      <CardBody className="space-y-3">
        {error && <Alert>{error}</Alert>}
        {review ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Stars value={review.rating} size="md" />
              <span className="text-xs text-slate-400">{formatDate(review.createdAt)}</span>
            </div>
            <p className="text-sm text-slate-800">{review.comment || <span className="italic text-slate-400">{t("orders.noComment")}</span>}</p>
            <p className="text-xs text-slate-500">— {review.buyer?.name}{review.buyer?.company ? `, ${review.buyer.company.name}` : ""}</p>
            {review.reply ? (
              <div className="rounded-xl border-s-4 border-brand-600 bg-brand-50 px-3 py-2 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{t("reviews.supplierReply")}{review.repliedAt ? ` · ${formatDate(review.repliedAt)}` : ""}</p>
                <p className="mt-0.5 text-slate-800">{review.reply}</p>
              </div>
            ) : canReply ? (
              <div className="space-y-2">
                <Textarea name="reply" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t("orders.replyPlaceholder")} />
                <Button size="sm" onClick={submitReply} loading={busy}>{t("sup.reviews.postReply")}</Button>
              </div>
            ) : perspective === "supplier" ? null : (
              <p className="text-xs text-slate-400">{t("orders.noReplyYet")}</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <Stars value={rating} onChange={setRating} size="lg" />
            <Textarea name="reviewComment" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t("orders.reviewPlaceholder")} />
            <Button onClick={submitRating} loading={busy} disabled={rating < 1}>{t("orders.submitRating")}</Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/** Reviews may be embedded on the order by newer API builds; tolerate both `review` and `reviews[0]`. */
// ---------------------------------------------------------------------------
// Returns (RMA)
// ---------------------------------------------------------------------------

export function ReturnStatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  return <Badge tone={returnStatusTone(status)}>{returnStatusLabel(status, t)}</Badge>;
}

function returnHref(perspective: OrderPerspective, id: string): string | null {
  if (perspective === "buyer") return `/dashboard/returns/${id}`;
  if (perspective === "supplier") return `/supplier/returns/${id}`;
  return null;
}

/** Existing return requests on an order, for every perspective (the API scopes the list). */
export function OrderReturns({ orderId, perspective, refreshKey = 0, onLoaded }: { orderId: string; perspective: OrderPerspective; refreshKey?: number; onLoaded?: (returns: ReturnRequest[]) => void }) {
  const { t, lang } = useI18n();
  const state = useAsync(() => commerceApi.returns({ orderId }), [orderId, refreshKey]);
  const rows = useMemo(() => state.data?.data ?? [], [state.data]);
  useEffect(() => {
    if (state.data) onLoaded?.(rows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.data]);
  if (state.loading && !state.data) return null;
  if (state.error) return null;
  if (rows.length === 0) return null;
  return (
    <Card>
      <CardHeader title={t("dash.returns")} subtitle={`${rows.length} ${rows.length === 1 ? t("returns.requestOne") : t("returns.requestMany")} ${t("returns.onThisOrder")}`} />
      <ul className="divide-y divide-slate-100">
        {rows.map((r) => {
          const href = returnHref(perspective, r.id);
          const qty = r.items.reduce((s, i) => s + i.quantity, 0);
          return (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-slate-900">
                  {href ? <Link href={href} className="text-brand-700 hover:underline">{r.reference}</Link> : r.reference}
                  <span className="ms-2 text-xs text-slate-500">{formatDate(r.createdAt, lang)}</span>
                </p>
                <p className="truncate text-xs text-slate-500">
                  {returnReasonText(r.reason, t)} · {r.items.length} {r.items.length === 1 ? t("orders.lineOne") : t("orders.lineMany")} · {qty} {t("returns.units")}
                  {typeof r.refundAmount === "number" ? ` · ${t("returns.refundLower")} ${formatSar(r.refundAmount, lang)}` : ""}
                </p>
              </div>
              <ReturnStatusBadge status={r.status} />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Buyer modal: pick the lines and quantities to send back. */
export function ReturnRequestModal({ order, open, onClose, existing, onCreated }: { order: OrderExtended; open: boolean; onClose: () => void; existing: ReturnRequest[]; onCreated: (r: ReturnRequest) => void }) {
  const { t, lang } = useI18n();
  const [reason, setReason] = useState<ReturnReason | "">("");
  const [details, setDetails] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Quantities already claimed by open or accepted returns cannot be requested again.
  const claimed = useMemo(() => {
    const map = new Map<string, number>();
    existing
      .filter((r) => r.status !== "REJECTED" && r.status !== "CANCELLED")
      .forEach((r) => r.items.forEach((i) => map.set(i.orderItemId, (map.get(i.orderItemId) ?? 0) + i.quantity)));
    return map;
  }, [existing]);
  const lines = (order.items ?? []).map((it: OrderItem) => ({ item: it, remaining: Math.max(0, it.quantity - (claimed.get(it.id) ?? 0)) }));
  const selected = lines.filter((l) => (qty[l.item.id] ?? 0) > 0);
  const estimate = selected.reduce((s, l) => s + (qty[l.item.id] ?? 0) * l.item.unitPrice, 0);

  useEffect(() => {
    if (!open) {
      setReason("");
      setDetails("");
      setQty({});
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    setError(null);
    if (!reason) return setError(t("returns.errReason"));
    if (selected.length === 0) return setError(t("returns.errItems"));
    if (reason === "OTHER" && details.trim().length < 5) return setError(t("returns.errDescribe"));
    setSubmitting(true);
    try {
      const created = await commerceApi.createReturn(order.id, {
        reason,
        details: details.trim() || undefined,
        items: selected.map((l) => ({ orderItemId: l.item.id, quantity: qty[l.item.id] })),
      });
      onCreated(created);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${t("returns.requestTitle")} · ${order.reference}`}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>{t("common.cancel")}</Button>
          <Button onClick={submit} loading={submitting} disabled={selected.length === 0 || !reason}>{t("returns.submitRequest")}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">{t("returns.policy")}</p>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 text-start">{t("orders.item")}</th>
                <th className="px-3 py-2 text-end">{t("returns.ordered")}</th>
                <th className="px-3 py-2 text-end">{t("returns.returnable")}</th>
                <th className="px-3 py-2 text-end">{t("returns.returnQty")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map(({ item, remaining }) => (
                <tr key={item.id} className={cn(remaining <= 0 && "opacity-50")}>
                  <td className="px-3 py-2">
                    <p className="font-medium text-slate-900">{item.name}</p>
                    <p className="text-xs text-slate-500">{formatSar(item.unitPrice, lang)} / {item.unit}</p>
                  </td>
                  <td className="px-3 py-2 text-end tabular-nums">{item.quantity}</td>
                  <td className="px-3 py-2 text-end tabular-nums">{remaining}</td>
                  <td className="px-3 py-2 text-end">
                    <div className="inline-flex items-center gap-1" dir="ltr">
                      <Input
                        type="number"
                        name={`return-${item.id}`}
                        aria-label={`${t("returns.quantityOf")} ${item.name} ${t("returns.toReturn")}`}
                        min={0}
                        max={remaining}
                        step="any"
                        value={qty[item.id] ?? 0}
                        disabled={remaining <= 0}
                        onChange={(e) => {
                          const v = Math.max(0, Math.min(remaining, Number(e.target.value) || 0));
                          setQty((q) => ({ ...q, [item.id]: v }));
                        }}
                        className="w-24"
                      />
                      <button type="button" className="text-xs font-medium text-brand-700 hover:underline disabled:opacity-40" disabled={remaining <= 0} onClick={() => setQty((q) => ({ ...q, [item.id]: remaining }))}>
                        {t("returns.all")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label={t("returns.reason")} name="returnReason" value={reason} onChange={(e) => setReason(e.target.value as ReturnReason)} placeholder={t("returns.selectReason")} options={RETURN_REASONS.map((r) => ({ value: r.value, label: returnReasonText(r.value, t) }))} required />
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
            <p className="text-slate-500">{t("returns.estimatedRefundExVat")}</p>
            <p className="text-lg font-semibold tabular-nums text-slate-900">{formatSar(estimate, lang)}</p>
            <p className="text-xs text-slate-500">{t("returns.finalAmountNote")}</p>
          </div>
        </div>
        <Textarea label={t("returns.details")} name="returnDetails" value={details} onChange={(e) => setDetails(e.target.value)} rows={3} placeholder={t("returns.detailsPlaceholder")} required={reason === "OTHER"} />
        {error && <Alert>{error}</Alert>}
      </div>
    </Modal>
  );
}

function embeddedReview(o: OrderExtended): Review | null {
  const anyOrder = o as OrderExtended & { review?: Review | null; reviews?: Review[] };
  if (anyOrder.review) return anyOrder.review;
  if (Array.isArray(anyOrder.reviews) && anyOrder.reviews.length > 0) return anyOrder.reviews[0];
  return null;
}

export function OrderDetail({ id, perspective, backHref }: { id: string; perspective: OrderPerspective; backHref: string }) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const { reload: reloadCart } = useCart();
  const state = useAsync(() => api.order(id), [id]);
  const [paymentsKey, setPaymentsKey] = useState(0);
  const { config: paymentConfig } = usePaymentConfig();
  const [flash, setFlash] = useFlash(6000);
  const [busy, setBusy] = useState<OrderStatus | "PAID" | "REORDER" | null>(null);
  const [activityKey, setActivityKey] = useState(0);
  const [review, setReview] = useState<Review | null | undefined>(undefined);
  const [returnsKey, setReturnsKey] = useState(0);
  const [orderReturns, setOrderReturns] = useState<ReturnRequest[]>([]);
  const [returnOpen, setReturnOpen] = useState(false);
  const [createdReturn, setCreatedReturn] = useState<ReturnRequest | null>(null);
  const bumpActivity = () => setActivityKey((k) => k + 1);

  const reorder = async () => {
    setBusy("REORDER");
    try {
      const result = await commerceApi.reorder(id);
      reloadCart();
      const replaced = result.skipped.filter((sk) => /instead/i.test(sk.reason));
      const dropped = result.skipped.filter((sk) => !/instead/i.test(sk.reason));
      if (result.added === 0) {
        setFlash({ kind: "error", message: `${t("orders.reorderNothing")} ${dropped.map((sk) => `${sk.name} (${sk.reason})`).join("; ") || t("orders.noPurchasableLines")}.` });
      } else {
        const notes = [
          replaced.length > 0 ? `${replaced.length} ${replaced.length === 1 ? t("orders.lineOne") : t("orders.lineMany")} ${t("orders.switchedSupplier")}` : "",
          dropped.length > 0 ? `${dropped.length} ${t("orders.skipped")} ${dropped.map((sk) => sk.name).join(", ")}` : "",
        ].filter(Boolean);
        setFlash({ kind: "success", message: `${result.added} ${result.added === 1 ? t("orders.lineOne") : t("orders.lineMany")} ${t("orders.addedToCart")}${notes.length ? ` · ${notes.join(" · ")}` : ""}.` });
        if (dropped.length === 0) router.push("/cart");
      }
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const setStatus = async (status: OrderStatus) => {
    if (status === "CANCELLED" && !window.confirm(t("orders.confirmCancel"))) return;
    setBusy(status);
    try {
      const updated = await api.updateOrderStatus(id, status);
      state.setData((prev) => (prev ? { ...prev, ...updated } : updated));
      bumpActivity();
      setFlash({ kind: "success", message: `${t("orders.markedPrefix")} ${orderStatusLabel(status, t).toLowerCase()}.` });
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const markPaid = async () => {
    if (!window.confirm(t("orders.confirmMarkPaid"))) return;
    setBusy("PAID");
    try {
      const updated = await api.updateOrderPayment(id, "PAID");
      state.setData((prev) => (prev ? { ...prev, ...updated } : updated));
      bumpActivity();
      setFlash({ kind: "success", message: t("orders.paymentRecorded") });
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  /** After a shipment reaches DELIVERED the API flips the order status; re-fetch so the header and timeline agree. */
  const refreshOrder = async () => {
    try {
      const fresh = await api.order(id);
      state.setData(fresh);
    } catch {
      state.reload();
    }
    bumpActivity();
  };

  if (state.loading) return <LoadingBlock />;
  if (state.error || !state.data) return <Alert onRetry={state.reload}>{state.error ?? t("orders.notFound")}</Alert>;
  const o = state.data as OrderWithCommerce;
  const type = orderType(o);
  const canReorder = perspective === "buyer" && (o.items?.length ?? 0) > 0;
  const canReturn = perspective === "buyer" && canRequestReturn(o.status) && (o.items?.length ?? 0) > 0;
  const isAdminUser = user?.role === "ADMIN";
  const canRefund = o.paymentStatus === "PAID" && (perspective === "admin" ? isAdminUser : perspective === "supplier" && (isAdminUser || canManageCompany(companyRoleOf(user))));
  const canManageShipments = perspective === "supplier" && user?.role === "SUPPLIER";
  const currentReview = review === undefined ? embeddedReview(o) : review;
  const canPrintDeliveryNote = perspective === "supplier" || perspective === "admin";

  const supplierNext: Partial<Record<OrderStatus, OrderStatus>> = { PENDING: "CONFIRMED", CONFIRMED: "IN_TRANSIT", IN_TRANSIT: "DELIVERED" };
  const nextStatus = supplierNext[o.status];
  const canSupplierAct = (perspective === "supplier" || perspective === "admin") && nextStatus;
  const canBuyerCancel = (perspective === "buyer" || perspective === "admin") && o.status === "PENDING";
  const canMarkPaid = (perspective === "supplier" || perspective === "admin") && o.paymentStatus !== "PAID" && o.status !== "CANCELLED";
  const canPayByCard = perspective === "buyer" && o.paymentStatus === "UNPAID" && o.paymentMethod === "CARD" && o.status !== "CANCELLED" && !!paymentConfig?.cardPaymentsEnabled;
  const showBankInstructions = o.paymentMethod === "BANK_TRANSFER" && o.paymentStatus === "UNPAID" && o.status !== "CANCELLED";

  const orderItems = o.items ?? [];
  const bidItems = o.bid?.items ?? [];
  const rfqItems = o.rfq?.items ?? [];
  const hasBreakdown = typeof o.subtotal === "number";
  const lineCount = orderItems.length || bidItems.length || rfqItems.length;

  const deliveryCity = o.deliveryCity ?? o.rfq?.deliveryCity ?? null;
  const deliveryAddress = o.deliveryAddress ?? o.rfq?.deliveryAddress ?? null;

  return (
    <div>
      <nav className="mb-4 text-sm text-slate-500" aria-label={t("common.breadcrumb")}>
        <Link href={backHref} className="hover:text-brand-700">{t("dash.orders")}</Link>
        <span className="mx-2">/</span>
        <span className="text-slate-700">{o.reference}</span>
      </nav>
      <PageHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            {o.reference}
            <OrderTypeBadge order={o} />
          </span>
        }
        subtitle={o.rfq ? `${o.rfq.title} · ${o.rfq.reference}` : type === "DIRECT" ? t("orders.directFromShop") : undefined}
        action={
          <>
            <StatusBadge status={o.status} />
            <PaymentStatusBadge status={o.paymentStatus} />
            <Button variant="outline" onClick={() => void openDownload(invoiceHtmlPath(o.id))}>
              {t("orders.viewInvoice")}
            </Button>
            {canPrintDeliveryNote && (
              <Button variant="outline" onClick={() => void openDownload(deliveryNoteHtmlPath(o.id))} title={t("orders.deliveryNoteTitle")}>
                {t("order.deliveryNote")}
              </Button>
            )}
            {canPayByCard && (
              <LinkButton href={`/pay/${o.id}`} variant="accent">
                {t("checkout.payNow")}
              </LinkButton>
            )}
            {canMarkPaid && (
              <Button variant="outline" onClick={markPaid} loading={busy === "PAID"}>
                {t("orders.markAsPaid")}
              </Button>
            )}
            {canRefund && (
              <RefundButton
                order={o}
                onRefunded={(result) => {
                  state.setData((prev) => (prev ? { ...prev, ...result.order } : result.order));
                  setPaymentsKey((k) => k + 1);
                  bumpActivity();
                  setFlash({ kind: "success", message: `${formatSar(result.refundedAmount, lang)} ${t("orders.refunded")} ${o.paymentMethod === "CARD" ? t("orders.viaMoyasar") : t("orders.manualRefund")}. ${t("orders.buyerNotified")}` });
                }}
              />
            )}
            {canSupplierAct && nextStatus && (
              <Button onClick={() => setStatus(nextStatus)} loading={busy === nextStatus}>
                {t("orders.mark")} {orderStatusLabel(nextStatus, t).toLowerCase()}
              </Button>
            )}
            {canBuyerCancel && (
              <Button variant="danger" onClick={() => setStatus("CANCELLED")} loading={busy === "CANCELLED"}>
                {t("orders.cancelOrder")}
              </Button>
            )}
            {canReturn && (
              <Button variant="outline" onClick={() => setReturnOpen(true)}>
                {t("returns.requestTitle")}
              </Button>
            )}
            {canReorder && (
              <Button variant="secondary" onClick={reorder} loading={busy === "REORDER"} title={t("orders.reorderTitle")}>
                {t("orders.reorder")}
              </Button>
            )}
          </>
        }
      />
      <FlashMessage flash={flash} className="mb-4" />
      {createdReturn && (
        <Alert kind="success" className="mb-4">
          {t("returns.return")} <span className="font-semibold">{createdReturn.reference}</span> {t("returns.requestedNotified")}{" "}
          <Link href={`/dashboard/returns/${createdReturn.id}`} className="font-semibold underline underline-offset-2">{t("returns.trackInMyReturns")}</Link>
        </Alert>
      )}
      {canReturn && (
        <ReturnRequestModal
          order={o}
          open={returnOpen}
          existing={orderReturns}
          onClose={() => setReturnOpen(false)}
          onCreated={(r) => {
            setReturnOpen(false);
            setCreatedReturn(r);
            setReturnsKey((k) => k + 1);
            bumpActivity();
          }}
        />
      )}

      <Card className="p-5">
        <OrderStatusTimeline status={o.status} />
      </Card>

      {canPayByCard && (
        <Alert kind="warning" className="mt-6">
          <span className="font-semibold">{t("orders.paymentPending")}</span> {t("orders.awaitingCard")}{" "}
          <Link href={`/pay/${o.id}`} className="font-semibold underline underline-offset-2">{t("orders.pay")} {formatSar(o.total, lang)} {t("orders.now")}</Link>
        </Alert>
      )}
      {showBankInstructions && (
        <div className="mt-6">
          <BankTransferInstructions order={o} />
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={t("orders.lineItems")} subtitle={`${lineCount} ${lineCount === 1 ? t("cart.itemOne") : t("cart.itemMany")}`} />
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-start">{t("orders.item")}</th>
                  <th className="px-4 py-3 text-start">{t("product.unit")}</th>
                  <th className="px-4 py-3 text-end">{t("orders.qty")}</th>
                  <th className="px-4 py-3 text-end">{t("product.unitPrice")}</th>
                  <th className="px-4 py-3 text-end">{t("product.lineTotal")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orderItems.length > 0
                  ? orderItems.map((it) => (
                      <tr key={it.id}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900">
                            {it.materialId ? <Link href={`/shop/products/${it.materialId}`} className="hover:text-brand-700">{it.name}</Link> : it.name}
                          </p>
                          {it.material?.sku && <p className="text-xs text-slate-500">{t("product.sku")} {it.material.sku}{it.material.brand ? ` · ${it.material.brand}` : ""}</p>}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{it.unit}</td>
                        <td className="px-4 py-3 text-end tabular-nums">{it.quantity}</td>
                        <td className="px-4 py-3 text-end tabular-nums">{formatSar(it.unitPrice, lang)}</td>
                        <td className="px-4 py-3 text-end font-medium tabular-nums">{formatSar(it.lineTotal ?? it.unitPrice * it.quantity, lang)}</td>
                      </tr>
                    ))
                  : bidItems.length > 0
                    ? bidItems.map((bi) => {
                        const ri = rfqItems.find((r) => r.id === bi.rfqItemId);
                        return (
                          <tr key={bi.id}>
                            <td className="px-4 py-3">
                              <p className="font-medium text-slate-900">{ri?.material?.name ?? ri?.description ?? bi.rfqItemId}</p>
                              {ri?.material && <p className="text-xs text-slate-500">{ri.description}</p>}
                            </td>
                            <td className="px-4 py-3 text-slate-600">{ri?.unit ?? ""}</td>
                            <td className="px-4 py-3 text-end tabular-nums">{bi.quantity}</td>
                            <td className="px-4 py-3 text-end tabular-nums">{formatSar(bi.unitPrice, lang)}</td>
                            <td className="px-4 py-3 text-end font-medium tabular-nums">{formatSar(bi.unitPrice * bi.quantity, lang)}</td>
                          </tr>
                        );
                      })
                    : rfqItems.map((ri) => (
                        <tr key={ri.id}>
                          <td className="px-4 py-3 font-medium text-slate-900">{ri.material?.name ?? ri.description}</td>
                          <td className="px-4 py-3 text-slate-600">{ri.unit}</td>
                          <td className="px-4 py-3 text-end tabular-nums">{ri.quantity}</td>
                          <td className="px-4 py-3 text-end text-slate-400">—</td>
                          <td className="px-4 py-3 text-end text-slate-400">—</td>
                        </tr>
                      ))}
                {lineCount === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">{t("orders.noLineItems")}</td>
                  </tr>
                )}
              </tbody>
              <tfoot className="border-t border-slate-200 bg-slate-50 text-sm">
                {hasBreakdown && (
                  <>
                    <tr>
                      <td colSpan={4} className="px-4 py-2 text-end text-slate-600">{t("common.subtotal")}</td>
                      <td className="px-4 py-2 text-end tabular-nums text-slate-900">{formatSar(o.subtotal, lang)}</td>
                    </tr>
                    <tr>
                      <td colSpan={4} className="px-4 py-2 text-end text-slate-600">{t("cart.vat")}</td>
                      <td className="px-4 py-2 text-end tabular-nums text-slate-900">{formatSar(o.vat, lang)}</td>
                    </tr>
                    <tr>
                      <td colSpan={4} className="px-4 py-2 text-end text-slate-600">{t("order.delivery")}</td>
                      <td className="px-4 py-2 text-end tabular-nums text-slate-900">{formatSar(o.deliveryFee, lang)}</td>
                    </tr>
                  </>
                )}
                <tr className="border-t border-slate-200">
                  <td colSpan={4} className="px-4 py-3 text-end font-semibold text-slate-700">{t("orders.orderTotal")}</td>
                  <td className="px-4 py-3 text-end text-base font-bold tabular-nums text-brand-700">{formatSar(o.total, lang)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title={perspective === "buyer" ? t("product.supplier") : t("reviews.buyer")} />
            <dl className="space-y-2 px-5 py-4 text-sm">
              {perspective === "buyer" ? (
                <>
                  <div><dt className="text-slate-500">{t("orders.company")}</dt><dd className="font-medium text-slate-900">{o.company ? <Link href={`/suppliers/${o.company.id}`} className="hover:text-brand-700">{o.company.name}</Link> : o.companyId}</dd></div>
                  {o.company?.phone && <div><dt className="text-slate-500">{t("orders.phone")}</dt><dd className="font-medium text-slate-900" dir="ltr">{o.company.phone}</dd></div>}
                  {o.company && <div><dt className="text-slate-500">{t("common.city")}</dt><dd className="font-medium text-slate-900">{o.company.city}</dd></div>}
                </>
              ) : (
                <>
                  <div><dt className="text-slate-500">{t("orders.name")}</dt><dd className="font-medium text-slate-900">{o.rfq?.buyer?.name ?? o.buyerId}</dd></div>
                  {o.rfq?.buyer?.company && <div><dt className="text-slate-500">{t("orders.company")}</dt><dd className="font-medium text-slate-900">{o.rfq.buyer.company.name}</dd></div>}
                  {o.contactPhone && <div><dt className="text-slate-500">{t("checkout.contactPhone")}</dt><dd className="font-medium text-slate-900" dir="ltr">{o.contactPhone}</dd></div>}
                </>
              )}
            </dl>
          </Card>
          <Card>
            <CardHeader title={t("orders.payment")} />
            <dl className="space-y-2 px-5 py-4 text-sm">
              <div>
                <dt className="text-slate-500">{t("orders.method")}</dt>
                <dd className="font-medium text-slate-900">
                  {o.paymentMethod === "CREDIT" && o.dueDate
                    ? <>{t("checkout.credit")} · {t("orders.due")} {formatDate(o.dueDate, lang)}{o.paymentStatus === "UNPAID" && new Date(o.dueDate).getTime() < Date.now() && <Badge tone="red" className="ms-2">{t("orders.overdue")}</Badge>}</>
                    : o.paymentMethod ? (PAYMENT_LABEL_KEY[o.paymentMethod] ? t(PAYMENT_LABEL_KEY[o.paymentMethod]) : o.paymentMethod) : type === "RFQ" ? t("orders.asAgreedInBid") : "—"}
                </dd>
              </div>
              {o.poNumber && <div><dt className="text-slate-500">{t("orders.poNumber")}</dt><dd className="font-medium text-slate-900" dir="ltr">{o.poNumber}</dd></div>}
              <div><dt className="text-slate-500">{t("common.status")}</dt><dd className="mt-0.5 flex items-center gap-2"><PaymentStatusBadge status={o.paymentStatus} />{o.paymentStatus === "REFUNDED" && <span className="text-xs text-slate-500">{t("orders.refundRecordedBelow")}</span>}</dd></div>
              <div>
                <dt className="mb-1 text-slate-500">{t("orders.paymentRecords")}</dt>
                <dd><PaymentsList orderId={o.id} refreshKey={paymentsKey} /></dd>
              </div>
            </dl>
          </Card>
          <InvoicePreview orderId={o.id} />
          <EInvoiceCard orderId={o.id} isAdmin={perspective === "admin" && isAdminUser} onToast={setFlash} />
          <Card>
            <CardHeader title={t("order.delivery")} />
            <dl className="space-y-2 px-5 py-4 text-sm">
              {o.address && (
                <div>
                  <dt className="text-slate-500">{t("orders.savedAddress")}</dt>
                  <dd className="font-medium text-slate-900">
                    {o.address.label}
                    <span className="block text-xs font-normal text-slate-500">{o.address.recipient} · {formatAddressLine(o.address)}</span>
                  </dd>
                </div>
              )}
              <div><dt className="text-slate-500">{t("common.city")}</dt><dd className="font-medium text-slate-900">{deliveryCity ?? "—"}</dd></div>
              <div><dt className="text-slate-500">{t("orders.address")}</dt><dd className="font-medium text-slate-900">{deliveryAddress ?? "—"}</dd></div>
              {perspective === "buyer" && o.contactPhone && <div><dt className="text-slate-500">{t("checkout.contactPhone")}</dt><dd className="font-medium text-slate-900" dir="ltr">{o.contactPhone}</dd></div>}
              {o.rfq?.deliveryDate && <div><dt className="text-slate-500">{t("orders.requestedDate")}</dt><dd className="font-medium text-slate-900">{formatDateTime(o.rfq.deliveryDate, lang)}</dd></div>}
              {o.bid && <div><dt className="text-slate-500">{t("orders.promisedDelivery")}</dt><dd className="font-medium text-slate-900">{o.bid.deliveryDays} {t("product.days")}</dd></div>}
              {o.notes && <div><dt className="text-slate-500">{t("orders.notes")}</dt><dd className="whitespace-pre-line font-medium text-slate-900">{o.notes}</dd></div>}
              <div><dt className="text-slate-500">{t("orders.created")}</dt><dd className="font-medium text-slate-900">{formatDateTime(o.createdAt, lang)}</dd></div>
            </dl>
          </Card>
        </div>
      </div>

      {o.status !== "CANCELLED" && (
        <div className="mt-6">
          <OrderShipments orderId={o.id} canManage={canManageShipments && o.status !== "DELIVERED"} onDelivered={() => void refreshOrder()} onChanged={bumpActivity} />
        </div>
      )}

      <div className="mt-6 empty:hidden">
        <OrderReturns orderId={o.id} perspective={perspective} refreshKey={returnsKey} onLoaded={setOrderReturns} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <OrderMessages orderId={o.id} perspective={perspective} onActivity={bumpActivity} />
          <OrderReview
            order={o}
            perspective={perspective}
            review={currentReview}
            onChange={(r) => {
              setReview(r);
              bumpActivity();
              setFlash({ kind: "success", message: perspective === "buyer" ? t("orders.thanksReview") : t("orders.replyPosted") });
            }}
          />
        </div>
        <OrderActivity orderId={o.id} refreshKey={activityKey} />
      </div>
    </div>
  );
}
