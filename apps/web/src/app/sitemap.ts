import type { MetadataRoute } from "next";
import type { Paginated, Product } from "@mysupplier/shared";
import { API_URL, SITE_URL } from "@/lib/api";

export const dynamic = "force-dynamic";

const STATIC_ROUTES: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
  { path: "/", priority: 1, changeFrequency: "daily" },
  { path: "/shop", priority: 0.9, changeFrequency: "daily" },
  { path: "/shop/products", priority: 0.9, changeFrequency: "daily" },
  { path: "/materials", priority: 0.8, changeFrequency: "daily" },
  { path: "/suppliers", priority: 0.7, changeFrequency: "weekly" },
  { path: "/compare", priority: 0.5, changeFrequency: "weekly" },
  { path: "/boq", priority: 0.8, changeFrequency: "weekly" },
  { path: "/about", priority: 0.4, changeFrequency: "monthly" },
  { path: "/help", priority: 0.5, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.4, changeFrequency: "monthly" },
  { path: "/terms", priority: 0.2, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.2, changeFrequency: "yearly" },
  { path: "/refund-policy", priority: 0.2, changeFrequency: "yearly" },
  { path: "/login", priority: 0.3, changeFrequency: "yearly" },
  { path: "/register", priority: 0.5, changeFrequency: "yearly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${API_URL}/shop/products?pageSize=100`, { cache: "no-store", signal: controller.signal, headers: { Accept: "application/json" } });
    clearTimeout(timer);
    if (res.ok) {
      const page = (await res.json()) as Partial<Paginated<Product>>;
      const products = Array.isArray(page?.data) ? page.data : [];
      for (const p of products) {
        if (!p?.id) continue;
        entries.push({
          url: `${SITE_URL}/shop/products/${encodeURIComponent(p.id)}`,
          lastModified: now,
          changeFrequency: "daily",
          priority: 0.6,
        });
      }
    }
  } catch {
    // The API may be unreachable at request time; static routes are still served.
  }

  return entries;
}
