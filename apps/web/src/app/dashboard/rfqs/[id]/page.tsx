"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { Bid } from "@mysupplier/shared";
import { api, errorMessage } from "@/lib/api";
import { useAsync, useFlash } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { cn, formatDateTime, formatSar } from "@/lib/format";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, FlashMessage, LoadingBlock, PageHeader, StatusBadge, VerifiedBadge } from "@/components/ui";

export default function BuyerRfqDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useI18n();
  const router = useRouter();
  const state = useAsync(() => api.rfq(id), [id]);
  const [flash, setFlash] = useFlash(6000);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const rfq = state.data;
  const bids = useMemo(() => {
    const list = (rfq?.bids ?? []).filter((b) => b.status !== "WITHDRAWN");
    return list.sort((a, b) => a.totalPrice - b.totalPrice);
  }, [rfq]);

  const act = async (key: string, fn: () => Promise<unknown>, success: string) => {
    setBusy(key);
    try {
      await fn();
      setFlash({ kind: "success", message: success });
      state.reload();
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  if (state.loading) return <LoadingBlock />;
  if (state.error || !rfq) return <Alert onRetry={state.reload}>{state.error ?? "RFQ not found"}</Alert>;

  const isOpen = rfq.status === "OPEN";
  const closed = new Date(rfq.closesAt).getTime() < Date.now();

  return (
    <div>
      <nav className="mb-4 text-sm text-slate-500" aria-label="Breadcrumb">
        <Link href="/dashboard/rfqs" className="hover:text-brand-700">{t("dash.rfqs")}</Link>
        <span className="mx-2">/</span>
        <span className="text-slate-700">{rfq.reference}</span>
      </nav>
      <PageHeader
        title={rfq.title}
        subtitle={<>{rfq.reference} · created {formatDateTime(rfq.createdAt, lang)}</>}
        action={
          <>
            <StatusBadge status={rfq.status} />
            {isOpen && (
              <Button variant="outline" loading={busy === "close"} onClick={() => act("close", () => api.closeRfq(rfq.id), "RFQ closed. No more bids will be accepted.")}>
                Close RFQ
              </Button>
            )}
            {(isOpen || rfq.status === "CLOSED") && (
              <Button
                variant="danger"
                loading={busy === "cancel"}
                onClick={() => {
                  if (window.confirm("Cancel this RFQ? Suppliers will be notified.")) void act("cancel", () => api.cancelRfq(rfq.id), "RFQ cancelled.");
                }}
              >
                Cancel
              </Button>
            )}
          </>
        }
      />
      <FlashMessage flash={flash} className="mb-4" />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Requested items" subtitle={`${rfq.items.length} line items`} />
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-start">#</th>
                  <th className="px-4 py-3 text-start">Item</th>
                  <th className="px-4 py-3 text-end">Quantity</th>
                  <th className="px-4 py-3 text-end">Market avg</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rfq.items.map((it, i) => (
                  <tr key={it.id}>
                    <td className="px-4 py-3 text-slate-400">{i + 1}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{it.material ? <Link href={`/materials/${it.material.id}`} className="hover:text-brand-700">{it.material.name}</Link> : it.description}</p>
                      {it.material && it.description !== it.material.name && <p className="text-xs text-slate-500">{it.description}</p>}
                      {it.notes && <p className="text-xs text-slate-500">{it.notes}</p>}
                    </td>
                    <td className="px-4 py-3 text-end tabular-nums">{it.quantity} {it.unit}</td>
                    <td className="px-4 py-3 text-end tabular-nums text-slate-500">{formatSar(it.material?.avgPrice, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <CardHeader title="Delivery & timing" />
          <dl className="space-y-3 px-5 py-4 text-sm">
            <div><dt className="text-slate-500">Delivery city</dt><dd className="font-medium text-slate-900">{rfq.deliveryCity}</dd></div>
            <div><dt className="text-slate-500">Address</dt><dd className="font-medium text-slate-900">{rfq.deliveryAddress || "—"}</dd></div>
            <div><dt className="text-slate-500">Requested delivery</dt><dd className="font-medium text-slate-900">{rfq.deliveryDate ? formatDateTime(rfq.deliveryDate, lang) : "—"}</dd></div>
            <div>
              <dt className="text-slate-500">Bidding closes</dt>
              <dd className={cn("font-medium", closed ? "text-red-600" : "text-slate-900")}>{formatDateTime(rfq.closesAt, lang)}{closed && " (passed)"}</dd>
            </div>
            {rfq.notes && <div><dt className="text-slate-500">Notes</dt><dd className="whitespace-pre-wrap text-slate-700">{rfq.notes}</dd></div>}
          </dl>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Bids" subtitle={bids.length ? `${bids.length} bids ranked by total price` : "No bids received yet"} />
        {bids.length === 0 ? (
          <EmptyState title="Waiting for bids" description="Suppliers in the delivery city have been notified. Bids will appear here as they arrive." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-start">Rank</th>
                  <th className="px-4 py-3 text-start">Supplier</th>
                  <th className="px-4 py-3 text-end">Total</th>
                  <th className="px-4 py-3 text-end">Delivery</th>
                  <th className="px-4 py-3 text-start">Valid until</th>
                  <th className="px-4 py-3 text-start">{t("common.status")}</th>
                  <th className="px-4 py-3 text-end">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bids.map((b, i) => (
                  <BidRow
                    key={b.id}
                    bid={b}
                    rank={i + 1}
                    rfqStatus={rfq.status}
                    expanded={expanded === b.id}
                    onToggle={() => setExpanded(expanded === b.id ? null : b.id)}
                    busy={busy}
                    lang={lang}
                    itemsById={Object.fromEntries(rfq.items.map((it) => [it.id, it]))}
                    onAccept={() => {
                      if (!window.confirm(`Accept the bid from ${b.company?.name ?? "this supplier"} for ${formatSar(b.totalPrice, lang)}? This awards the RFQ and creates an order.`)) return;
                      setBusy(`accept-${b.id}`);
                      api
                        .acceptBid(b.id)
                        .then((res) => {
                          setFlash({ kind: "success", message: `Bid accepted. Order ${res.order.reference} created.` });
                          router.push(`/dashboard/orders/${res.order.id}`);
                        })
                        .catch((err) => setFlash({ kind: "error", message: errorMessage(err) }))
                        .finally(() => setBusy(null));
                    }}
                    onReject={() => act(`reject-${b.id}`, () => api.rejectBid(b.id), "Bid rejected.")}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function BidRow({
  bid: b,
  rank,
  rfqStatus,
  expanded,
  onToggle,
  busy,
  lang,
  itemsById,
  onAccept,
  onReject,
}: {
  bid: Bid;
  rank: number;
  rfqStatus: string;
  expanded: boolean;
  onToggle: () => void;
  busy: string | null;
  lang: "en" | "ar";
  itemsById: Record<string, { description: string; unit: string; material?: { name: string } | null }>;
  onAccept: () => void;
  onReject: () => void;
}) {
  const actionable = b.status === "SUBMITTED" && (rfqStatus === "OPEN" || rfqStatus === "CLOSED");
  const expired = new Date(b.validUntil).getTime() < Date.now();
  return (
    <>
      <tr className={cn(rank === 1 && b.status === "SUBMITTED" && "bg-emerald-50/40")}>
        <td className="px-4 py-3">
          <span className={cn("inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold", rank === 1 ? "bg-amber-500 text-slate-900" : "bg-slate-100 text-slate-600")}>{rank}</span>
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {b.company ? <Link href={`/suppliers/${b.company.id}`} className="font-medium text-slate-900 hover:text-brand-700">{b.company.name}</Link> : <span>{b.companyId}</span>}
            {b.company && <VerifiedBadge verified={b.company.verified} />}
            {b.company && <span className="text-xs text-slate-500">{b.company.city}</span>}
          </div>
          <button type="button" onClick={onToggle} className="mt-0.5 text-xs font-medium text-brand-700 hover:underline">
            {expanded ? "Hide breakdown" : "View breakdown"}
          </button>
        </td>
        <td className="px-4 py-3 text-end text-base font-semibold tabular-nums text-slate-900">{formatSar(b.totalPrice, lang)}</td>
        <td className="px-4 py-3 text-end tabular-nums">{b.deliveryDays} days</td>
        <td className="px-4 py-3">
          <span className={cn(expired && "text-red-600")}>{formatDateTime(b.validUntil, lang)}</span>
          {expired && <Badge tone="red" className="ms-2">Expired</Badge>}
        </td>
        <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
        <td className="px-4 py-3 text-end">
          {actionable && (
            <div className="flex justify-end gap-2">
              <Button size="sm" onClick={onAccept} loading={busy === `accept-${b.id}`} disabled={busy !== null && busy !== `accept-${b.id}`}>Accept</Button>
              <Button size="sm" variant="outline" onClick={onReject} loading={busy === `reject-${b.id}`} disabled={busy !== null && busy !== `reject-${b.id}`}>Reject</Button>
            </div>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50">
          <td colSpan={7} className="px-6 py-3">
            <table className="w-full text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-1 text-start font-medium">Item</th>
                  <th className="py-1 text-end font-medium">Qty</th>
                  <th className="py-1 text-end font-medium">Unit price</th>
                  <th className="py-1 text-end font-medium">Lead time</th>
                  <th className="py-1 text-end font-medium">Line total</th>
                </tr>
              </thead>
              <tbody>
                {b.items.map((bi) => {
                  const ri = itemsById[bi.rfqItemId];
                  return (
                    <tr key={bi.id} className="border-t border-slate-200">
                      <td className="py-1.5 text-slate-800">{ri?.material?.name ?? ri?.description ?? bi.rfqItemId}{bi.notes && <span className="ms-2 text-slate-500">— {bi.notes}</span>}</td>
                      <td className="py-1.5 text-end tabular-nums">{bi.quantity} {ri?.unit ?? ""}</td>
                      <td className="py-1.5 text-end tabular-nums">{formatSar(bi.unitPrice, lang)}</td>
                      <td className="py-1.5 text-end tabular-nums">{bi.leadTimeDays} d</td>
                      <td className="py-1.5 text-end font-medium tabular-nums">{formatSar(bi.unitPrice * bi.quantity, lang)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {b.notes && <p className="mt-2 text-xs text-slate-600"><span className="font-medium">Supplier notes:</span> {b.notes}</p>}
          </td>
        </tr>
      )}
    </>
  );
}
