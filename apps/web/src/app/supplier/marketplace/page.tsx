"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SAUDI_CITIES } from "@mysupplier/shared";
import { api, type MarketplaceRfq } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAsync } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { Alert, Badge, Button, Card, EmptyState, Input, LinkButton, LoadingBlock, PageHeader, Pagination, Select, Table, type Column } from "@/components/ui";

export default function MarketplacePage() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const [city, setCity] = useState(user?.company?.city ?? "");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    if (user?.company?.city && city === "") setCity(user.company.city);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.company?.city]);

  const state = useAsync(() => api.marketplaceRfqs({ city: city || undefined, q: q || undefined, page }), [city, q, page]);

  const columns: Column<MarketplaceRfq>[] = [
    { key: "ref", header: t("checkout.reference"), render: (r) => <Link href={`/supplier/marketplace/${r.id}`} className="font-medium text-brand-700 hover:underline">{r.reference}</Link> },
    {
      key: "title",
      header: t("sup.marketplace.title"),
      render: (r) => (
        <div>
          <p className="font-medium text-slate-900">{r.title}</p>
          <p className="text-xs text-slate-500">{r.buyer?.company?.name ?? r.buyer?.name ?? t("reviews.buyer")}</p>
        </div>
      ),
    },
    { key: "city", header: t("common.city"), render: (r) => r.deliveryCity },
    { key: "items", header: t("orders.items"), align: "end", render: (r) => r.items?.length ?? 0 },
    { key: "bids", header: t("stats.bids"), align: "end", render: (r) => r.bidCount ?? 0 },
    { key: "delivery", header: t("order.delivery"), render: (r) => <span className="text-slate-500">{r.deliveryDate ? formatDateTime(r.deliveryDate, lang) : "—"}</span> },
    { key: "closes", header: t("sup.marketplace.closes"), render: (r) => <span className="text-slate-500">{formatDateTime(r.closesAt, lang)}</span> },
    {
      key: "action",
      header: "",
      align: "end",
      render: (r) =>
        r.myBidId ? (
          <div className="flex items-center justify-end gap-2">
            <Badge tone="green">{t("sup.marketplace.bidPlaced")}</Badge>
            <LinkButton href={`/supplier/marketplace/${r.id}`} size="sm" variant="outline">{t("sup.marketplace.update")}</LinkButton>
          </div>
        ) : (
          <LinkButton href={`/supplier/marketplace/${r.id}`} size="sm" variant="accent">{t("sup.marketplace.bid")}</LinkButton>
        ),
    },
  ];

  return (
    <div>
      <PageHeader title={t("sup.marketplace")} subtitle={t("sup.marketplace.subtitle")} />
      <Card className="mb-4 p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setQ(search.trim());
            setPage(1);
          }}
          className="grid gap-3 sm:grid-cols-[1fr_200px_auto]"
        >
          <Input name="q" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("sup.marketplace.searchPlaceholder")} />
          <Select name="city" value={city} onChange={(e) => { setCity(e.target.value); setPage(1); }} placeholder={t("materials.allCities")} options={SAUDI_CITIES.map((c) => ({ value: c, label: c }))} />
          <Button type="submit">{t("hero.search")}</Button>
        </form>
      </Card>
      {state.loading ? <LoadingBlock /> : state.error ? <Alert onRetry={state.reload}>{state.error}</Alert> : (
        <Card>
          <Table columns={columns} rows={state.data?.data ?? []} rowKey={(r) => r.id} empty={<EmptyState title={t("sup.marketplace.noOpen")} description={t("sup.marketplace.noOpenDesc")} />} />
          {state.data && <Pagination page={state.data.page} pageSize={state.data.pageSize} total={state.data.total} onChange={setPage} />}
        </Card>
      )}
    </div>
  );
}
