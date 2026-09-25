// B2B commerce client: volume tiers / sales in the cart, address book, credit terms, reorder,
// returns (RMA), recurring orders and price alerts. See docs/API.md → "B2B commerce".
import type {
  Address,
  AddressPayload,
  CartItem,
  CartItemPricing,
  CheckoutExtras,
  CheckoutResult,
  CreditInfo,
  FrequentlyOrderedItem,
  ListingTier,
  OrderExtended,
  Paginated,
  PriceAlert,
  RecurringOrder,
  RecurringOrderPayload,
  RecurringOrderUpdatePayload,
  RecurringRunResult,
  ReorderResult,
  ReturnPayload,
  ReturnReason,
  ReturnRequest,
  ReturnStatus,
} from "@mysupplier/shared";
import { request, type CartWithQuotes, type CheckoutPayloadWithCarriers } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types layered on top of the shared ones (the API returns these extra fields)
// ---------------------------------------------------------------------------

/** A cart line as returned by `GET /cart`: the base `CartItem` plus effective pricing. Guest carts carry no pricing. */
export type CartLine = CartItem & Partial<CartItemPricing> & { tiers?: ListingTier[] };

export type CartCredit = CreditInfo & { canCoverCart: boolean };

/** `GET /cart` with the B2B extras: total tier/sale savings and the buyer's credit terms. */
export type CommerceCart = CartWithQuotes & { savings?: number; credit?: CartCredit | null };

/** Extra order fields stored by checkout (PO number, saved address, credit due date). */
export interface OrderCommerceFields {
  poNumber?: string | null;
  addressId?: string | null;
  address?: Address | null;
  dueDate?: string | null;
}

export type OrderWithCommerce = OrderExtended & OrderCommerceFields;

/** `POST /checkout`: delivery fields are optional when a saved `addressId` is given. */
export type CommerceCheckoutPayload = Omit<CheckoutPayloadWithCarriers, "deliveryCity" | "deliveryAddress" | "contactPhone"> &
  Partial<Pick<CheckoutPayloadWithCarriers, "deliveryCity" | "deliveryAddress" | "contactPhone">> &
  CheckoutExtras;

export type CreditOverview = CreditInfo & {
  openOrders: Array<{ id: string; reference: string; total: number; dueDate: string | null; createdAt: string; company?: { id: string; name: string } }>;
  overdue: number;
};

export type ReturnDetail = ReturnRequest & { estimatedRefund: number | null };

export type ReturnsQuery = { status?: ReturnStatus | ""; orderId?: string; page?: number };

export type RecurringLastOrder = { id: string; reference: string; status: string; total: number; createdAt: string };

export type RecurringOrderWithLast = RecurringOrder & { lastOrder?: RecurringLastOrder | null };

export type RecurringRunResponse = RecurringRunResult & { total: number; recurringOrder: RecurringOrderWithLast };

// ---------------------------------------------------------------------------
// Labels & helpers shared by the buyer pages
// ---------------------------------------------------------------------------

export const RETURN_REASONS: Array<{ value: ReturnReason; label: string }> = [
  { value: "DAMAGED", label: "Damaged in transit" },
  { value: "DEFECTIVE", label: "Defective / faulty" },
  { value: "WRONG_ITEM", label: "Wrong item delivered" },
  { value: "NOT_AS_DESCRIBED", label: "Not as described" },
  { value: "EXCESS", label: "Excess quantity" },
  { value: "OTHER", label: "Other" },
];

export function returnReasonLabel(reason: string): string {
  return RETURN_REASONS.find((r) => r.value === reason)?.label ?? reason.replace(/_/g, " ").toLowerCase();
}

export const RETURN_STATUSES: ReturnStatus[] = ["REQUESTED", "APPROVED", "RECEIVED", "REFUNDED", "REJECTED", "CANCELLED"];

/** Happy path of a return; REJECTED / CANCELLED branch off it. */
export const RETURN_FLOW: ReturnStatus[] = ["REQUESTED", "APPROVED", "RECEIVED", "REFUNDED"];

export function returnStatusTone(status: ReturnStatus | string): "green" | "amber" | "red" | "blue" | "slate" | "purple" {
  switch (status) {
    case "REQUESTED":
      return "amber";
    case "APPROVED":
      return "blue";
    case "RECEIVED":
      return "purple";
    case "REFUNDED":
      return "green";
    case "REJECTED":
      return "red";
    default:
      return "slate";
  }
}

/** Orders that can still have a return requested (the API also enforces a 14-day window). */
export function canRequestReturn(status: string): boolean {
  return status === "IN_TRANSIT" || status === "DELIVERED";
}

/** Whether a cart line is priced below its base price (volume tier or live sale). */
export function hasDiscount(line: CartLine): boolean {
  return typeof line.basePrice === "number" && typeof line.unitPrice === "number" && line.unitPrice < line.basePrice;
}

export function formatAddressLine(a: Pick<Address, "street" | "building" | "district" | "city">): string {
  return [a.building, a.street, a.district, a.city].filter((p) => !!p && String(p).trim()).join(", ");
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export const commerceApi = {
  // Cart & checkout
  cart: (deliveryCity?: string | null, coupon?: string | null) =>
    request<CommerceCart>("/cart", { query: { deliveryCity: deliveryCity || undefined, coupon: coupon || undefined } }),
  checkout: (payload: CommerceCheckoutPayload) => request<CheckoutResult>("/checkout", { method: "POST", body: payload }),

  // Address book
  addresses: () => request<Address[]>("/addresses"),
  createAddress: (body: AddressPayload) => request<Address>("/addresses", { method: "POST", body }),
  updateAddress: (id: string, body: Partial<AddressPayload>) => request<Address>(`/addresses/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  deleteAddress: (id: string) => request<{ ok: boolean }>(`/addresses/${encodeURIComponent(id)}`, { method: "DELETE" }),
  setDefaultAddress: (id: string) => request<Address>(`/addresses/${encodeURIComponent(id)}/default`, { method: "POST" }),

  // Credit terms
  credit: () => request<CreditOverview>("/me/credit"),

  // Reorder / buy again
  reorder: (orderId: string) => request<ReorderResult>(`/orders/${encodeURIComponent(orderId)}/reorder`, { method: "POST" }),
  frequentlyOrdered: (limit = 20) => request<FrequentlyOrderedItem[]>("/orders/frequently-ordered", { query: { limit } }),

  // Returns / RMA
  createReturn: (orderId: string, body: ReturnPayload) => request<ReturnRequest>(`/orders/${encodeURIComponent(orderId)}/returns`, { method: "POST", body }),
  returns: (query: ReturnsQuery = {}) =>
    request<Paginated<ReturnRequest>>("/returns", { query: { status: query.status || undefined, orderId: query.orderId || undefined, page: query.page } }),
  returnDetail: (id: string) => request<ReturnDetail>(`/returns/${encodeURIComponent(id)}`),
  cancelReturn: (id: string) => request<ReturnRequest>(`/returns/${encodeURIComponent(id)}`, { method: "PATCH", body: { status: "CANCELLED" } }),

  // Recurring orders
  recurring: () => request<RecurringOrderWithLast[]>("/recurring"),
  createRecurring: (body: RecurringOrderPayload) => request<RecurringOrderWithLast>("/recurring", { method: "POST", body }),
  updateRecurring: (id: string, body: RecurringOrderUpdatePayload) => request<RecurringOrderWithLast>(`/recurring/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  deleteRecurring: (id: string) => request<{ ok: boolean }>(`/recurring/${encodeURIComponent(id)}`, { method: "DELETE" }),
  runRecurringNow: (id: string) => request<RecurringRunResponse>(`/recurring/${encodeURIComponent(id)}/run-now`, { method: "POST" }),

  // Price alerts (created from the product page)
  alerts: () => request<PriceAlert[]>("/alerts"),
  deleteAlert: (id: string) => request<{ ok: boolean }>(`/alerts/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
