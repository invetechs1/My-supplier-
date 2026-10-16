"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Bid, CreateBidPayload, RfqItem } from "@mysupplier/shared";
import { api, errorMessage } from "@/lib/api";
import { useAsync, useFlash } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { cn, formatDateTime, formatSar, toDateTimeLocal } from "@/lib/format";
import { Alert, Button, Card, CardBody, CardHeader, FlashMessage, Input, LoadingBlock, PageHeader, StatusBadge, Textarea } from "@/components/ui";

interface LineState {
  unitPrice: string;
  leadTimeDays: string;
  notes: string;
}

export default function SupplierRfqDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useI18n();
  const router = useRouter();
  const state = useAsync(() => api.rfq(id), [id]);
  const [flash, setFlash] = useFlash(6000);

  const rfq = state.data;
  const myBid: Bid | undefined = rfq?.bids?.[0];

  const [lines, setLines] = useState<Record<string, LineState>>({});
  const [deliveryDays, setDeliveryDays] = useState("7");
  const [validUntil, setValidUntil] = useState(toDateTimeLocal(new Date(Date.now() + 14 * 86400000).toISOString()));
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  useEffect(() => {
    if (!rfq) return;
    const initial: Record<string, LineState> = {};
    rfq.items.forEach((it) => {
      const existing = myBid?.items.find((bi) => bi.rfqItemId === it.id);
      initial[it.id] = {
        unitPrice: existing ? String(existing.unitPrice) : "",
        leadTimeDays: existing ? String(existing.leadTimeDays) : "7",
        notes: existing?.notes ?? "",
      };
    });
    setLines(initial);
    if (myBid) {
      setDeliveryDays(String(myBid.deliveryDays));
      setValidUntil(toDateTimeLocal(myBid.validUntil));
      setNotes(myBid.notes ?? "");
    }
  }, [rfq, myBid]);

  const total = useMemo(
    () => (rfq?.items ?? []).reduce((sum, it) => sum + (Number(lines[it.id]?.unitPrice) || 0) * it.quantity, 0),
    [rfq, lines],
  );

  const setLine = (itemId: string, patch: Partial<LineState>) => setLines((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }));

  const validate = (items: RfqItem[]): boolean => {
    const next: Record<string, string> = {};
    items.forEach((it) => {
      const price = Number(lines[it.id]?.unitPrice);
      if (!lines[it.id]?.unitPrice || Number.isNaN(price) || price <= 0) next[`price-${it.id}`] = t("sup.marketplace.errUnitPrice");
      const lead = Number(lines[it.id]?.leadTimeDays);
      if (Number.isNaN(lead) || lead < 0) next[`lead-${it.id}`] = t("sup.marketplace.errInvalid");
    });
    const dd = Number(deliveryDays);
    if (Number.isNaN(dd) || dd <= 0) next.deliveryDays = t("sup.marketplace.errDeliveryDays");
    if (!validUntil) next.validUntil = t("sup.marketplace.errValidity");
    else if (new Date(validUntil).getTime() <= Date.now()) next.validUntil = t("sup.marketplace.errFuture");
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rfq || !validate(rfq.items)) return;
    const payload: CreateBidPayload = {
      validUntil: new Date(validUntil).toISOString(),
      deliveryDays: Number(deliveryDays),
      notes: notes.trim() || undefined,
      items: rfq.items.map((it) => ({
        rfqItemId: it.id,
        unitPrice: Number(lines[it.id].unitPrice),
        quantity: it.quantity,
        leadTimeDays: Number(lines[it.id].leadTimeDays) || 0,
        notes: lines[it.id].notes.trim() || undefined,
      })),
    };
    setSubmitting(true);
    try {
      await api.submitBid(rfq.id, payload);
      setFlash({ kind: "success", message: myBid ? t("sup.marketplace.bidUpdated") : t("sup.marketplace.bidSubmitted") });
      state.reload();
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const withdraw = async () => {
    if (!myBid || !window.confirm(t("sup.marketplace.confirmWithdraw"))) return;
    setWithdrawing(true);
    try {
      await api.withdrawBid(myBid.id);
      setFlash({ kind: "success", message: t("sup.bids.withdrawn") });
      state.reload();
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setWithdrawing(false);
    }
  };

  if (state.loading) return <LoadingBlock />;
  if (state.error || !rfq) return <Alert onRetry={state.reload}>{state.error ?? t("sup.marketplace.notFound")}</Alert>;

  const closed = rfq.status !== "OPEN" || new Date(rfq.closesAt).getTime() < Date.now();
  const canBid = !closed && (!myBid || myBid.status === "SUBMITTED" || myBid.status === "WITHDRAWN");

  return (
    <div>
      <nav className="mb-4 text-sm text-slate-500" aria-label={t("common.breadcrumb")}>
        <Link href="/supplier/marketplace" className="hover:text-brand-700">{t("sup.marketplace")}</Link>
        <span className="mx-2">/</span>
        <span className="text-slate-700">{rfq.reference}</span>
      </nav>
      <PageHeader
        title={rfq.title}
        subtitle={<>{rfq.reference} · {rfq.buyer?.company?.name ?? rfq.buyer?.name ?? t("reviews.buyer")} · {t("sup.marketplace.closesLower")} {formatDateTime(rfq.closesAt, lang)}</>}
        action={
          <>
            <StatusBadge status={rfq.status} />
            {myBid && <span className="text-sm text-slate-500">{t("sup.marketplace.yourBid")} <StatusBadge status={myBid.status} /></span>}
          </>
        }
      />
      <FlashMessage flash={flash} className="mb-4" />
      {closed && <Alert kind="warning" className="mb-4">{t("sup.marketplace.closedNotice")}</Alert>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <form onSubmit={submit} noValidate>
            <Card>
              <CardHeader title={t("sup.marketplace.itemsPricing")} subtitle={t("sup.marketplace.itemsPricingSub")} />
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-start">{t("orders.item")}</th>
                      <th className="px-4 py-3 text-end">{t("orders.qty")}</th>
                      <th className="px-4 py-3 text-end">{t("sup.marketplace.marketAvg")}</th>
                      <th className="w-36 px-4 py-3 text-start">{t("sup.marketplace.unitPriceSar")}</th>
                      <th className="w-24 px-4 py-3 text-start">{t("sup.marketplace.leadDays")}</th>
                      <th className="px-4 py-3 text-end">{t("product.lineTotal")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rfq.items.map((it) => {
                      const l = lines[it.id] ?? { unitPrice: "", leadTimeDays: "7", notes: "" };
                      const lineTotal = (Number(l.unitPrice) || 0) * it.quantity;
                      return (
                        <tr key={it.id} className="align-top">
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-900">{it.material ? <Link href={`/materials/${it.material.id}`} className="hover:text-brand-700">{it.material.name}</Link> : it.description}</p>
                            {it.material && it.description !== it.material.name && <p className="text-xs text-slate-500">{it.description}</p>}
                            {it.notes && <p className="text-xs text-slate-500">{it.notes}</p>}
                            <input
                              type="text"
                              value={l.notes}
                              onChange={(e) => setLine(it.id, { notes: e.target.value })}
                              placeholder={t("sup.marketplace.lineNotePlaceholder")}
                              disabled={!canBid}
                              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1 text-xs focus:border-brand-600 focus:outline-none disabled:bg-slate-50"
                            />
                          </td>
                          <td className="px-4 py-3 text-end tabular-nums">{it.quantity} {it.unit}</td>
                          <td className="px-4 py-3 text-end tabular-nums text-slate-500">{formatSar(it.material?.avgPrice, lang)}</td>
                          <td className="px-4 py-3">
                            <Input name={`price-${it.id}`} type="number" min={0} step="0.01" value={l.unitPrice} onChange={(e) => setLine(it.id, { unitPrice: e.target.value })} error={errors[`price-${it.id}`]} disabled={!canBid} dir="ltr" />
                          </td>
                          <td className="px-4 py-3">
                            <Input name={`lead-${it.id}`} type="number" min={0} value={l.leadTimeDays} onChange={(e) => setLine(it.id, { leadTimeDays: e.target.value })} error={errors[`lead-${it.id}`]} disabled={!canBid} dir="ltr" />
                          </td>
                          <td className="px-4 py-3 text-end font-medium tabular-nums">{formatSar(lineTotal, lang)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-200 bg-slate-50">
                      <td colSpan={5} className="px-4 py-3 text-end text-sm font-semibold text-slate-700">{t("sup.marketplace.bidTotal")}</td>
                      <td className="px-4 py-3 text-end text-lg font-bold tabular-nums text-brand-700">{formatSar(total, lang)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <CardBody className="grid gap-4 border-t border-slate-100 sm:grid-cols-2">
                <Input label={t("sup.marketplace.deliveryWithin")} name="deliveryDays" type="number" min={1} value={deliveryDays} onChange={(e) => setDeliveryDays(e.target.value)} error={errors.deliveryDays} disabled={!canBid} required dir="ltr" />
                <Input label={t("sup.marketplace.validUntil")} name="validUntil" type="datetime-local" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} error={errors.validUntil} disabled={!canBid} required />
                <Textarea label={t("sup.marketplace.notesToBuyer")} name="notes" className="sm:col-span-2" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("sup.marketplace.notesPlaceholder")} disabled={!canBid} />
              </CardBody>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
                <p className={cn("text-xs", myBid ? "text-slate-500" : "text-slate-400")}>
                  {myBid ? `${t("sup.marketplace.lastSubmitted")} ${formatDateTime(myBid.createdAt, lang)}` : t("sup.marketplace.oneBidNote")}
                </p>
                <div className="flex gap-2">
                  {myBid && myBid.status === "SUBMITTED" && (
                    <Button type="button" variant="outline" onClick={withdraw} loading={withdrawing}>{t("sup.marketplace.withdrawBid")}</Button>
                  )}
                  <Button type="submit" loading={submitting} disabled={!canBid} size="lg">
                    {myBid && myBid.status !== "WITHDRAWN" ? t("sup.marketplace.updateBid") : t("sup.marketplace.submitBid")}
                  </Button>
                </div>
              </div>
            </Card>
          </form>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title={t("order.delivery")} />
            <dl className="space-y-3 px-5 py-4 text-sm">
              <div><dt className="text-slate-500">{t("common.city")}</dt><dd className="font-medium text-slate-900">{rfq.deliveryCity}</dd></div>
              <div><dt className="text-slate-500">{t("orders.address")}</dt><dd className="font-medium text-slate-900">{rfq.deliveryAddress || "—"}</dd></div>
              <div><dt className="text-slate-500">{t("orders.requestedDate")}</dt><dd className="font-medium text-slate-900">{rfq.deliveryDate ? formatDateTime(rfq.deliveryDate, lang) : "—"}</dd></div>
              <div><dt className="text-slate-500">{t("sup.marketplace.competingBids")}</dt><dd className="font-medium text-slate-900">{rfq.bidCount ?? 0}{rfq.lowestBid ? ` · ${t("sup.marketplace.lowest")} ${formatSar(rfq.lowestBid, lang)}` : ""}</dd></div>
            </dl>
          </Card>
          {rfq.notes && (
            <Card>
              <CardHeader title={t("sup.marketplace.buyerNotes")} />
              <CardBody><p className="whitespace-pre-wrap text-sm text-slate-700">{rfq.notes}</p></CardBody>
            </Card>
          )}
          <Button variant="ghost" className="w-full" onClick={() => router.push("/supplier/marketplace")}>{t("sup.marketplace.backToMarketplace")}</Button>
        </div>
      </div>
    </div>
  );
}
