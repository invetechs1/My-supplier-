"use client";

import { marketplaceApi } from "@/lib/api/marketplace";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { useAsync } from "@/lib/hooks";
import { ProductRail, SectionHeading } from "./ProductCard";

/** "Recently viewed" rail for logged-in users; renders nothing for guests or an empty history. */
export function RecentlyViewed({ excludeId, title = "Recently viewed", limit = 12 }: { excludeId?: string; title?: string; limit?: number }) {
  const { user } = useAuth();
  const { deliveryCity } = useCart();
  const recent = useAsync(() => marketplaceApi.recentlyViewed(deliveryCity || undefined), [user?.id, deliveryCity], !!user);
  if (!user || recent.error) return null;
  const items = (recent.data ?? []).filter((p) => p.id !== excludeId).slice(0, limit);
  if (!recent.loading && items.length === 0) return null;
  return (
    <section aria-label={title}>
      <SectionHeading title={title} subtitle="Pick up where you left off" />
      {recent.loading && items.length === 0 ? <div className="h-40 animate-pulse rounded-xl bg-slate-100" aria-hidden /> : <ProductRail products={items} />}
    </section>
  );
}

/** "Recommended for you" rail (personalised when logged in, popular otherwise). */
export function Recommended({ limit = 12 }: { limit?: number }) {
  const { user } = useAuth();
  const { deliveryCity } = useCart();
  const rec = useAsync(() => marketplaceApi.recommendations(deliveryCity || undefined), [user?.id, deliveryCity]);
  if (rec.error) return null;
  const items = (rec.data?.items ?? []).slice(0, limit);
  if (!rec.loading && items.length === 0) return null;
  const personal = rec.data?.basis === "recently_viewed";
  return (
    <section aria-label="Recommended">
      <SectionHeading title={personal ? "Recommended for you" : "Popular right now"} subtitle={personal ? "Based on the categories you browsed" : "What contractors are ordering this week"} href="/shop/products?sort=popular" />
      {rec.loading && items.length === 0 ? <div className="h-40 animate-pulse rounded-xl bg-slate-100" aria-hidden /> : <ProductRail products={items} />}
    </section>
  );
}
