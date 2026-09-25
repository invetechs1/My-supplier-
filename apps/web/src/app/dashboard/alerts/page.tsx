"use client";

import Link from "next/link";
import { useState } from "react";
import type { PriceAlert } from "@mysupplier/shared";
import { errorMessage } from "@/lib/api";
import { commerceApi } from "@/lib/api/commerce";
import { useAsync, useFlash, usePageTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatSar } from "@/lib/format";
import { ProductImage } from "@/components/shop/ProductCard";
import { Alert, Badge, Button, Card, EmptyState, FlashMessage, LinkButton, LoadingBlock, PageHeader, Table, type Column } from "@/components/ui";

export default function AlertsPage() {
  const { t, lang } = useI18n();
  usePageTitle(t("dash.alerts"));
  const state = useAsync(() => commerceApi.alerts(), []);
  const [flash, setFlash] = useFlash();
  const [busyId, setBusyId] = useState<string | null>(null);
  const rows = state.data ?? [];

  const remove = async (a: PriceAlert) => {
    if (!window.confirm(`Remove the alert for "${a.material?.name ?? "this product"}"?`)) return;
    setBusyId(a.id);
    try {
      await commerceApi.deleteAlert(a.id);
      state.setData((prev) => (prev ?? []).filter((x) => x.id !== a.id));
      setFlash({ kind: "success", message: "Alert removed." });
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusyId(null);
    }
  };

  const columns: Column<PriceAlert>[] = [
    {
      key: "product",
      header: "Product",
      render: (a) => {
        const m = a.material;
        if (!m) return <span className="text-slate-500">{a.materialId}</span>;
        const name = lang === "ar" ? m.nameAr || m.name : m.name;
        return (
          <Link href={`/shop/products/${m.id}`} className="flex items-center gap-3 hover:text-brand-700">
            <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-slate-50 p-1">
              <ProductImage material={m} />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium text-slate-900">{name}</span>
              <span className="block text-xs text-slate-500">{m.brand ? `${m.brand} · ` : ""}{m.sku}</span>
            </span>
          </Link>
        );
      },
    },
    {
      key: "current",
      header: "Best price now",
      align: "end",
      render: (a) => {
        const best = a.material?.bestOffer;
        const hit = best && typeof a.targetPrice === "number" && best.price <= a.targetPrice;
        return best ? (
          <span className={hit ? "font-semibold tabular-nums text-emerald-700" : "tabular-nums text-slate-700"}>
            {formatSar(best.price, lang)}
            <span className="block text-xs font-normal text-slate-500">{best.companyName}</span>
          </span>
        ) : (
          <span className="text-xs text-slate-400">No offer</span>
        );
      },
    },
    { key: "target", header: "Target price", align: "end", render: (a) => <span className="tabular-nums">{typeof a.targetPrice === "number" ? `≤ ${formatSar(a.targetPrice, lang)}` : "—"}</span> },
    { key: "stock", header: "Back in stock", render: (a) => (a.notifyBackInStock ? <Badge tone="blue">Notify</Badge> : <span className="text-slate-400">—</span>) },
    { key: "city", header: t("common.city"), render: (a) => a.city || <span className="text-slate-400">Any</span> },
    {
      key: "status",
      header: t("common.status"),
      render: (a) =>
        a.active ? (
          <Badge tone="green">Active</Badge>
        ) : (
          <span className="inline-flex flex-col">
            <Badge tone="amber">Triggered</Badge>
            {a.triggeredAt && <span className="mt-0.5 text-xs text-slate-500">{formatDate(a.triggeredAt, lang)}</span>}
          </span>
        ),
    },
    { key: "created", header: "Created", render: (a) => <span className="text-slate-500">{formatDate(a.createdAt, lang)}</span> },
    {
      key: "actions",
      header: <span className="sr-only">{t("common.actions")}</span>,
      align: "end",
      render: (a) => (
        <div className="flex justify-end gap-2">
          {a.material && (
            <LinkButton href={`/shop/products/${a.material.id}`} size="sm" variant="outline">
              View
            </LinkButton>
          )}
          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(a)} loading={busyId === a.id}>
            {t("common.delete")}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title={t("dash.alerts")} subtitle="We notify you when a product's best price drops to your target or when it is back in stock. Alerts are created from the product page." />
      <FlashMessage flash={flash} className="mb-4" />
      {state.loading ? (
        <LoadingBlock />
      ) : state.error ? (
        <Alert onRetry={state.reload}>{state.error}</Alert>
      ) : (
        <Card>
          <Table
            columns={columns}
            rows={rows}
            rowKey={(a) => a.id}
            empty={<EmptyState title="No price alerts" description="Open a product and set a target price or ask to be notified when it is back in stock." action={<LinkButton href="/shop">Browse the shop</LinkButton>} />}
          />
        </Card>
      )}
    </div>
  );
}
