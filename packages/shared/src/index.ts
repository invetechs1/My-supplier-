// Shared domain types for MySupplier (API, web, mobile).
// Keep this file dependency-free so every app can import it directly.

export type Role = "BUYER" | "SUPPLIER" | "ADMIN";
export type CompanyType = "SUPPLIER" | "CONTRACTOR" | "CONSULTANT" | "OTHER";
export type PriceSource = "SUPPLIER" | "MARKET" | "IMPORTED" | "QUOTATION";
export type RfqStatus = "OPEN" | "CLOSED" | "AWARDED" | "CANCELLED";
export type BidStatus = "SUBMITTED" | "WITHDRAWN" | "ACCEPTED" | "REJECTED";
export type OrderStatus = "PENDING" | "CONFIRMED" | "IN_TRANSIT" | "DELIVERED" | "CANCELLED";
export type NotificationType = "NEW_RFQ" | "NEW_BID" | "BID_ACCEPTED" | "BID_REJECTED" | "ORDER_UPDATE" | "SYSTEM";

export const CURRENCY = "SAR";

export const SAUDI_CITIES = [
  "Riyadh", "Jeddah", "Makkah", "Madinah", "Dammam", "Khobar", "Dhahran",
  "Jubail", "Tabuk", "Abha", "Khamis Mushait", "Taif", "Buraidah", "Hail",
  "Najran", "Jazan", "Yanbu", "Al Ahsa", "Qatif", "NEOM",
] as const;
export type SaudiCity = (typeof SAUDI_CITIES)[number];

export const UNITS = ["ton", "kg", "bag", "m3", "m2", "m", "piece", "pallet", "roll", "litre", "drum", "sheet", "bundle"] as const;
export type Unit = (typeof UNITS)[number];

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  role: Role;
  locale: "en" | "ar";
  companyId?: string | null;
  company?: Company | null;
  createdAt: string;
}

export interface Company {
  id: string;
  name: string;
  nameAr?: string | null;
  type: CompanyType;
  crNumber?: string | null;
  vatNumber?: string | null;
  city: string;
  region?: string | null;
  phone?: string | null;
  website?: string | null;
  verified: boolean;
  rating: number; // 0..5
  ratingCount: number;
  createdAt: string;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  nameAr: string;
  parentId?: string | null;
  icon?: string | null;
  materialCount?: number;
}

export interface Material {
  id: string;
  sku: string;
  name: string;
  nameAr: string;
  unit: Unit | string;
  categoryId: string;
  category?: Category;
  brand?: string | null;
  specs?: Record<string, string | number> | null;
  imageUrl?: string | null;
  description?: string | null;
  // Aggregates (filled by the API when listing)
  minPrice?: number | null;
  avgPrice?: number | null;
  maxPrice?: number | null;
  supplierCount?: number;
  lastUpdated?: string | null;
}

export interface PriceListing {
  id: string;
  materialId: string;
  material?: Material;
  companyId: string;
  company?: Company;
  price: number;
  currency: string;
  minQty: number;
  leadTimeDays: number;
  city: string;
  source: PriceSource;
  sourceName?: string | null;
  validUntil?: string | null;
  updatedAt: string;
}

export interface PriceSummary {
  materialId: string;
  min: number | null;
  avg: number | null;
  median: number | null;
  max: number | null;
  count: number;
  cheapestListingId?: string | null;
  lastUpdated?: string | null;
}

export interface PriceHistoryPoint {
  date: string; // YYYY-MM-DD
  avg: number;
  min: number;
  max: number;
}

export interface RfqItem {
  id: string;
  rfqId: string;
  materialId?: string | null;
  material?: Material | null;
  description: string;
  quantity: number;
  unit: string;
  notes?: string | null;
}

export interface Rfq {
  id: string;
  reference: string; // e.g. RFQ-2026-000123
  buyerId: string;
  buyer?: Pick<User, "id" | "name" | "company">;
  title: string;
  status: RfqStatus;
  deliveryCity: string;
  deliveryAddress?: string | null;
  deliveryDate?: string | null;
  closesAt: string;
  notes?: string | null;
  items: RfqItem[];
  bidCount?: number;
  lowestBid?: number | null;
  awardedBidId?: string | null;
  createdAt: string;
}

export interface BidItem {
  id: string;
  bidId: string;
  rfqItemId: string;
  unitPrice: number;
  quantity: number;
  leadTimeDays: number;
  notes?: string | null;
}

export interface Bid {
  id: string;
  rfqId: string;
  rfq?: Rfq;
  companyId: string;
  company?: Company;
  totalPrice: number;
  currency: string;
  validUntil: string;
  deliveryDays: number;
  notes?: string | null;
  status: BidStatus;
  items: BidItem[];
  createdAt: string;
}

export interface Order {
  id: string;
  reference: string; // ORD-2026-000045
  rfqId: string;
  bidId: string;
  buyerId: string;
  companyId: string;
  company?: Company;
  rfq?: Rfq;
  bid?: Bid;
  total: number;
  currency: string;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
  read: boolean;
  createdAt: string;
}

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ApiError {
  error: string;
  details?: unknown;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface PlatformStats {
  materials: number;
  suppliers: number;
  priceListings: number;
  openRfqs: number;
  bids: number;
  orders: number;
  gmv: number; // total order value in SAR
}

export interface PriceIndexEntry {
  category: Category;
  avgPrice: number;
  changePct30d: number; // e.g. -2.4
  materialCount: number;
}

// Request payloads -----------------------------------------------------------

export interface RegisterPayload {
  email: string;
  password: string;
  name: string;
  phone?: string;
  role: Exclude<Role, "ADMIN">;
  locale?: "en" | "ar";
  company?: {
    name: string;
    nameAr?: string;
    type: CompanyType;
    city: string;
    crNumber?: string;
    vatNumber?: string;
    phone?: string;
  };
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface CreateRfqPayload {
  title: string;
  deliveryCity: string;
  deliveryAddress?: string;
  deliveryDate?: string;
  closesAt: string;
  notes?: string;
  items: Array<{
    materialId?: string;
    description: string;
    quantity: number;
    unit: string;
    notes?: string;
  }>;
}

export interface CreateBidPayload {
  validUntil: string;
  deliveryDays: number;
  notes?: string;
  items: Array<{
    rfqItemId: string;
    unitPrice: number;
    quantity?: number;
    leadTimeDays?: number;
    notes?: string;
  }>;
}

export interface UpsertPricePayload {
  materialId: string;
  price: number;
  minQty?: number;
  leadTimeDays?: number;
  city: string;
  validUntil?: string;
}

export function formatSar(value: number | null | undefined, locale: "en" | "ar" = "en"): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const formatted = new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-SA", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value);
  return locale === "ar" ? `${formatted} ر.س` : `SAR ${formatted}`;
}

// BOQ research -----------------------------------------------------------------

export interface BoqLineInput {
  description: string;
  quantity: number;
  unit?: string;
  materialId?: string; // pin a match chosen by the user
}

export interface BoqOffer {
  listingId: string;
  supplierId: string; // company id, or "market:<source>" for imported reference prices
  supplierName: string;
  verified: boolean;
  city: string;
  price: number;
  minQty: number;
  leadTimeDays: number;
  source: PriceSource | string;
  lineTotal: number;
}

export interface BoqLineResult {
  index: number;
  description: string;
  quantity: number;
  unit: string;
  match: { material: Material; confidence: number } | null;
  alternatives: Array<{ material: Material; confidence: number }>;
  unitMismatch: boolean;
  bestOffer: BoqOffer | null;
  avgUnitPrice: number | null;
  offerCount: number;
  supplierCount: number;
  offers: BoqOffer[];
}

export interface BoqSupplierBreakdown {
  supplierId: string;
  supplierName: string;
  verified: boolean;
  city: string;
  linesCovered: number;
  coveragePct: number;
  total: number;
  avgLeadTimeDays: number;
  lines: Array<{ index: number; listingId: string; unitPrice: number; lineTotal: number }>;
}

export interface BoqAnalysis {
  city: string | null;
  generatedAt: string;
  lineCount: number;
  matchedLines: number;
  unmatchedLines: number;
  summary: {
    cheapestTotal: number;
    averageTotal: number;
    highestTotal: number;
    savingsVsAverage: number;
    savingsVsHighest: number;
    distinctSuppliersInCheapest: number;
    bestSingleSupplier: BoqSupplierBreakdown | null;
  };
  cheapestPerLine: Array<{ index: number; listingId: string; supplierId: string; supplierName: string; unitPrice: number; lineTotal: number }>;
  suppliers: BoqSupplierBreakdown[];
  lines: BoqLineResult[];
}

export interface BoqToRfqPayload {
  title: string;
  deliveryCity: string;
  deliveryAddress?: string;
  deliveryDate?: string;
  closesInDays?: number;
  notes?: string;
  lines: BoqLineInput[];
}

// Shop / e-commerce ---------------------------------------------------------------

export type OrderType = "RFQ" | "DIRECT";
export type PaymentMethod = "COD" | "BANK_TRANSFER" | "CARD";
export type PaymentStatus = "UNPAID" | "PAID" | "REFUNDED";
export type MaterialSource = "CURATED" | "SUPPLIER" | "FEED";

export const VAT_RATE = 0.15;

/** A material enriched for the storefront. */
export interface Product extends Material {
  tags?: string[];
  featured?: boolean;
  source?: MaterialSource;
  bestOffer?: ShopOffer | null;
  offerCount?: number;
  inStock?: boolean;
  isDeal?: boolean; // best price is >= 5% below the average of all offers
}

export interface ShopOffer {
  listingId: string;
  companyId: string | null;
  companyName: string;
  verified: boolean;
  rating: number;
  city: string;
  price: number;
  minQty: number;
  leadTimeDays: number;
  stock: number | null; // null = not tracked / on request
  source: PriceSource | string;
  sourceName?: string | null;
}

export interface ProductDetail extends Product {
  offers: ShopOffer[];
  summary: PriceSummary;
  history: PriceHistoryPoint[];
  related: Product[];
}

export interface ShopHome {
  featured: Product[];
  deals: Product[];
  newArrivals: Product[];
  categories: Category[];
  stats: PlatformStats;
}

export interface CartItem {
  id: string;
  listingId: string;
  quantity: number;
  offer: ShopOffer;
  material: Material;
  lineTotal: number;
}

export interface Cart {
  id: string;
  items: CartItem[];
  subtotal: number;
  vat: number;
  deliveryFee: number;
  total: number;
  supplierCount: number;
  currency: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  materialId: string | null;
  material?: Material | null;
  listingId?: string | null;
  name: string;
  unit: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

/** Extra fields present on every order (RFQ-awarded and direct). */
export interface OrderExtended extends Order {
  type: OrderType;
  items: OrderItem[];
  subtotal: number;
  vat: number;
  deliveryFee: number;
  paymentMethod?: PaymentMethod | null;
  paymentStatus: PaymentStatus;
  deliveryCity?: string | null;
  deliveryAddress?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
}

export interface CheckoutPayload {
  deliveryCity: string;
  deliveryAddress: string;
  contactPhone: string;
  paymentMethod: PaymentMethod;
  notes?: string;
}

export interface CheckoutResult {
  orders: OrderExtended[];
  total: number;
}

export interface SupplierCatalogItem {
  sku?: string;
  name: string;
  nameAr?: string;
  categorySlug: string;
  unit: string;
  brand?: string;
  description?: string;
  imageUrl?: string;
  price: number;
  city: string;
  stock?: number;
  minQty?: number;
  leadTimeDays?: number;
}

export interface Feed {
  id: string;
  name: string;
  url: string;
  format: "json" | "csv";
  enabled: boolean;
  lastRunAt?: string | null;
  lastStatus?: string | null;
  lastItemCount: number;
  createdAt: string;
}

// Production: payments, invoices, devices, password reset --------------------------

export type PaymentProvider = "MOYASAR" | "MANUAL";
export type PaymentRecordStatus = "INITIATED" | "PAID" | "FAILED" | "REFUNDED";

export interface PaymentConfig {
  provider: PaymentProvider;
  cardPaymentsEnabled: boolean; // true when the gateway is configured
  publishableKey?: string | null; // Moyasar publishable key for the client form
  currency: string;
  methods: PaymentMethod[];
}

export interface PaymentRecord {
  id: string;
  orderId: string;
  provider: PaymentProvider;
  providerPaymentId?: string | null;
  amount: number; // SAR
  currency: string;
  status: PaymentRecordStatus;
  createdAt: string;
}

export interface PaymentIntent {
  orderId: string;
  reference: string;
  amount: number; // SAR
  amountHalalas: number; // Moyasar expects the minor unit
  currency: string;
  description: string;
  callbackUrl: string;
  publishableKey: string | null;
  provider: PaymentProvider;
}

export interface InvoiceData {
  order: OrderExtended;
  seller: Company;
  buyer: Pick<User, "id" | "name" | "email" | "phone"> & { company?: Company | null };
  invoiceNumber: string;
  issuedAt: string;
  zatcaQr: string; // base64 TLV (ZATCA phase 1 simplified invoice)
  qrSvg: string; // ready-to-embed SVG of the QR
}

export interface DeviceRegistration {
  token: string; // Expo push token
  platform: "ios" | "android" | "web";
}

export interface HealthStatus {
  ok: boolean;
  time: string;
  db: "up" | "down";
  version: string;
  uptimeSeconds: number;
}

// AI price collection -------------------------------------------------------------
// Sources: supplier price lists (PDF/Excel/image/text), quotations received by buyers,
// supplier web pages (scraped + AI-normalised), and supplier self-updates via magic links.

export type ImportKind = "SUPPLIER_PRICE_LIST" | "BUYER_QUOTATION" | "WEB_PAGE" | "TEXT";
export type ImportStatus = "PROCESSING" | "REVIEW" | "PUBLISHED" | "FAILED" | "REJECTED";
export type ImportRowStatus = "SUGGESTED" | "APPROVED" | "REJECTED" | "PUBLISHED";
export type OutreachChannel = "EMAIL" | "WHATSAPP" | "LINK";

export interface AiConfig {
  enabled: boolean; // false when no ANTHROPIC_API_KEY: text/CSV/Excel still work via heuristics, PDFs/images need AI
  model: string | null;
  maxFileMb: number;
  acceptedTypes: string[]; // mime types
}

export interface PriceImportRow {
  id: string;
  importId: string;
  rawName: string;
  rawUnit?: string | null;
  rawPrice?: string | null;
  rawCity?: string | null;
  brand?: string | null;
  notes?: string | null;
  price: number | null; // SAR, normalised
  unit: string;
  city: string | null;
  materialId: string | null;
  material?: Material | null;
  confidence: number; // 0..1 match confidence
  alternatives: Array<{ material: Material; confidence: number }>;
  status: ImportRowStatus;
  createMaterial: boolean; // when no match: create a new catalogue item from this row on publish
}

export interface PriceImport {
  id: string;
  kind: ImportKind;
  status: ImportStatus;
  sourceName: string; // e.g. supplier name, feed name, "Quotation – Al Rajhi BM"
  supplierName?: string | null; // for quotations: who issued it
  companyId?: string | null; // supplier company the prices belong to (when known)
  company?: Company | null;
  uploadedById: string;
  uploadedBy?: Pick<User, "id" | "name" | "role"> | null;
  fileName?: string | null;
  mimeType?: string | null;
  city?: string | null;
  quotationDate?: string | null;
  aiUsed: boolean;
  model?: string | null;
  extractedCount: number;
  publishedCount: number;
  error?: string | null;
  rows?: PriceImportRow[];
  createdAt: string;
  updatedAt: string;
}

export interface PublishImportResult {
  published: number;
  skipped: number;
  createdMaterials: number;
  import: PriceImport;
}

export interface OutreachSupplier {
  company: Company;
  contactEmail: string | null;
  contactPhone: string | null;
  listingCount: number;
  lastPriceUpdate: string | null;
  staleDays: number | null;
  pendingRequest: { id: string; channel: OutreachChannel; sentAt: string; expiresAt: string } | null;
}

export interface OutreachRequestResult {
  companyId: string;
  companyName: string;
  link: string; // public magic link WEB_URL/update-prices/<token>
  whatsappUrl: string | null; // https://wa.me/<phone>?text=…
  emailed: boolean;
}

export interface PriceUpdateRequestInfo {
  company: Pick<Company, "id" | "name" | "nameAr" | "city" | "verified">;
  expiresAt: string;
  completedAt: string | null;
  listings: Array<PriceListing & { material: Material }>;
}

export interface PriceUpdateSubmission {
  items: Array<{ listingId: string; price: number; stock?: number | null; leadTimeDays?: number }>;
  newItems?: SupplierCatalogItem[];
  contactName?: string;
}
