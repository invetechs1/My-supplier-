// marketplace domain types – owned by the marketplace module (product discovery, reviews, Q&A,
// wishlists, price alerts). Names here must not collide with ./index.ts.
import type { Category, Paginated, Product, ShopOffer } from "./index";

export type AttributeType = "TEXT" | "NUMBER" | "SELECT" | "BOOLEAN";

/** Category-level spec definition: drives the spec table on the product page and the filter sidebar. */
export interface CategoryAttribute {
  id: string;
  categoryId: string;
  key: string;
  label: string;
  labelAr: string;
  type: AttributeType;
  unit?: string | null;
  options: string[];
  filterable: boolean;
  sortOrder: number;
}

export interface CategoryAttributePayload {
  key: string;
  label: string;
  labelAr: string;
  type?: AttributeType;
  unit?: string | null;
  options?: string[];
  filterable?: boolean;
  sortOrder?: number;
}

/** Sale / volume pricing fields added to every offer. */
export interface OfferPricing {
  /** Live sale price (null when no sale or the sale expired). */
  salePrice?: number | null;
  /** ISO date the sale ends (null = open ended). */
  saleEndsAt?: string | null;
  /** Original list price, present only while a sale is live (for strike-through display). */
  compareAtPrice?: number | null;
  /** Price the buyer actually pays for `minQty`: sale price when live, else list price. */
  effectivePrice: number;
  /** Volume tiers sorted by minQty ascending; the tier whose minQty <= quantity applies. */
  tiers: { minQty: number; price: number }[];
}

export type ShopOfferWithPricing = ShopOffer & OfferPricing;

export interface FacetOption {
  value: string;
  count: number;
}

export interface AttributeFacet extends CategoryAttribute {
  /** SELECT/TEXT/BOOLEAN: distinct values with product counts. */
  options: string[];
  values: FacetOption[];
  /** NUMBER: observed range among the filtered products. */
  min?: number | null;
  max?: number | null;
}

export interface ProductFacets {
  attributes: AttributeFacet[];
  brands: FacetOption[];
  price: { min: number | null; max: number | null };
  cities: FacetOption[];
  total: number;
  /** True when the candidate set hit the in-memory bound (facet counts are then approximate). */
  truncated: boolean;
  /** Set when the exact search returned too few rows and trigram similarity results were mixed in. */
  fuzzy?: boolean;
}

export type ProductSort = "relevance" | "price_asc" | "price_desc" | "rating" | "newest" | "popular";

export interface ProductSearchResponse extends Paginated<Product> {
  facets: ProductFacets;
}

export interface ProductSuggestion {
  id: string;
  name: string;
  nameAr: string;
  sku: string;
  imageUrl: string | null;
  categoryName: string;
}

export interface ShopSuggestions {
  products: ProductSuggestion[];
  categories: Pick<Category, "id" | "slug" | "name" | "nameAr" | "icon">[];
  brands: string[];
}

export interface BrandSummary {
  brand: string;
  productCount: number;
  imageUrl: string | null;
}

export interface ProductReviewAuthor {
  id: string;
  name: string;
  companyName?: string | null;
}

export interface ProductReview {
  id: string;
  materialId: string;
  userId: string;
  user?: ProductReviewAuthor;
  orderId?: string | null;
  rating: number;
  title?: string | null;
  body?: string | null;
  images: string[];
  verified: boolean;
  hidden: boolean;
  helpful: number;
  supplierReply?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductReviewSummary {
  average: number;
  count: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export interface ProductReviewsResponse extends Paginated<ProductReview> {
  summary: ProductReviewSummary;
  /** The signed-in buyer's own review of this product (null when none, absent for guests). */
  mine?: ProductReview | null;
}

export interface ProductReviewPayload {
  rating: number;
  title?: string;
  body?: string;
  images?: string[];
}

export interface ProductQuestion {
  id: string;
  materialId: string;
  userId: string;
  user?: ProductReviewAuthor;
  question: string;
  answer?: string | null;
  answeredById?: string | null;
  answeredBy?: { id: string; name: string; companyName?: string | null } | null;
  answeredAt?: string | null;
  hidden: boolean;
  createdAt: string;
}

export interface WishlistItem {
  id: string;
  wishlistId: string;
  materialId: string;
  material?: Product;
  listingId?: string | null;
  quantity: number;
  note?: string | null;
  createdAt: string;
}

export interface Wishlist {
  id: string;
  userId: string;
  name: string;
  isDefault: boolean;
  itemCount?: number;
  items?: WishlistItem[];
  createdAt: string;
  updatedAt: string;
}

export interface WishlistItemPayload {
  materialId: string;
  listingId?: string | null;
  quantity?: number;
  note?: string | null;
}

export interface WishlistAddToCartResult {
  added: number;
  skipped: { materialId: string; reason: string }[];
}

export interface WishlistContains {
  materialId: string;
  wishlistIds: string[];
  saved: boolean;
}

export interface PriceAlert {
  id: string;
  userId: string;
  materialId: string;
  material?: Product;
  targetPrice?: number | null;
  notifyBackInStock: boolean;
  city?: string | null;
  active: boolean;
  triggeredAt?: string | null;
  createdAt: string;
}

export interface PriceAlertPayload {
  materialId: string;
  targetPrice?: number | null;
  notifyBackInStock?: boolean;
  city?: string | null;
}

/** Extra fields returned by GET /shop/products/:id on top of ProductDetail. */
export interface ProductDiscoveryDetail {
  attributes: CategoryAttribute[];
  reviewSummary: ProductReviewSummary;
  questionsCount: number;
  frequentlyBoughtTogether: Product[];
}
