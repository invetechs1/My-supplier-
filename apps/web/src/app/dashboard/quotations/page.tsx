"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Badge, Card, CardBody, PageHeader } from "@/components/ui";
import { ImportList, ImportUploader } from "@/components/imports";

export default function BuyerQuotationsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [refreshKey, setRefreshKey] = useState(0);
  const [total, setTotal] = useState<number | null>(null);

  return (
    <div>
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            {t("dash.quotations")}
            {total !== null && <Badge tone="purple" className="text-sm">{total}</Badge>}
          </span>
        }
        subtitle="Turn the quotations you receive into market intelligence for everyone."
      />

      <Card className="mb-6 overflow-hidden">
        <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50 to-white px-5 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185z" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-slate-900">Got a quotation from a supplier? Upload it.</p>
              <p className="text-sm text-slate-600">
                We extract the prices and add them to the market data as <em>quoted prices</em>, helping every contractor — and you get the supplier&apos;s other prices in return. Your identity is never shown.
              </p>
            </div>
          </div>
        </div>
        <CardBody>
          <ImportUploader
            kind="BUYER_QUOTATION"
            onCreated={(imp) => {
              setRefreshKey((k) => k + 1);
              router.push(`/dashboard/quotations/${imp.id}`);
            }}
          />
        </CardBody>
      </Card>

      <ImportList area="buyer" fixedKind="BUYER_QUOTATION" refreshKey={refreshKey} title="My quotation uploads" onTotal={setTotal} />
    </div>
  );
}
