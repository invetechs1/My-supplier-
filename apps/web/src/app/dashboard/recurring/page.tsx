"use client";

import Link from "next/link";
import { useState } from "react";
import { errorMessage } from "@/lib/api";
import { commerceApi, type RecurringOrderWithLast } from "@/lib/api/commerce";
import { useAuth } from "@/lib/auth";
import { useAsync, useFlash, usePageTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { cn, formatDateTime, formatSar } from "@/lib/format";
import { Alert, Badge, Button, Card, EmptyState, FlashMessage, LoadingBlock, PageHeader, StatusBadge, Toggle } from "@/components/ui";
import { RecurringFormModal } from "./RecurringFormModal";

const PAYMENT_LABEL: Record<string, string> = { COD: "Cash on delivery", BANK_TRANSFER: "Bank transfer", CREDIT: "Credit terms" };

export default function RecurringOrdersPage() {
  const { t, lang } = useI18n();
  usePageTitle(t("dash.recurring"));
  const { user } = useAuth();
  const state = useAsync(() => commerceApi.recurring(), []);
  const addresses = useAsync(() => commerceApi.addresses(), []);
  const credit = useAsync(() => commerceApi.credit(), [user?.companyId], !!user?.companyId);
  const [flash, setFlash] = useFlash(7000);
  const [editing, setEditing] = useState<RecurringOrderWithLast | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const rows = state.data ?? [];
  const hasCompany = !!(user?.companyId || user?.company);

  const replace = (ro: RecurringOrderWithLast) =>
    state.setData((prev) => {
      const list = prev ?? [];
      const idx = list.findIndex((x) => x.id === ro.id);
      if (idx < 0) return [ro, ...list];
      const next = [...list];
      next[idx] = ro;
      return next;
    });

  const toggle = async (ro: RecurringOrderWithLast, active: boolean) => {
    setBusy(ro.id);
    try {
      replace(await commerceApi.updateRecurring(ro.id, { active }));
      setFlash({ kind: "success", message: active ? `${ro.name} resumed.` : `${ro.name} paused.` });
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const runNow = async (ro: RecurringOrderWithLast) => {
    if (!window.confirm(`Place the "${ro.name}" order now?`)) return;
    setBusy(ro.id);
    try {
      const result = await commerceApi.runRecurringNow(ro.id);
      replace(result.recurringOrder);
      const skipped = result.skipped.length > 0 ? ` · ${result.skipped.length} ${result.skipped.length === 1 ? "line" : "lines"} skipped` : "";
      setFlash({ kind: "success", message: `${result.orders.length} ${result.orders.length === 1 ? "order" : "orders"} placed (${formatSar(result.total, lang)} incl. VAT)${skipped}. Next run ${formatDateTime(result.nextRunAt, lang)}.` });
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (ro: RecurringOrderWithLast) => {
    if (!window.confirm(`Delete "${ro.name}"? Future orders will not be placed.`)) return;
    setBusy(ro.id);
    try {
      await commerceApi.deleteRecurring(ro.id);
      state.setData((prev) => (prev ?? []).filter((x) => x.id !== ro.id));
      setFlash({ kind: "success", message: "Recurring order deleted." });
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHeader
        title={t("dash.recurring")}
        subtitle="Standing orders placed automatically every N days, one order per supplier, exactly like checkout."
        action={<Button onClick={() => setEditing(null)} disabled={!hasCompany}>New recurring order</Button>}
      />
      <FlashMessage flash={flash} className="mb-4" />
      {!hasCompany && (
        <Alert kind="info" className="mb-4">
          Recurring orders need a company profile.{" "}
          <Link href="/account" className="font-semibold underline">Complete your company details</Link> to schedule deliveries.
        </Alert>
      )}
      {state.loading ? (
        <LoadingBlock />
      ) : state.error ? (
        <Alert onRetry={state.reload}>{state.error}</Alert>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState title="No recurring orders" description="Set up a schedule for materials you consume steadily – cement, blocks, rebar – and we place the order for you." action={hasCompany ? <Button onClick={() => setEditing(null)}>Create your first schedule</Button> : undefined} />
        </Card>
      ) : (
        <div className="space-y-4">
          {rows.map((ro) => {
            const overdue = ro.active && new Date(ro.nextRunAt).getTime() < Date.now();
            return (
              <Card key={ro.id} className={cn("p-5", !ro.active && "bg-slate-50/60")}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold text-slate-900">
                      {ro.name}
                      <Badge tone={ro.active ? "green" : "slate"}>{ro.active ? "Active" : "Paused"}</Badge>
                      <Badge tone="blue">Every {ro.intervalDays} days</Badge>
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Next run <span className={cn("font-medium", overdue ? "text-amber-700" : "text-slate-900")}>{ro.active ? formatDateTime(ro.nextRunAt, lang) : "—"}</span>
                      {overdue && <span className="ms-1 text-xs text-amber-700">(due, runs shortly)</span>}
                      {" · "}
                      {PAYMENT_LABEL[ro.paymentMethod] ?? ro.paymentMethod} · deliver to {ro.deliveryCity}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">{ro.active ? "On" : "Off"}</span>
                    <Toggle checked={ro.active} onChange={(v) => toggle(ro, v)} disabled={busy === ro.id} label={`Toggle ${ro.name}`} />
                  </div>
                </div>

                <ul className="mt-3 flex flex-wrap gap-2">
                  {ro.items.map((l) => (
                    <li key={l.listingId} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700">
                      <span className="font-semibold tabular-nums">{l.quantity}</span> {l.unit ?? ""} {l.name ?? l.listingId}
                      {l.companyName && <span className="text-slate-400"> · {l.companyName}</span>}
                    </li>
                  ))}
                </ul>

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                  {ro.lastOrder ? (
                    <span className="me-auto text-xs text-slate-500">
                      Last order{" "}
                      <Link href={`/dashboard/orders/${ro.lastOrder.id}`} className="font-semibold text-brand-700 hover:underline">{ro.lastOrder.reference}</Link>{" "}
                      · {formatDateTime(ro.lastOrder.createdAt, lang)} · {formatSar(ro.lastOrder.total, lang)} <StatusBadge status={ro.lastOrder.status} />
                    </span>
                  ) : (
                    <span className="me-auto text-xs text-slate-500">{ro.lastRunAt ? `Last run ${formatDateTime(ro.lastRunAt, lang)}` : "Not run yet"}</span>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => runNow(ro)} loading={busy === ro.id}>Run now</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(ro)} disabled={busy === ro.id}>Edit</Button>
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(ro)} disabled={busy === ro.id}>Delete</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <RecurringFormModal
        open={editing !== undefined}
        existing={editing ?? null}
        addresses={addresses.data ?? []}
        creditApproved={!!credit.data?.approved}
        onClose={() => setEditing(undefined)}
        onSaved={(ro) => {
          replace(ro);
          setEditing(undefined);
          setFlash({ kind: "success", message: `${ro.name} saved. Next run ${formatDateTime(ro.nextRunAt, lang)}.` });
        }}
      />
    </div>
  );
}
