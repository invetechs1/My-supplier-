"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import type { Company, CompanyProfile } from "@mysupplier/shared";
import { api, errorMessage } from "@/lib/api";
import { useAsync, useFlash } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { Alert, Badge, Button, Card, EmptyState, FlashMessage, LoadingBlock, PageHeader, Pagination, Select, Table, VerificationBadge, type Column } from "@/components/ui";

function AdminCompaniesInner() {
  const { t, lang } = useI18n();
  const params = useSearchParams();
  const [verified, setVerified] = useState(() => (params.get("verified") === "true" || params.get("verified") === "false" ? (params.get("verified") as string) : ""));
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
        <p className="font-medium text-slate-900"><Link href={`/admin/companies/${c.id}`} className="hover:text-brand-700">{c.name}</Link></p>
        <p className="text-xs text-slate-500">{c.nameAr}</p>
      </div>
    ) },
    { key: "type", header: "Type", render: (c) => <Badge tone="slate">{c.type}</Badge> },
    { key: "city", header: t("common.city"), render: (c) => c.city },
    { key: "cr", header: "CR / VAT", render: (c) => <span className="text-xs text-slate-600" dir="ltr">{c.crNumber ?? "—"} / {c.vatNumber ?? "—"}</span> },
    { key: "rating", header: "Rating", align: "end", render: (c) => `${c.rating.toFixed(1)} (${c.ratingCount})` },
    { key: "verified", header: "Verification", render: (c) => <VerificationBadge status={(c as Company & Partial<CompanyProfile>).verificationStatus ?? (c.verified ? "VERIFIED" : "PENDING")} /> },
    { key: "created", header: "Joined", render: (c) => <span className="text-slate-500">{formatDate(c.createdAt, lang)}</span> },
    { key: "actions", header: "", align: "end", render: (c) => (
      <div className="flex justify-end gap-2">
        <Link href={`/admin/companies/${c.id}`} className="inline-flex h-8 items-center rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50">Review</Link>
        <Button size="sm" variant={c.verified ? "outline" : "primary"} onClick={() => toggle(c)} loading={busy === c.id}>
          {c.verified ? "Revoke" : "Verify"}
        </Button>
      </div>
    ) },
  ];

  return (
    <div>
      <PageHeader title={t("admin.companies")} subtitle="Open a company to review documents, members, branches and set verification or a commission override." action={<Select name="verified" value={verified} onChange={(e) => { setVerified(e.target.value); setPage(1); }} placeholder="All companies" options={[{ value: "true", label: "Verified" }, { value: "false", label: "Unverified" }]} />} />
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

export default function AdminCompaniesPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <AdminCompaniesInner />
    </Suspense>
  );
}
