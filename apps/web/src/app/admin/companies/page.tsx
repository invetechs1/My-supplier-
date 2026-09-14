"use client";

import Link from "next/link";
import { useState } from "react";
import type { Company } from "@mysupplier/shared";
import { api, errorMessage } from "@/lib/api";
import { useAsync, useFlash } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { Alert, Badge, Button, Card, EmptyState, FlashMessage, LoadingBlock, PageHeader, Pagination, Select, Table, VerifiedBadge, type Column } from "@/components/ui";

export default function AdminCompaniesPage() {
  const { t, lang } = useI18n();
  const [verified, setVerified] = useState("");
  const [page, setPage] = useState(1);
  const state = useAsync(() => api.adminCompanies({ verified: verified || undefined, page }), [verified, page]);
  const [flash, setFlash] = useFlash();
  const [busy, setBusy] = useState<string | null>(null);

  const toggle = async (c: Company) => {
    setBusy(c.id);
    try {
      const updated = await api.adminVerifyCompany(c.id, !c.verified);
      state.setData((prev) => (prev ? { ...prev, data: prev.data.map((x) => (x.id === c.id ? { ...x, ...updated } : x)) } : prev));
      setFlash({ kind: "success", message: `${c.name} ${updated.verified ? "verified" : "unverified"}.` });
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const columns: Column<Company>[] = [
    { key: "name", header: "Company", render: (c) => (
      <div>
        <p className="font-medium text-slate-900">{c.type === "SUPPLIER" ? <Link href={`/suppliers/${c.id}`} className="hover:text-brand-700">{c.name}</Link> : c.name}</p>
        <p className="text-xs text-slate-500">{c.nameAr}</p>
      </div>
    ) },
    { key: "type", header: "Type", render: (c) => <Badge tone="slate">{c.type}</Badge> },
    { key: "city", header: t("common.city"), render: (c) => c.city },
    { key: "cr", header: "CR / VAT", render: (c) => <span className="text-xs text-slate-600" dir="ltr">{c.crNumber ?? "—"} / {c.vatNumber ?? "—"}</span> },
    { key: "rating", header: "Rating", align: "end", render: (c) => `${c.rating.toFixed(1)} (${c.ratingCount})` },
    { key: "verified", header: "Verified", render: (c) => (c.verified ? <VerifiedBadge verified /> : <Badge tone="amber">Pending</Badge>) },
    { key: "created", header: "Joined", render: (c) => <span className="text-slate-500">{formatDate(c.createdAt, lang)}</span> },
    { key: "actions", header: "", align: "end", render: (c) => (
      <Button size="sm" variant={c.verified ? "outline" : "primary"} onClick={() => toggle(c)} loading={busy === c.id}>
        {c.verified ? "Revoke" : "Verify"}
      </Button>
    ) },
  ];

  return (
    <div>
      <PageHeader title={t("admin.companies")} action={<Select name="verified" value={verified} onChange={(e) => { setVerified(e.target.value); setPage(1); }} placeholder="All companies" options={[{ value: "true", label: "Verified" }, { value: "false", label: "Unverified" }]} />} />
      <FlashMessage flash={flash} className="mb-4" />
      {state.loading ? <LoadingBlock /> : state.error ? <Alert onRetry={state.reload}>{state.error}</Alert> : (
        <Card>
          <Table columns={columns} rows={state.data?.data ?? []} rowKey={(c) => c.id} empty={<EmptyState title="No companies" />} />
          {state.data && <Pagination page={state.data.page} pageSize={state.data.pageSize} total={state.data.total} onChange={setPage} />}
        </Card>
      )}
    </div>
  );
}
