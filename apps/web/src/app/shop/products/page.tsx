"use client";

import { Suspense } from "react";
import { LoadingBlock } from "@/components/ui";
import { ProductListing } from "@/components/shop/ProductListing";

export default function ShopProductsPage() {
  return (
    <Suspense fallback={<LoadingBlock className="min-h-[50vh]" />}>
      <ProductListing basePath="/shop/products" />
    </Suspense>
  );
}
