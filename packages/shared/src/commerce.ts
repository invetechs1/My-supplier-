// commerce domain types – owned by the commerce module (B2B commerce: pricing tiers, address book,
// credit terms, reorder, returns/RMA and recurring orders). Cart / CheckoutPayload live in index.ts.
import type { Cart, Material, ShopOffer } from "./index";

// ---------------------------------------------------------------- pricing (tiers & sales)
export interface ListingTier {
  minQty: number;
  price: number;
}

/** Effective pricing of a cart line: sale price if live, else the best volume tier reached, else the base price. */
export interface CartItemPricing {
  unitPrice: number;
  basePrice: number;
  tierApplied: ListingTier | null;
  saleApplied: boolean;
  /** Next volume break the buyer could reach by ordering more (null when none or a sale is live). */
  nextTier: (ListingTier & { savePerUnit: number }) | null;
}

// ---------------------------------------------------------------- address book
export interface Address {
  id: string;
  userId: string;
  companyId?: string | null;
  label: string;
  recipient: string;
  phone: string;
  city: string;
  district?: string | null;
  street: string;
  building?: string | null;
  notes?: string | null;
  lat?: number | null;
  lng?: number | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AddressPayload {
  label: string;
  recipient: string;
  phone: string;
  city: string;
  district?: string | null;
  street: string;
  building?: string | null;
  notes?: string | null;
  lat?: number | null;
  lng?: number | null;
  isDefault?: boolean;
}

/** Extra checkout fields accepted by POST /checkout on top of CheckoutPayload. */
export interface CheckoutExtras {
  /** Saved address: fills deliveryCity / deliveryAddress / contactPhone when given. */
  addressId?: string;
  /** Buyer's purchase-order number, printed on the invoice. */
  poNumber?: string;
}

// ---------------------------------------------------------------- credit terms (net terms)
export interface CreditInfo {
  approved: boolean;
  limit: number;
  used: number;
  available: number;
  termsDays: number;
}

// ---------------------------------------------------------------- reorder / buy again
export interface FrequentlyOrderedItem {
  materialId: string;
  material: Material;
  /** Total quantity bought in the last 12 months. */
  quantity: number;
  orders: number;
  lastOrderedAt: string;
  lastUnitPrice: number;
  bestOffer: ShopOffer | null;
}

export interface ReorderSkippedItem {
  orderItemId: string;
  name: string;
  quantity: number;
  reason: string;
}

export interface ReorderResult {
  cart: Cart;
  added: number;
  skipped: ReorderSkippedItem[];
}

// ---------------------------------------------------------------- returns / RMA
export type ReturnStatus = "REQUESTED" | "APPROVED" | "REJECTED" | "RECEIVED" | "REFUNDED" | "CANCELLED";
export type ReturnReason = "DAMAGED" | "DEFECTIVE" | "WRONG_ITEM" | "NOT_AS_DESCRIBED" | "EXCESS" | "OTHER";

export interface ReturnItem {
  orderItemId: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
}

export interface ReturnRequest {
  id: string;
  reference: string;
  orderId: string;
  buyerId: string;
  companyId: string;
  status: ReturnStatus;
  reason: ReturnReason | string;
  details?: string | null;
  items: ReturnItem[];
  images: string[];
  refundAmount?: number | null;
  resolution?: string | null;
  createdAt: string;
  updatedAt: string;
  order?: { id: string; reference: string; total: number; paymentMethod?: string | null; paymentStatus: string; status: string };
  buyer?: { id: string; name: string; email?: string };
  company?: { id: string; name: string };
}

export interface ReturnPayload {
  reason: ReturnReason;
  details?: string;
  items: Array<{ orderItemId: string; quantity: number }>;
}

export interface ReturnUpdatePayload {
  status: "APPROVED" | "REJECTED" | "RECEIVED" | "REFUNDED" | "CANCELLED";
  resolution?: string;
  /** Optional override (admin / supplier) when marking RECEIVED; never above the computed amount. */
  refundAmount?: number;
}

// ---------------------------------------------------------------- recurring orders
export type RecurringPaymentMethod = "COD" | "BANK_TRANSFER" | "CREDIT";

export interface RecurringOrderLine {
  listingId: string;
  quantity: number;
  /** Snapshot for display; the live listing is used when the order runs. */
  name?: string;
  unit?: string;
  companyName?: string;
}

export interface RecurringOrder {
  id: string;
  userId: string;
  companyId: string;
  name: string;
  items: RecurringOrderLine[];
  intervalDays: number;
  nextRunAt: string;
  lastRunAt?: string | null;
  lastOrderId?: string | null;
  deliveryCity: string;
  deliveryAddress: string;
  contactPhone: string;
  paymentMethod: RecurringPaymentMethod;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringOrderPayload {
  name: string;
  items: Array<{ listingId: string; quantity: number }>;
  /** 7..90 days. */
  intervalDays: number;
  deliveryCity: string;
  deliveryAddress: string;
  contactPhone: string;
  paymentMethod: RecurringPaymentMethod;
  /** First run; defaults to now + intervalDays. */
  startAt?: string;
}

export interface RecurringOrderUpdatePayload extends Partial<RecurringOrderPayload> {
  active?: boolean;
  nextRunAt?: string;
}

export interface RecurringRunResult {
  orders: Array<{ id: string; reference: string; total: number; companyId: string }>;
  skipped: Array<{ listingId: string; quantity: number; reason: string }>;
  nextRunAt: string;
}
