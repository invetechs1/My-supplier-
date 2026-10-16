"use client";

import Link from "next/link";
import React, { useRef, useState } from "react";
import type { CompanyDocument, DocumentType, VerificationStatus } from "@mysupplier/shared";
import { api, errorMessage, openDownload, supplierDocumentFilePath } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAsync, useFlash } from "@/lib/hooks";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { cn, formatDateTime } from "@/lib/format";
import { Alert, Badge, Button, Card, CardHeader, FlashMessage, LoadingBlock, PageHeader, StatusBadge, VerificationBadge } from "@/components/ui";
import { RoleGuard } from "@/components/RoleGuard";

const DOC_TYPES: Array<{ type: DocumentType; titleKey: TranslationKey; hintKey: TranslationKey; required: boolean }> = [
  { type: "CR", titleKey: "sup.documents.cr", hintKey: "sup.documents.crHint", required: true },
  { type: "VAT", titleKey: "sup.documents.vat", hintKey: "sup.documents.vatHint", required: true },
  { type: "LICENSE", titleKey: "sup.documents.license", hintKey: "sup.documents.licenseHint", required: false },
  { type: "OTHER", titleKey: "sup.documents.other", hintKey: "sup.documents.otherHint", required: false },
];

const ACCEPT = ".pdf,.png,.jpg,.jpeg";
const MAX_MB = 10;

const STATUS_COPY: Record<VerificationStatus, { titleKey: TranslationKey; bodyKey: TranslationKey; kind: "info" | "warning" | "success" | "error" }> = {
  PENDING: { titleKey: "sup.documents.pendingTitle", bodyKey: "sup.documents.pendingBody", kind: "warning" },
  UNDER_REVIEW: { titleKey: "verification.UNDER_REVIEW", bodyKey: "sup.documents.reviewBody", kind: "info" },
  VERIFIED: { titleKey: "sup.documents.verifiedTitle", bodyKey: "sup.documents.verifiedBody", kind: "success" },
  REJECTED: { titleKey: "sup.documents.rejectedTitle", bodyKey: "sup.documents.rejectedBody", kind: "error" },
};

function DocumentCard({ def, docs, onUploaded, onDeleted, onError }: { def: (typeof DOC_TYPES)[number]; docs: CompanyDocument[]; onUploaded: (d: CompanyDocument) => void; onDeleted: (id: string) => void; onError: (m: string) => void }) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const latest = docs[0];

  const pick = async (f: File | null | undefined) => {
    if (!f) return;
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["pdf", "png", "jpg", "jpeg"].includes(ext)) {
      onError(`"${f.name}" ${t("sup.documents.unsupported")}`);
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      onError(`"${f.name}" ${t("sup.documents.tooLarge")} ${MAX_MB} ${t("sup.documents.mb")}.`);
      return;
    }
    setBusy(true);
    try {
      onUploaded(await api.uploadCompanyDocument(f, def.type));
    } catch (err) {
      onError(errorMessage(err, t("sup.documents.uploadFailed")));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async (d: CompanyDocument) => {
    if (!window.confirm(`${t("sup.documents.confirmDelete")} ${d.fileName}?`)) return;
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
        title={<span className="inline-flex items-center gap-2">{t(def.titleKey)}{def.required && <Badge tone="amber">{t("sup.documents.required")}</Badge>}</span>}
        subtitle={t(def.hintKey)}
        action={latest ? <StatusBadge status={latest.status} /> : <Badge tone="slate">{t("sup.documents.notUploaded")}</Badge>}
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
            <span className="text-sm text-slate-600">{t("sup.documents.uploading")}</span>
          ) : (
            <>
              <p className="text-sm font-medium text-slate-900">{latest ? t("sup.documents.uploadNew") : t("sup.documents.dragDrop")}</p>
              <p className="mt-1 text-xs text-slate-500">{t("sup.documents.formats")} {MAX_MB} {t("sup.documents.mb")}</p>
            </>
          )}
          <input ref={inputRef} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} onChange={(e) => void pick(e.target.files?.[0])} />
        </div>
        {docs.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {docs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <a href="#" onClick={(e) => { e.preventDefault(); void openDownload(supplierDocumentFilePath(d.id)); }} title={t("sup.documents.opensSecurely")} className="min-w-0 flex-1 truncate font-medium text-brand-700 hover:underline" dir="ltr">{d.fileName}</a>
                <StatusBadge status={d.status} />
                <span className="text-xs text-slate-400">{formatDateTime(d.createdAt)}</span>
                {d.status === "PENDING" && (
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(d)} loading={deleting === d.id}>{t("common.delete")}</Button>
                )}
                {d.notes && <p className={cn("w-full rounded-lg px-2 py-1 text-xs", d.status === "REJECTED" ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-600")}><span className="font-semibold">{t("sup.documents.adminNotes")}</span> {d.notes}</p>}
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
    setFlash({ kind: "success", message: `${t("sup.documents.uploadedWord")} ${d.fileName}. ${t("sup.documents.reviewShortly")}` });
    company.reload();
    void refresh();
  };
  const onDeleted = (id: string) => {
    docs.setData((prev) => (prev ?? []).filter((d) => d.id !== id));
    setFlash({ kind: "success", message: t("sup.documents.deleted") });
  };

  return (
    <div>
      <PageHeader title={t("sup.documents")} subtitle={t("sup.documents.subtitle")} action={<VerificationBadge status={status} />} />
      <Alert kind={copy.kind} className="mb-4">
        <p className="font-semibold">{t(copy.titleKey)}</p>
        <p className="mt-0.5">{t(copy.bodyKey)}</p>
        {status === "REJECTED" && company.data?.verificationNotes && <p className="mt-2 rounded-lg bg-white/60 px-3 py-2 text-sm"><span className="font-semibold">{t("sup.documents.reviewerNotes")}</span> {company.data.verificationNotes}</p>}
        {status === "VERIFIED" && <p className="mt-2 text-xs"><Link href="/supplier/company" className="font-semibold underline">{t("sup.documents.completeStorefront")}</Link> {t("sup.documents.makeMostBadge")}</p>}
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
