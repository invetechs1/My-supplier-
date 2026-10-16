"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/ui";
import { ImportReview } from "@/components/imports";

export default function SupplierImportReviewPage() {
  const params = useParams<{ id: string }>();
  const { t } = useI18n();
  const id = typeof params?.id === "string" ? params.id : "";

  return (
    <div>
      <PageHeader
        title={t("sup.imports.reviewTitle")}
        subtitle={t("sup.imports.reviewSubtitle")}
        action={<Link href="/supplier/imports" className="text-sm font-semibold text-brand-700 hover:underline">{t("common.backArrow")} {t("sup.imports")}</Link>}
      />
      {id ? <ImportReview importId={id} area="supplier" /> : null}
    </div>
  );
}
