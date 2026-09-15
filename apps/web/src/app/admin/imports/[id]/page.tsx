"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/ui";
import { ImportReview } from "@/components/imports";

export default function AdminImportReviewPage() {
  const params = useParams<{ id: string }>();
  const { t } = useI18n();
  const id = typeof params?.id === "string" ? params.id : "";

  return (
    <div>
      <PageHeader
        title="Review import"
        subtitle="Admin review: fix matches, approve rows and publish. Supplier imports publish as SUPPLIER listings, quotations as QUOTATION, text and web pages as MARKET."
        action={<Link href="/admin/imports" className="text-sm font-semibold text-brand-700 hover:underline">← {t("admin.imports")}</Link>}
      />
      {id ? <ImportReview importId={id} area="admin" /> : null}
    </div>
  );
}
