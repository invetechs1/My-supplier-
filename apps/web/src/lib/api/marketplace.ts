import type {
  BrandSummary,
  OfferPricing,
  Paginated,
  PriceAlert,
  PriceAlertPayload,
  Product,
  ProductDetail,
  ProductDiscoveryDetail,
  ProductQuestion,
  ProductReview,
  ProductReviewPayload,
  ProductReviewsResponse,
  ProductSearchResponse,
  ProductSort,
  ShopOffer,
  ShopOfferWithPricing,
  ShopSuggestions,
  Wishlist,
  WishlistAddToCartResult,
  WishlistContains,
  WishlistItem,
  WishlistItemPayload,
} from "@mysupplier/shared";
import { API_ORIGIN, request } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types the discovery endpoints return on top of the shared shapes
// ---------------------------------------------------------------------------

/** Extra material columns the API spreads onto every product (ratings, media). */
export interface ProductExtras {
  ratingAvg?: number;
  ratingCount?: number;
  images?: string[];
  datasheetUrl?: string | null;
  videoUrl?: string | null;
  popularity?: number;
  createdAt?: string;
  viewedAt?: string;
}

export type ShopProduct = Product & ProductExtras;

/** GET /shop/products/:id – storefront detail plus discovery extras. */
export type MarketplaceProductDetail = ProductDetail &
  ProductDiscoveryDetail &
  ProductExtras & {
    offers: ShopOfferWithPricing[];
    bestOffer?: ShopOfferWithPricing | null;
  };

export type BrandProductsResponse = Paginated<ShopProduct> & { brand: BrandSummary };

export type RecommendationsResponse = { basis: "recently_viewed" | "popular"; items: ShopProduct[] };

export type ReviewSort = "recent" | "helpful" | "rating";

export interface MarketplaceSearchQuery {
  q?: string;
  categoryId?: string;
  city?: string;
  /** One brand or several (comma separated = OR). */
  brand?: string;
  minPrice?: string | number;
  maxPrice?: string | number;
  inStock?: boolean;
  minRating?: number | string;
  sort?: ProductSort | string;
  page?: number;
  pageSize?: number;
  /** spec.<key> filters: value, "a,b" (OR) or "min..max" for NUMBER attributes. */
  specs?: Record<string, string>;
}

function searchQuery(q: MarketplaceSearchQuery): Record<string, string | number | boolean | undefined> {
  const out: Record<string, string | number | boolean | undefined> = {
    q: q.q || undefined,
    categoryId: q.categoryId || undefined,
    city: q.city || undefined,
    brand: q.brand || undefined,
    minPrice: q.minPrice === "" ? undefined : q.minPrice,
    maxPrice: q.maxPrice === "" ? undefined : q.maxPrice,
    inStock: q.inStock ? 1 : undefined,
    minRating: q.minRating === "" ? undefined : q.minRating,
    sort: q.sort || undefined,
    page: q.page,
    pageSize: q.pageSize,
  };
  Object.entries(q.specs ?? {}).forEach(([key, value]) => {
    if (value) out[`spec.${key}`] = value;
  });
  return out;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const enc = encodeURIComponent;

export const marketplaceApi = {
  // Discovery (public)
  searchProducts: (query: MarketplaceSearchQuery = {}) => request<ProductSearchResponse & { data: ShopProduct[] }>("/shop/products", { query: searchQuery(query) }),
  suggest: (q: string, signal?: AbortSignal) => request<ShopSuggestions>("/shop/suggest", { query: { q }, signal }),
  brands: () => request<BrandSummary[]>("/shop/brands"),
  brand: (brand: string, query: { page?: number; pageSize?: number; city?: string } = {}) => request<BrandProductsResponse>(`/shop/brands/${enc(brand)}`, { query }),
  product: (id: string, city?: string) => request<MarketplaceProductDetail>(`/shop/products/${enc(id)}`, { query: { city: city || undefined } }),
  recommendations: (city?: string) => request<RecommendationsResponse>("/shop/recommendations", { query: { city: city || undefined } }),
  recentlyViewed: (city?: string) => request<ShopProduct[]>("/shop/recently-viewed", { query: { city: city || undefined } }),

  // Reviews
  reviews: (productId: string, query: { sort?: ReviewSort; page?: number; pageSize?: number } = {}) =>
    request<ProductReviewsResponse>(`/shop/products/${enc(productId)}/reviews`, { query }),
  createReview: (productId: string, body: ProductReviewPayload) => request<ProductReview>(`/shop/products/${enc(productId)}/reviews`, { method: "POST", body }),
  updateReview: (reviewId: string, body: Partial<ProductReviewPayload>) => request<ProductReview>(`/shop/reviews/${enc(reviewId)}`, { method: "PATCH", body }),
  markHelpful: (reviewId: string) => request<{ id: string; helpful: number }>(`/shop/reviews/${enc(reviewId)}/helpful`, { method: "POST" }),

  // Q&A
  questions: (productId: string, query: { page?: number; pageSize?: number } = {}) => request<Paginated<ProductQuestion>>(`/shop/products/${enc(productId)}/questions`, { query }),
  askQuestion: (productId: string, question: string) => request<ProductQuestion>(`/shop/products/${enc(productId)}/questions`, { method: "POST", body: { question } }),

  // Wishlists (auth)
  wishlists: () => request<Wishlist[]>("/wishlists"),
  createWishlist: (name: string) => request<Wishlist>("/wishlists", { method: "POST", body: { name } }),
  wishlist: (id: string, city?: string) => request<Wishlist & { items: WishlistItem[] }>(`/wishlists/${enc(id)}`, { query: { city: city || undefined } }),
  wishlistContains: (materialId: string) => request<WishlistContains>("/wishlists/contains", { query: { materialId } }),
  renameWishlist: (id: string, name: string) => request<Wishlist>(`/wishlists/${enc(id)}`, { method: "PATCH", body: { name } }),
  deleteWishlist: (id: string) => request<{ ok: boolean }>(`/wishlists/${enc(id)}`, { method: "DELETE" }),
  /** `listId` may be "default". */
  addWishlistItem: (listId: string, body: WishlistItemPayload) => request<WishlistItem>(`/wishlists/${enc(listId)}/items`, { method: "POST", body }),
  updateWishlistItem: (listId: string, itemId: string, body: Partial<Omit<WishlistItemPayload, "materialId">>) =>
    request<WishlistItem>(`/wishlists/${enc(listId)}/items/${enc(itemId)}`, { method: "PATCH", body }),
  removeWishlistItem: (listId: string, itemId: string) => request<{ ok: boolean }>(`/wishlists/${enc(listId)}/items/${enc(itemId)}`, { method: "DELETE" }),
  wishlistToCart: (listId: string, city?: string) => request<WishlistAddToCartResult>(`/wishlists/${enc(listId)}/add-to-cart`, { method: "POST", body: { city: city || undefined } }),

  // Price alerts (auth)
  alerts: () => request<PriceAlert[]>("/alerts"),
  createAlert: (body: PriceAlertPayload) => request<PriceAlert>("/alerts", { method: "POST", body }),
  deleteAlert: (id: string) => request<{ ok: boolean }>(`/alerts/${enc(id)}`, { method: "DELETE" }),
};

/** Removes a material from every list it is saved in (the heart "un-save" action). */
export async function removeMaterialFromLists(materialId: string, wishlistIds: string[]): Promise<void> {
  await Promise.all(
    wishlistIds.map(async (listId) => {
      const list = await marketplaceApi.wishlist(listId);
      const item = (list.items ?? []).find((it) => it.materialId === materialId);
      if (item) await marketplaceApi.removeWishlistItem(listId, item.id);
    }),
  );
}

// ---------------------------------------------------------------------------
// Pricing helpers (sale price wins, else the highest tier reached, else list price)
// ---------------------------------------------------------------------------

export type PricedOffer = ShopOffer & OfferPricing;

/** Normalises an offer that may come from an older endpoint without OfferPricing fields. */
export function asPriced(offer: ShopOffer | null | undefined): PricedOffer | null {
  if (!offer) return null;
  const o = offer as ShopOffer & Partial<OfferPricing>;
  const salePrice = typeof o.salePrice === "number" ? o.salePrice : null;
  return {
    ...offer,
    salePrice,
    saleEndsAt: o.saleEndsAt ?? null,
    compareAtPrice: o.compareAtPrice ?? (salePrice !== null ? offer.price : null),
    effectivePrice: typeof o.effectivePrice === "number" ? o.effectivePrice : salePrice ?? offer.price,
    tiers: Array.isArray(o.tiers) ? [...o.tiers].sort((a, b) => a.minQty - b.minQty) : [],
  };
}

export function isOnSale(offer: PricedOffer | null | undefined): boolean {
  return !!offer && typeof offer.salePrice === "number" && offer.salePrice < offer.price;
}

/** Whole-percent saving of `price` against `compareAt` (null when not a saving). */
export function savingsPercent(compareAt: number | null | undefined, price: number): number | null {
  if (!compareAt || compareAt <= 0 || price >= compareAt) return null;
  return Math.round(((compareAt - price) / compareAt) * 100);
}

/** Tier that applies to `quantity` (null when the base/sale price applies). */
export function tierFor(offer: PricedOffer | null | undefined, quantity: number): { minQty: number; price: number } | null {
  if (!offer || isOnSale(offer)) return null;
  let match: { minQty: number; price: number } | null = null;
  for (const t of offer.tiers) if (t.minQty <= quantity) match = t;
  return match;
}

/** Unit price the buyer pays for `quantity` units of this offer. */
export function unitPriceFor(offer: PricedOffer | null | undefined, quantity: number): number {
  if (!offer) return 0;
  if (isOnSale(offer)) return offer.effectivePrice;
  return tierFor(offer, quantity)?.price ?? offer.price;
}

/** Next volume break above `quantity`, with the per-unit saving versus the current unit price. */
export function nextTierFor(offer: PricedOffer | null | undefined, quantity: number): { minQty: number; price: number; savePerUnit: number } | null {
  if (!offer || isOnSale(offer)) return null;
  const current = unitPriceFor(offer, quantity);
  const next = offer.tiers.find((t) => t.minQty > quantity && t.price < current);
  return next ? { ...next, savePerUnit: Math.round((current - next.price) * 100) / 100 } : null;
}

/** Cheapest tier (for the "from SAR x for 50+" hint on cards). */
export function bestTier(offer: PricedOffer | null | undefined): { minQty: number; price: number } | null {
  if (!offer || offer.tiers.length === 0) return null;
  return offer.tiers.reduce((best, t) => (t.price < best.price ? t : best), offer.tiers[0]);
}

/** Absolute URL for an uploaded file path (`/uploads/...`) or an already absolute URL. */
export function fileUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  // Only API-relative paths (`/uploads/...`) are accepted; `data:`, `javascript:` and other schemes are dropped.
  if (path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\")) return `${API_ORIGIN}${path}`;
  return null;
}

/** Embed URL for YouTube / Vimeo links (null for a plain video file). */
export function videoEmbedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/i);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
}
