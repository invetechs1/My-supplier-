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
        title="Review extracted prices"
        subtitle="Check the catalogue match, price, unit and city for each row, approve what is right and publish."
        action={<Link href="/supplier/imports" className="text-sm font-semibold text-brand-700 hover:underline">← {t("sup.imports")}</Link>}
      />
      {id ? <ImportReview importId={id} area="supplier" /> : null}
    </div>
  );
}
