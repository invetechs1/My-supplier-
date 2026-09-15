"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/ui";
import { ImportReview } from "@/components/imports";

export default function BuyerQuotationReviewPage() {
  const params = useParams<{ id: string }>();
  const { t } = useI18n();
  const id = typeof params?.id === "string" ? params.id : "";

  return (
    <div>
      <PageHeader
        title="Review quotation"
        subtitle="Confirm which catalogue items the quoted lines refer to, fix any prices, then publish them as quoted prices."
        action={<Link href="/dashboard/quotations" className="text-sm font-semibold text-brand-700 hover:underline">← {t("dash.quotations")}</Link>}
      />
      {id ? <ImportReview importId={id} area="buyer" /> : null}
    </div>
  );
}
