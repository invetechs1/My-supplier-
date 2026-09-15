"use client";

import Link from "next/link";
import React, { useRef, useState } from "react";
import type { CompanyDocument, DocumentType, VerificationStatus } from "@mysupplier/shared";
import { api, errorMessage, supplierDocumentFileUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAsync, useFlash } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { cn, formatDateTime } from "@/lib/format";
import { Alert, Badge, Button, Card, CardHeader, FlashMessage, LoadingBlock, PageHeader, StatusBadge, VerificationBadge } from "@/components/ui";
import { RoleGuard } from "@/components/RoleGuard";

const DOC_TYPES: Array<{ type: DocumentType; title: string; hint: string; required: boolean }> = [
  { type: "CR", title: "Commercial registration (CR)", hint: "Valid CR certificate from the Ministry of Commerce.", required: true },
  { type: "VAT", title: "VAT registration certificate", hint: "ZATCA VAT certificate showing your 15-digit VAT number.", required: true },
  { type: "LICENSE", title: "Trade / municipal license", hint: "Baladi license or industrial license, if applicable.", required: false },
  { type: "OTHER", title: "Other supporting documents", hint: "ISO certificates, SASO conformity, authorised distributor letters…", required: false },
];

const ACCEPT = ".pdf,.png,.jpg,.jpeg";
const MAX_MB = 10;

const STATUS_COPY: Record<VerificationStatus, { title: string; body: string; kind: "info" | "warning" | "success" | "error" }> = {
  PENDING: { title: "Not verified yet", body: "Upload your commercial registration and VAT certificate. Verified suppliers get a badge, rank higher in search and can receive card payments.", kind: "warning" },
  UNDER_REVIEW: { title: "Under review", body: "Thanks — our team is checking your documents. This usually takes 1–2 business days. You can keep publishing prices meanwhile.", kind: "info" },
  VERIFIED: { title: "Verified supplier", body: "Your company is verified. Keep your documents current; we will ask for renewals when a certificate expires.", kind: "success" },
  REJECTED: { title: "Verification rejected", body: "One or more documents could not be accepted. Check the notes below, upload corrected files and we will review again.", kind: "error" },
};

function DocumentCard({ def, docs, onUploaded, onDeleted, onError }: { def: (typeof DOC_TYPES)[number]; docs: CompanyDocument[]; onUploaded: (d: CompanyDocument) => void; onDeleted: (id: string) => void; onError: (m: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const latest = docs[0];

  const pick = async (f: File | null | undefined) => {
    if (!f) return;
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["pdf", "png", "jpg", "jpeg"].includes(ext)) {
      onError(`"${f.name}" is not supported. Upload a PDF, PNG or JPG.`);
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      onError(`"${f.name}" is too large. The limit is ${MAX_MB} MB.`);
      return;
    }
    setBusy(true);
    try {
      onUploaded(await api.uploadCompanyDocument(f, def.type));
    } catch (err) {
      onError(errorMessage(err, "Upload failed."));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async (d: CompanyDocument) => {
    if (!window.confirm(`Delete ${d.fileName}?`)) return;
    setDeleting(d.id);
    try {
      await api.deleteCompanyDocument(d.id);
      onDeleted(d.id);
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Card className="flex flex-col">
      <CardHeader
        title={<span className="inline-flex items-center gap-2">{def.title}{def.required && <Badge tone="amber">Required</Badge>}</span>}
        subtitle={def.hint}
        action={latest ? <StatusBadge status={latest.status} /> : <Badge tone="slate">Not uploaded</Badge>}
      />
      <div className="flex-1 space-y-3 px-5 py-4">
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void pick(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition",
            dragging ? "border-brand-600 bg-brand-50" : "border-slate-300 bg-slate-50 hover:border-brand-400 hover:bg-brand-50/40",
          )}
        >
          {busy ? (
            <span className="text-sm text-slate-600">Uploading…</span>
          ) : (
            <>
              <p className="text-sm font-medium text-slate-900">{latest ? "Upload a new version" : "Drag & drop or click to upload"}</p>
              <p className="mt-1 text-xs text-slate-500">PDF, PNG or JPG · up to {MAX_MB} MB</p>
            </>
          )}
          <input ref={inputRef} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} onChange={(e) => void pick(e.target.files?.[0])} />
        </div>
        {docs.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {docs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <a href={supplierDocumentFileUrl(d.id)} target="_blank" rel="noreferrer" title="Opens securely with your session token" className="min-w-0 flex-1 truncate font-medium text-brand-700 hover:underline" dir="ltr">{d.fileName}</a>
                <StatusBadge status={d.status} />
                <span className="text-xs text-slate-400">{formatDateTime(d.createdAt)}</span>
                {d.status === "PENDING" && (
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(d)} loading={deleting === d.id}>Delete</Button>
                )}
                {d.notes && <p className={cn("w-full rounded-lg px-2 py-1 text-xs", d.status === "REJECTED" ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-600")}><span className="font-semibold">Admin notes:</span> {d.notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function DocumentsInner() {
  const { user, refresh } = useAuth();
  const { t } = useI18n();
  const company = useAsync(() => api.supplierCompany(), []);
  const docs = useAsync(() => api.companyDocuments(), []);
  const [flash, setFlash] = useFlash(6000);

  const status: VerificationStatus = company.data?.verificationStatus ?? (user?.company?.verificationStatus as VerificationStatus | undefined) ?? (user?.company?.verified ? "VERIFIED" : "PENDING");
  const copy = STATUS_COPY[status];

  const onUploaded = (d: CompanyDocument) => {
    docs.setData((prev) => [d, ...(prev ?? [])]);
    setFlash({ kind: "success", message: `${d.fileName} uploaded. We'll review it shortly.` });
    company.reload();
    void refresh();
  };
  const onDeleted = (id: string) => {
    docs.setData((prev) => (prev ?? []).filter((d) => d.id !== id));
    setFlash({ kind: "success", message: "Document deleted." });
  };

  return (
    <div>
      <PageHeader title={t("sup.documents")} subtitle="Verification builds trust with buyers and unlocks card payments and payouts." action={<VerificationBadge status={status} />} />
      <Alert kind={copy.kind} className="mb-4">
        <p className="font-semibold">{copy.title}</p>
        <p className="mt-0.5">{copy.body}</p>
        {status === "REJECTED" && company.data?.verificationNotes && <p className="mt-2 rounded-lg bg-white/60 px-3 py-2 text-sm"><span className="font-semibold">Reviewer notes:</span> {company.data.verificationNotes}</p>}
        {status === "VERIFIED" && <p className="mt-2 text-xs"><Link href="/supplier/company" className="font-semibold underline">Complete your storefront</Link> to make the most of your badge.</p>}
      </Alert>
      <FlashMessage flash={flash} className="mb-4" />
      {docs.loading ? (
        <LoadingBlock />
      ) : docs.error ? (
        <Alert onRetry={docs.reload}>{docs.error}</Alert>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {DOC_TYPES.map((def) => (
            <DocumentCard
              key={def.type}
              def={def}
              docs={(docs.data ?? []).filter((d) => d.type === def.type).sort((a, b) => b.createdAt.localeCompare(a.createdAt))}
              onUploaded={onUploaded}
              onDeleted={onDeleted}
              onError={(m) => setFlash({ kind: "error", message: m })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function SupplierDocumentsPage() {
  return (
    <RoleGuard area="documents">
      <DocumentsInner />
    </RoleGuard>
  );
}
