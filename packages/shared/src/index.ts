// Shared domain types for MySupplier (API, web, mobile).
// Keep this file dependency-free so every app can import it directly.

export type Role = "BUYER" | "SUPPLIER" | "ADMIN";
export type CompanyType = "SUPPLIER" | "CONTRACTOR" | "CONSULTANT" | "OTHER";
export type PriceSource = "SUPPLIER" | "MARKET" | "IMPORTED" | "QUOTATION";
export type RfqStatus = "OPEN" | "CLOSED" | "AWARDED" | "CANCELLED";
export type BidStatus = "SUBMITTED" | "WITHDRAWN" | "ACCEPTED" | "REJECTED";
export type OrderStatus = "PENDING" | "CONFIRMED" | "IN_TRANSIT" | "DELIVERED" | "CANCELLED";
export type NotificationType = "NEW_RFQ" | "NEW_BID" | "BID_ACCEPTED" | "BID_REJECTED" | "ORDER_UPDATE" | "SYSTEM" | "ANNOUNCEMENT";

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
  companyRole?: CompanyRole | null;
  phoneVerified?: boolean;
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
  /** Cheapest (or chosen) delivery quote per supplier id; present when a delivery city is known. */
  quotes?: Record<string, DeliveryQuote | null>;
  /** Coupon discount applied to the subtotal (VAT is charged on subtotal minus discount). */
  discount?: number;
  coupon?: CartCoupon | null;
  /** Why the requested coupon code was not applied, if any. */
  couponError?: string | null;
}

export interface CartCoupon {
  code: string;
  type: CouponType;
  value: number;
  description?: string | null;
  maxDiscount?: number | null;
  minOrder?: number | null;
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
  discount?: number;
  couponCode?: string | null;
}

export interface CheckoutPayload {
  deliveryCity: string;
  deliveryAddress: string;
  contactPhone: string;
  paymentMethod: PaymentMethod;
  notes?: string;
  /** Carrier chosen per supplier id (from /shipping/quote); defaults to the cheapest quote. */
  carrierBySupplier?: Record<string, CarrierCode>;
  /** Promotion code validated by GET /cart?coupon=; split pro rata across the per-supplier orders. */
  couponCode?: string;
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
  format: "json" | "csv" | "html"; // html = supplier web page read by AI into the review queue
  companyId?: string | null;
  city?: string | null;
  autoPublish?: boolean;
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
  metadata?: { order_id: string }; // must be passed to the gateway so the payment can be bound to the order
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

// Supplier portal (multi-tenant) ------------------------------------------------------

export type CompanyRole = "OWNER" | "MANAGER" | "SALES" | "WAREHOUSE";
export type VerificationStatus = "PENDING" | "UNDER_REVIEW" | "VERIFIED" | "REJECTED";
export type DocumentType = "CR" | "VAT" | "LICENSE" | "OTHER";
export type DocumentStatus = "PENDING" | "APPROVED" | "REJECTED";
export type StockMovementType = "IN" | "OUT" | "ADJUST" | "RESERVE" | "RELEASE";
export type PayoutStatus = "PENDING" | "PAID";
export type OrderEventType = "CREATED" | "STATUS" | "PAYMENT" | "NOTE" | "MESSAGE" | "REVIEW";

/** Company profile fields editable by the supplier (extends Company). */
export interface CompanyProfile extends Company {
  slug?: string | null;
  logoUrl?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  citiesServed: string[];
  minOrderValue?: number | null;
  deliveryFee?: number | null;
  deliveryDays?: number | null;
  workingHours?: string | null;
  email?: string | null;
  bankName?: string | null;
  iban?: string | null;
  beneficiary?: string | null;
  lowStockThreshold: number;
  verificationStatus: VerificationStatus;
  verificationNotes?: string | null;
  commissionPct?: number | null; // per-company override of the platform take rate
}

export interface CompanyDocument {
  id: string;
  companyId: string;
  type: DocumentType;
  fileName: string;
  fileUrl: string;
  status: DocumentStatus;
  notes?: string | null;
  uploadedById: string;
  createdAt: string;
}

export interface Branch {
  id: string;
  companyId: string;
  name: string;
  city: string;
  address?: string | null;
  phone?: string | null;
  isDefault: boolean;
  createdAt: string;
}

export interface TeamMember extends Pick<User, "id" | "email" | "name" | "phone" | "createdAt"> {
  companyRole: CompanyRole;
  active: boolean;
  lastLoginAt?: string | null;
}

export interface CompanyInvite {
  id: string;
  email: string;
  role: CompanyRole;
  invitedBy?: Pick<User, "id" | "name"> | null;
  expiresAt: string;
  acceptedAt?: string | null;
  createdAt: string;
}

export interface InventoryItem {
  listing: PriceListing & { material: Material; branch?: Branch | null };
  stock: number | null; // null = not tracked
  reserved: number; // quantity in PENDING/CONFIRMED orders not yet dispatched
  available: number | null;
  lowStock: boolean;
  soldLast30d: number;
}

export interface StockMovement {
  id: string;
  listingId: string;
  type: StockMovementType;
  quantity: number;
  balanceAfter: number | null;
  reason?: string | null;
  orderId?: string | null;
  order?: Pick<Order, "id" | "reference"> | null;
  user?: Pick<User, "id" | "name"> | null;
  createdAt: string;
}

export interface SeriesPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

export interface SupplierDashboard {
  company: CompanyProfile;
  kpis: {
    revenue30d: number;
    revenueTotal: number;
    orders30d: number;
    pendingOrders: number;
    unpaidOrders: number;
    openRfqsInMyCities: number;
    bidsSubmitted: number;
    bidsWon: number;
    winRatePct: number;
    listings: number;
    lowStockItems: number;
    unreadMessages: number;
    rating: number;
    ratingCount: number;
    productViews30d: number;
  };
  revenueByDay: SeriesPoint[]; // last 30 days
  ordersByDay: SeriesPoint[];
  ordersByStatus: Record<OrderStatus, number>;
  topProducts: Array<{ material: Material; quantity: number; revenue: number; orders: number }>;
  priceCompetitiveness: Array<{ material: Material; listingId: string; myPrice: number; marketAvg: number; marketMin: number; diffPct: number; rank: number; sellers: number }>;
  recentOrders: OrderExtended[];
  recentReviews: Review[];
}

export interface OrderEvent {
  id: string;
  orderId: string;
  type: OrderEventType;
  status?: OrderStatus | null;
  message?: string | null;
  user?: Pick<User, "id" | "name" | "role"> | null;
  createdAt: string;
}

export interface OrderMessage {
  id: string;
  orderId: string;
  sender: Pick<User, "id" | "name" | "role">;
  body: string;
  readAt?: string | null;
  createdAt: string;
}

export interface Review {
  id: string;
  orderId: string;
  companyId: string;
  buyer: Pick<User, "id" | "name"> & { company?: Pick<Company, "id" | "name"> | null };
  rating: number; // 1..5
  comment?: string | null;
  reply?: string | null;
  repliedAt?: string | null;
  hidden?: boolean;
  createdAt: string;
}

export interface FinanceSummary {
  currency: string;
  commissionPct: number;
  grossPaid: number; // paid orders (delivered or not)
  commission: number;
  netEarned: number;
  paidOut: number;
  pendingPayout: number; // net for paid+delivered orders not yet in a PAID payout
  awaitingDelivery: number; // paid but not delivered yet
  unpaidReceivables: number; // COD / bank transfer not yet marked paid
  commissionDue: number; // commission owed to the platform on cash (COD) the supplier collected directly
}

export interface StatementLine {
  order: Pick<OrderExtended, "id" | "reference" | "createdAt" | "status" | "paymentStatus" | "paymentMethod" | "total">;
  gross: number;
  commissionPct: number;
  commission: number;
  net: number;
  payout?: Pick<Payout, "id" | "status" | "reference"> | null;
}

export interface Payout {
  id: string;
  companyId: string;
  company?: Company;
  amount: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
  orderCount: number;
  status: PayoutStatus;
  reference?: string | null;
  paidAt?: string | null;
  createdAt: string;
}

export interface PlatformSettings {
  commissionPct: number;
  payoutDayOfWeek: number; // 0-6
  lowStockThresholdDefault: number;
}

export interface SupplierPublicProfile extends CompanyProfile {
  branches: Branch[];
  listings: Array<PriceListing & { material: Material }>;
  reviews: Review[];
  stats: { listings: number; bids: number; wonBids: number; ordersDelivered: number; memberSince: string };
}

// Go-live: OTP login, refunds, shipments & carriers, e-invoicing ----------------------

export interface OtpRequestPayload {
  phone: string; // E.164, e.g. +9665xxxxxxxx
  purpose?: "LOGIN" | "VERIFY_PHONE";
}
export interface OtpRequestResult {
  ok: true;
  expiresInSeconds: number;
  channel: "SMS" | "WHATSAPP" | "DEV";
  devCode?: string; // only in non-production when no SMS provider is configured
}
export interface OtpVerifyPayload {
  phone: string;
  code: string;
  name?: string; // required when the phone is new (account is created as BUYER)
  role?: "BUYER" | "SUPPLIER";
  company?: RegisterPayload["company"];
}

export interface RefundPayload {
  amount?: number; // SAR, defaults to the full paid amount
  reason: string;
}
export interface RefundResult {
  order: OrderExtended;
  payment: PaymentRecord;
  refundedAmount: number;
}

export type ShipmentStatus = "PENDING" | "BOOKED" | "PICKED_UP" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED" | "FAILED" | "CANCELLED";
export type CarrierCode = "SUPPLIER" | "TRUKKER" | "TRELLA" | "SMSA" | "ARAMEX" | "SPL" | "OTHER";

export interface Carrier {
  code: CarrierCode;
  name: string;
  nameAr: string;
  kind: "OWN_FLEET" | "HEAVY_TRUCKING" | "PARCEL";
  enabled: boolean;
  supportsTracking: boolean;
  maxWeightKg: number | null;
}

export interface DeliveryQuote {
  carrier: CarrierCode;
  carrierName: string;
  service: string; // e.g. "Flatbed trailer", "Same-day parcel"
  zone: "SAME_CITY" | "SAME_REGION" | "NATIONAL";
  weightKg: number;
  volumeM3: number;
  price: number; // SAR excl. VAT
  etaDays: number;
  notes?: string | null;
}

export interface ShipmentEvent {
  id: string;
  status: ShipmentStatus;
  description?: string | null;
  location?: string | null;
  createdAt: string;
}

export interface Shipment {
  id: string;
  orderId: string;
  carrier: CarrierCode;
  carrierName: string;
  service?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  status: ShipmentStatus;
  cost: number | null;
  weightKg: number | null;
  volumeM3: number | null;
  pickupBranchId?: string | null;
  pickupBranch?: Branch | null;
  driverName?: string | null;
  driverPhone?: string | null;
  vehicle?: string | null;
  scheduledAt?: string | null;
  deliveredAt?: string | null;
  events: ShipmentEvent[];
  createdAt: string;
}

export interface CreateShipmentPayload {
  carrier: CarrierCode;
  service?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  pickupBranchId?: string;
  driverName?: string;
  driverPhone?: string;
  vehicle?: string;
  scheduledAt?: string;
  cost?: number;
}

export interface ShippingRate {
  id: string;
  carrier: CarrierCode;
  zone: DeliveryQuote["zone"];
  service: string;
  baseFee: number; // SAR
  perKg: number; // SAR per kg above includedKg
  includedKg: number;
  perM3: number;
  minFee: number;
  maxWeightKg: number | null;
  etaDays: number;
  enabled: boolean;
}

/** Material weight/volume so quotes can be computed (extends Material). */
export interface MaterialLogistics {
  weightKg?: number | null; // per unit
  volumeM3?: number | null; // per unit
  hazardous?: boolean;
}

export type EInvoiceStatus = "GENERATED" | "REPORTED" | "CLEARED" | "REJECTED" | "PENDING_CONFIG";
export interface EInvoiceRecord {
  id: string;
  orderId: string;
  invoiceNumber: string;
  uuid: string;
  invoiceHash: string;
  previousInvoiceHash: string;
  counter: number;
  status: EInvoiceStatus;
  zatcaResponse?: unknown;
  createdAt: string;
}

export interface ClientErrorReport {
  message: string;
  stack?: string;
  url?: string;
  userAgent?: string;
  platform?: "web" | "ios" | "android";
}

// ---------------------------------------------------------------- admin commerce (coupons, moderation, ledger, reports, audit, support)
export type CouponType = "PERCENT" | "FIXED";

export interface Coupon {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  description?: string | null;
  minOrder?: number | null;
  maxDiscount?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  usageLimit?: number | null;
  usedCount: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  /** Admin listing only: orders that used the code and total discount given. */
  orders?: number;
  discountGiven?: number;
}

export interface CouponPayload {
  code: string;
  type: CouponType;
  value: number;
  description?: string | null;
  minOrder?: number | null;
  maxDiscount?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  usageLimit?: number | null;
  active?: boolean;
}

export interface AdminReview extends Review {
  hidden: boolean;
  buyer: Pick<User, "id" | "name"> & { email?: string; company?: Pick<Company, "id" | "name"> | null };
  company?: Pick<Company, "id" | "name"> & { slug?: string };
  order?: { id: string; reference: string };
}

export interface AdminReviewsResponse extends Paginated<AdminReview> {
  summary: { average: number; total: number; hidden: number };
}

export interface AdminPaymentRow {
  id: string;
  orderId: string;
  provider: PaymentProvider;
  providerPaymentId?: string | null;
  amount: number;
  currency: string;
  status: PaymentRecordStatus;
  createdAt: string;
  order: {
    id: string;
    reference: string;
    paymentMethod?: PaymentMethod | null;
    paymentStatus: PaymentStatus;
    total: number;
    buyer: Pick<User, "id" | "name" | "email">;
    company: Pick<Company, "id" | "name">;
  };
}

export interface AdminPaymentsResponse extends Paginated<AdminPaymentRow> {
  summary: Record<string, { count: number; amount: number }>;
  outstanding: { count: number; amount: number };
}

export interface ReportBucket {
  id: string;
  name: string;
  orders: number;
  revenue: number;
  quantity: number;
}

export interface AdminReports {
  days: number;
  since: string;
  totals: {
    gmv: number;
    gmvChangePct: number | null;
    orders: number;
    ordersChangePct: number | null;
    aov: number;
    discounts: number;
    activeBuyers: number;
    newUsers: number;
    newUsersChangePct: number | null;
    rfqs: number;
    bids: number;
    rfqConversionPct: number;
    paidShare: number;
    supportOpen: number;
  };
  daily: { date: string; gmv: number; orders: number }[];
  topProducts: ReportBucket[];
  topSuppliers: ReportBucket[];
  byCategory: ReportBucket[];
  byCity: ReportBucket[];
  byPaymentMethod: ReportBucket[];
  byStatus: ReportBucket[];
}

export interface AuditLogEntry {
  id: string;
  actorId?: string | null;
  actor?: Pick<User, "id" | "name" | "email" | "role"> | null;
  action: string;
  entity: string;
  entityId?: string | null;
  meta?: Record<string, unknown> | null;
  ip?: string | null;
  createdAt: string;
}

export type ContactStatus = "NEW" | "IN_PROGRESS" | "RESOLVED";

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  subject: string;
  message: string;
  status: ContactStatus;
  notes?: string | null;
  assigneeId?: string | null;
  userId?: string | null;
  user?: Pick<User, "id" | "name" | "role"> | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactMessagesResponse extends Paginated<ContactMessage> {
  summary: Record<ContactStatus, number>;
}

export interface ContactPayload {
  name: string;
  email: string;
  phone?: string | null;
  subject: string;
  message: string;
  orderRef?: string | null;
  /** Honeypot: must stay empty. */
  website?: string;
}

export interface AnnouncementPayload {
  title: string;
  body: string;
  audience: "ALL" | "BUYERS" | "SUPPLIERS";
  link?: string | null;
  email?: boolean;
}
