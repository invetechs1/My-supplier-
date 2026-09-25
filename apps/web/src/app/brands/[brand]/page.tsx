"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense } from "react";
import { marketplaceApi } from "@/lib/api/marketplace";
import { useAsync } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { Alert, LinkButton, LoadingBlock } from "@/components/ui";
import { ProductListing } from "@/components/shop/ProductListing";

function BrandInner({ brand }: { brand: string }) {
  const { t } = useI18n();
  // Canonical casing + product count + representative image; 404 when the brand is unknown.
  const summary = useAsync(() => marketplaceApi.brand(brand, { pageSize: 1 }), [brand]);

  if (summary.error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Alert onRetry={summary.reload}>{summary.error}</Alert>
        <div className="mt-4">
          <LinkButton href="/brands" variant="outline">
            All brands
          </LinkButton>
        </div>
      </div>
    );
  }
  const info = summary.data?.brand;
  const name = info?.brand ?? brand;
  return (
    <ProductListing
      basePath={`/brands/${encodeURIComponent(brand)}`}
      fixedBrand={name}
      title={
        <span className="inline-flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-lg font-bold text-brand-700" aria-hidden>
            {name.slice(0, 1).toUpperCase()}
          </span>
          {name}
        </span>
      }
      subtitle={info ? `${info.productCount} ${info.productCount === 1 ? "product" : "products"} by ${name}` : summary.loading ? "Loading…" : undefined}
      breadcrumb={
        <>
          <span className="mx-2">/</span>
          <Link href="/brands" className="hover:text-brand-700">
            {t("nav.brands")}
          </Link>
          <span className="mx-2">/</span>
          <span className="text-slate-700">{name}</span>
        </>
      }
    />
  );
}

export default function BrandPage() {
  const params = useParams<{ brand: string }>();
  let brand = params.brand;
  try {
    brand = decodeURIComponent(params.brand);
  } catch {
    /* keep raw */
  }
  return (
    <Suspense fallback={<LoadingBlock className="min-h-[50vh]" />}>
      <BrandInner brand={brand} />
    </Suspense>
  );
}
