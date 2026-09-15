"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Card, CardBody, LinkButton, PageHeader } from "@/components/ui";
import { ImportList, ImportUploader } from "@/components/imports";

export default function SupplierImportsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div>
      <PageHeader
        title={t("sup.imports")}
        subtitle="Upload your price list — PDF, Excel, photo or paste; our AI reads it and matches it to the catalogue. You review every row before anything goes live."
        action={<LinkButton href="/supplier/prices" variant="outline">{t("sup.prices")}</LinkButton>}
      />

      <Card className="mb-6 overflow-hidden">
        <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50 to-white px-5 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-slate-900">Upload your price list — PDF, Excel, photo or paste</p>
              <p className="text-sm text-slate-600">Our AI reads it and matches every line to the MySupplier catalogue. Approve the matches and your prices are live in the shop within minutes.</p>
            </div>
          </div>
        </div>
        <CardBody>
          <ImportUploader
            kind="SUPPLIER_PRICE_LIST"
            defaultCity={user?.company?.city ?? ""}
            onCreated={(imp) => {
              setRefreshKey((k) => k + 1);
              router.push(`/supplier/imports/${imp.id}`);
            }}
          />
        </CardBody>
      </Card>

      <ImportList area="supplier" refreshKey={refreshKey} title="My imports" />
    </div>
  );
}
