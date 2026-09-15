"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import React, { useEffect, useState } from "react";
import type { Branch, CompanyDocument, DocumentStatus, TeamMember, VerificationStatus } from "@mysupplier/shared";
import { adminDocumentFileUrl, api, errorMessage, fileUrl, type AdminCompanyDetail } from "@/lib/api";
import { COMPANY_ROLE_LABEL } from "@/lib/auth";
import { useAsync, useFlash } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { formatDate, formatDateTime, formatSar, timeAgo } from "@/lib/format";
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, FlashMessage, Input, LoadingBlock, PageHeader, Select, Stars, StatusBadge, Table, Textarea, VerificationBadge, type Column } from "@/components/ui";

const VERIFICATION_OPTIONS: VerificationStatus[] = ["PENDING", "UNDER_REVIEW", "VERIFIED", "REJECTED"];
const DOC_LABEL: Record<string, string> = { CR: "Commercial registration", VAT: "VAT certificate", LICENSE: "License", OTHER: "Other" };

function DocumentRow({ doc, companyId, onUpdated, onError }: { doc: CompanyDocument; companyId: string; onUpdated: (d: CompanyDocument) => void; onError: (m: string) => void }) {
  const [notes, setNotes] = useState(doc.notes ?? "");
  const [busy, setBusy] = useState<DocumentStatus | null>(null);
  const setStatus = async (status: DocumentStatus) => {
    if (status === "REJECTED" && !notes.trim() && !window.confirm("Reject without a note to the supplier?")) return;
    setBusy(status);
    try {
      onUpdated(await api.adminUpdateDocument(companyId, doc.id, { status, notes: notes.trim() || undefined }));
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  return (
    <li className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="slate">{DOC_LABEL[doc.type] ?? doc.type}</Badge>
          <a href={adminDocumentFileUrl(companyId, doc.id)} target="_blank" rel="noreferrer" title="Private document — opens with your admin session token" className="truncate text-sm font-medium text-brand-700 hover:underline" dir="ltr">{doc.fileName}</a>
          <StatusBadge status={doc.status} />
          <span className="text-xs text-slate-400">{formatDateTime(doc.createdAt)}</span>
        </div>
        <Input name={`notes-${doc.id}`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes to the supplier (shown on their documents page)" className="mt-2" />
      </div>
      <div className="flex items-start gap-2 md:justify-end">
        <Button size="sm" variant={doc.status === "APPROVED" ? "outline" : "primary"} onClick={() => setStatus("APPROVED")} loading={busy === "APPROVED"} disabled={doc.status === "APPROVED"}>Approve</Button>
        <Button size="sm" variant="danger" onClick={() => setStatus("REJECTED")} loading={busy === "REJECTED"} disabled={doc.status === "REJECTED"}>Reject</Button>
        {doc.status !== "PENDING" && <Button size="sm" variant="ghost" onClick={() => setStatus("PENDING")} loading={busy === "PENDING"}>Reset</Button>}
      </div>
    </li>
  );
}

export default function AdminCompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useI18n();
  const state = useAsync(() => api.adminCompany(id), [id]);
  const settings = useAsync(() => api.adminSettings(), []);
  const [flash, setFlash] = useFlash(6000);
  const [verification, setVerification] = useState<{ status: VerificationStatus; notes: string; commissionPct: string }>({ status: "PENDING", notes: "", commissionPct: "" });
  const [savingVerification, setSavingVerification] = useState(false);

  useEffect(() => {
    if (state.data) setVerification({ status: state.data.verificationStatus ?? "PENDING", notes: state.data.verificationNotes ?? "", commissionPct: state.data.commissionPct === null || state.data.commissionPct === undefined ? "" : String(state.data.commissionPct) });
  }, [state.data]);

  if (state.loading) return <LoadingBlock />;
  if (state.error || !state.data) return <Alert onRetry={state.reload}>{state.error ?? "Company not found"}</Alert>;
  const c: AdminCompanyDetail = state.data;
  const logo = fileUrl(c.logoUrl);

  const saveVerification = async () => {
    const pct = verification.commissionPct.trim();
    if (pct !== "" && (Number.isNaN(Number(pct)) || Number(pct) < 0 || Number(pct) > 100)) {
      setFlash({ kind: "error", message: "Commission must be between 0 and 100." });
      return;
    }
    setSavingVerification(true);
    try {
      const updated = await api.adminSetVerification(c.id, { status: verification.status, notes: verification.notes.trim() || undefined, commissionPct: pct === "" ? null : Number(pct) });
      state.setData((prev) => (prev ? { ...prev, ...updated } : prev));
      setFlash({ kind: "success", message: `Verification set to ${verification.status.replace("_", " ").toLowerCase()}.` });
    } catch (err) {
      setFlash({ kind: "error", message: errorMessage(err) });
    } finally {
      setSavingVerification(false);
    }
  };

  const onDocUpdated = (d: CompanyDocument) => {
    state.setData((prev) => (prev ? { ...prev, documents: prev.documents.map((x) => (x.id === d.id ? d : x)) } : prev));
    setFlash({ kind: "success", message: `${d.fileName} marked ${d.status.toLowerCase()}.` });
  };

  const memberColumns: Column<TeamMember>[] = [
    { key: "name", header: "Member", render: (m) => <div><p className="font-medium text-slate-900">{m.name}</p><p className="text-xs text-slate-500" dir="ltr">{m.email}{m.phone ? ` · ${m.phone}` : ""}</p></div> },
    { key: "role", header: "Role", render: (m) => <Badge tone={m.companyRole === "OWNER" ? "green" : "slate"}>{COMPANY_ROLE_LABEL[m.companyRole] ?? m.companyRole}</Badge> },
    { key: "active", header: "Active", render: (m) => (m.active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Inactive</Badge>) },
    { key: "login", header: "Last login", render: (m) => <span className="text-slate-500">{m.lastLoginAt ? timeAgo(m.lastLoginAt) : "Never"}</span> },
    { key: "joined", header: "Joined", render: (m) => <span className="text-slate-500">{formatDate(m.createdAt, lang)}</span> },
  ];
  const branchColumns: Column<Branch>[] = [
    { key: "name", header: "Branch", render: (b) => <span className="font-medium text-slate-900">{b.name}{b.isDefault && <Badge tone="green" className="ms-2">Default</Badge>}</span> },
    { key: "city", header: t("common.city"), render: (b) => b.city },
    { key: "address", header: "Address", render: (b) => b.address ?? "—" },
    { key: "phone", header: "Phone", render: (b) => <span dir="ltr">{b.phone ?? "—"}</span> },
  ];

  const pendingDocs = c.documents.filter((d) => d.status === "PENDING").length;

  return (
    <div>
      <nav className="mb-4 text-sm text-slate-500" aria-label="Breadcrumb">
        <Link href="/admin/companies" className="hover:text-brand-700">{t("admin.companies")}</Link>
        <span className="mx-2">/</span>
        <span className="text-slate-700">{c.name}</span>
      </nav>
      <PageHeader
        title={
          <span className="inline-flex items-center gap-3">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="h-10 w-10 rounded-xl border border-slate-200 bg-white object-contain" />
            ) : null}
            {c.name}
            <VerificationBadge status={c.verificationStatus} />
          </span>
        }
        subtitle={<span>{c.type} · {c.city} · <Stars value={c.rating} count={c.ratingCount} /> · joined {formatDate(c.createdAt, lang)}</span>}
        action={c.type === "SUPPLIER" && <Link href={`/suppliers/${c.slug || c.id}`} target="_blank" className="text-sm font-semibold text-brand-700 hover:underline">Public page ↗</Link>}
      />
      <FlashMessage flash={flash} className="mb-4" />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Documents" subtitle={pendingDocs ? `${pendingDocs} awaiting review` : "All reviewed"} />
            {c.documents.length === 0 ? <EmptyState title="No documents uploaded" /> : (
              <ul className="divide-y divide-slate-100">{c.documents.map((d) => <DocumentRow key={d.id} doc={d} companyId={c.id} onUpdated={onDocUpdated} onError={(m) => setFlash({ kind: "error", message: m })} />)}</ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Members" subtitle={`${c.members.length} users`} />
            <Table columns={memberColumns} rows={c.members} rowKey={(m) => m.id} dense empty={<EmptyState title="No members" />} />
          </Card>
          <Card>
            <CardHeader title="Branches" />
            <Table columns={branchColumns} rows={c.branches} rowKey={(b) => b.id} dense empty={<EmptyState title="No branches" />} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-brand-200">
            <CardHeader title="Verification" subtitle="Setting VERIFIED also flips the public verified badge." />
            <CardBody className="space-y-3">
              <Select label="Status" name="verificationStatus" value={verification.status} onChange={(e) => setVerification({ ...verification, status: e.target.value as VerificationStatus })} options={VERIFICATION_OPTIONS.map((s) => ({ value: s, label: s.replace("_", " ") }))} />
              <Textarea label="Notes to supplier" name="verificationNotes" rows={3} value={verification.notes} onChange={(e) => setVerification({ ...verification, notes: e.target.value })} placeholder="Reason for rejection, missing documents, expiry dates…" />
              <Input label="Commission override (%)" name="commissionPct" type="number" min={0} max={100} step="0.1" dir="ltr" value={verification.commissionPct} onChange={(e) => setVerification({ ...verification, commissionPct: e.target.value })} hint={`Blank = platform default${settings.data ? ` (${settings.data.commissionPct}%)` : ""}`} />
              <Button className="w-full" onClick={saveVerification} loading={savingVerification}>Save verification</Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Profile" />
            <dl className="space-y-2 px-5 py-4 text-sm">
              <div><dt className="text-slate-500">Arabic name</dt><dd className="font-medium text-slate-900">{c.nameAr ?? "—"}</dd></div>
              <div><dt className="text-slate-500">Slug</dt><dd className="font-mono text-xs text-slate-900" dir="ltr">{c.slug ?? "—"}</dd></div>
              <div><dt className="text-slate-500">CR / VAT</dt><dd className="font-medium text-slate-900" dir="ltr">{c.crNumber ?? "—"} / {c.vatNumber ?? "—"}</dd></div>
              <div><dt className="text-slate-500">Phone / email</dt><dd className="font-medium text-slate-900" dir="ltr">{c.phone ?? "—"} / {c.email ?? "—"}</dd></div>
              <div><dt className="text-slate-500">Website</dt><dd className="font-medium text-slate-900" dir="ltr">{c.website ?? "—"}</dd></div>
              <div><dt className="text-slate-500">Cities served</dt><dd className="font-medium text-slate-900">{(c.citiesServed ?? []).join(", ") || "—"}</dd></div>
              <div><dt className="text-slate-500">Delivery</dt><dd className="font-medium text-slate-900">min {c.minOrderValue ? formatSar(c.minOrderValue, lang) : "—"} · fee {c.deliveryFee !== null && c.deliveryFee !== undefined ? formatSar(c.deliveryFee, lang) : "—"} · {c.deliveryDays ?? "—"} days</dd></div>
              <div><dt className="text-slate-500">Working hours</dt><dd className="font-medium text-slate-900">{c.workingHours ?? "—"}</dd></div>
              <div><dt className="text-slate-500">Low-stock threshold</dt><dd className="font-medium text-slate-900">{c.lowStockThreshold}</dd></div>
              {c.description && <div><dt className="text-slate-500">Description</dt><dd className="whitespace-pre-line text-slate-700">{c.description}</dd></div>}
            </dl>
          </Card>

          <Card>
            <CardHeader title="Bank details" subtitle="For payouts" />
            <dl className="space-y-2 px-5 py-4 text-sm">
              <div><dt className="text-slate-500">Bank</dt><dd className="font-medium text-slate-900">{c.bankName ?? "—"}</dd></div>
              <div><dt className="text-slate-500">IBAN</dt><dd className="font-mono text-xs text-slate-900" dir="ltr">{c.iban ?? "—"}</dd></div>
              <div><dt className="text-slate-500">Beneficiary</dt><dd className="font-medium text-slate-900">{c.beneficiary ?? "—"}</dd></div>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
