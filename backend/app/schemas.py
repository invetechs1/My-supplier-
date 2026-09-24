"""Pydantic request/response schemas."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, ConfigDict


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- auth ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=2, max_length=120)
    role: str = Field(default="buyer", pattern="^(buyer|supplier)$")
    phone: str = ""
    company_name: str = ""
    city: str = ""
    locale: str = "ar"
    cr_number: str = ""
    category_ids: list[int] = []
    otp_token: str = ""  # from /auth/otp/verify (purpose=register); required when OTP_REQUIRED=1


class OTPRequestIn(BaseModel):
    destination: str = Field(min_length=5, max_length=190)  # phone or email
    channel: Optional[str] = Field(default=None, pattern="^(sms|email|whatsapp)$")
    purpose: str = Field(default="register", pattern="^(register|login|reset|verify)$")


class OTPVerifyIn(BaseModel):
    destination: str
    code: str = Field(min_length=4, max_length=8)
    purpose: str = Field(default="register", pattern="^(register|login|reset|verify)$")


class PasswordResetIn(BaseModel):
    verification_token: str
    new_password: str = Field(min_length=8, max_length=128)


class NotificationPrefsIn(BaseModel):
    notify_email: Optional[bool] = None
    notify_sms: Optional[bool] = None
    notify_whatsapp: Optional[bool] = None
    notify_push: Optional[bool] = None


class DeviceIn(BaseModel):
    token: str = Field(min_length=10, max_length=300)
    platform: str = Field(default="expo", pattern="^(expo|ios|android|web)$")
    device_name: str = ""


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(ORM):
    id: int
    email: str
    phone: str
    full_name: str
    role: str
    company_name: str
    city: str
    locale: str
    is_active: bool
    phone_verified: bool = False
    email_verified: bool = False
    notify_email: bool = True
    notify_sms: bool = True
    notify_whatsapp: bool = False
    notify_push: bool = True
    created_at: datetime
    supplier_id: Optional[int] = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class UserUpdateIn(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    company_name: Optional[str] = None
    city: Optional[str] = None
    locale: Optional[str] = None


class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


# ---------- catalog ----------
class CategoryOut(ORM):
    id: int
    slug: str
    name_ar: str
    name_en: str
    parent_id: Optional[int]
    icon: str
    sort_order: int
    product_count: int = 0


class CategoryIn(BaseModel):
    slug: str
    name_ar: str
    name_en: str
    parent_id: Optional[int] = None
    icon: str = ""
    sort_order: int = 0


class ProductIn(BaseModel):
    category_id: int
    sku: str = ""
    name_ar: str
    name_en: str
    brand: str = ""
    unit: str = "piece"
    spec: dict = {}
    description: str = ""
    image_url: str = ""
    is_active: bool = True


class PriceSummary(BaseModel):
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    avg_price: Optional[float] = None
    median_price: Optional[float] = None
    offer_count: int = 0
    supplier_count: int = 0
    registered_supplier_count: int = 0
    last_updated: Optional[datetime] = None
    change_30d_pct: Optional[float] = None
    cities: list[str] = []
    basis: str = ""  # '' = sale price per unit | day | week | month = rental price
    rental_min_price: Optional[float] = None
    rental_basis: str = ""
    best_offer_id: Optional[int] = None  # cheapest offer that can go straight into the cart
    best_offer_price: Optional[float] = None
    best_offer_supplier: str = ""
    best_offer_stock: str = ""
    best_offer_min_qty: float = 1


class ProductOut(ORM):
    id: int
    category_id: int
    sku: str
    name_ar: str
    name_en: str
    brand: str
    unit: str
    spec: dict
    description: str
    image_url: str
    is_active: bool
    views: int = 0
    sold_qty: float = 0
    rating: float = 0
    rating_count: int = 0
    category_name_ar: str = ""
    category_name_en: str = ""
    summary: Optional[PriceSummary] = None
    is_favorite: bool = False


class SupplierBrief(ORM):
    id: int
    name: str
    city: str
    verified: bool
    is_external: bool
    rating: float
    rating_count: int
    delivery_available: bool
    lead_time_days: int
    logo_url: str = ""
    website: str = ""


class OfferOut(ORM):
    id: int
    supplier_id: int
    product_id: int
    price: float
    currency: str
    unit: str
    min_qty: float
    city: str
    includes_vat: bool
    delivery_included: bool
    stock_status: str
    rental_period: str = ""
    available_qty: Optional[float] = None
    low_stock_threshold: float = 0
    image_url: str = ""
    valid_until: Optional[datetime]
    source: str
    source_name: str
    source_url: str
    notes: str
    updated_at: datetime
    supplier: Optional[SupplierBrief] = None
    product: Optional[ProductOut] = None
    price_ex_vat: Optional[float] = None
    price_inc_vat: Optional[float] = None


class HistoryPoint(BaseModel):
    date: str
    min_price: float
    avg_price: float
    max_price: float


class ProductDetailOut(ProductOut):
    offers: list[OfferOut] = []
    history: list[HistoryPoint] = []
    related: list[ProductOut] = []


class PagedProducts(BaseModel):
    items: list[ProductOut]
    total: int
    page: int
    size: int


# ---------- supplier ----------
class SupplierOut(SupplierBrief):
    user_id: Optional[int]
    cr_number: str
    vat_number: str
    regions: list
    category_ids: list
    description: str
    phone: str
    plan: str
    created_at: datetime
    offer_count: int = 0
    iban_masked: str = ""
    bank_name: str = ""
    delivery_fee: float = 0
    free_delivery_over: Optional[float] = None
    min_order_amount: float = 0


class SupplierUpdateIn(BaseModel):
    iban: Optional[str] = None
    bank_name: Optional[str] = None
    delivery_fee: Optional[float] = None
    free_delivery_over: Optional[float] = None
    min_order_amount: Optional[float] = None
    name: Optional[str] = None
    cr_number: Optional[str] = None
    vat_number: Optional[str] = None
    city: Optional[str] = None
    regions: Optional[list[str]] = None
    category_ids: Optional[list[int]] = None
    description: Optional[str] = None
    logo_url: Optional[str] = None
    website: Optional[str] = None
    phone: Optional[str] = None
    delivery_available: Optional[bool] = None
    lead_time_days: Optional[int] = None


class OfferIn(BaseModel):
    product_id: int
    price: float = Field(gt=0)
    unit: str = ""
    min_qty: float = 1
    city: str = ""
    includes_vat: bool = False
    delivery_included: bool = False
    stock_status: str = Field(default="in_stock", pattern="^(in_stock|limited|out_of_stock)$")
    rental_period: str = Field(default="", pattern="^(|day|week|month)$")
    available_qty: Optional[float] = None
    low_stock_threshold: float = 0
    valid_until: Optional[datetime] = None
    notes: str = ""


class OfferUpdateIn(BaseModel):
    price: Optional[float] = Field(default=None, gt=0)
    unit: Optional[str] = None
    min_qty: Optional[float] = None
    includes_vat: Optional[bool] = None
    delivery_included: Optional[bool] = None
    stock_status: Optional[str] = Field(default=None, pattern="^(in_stock|limited|out_of_stock)$")
    rental_period: Optional[str] = Field(default=None, pattern="^(|day|week|month)$")
    available_qty: Optional[float] = None
    clear_qty: bool = False  # set available_qty back to "not tracked"
    low_stock_threshold: Optional[float] = None
    valid_until: Optional[datetime] = None
    notes: Optional[str] = None


class ImportResult(BaseModel):
    created_products: int = 0
    created_offers: int = 0
    updated_offers: int = 0
    skipped: int = 0
    errors: list[str] = []


# ---------- RFQ / bids ----------
class RFQItemIn(BaseModel):
    product_id: Optional[int] = None
    description: str = ""
    quantity: float = Field(gt=0)
    unit: str = ""
    target_price: Optional[float] = None
    notes: str = ""


class RFQIn(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str = ""
    project_name: str = ""
    city: str = ""
    delivery_address: str = ""
    needed_by: Optional[datetime] = None
    closes_at: Optional[datetime] = None
    visibility: str = Field(default="public", pattern="^(public|invited)$")
    invited_supplier_ids: list[int] = []
    items: list[RFQItemIn] = Field(min_length=1)
    publish: bool = True


class RFQItemOut(ORM):
    id: int
    product_id: Optional[int]
    description: str
    quantity: float
    unit: str
    target_price: Optional[float]
    notes: str
    product: Optional[ProductOut] = None
    market_min: Optional[float] = None
    market_avg: Optional[float] = None


class BidItemIn(BaseModel):
    rfq_item_id: int
    unit_price: float = Field(ge=0)
    quantity: Optional[float] = None
    brand: str = ""
    notes: str = ""


class BidIn(BaseModel):
    items: list[BidItemIn] = Field(min_length=1)
    delivery_days: int = 3
    delivery_fee: float = 0
    valid_until: Optional[datetime] = None
    payment_terms: str = ""
    notes: str = ""


class BidItemOut(ORM):
    id: int
    rfq_item_id: int
    unit_price: float
    quantity: float
    brand: str
    notes: str
    line_total: float = 0


class BidOut(ORM):
    id: int
    rfq_id: int
    supplier_id: int
    subtotal: float
    vat: float
    total: float
    delivery_days: int
    delivery_fee: float
    valid_until: Optional[datetime]
    payment_terms: str
    notes: str
    status: str
    created_at: datetime
    updated_at: datetime
    supplier: Optional[SupplierBrief] = None
    items: list[BidItemOut] = []
    rank: Optional[int] = None
    rfq_title: str = ""


class RFQOut(ORM):
    id: int
    buyer_id: int
    title: str
    description: str
    project_name: str
    city: str
    delivery_address: str
    needed_by: Optional[datetime]
    closes_at: Optional[datetime]
    status: str
    visibility: str
    category_ids: list
    created_at: datetime
    items: list[RFQItemOut] = []
    bid_count: int = 0
    best_total: Optional[float] = None
    buyer_name: str = ""
    my_bid: Optional[BidOut] = None


class RFQDetailOut(RFQOut):
    bids: list[BidOut] = []


# ---------- orders ----------
class DirectOrderIn(BaseModel):
    offer_id: int
    quantity: float = Field(gt=0)
    delivery_address: str = ""
    notes: str = ""
    coupon_code: str = ""


class OrderEventOut(ORM):
    id: int
    status: str
    note: str
    created_at: datetime


class OrderItemOut(ORM):
    id: int
    product_id: Optional[int]
    offer_id: Optional[int] = None
    description: str
    quantity: float
    unit: str
    unit_price: float
    line_total: float


class OrderOut(ORM):
    id: int
    buyer_id: int
    supplier_id: int
    rfq_id: Optional[int]
    bid_id: Optional[int]
    subtotal: float
    vat: float
    delivery_fee: float
    discount: float = 0
    coupon_code: str = ""
    total: float
    currency: str
    status: str
    payment_status: str = "unpaid"
    delivery_address: str
    city: str
    notes: str
    created_at: datetime
    updated_at: datetime
    items: list[OrderItemOut] = []
    supplier: Optional[SupplierBrief] = None
    buyer_name: str = ""
    has_review: bool = False
    events: list[OrderEventOut] = []
    group_ref: str = ""


class OrderStatusIn(BaseModel):
    status: str = Field(pattern="^(confirmed|in_delivery|delivered|cancelled)$")
    notes: str = ""


class ReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str = ""


# ---------- misc ----------
class NotificationOut(ORM):
    id: int
    kind: str
    title: str
    body: str
    ref_type: str
    ref_id: Optional[int]
    is_read: bool
    created_at: datetime


class PriceAlertIn(BaseModel):
    product_id: int
    city: str = ""
    target_price: Optional[float] = None


class PriceAlertOut(ORM):
    id: int
    product_id: int
    city: str
    target_price: Optional[float]
    is_active: bool
    created_at: datetime
    product: Optional[ProductOut] = None
    current_min: Optional[float] = None


class PriceSourceIn(BaseModel):
    name: str
    kind: str = Field(default="csv", pattern="^(csv|json|manual)$")
    url: str = ""
    city: str = ""
    supplier_id: Optional[int] = None
    is_active: bool = True


class PriceSourceOut(ORM):
    id: int
    name: str
    kind: str
    url: str
    city: str
    supplier_id: Optional[int]
    is_active: bool
    last_fetched_at: Optional[datetime]
    last_status: str
    imported_rows: int
    created_at: datetime


# ---------- payments ----------
class CheckoutIn(BaseModel):
    order_id: int
    method: str = Field(default="card", pattern="^(card|mada|applepay|stcpay|bank_transfer)$")


class PaymentOut(ORM):
    id: int
    order_id: int
    buyer_id: int
    supplier_id: int
    provider: str
    provider_ref: str
    method: str
    amount: float
    currency: str
    platform_fee: float
    supplier_net: float
    status: str
    checkout_url: str
    failure_reason: str
    transfer_reference: str
    group_ref: str = ""
    paid_at: Optional[datetime]
    released_at: Optional[datetime]
    refunded_at: Optional[datetime]
    created_at: datetime
    bank_instructions: str = ""
    publishable_key: str = ""
    supplier_name: str = ""
    buyer_name: str = ""


class PayoutOut(ORM):
    id: int
    supplier_id: int
    payment_id: int
    order_id: int
    amount: float
    status: str
    reference: str
    iban_masked: str
    paid_at: Optional[datetime]
    created_at: datetime
    supplier_name: str = ""


class InvoiceOut(ORM):
    id: int
    number: str
    kind: str
    order_id: int
    payment_id: Optional[int]
    seller_name: str
    seller_vat: str
    buyer_name: str
    buyer_vat: str
    subtotal: float
    vat: float
    total: float
    lines: list
    qr_tlv_base64: str
    issued_at: datetime


class DeliveryOut(ORM):
    id: int
    notification_id: int
    user_id: int
    channel: str
    destination: str
    status: str
    provider: str
    provider_ref: str
    error: str
    attempts: int
    sent_at: Optional[datetime]
    created_at: datetime


# ---------- v1.2: documents, BOQ, disputes ----------
class SupplierDocumentOut(ORM):
    id: int
    supplier_id: int
    kind: str
    file_url: str
    filename: str
    status: str
    note: str
    expires_at: Optional[datetime]
    uploaded_at: datetime
    reviewed_at: Optional[datetime]
    supplier_name: str = ""


class DocumentReviewIn(BaseModel):
    status: str = Field(pattern="^(approved|rejected)$")
    note: str = ""
    expires_at: Optional[datetime] = None


class BOQItemOut(BaseModel):
    description: str
    quantity: float
    unit: str = ""
    target_price: Optional[float] = None
    product_id: Optional[int] = None
    match_name_ar: str = ""
    match_name_en: str = ""
    confidence: float = 0


class DisputeIn(BaseModel):
    reason: str = Field(min_length=5, max_length=2000)
    kind: str = Field(default="dispute", pattern="^(dispute|return)$")


class DisputeResolveIn(BaseModel):
    status: str = Field(pattern="^(resolved|rejected)$")
    resolution: str = ""
    refund: bool = False


class DisputeOut(ORM):
    id: int
    order_id: int
    opened_by: int
    role: str
    kind: str = "dispute"
    reason: str
    status: str
    resolution: str
    refunded: bool
    created_at: datetime
    resolved_at: Optional[datetime]
    order_total: float = 0
    buyer_name: str = ""
    supplier_name: str = ""


# ---------- v1.4: admin back office ----------
class SettingsIn(BaseModel):
    values: dict[str, str]


class CouponIn(BaseModel):
    code: str = Field(min_length=3, max_length=40)
    kind: str = Field(default="percent", pattern="^(percent|fixed)$")
    value: float = Field(gt=0)
    min_order: float = 0
    max_discount: Optional[float] = None
    max_uses: Optional[int] = None
    audience: str = Field(default="all", pattern="^(all|new)$")
    is_active: bool = True
    expires_at: Optional[datetime] = None


class CouponOut(ORM):
    id: int
    code: str
    kind: str
    value: float
    min_order: float
    max_discount: Optional[float]
    max_uses: Optional[int]
    used: int
    audience: str
    is_active: bool
    expires_at: Optional[datetime]
    created_at: datetime


class BroadcastIn(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    body: str = ""
    audience: str = Field(default="all", pattern="^(all|buyers|suppliers)$")


class ReviewOut(ORM):
    id: int
    order_id: int
    supplier_id: int
    buyer_id: int
    rating: int
    comment: str
    created_at: datetime
    supplier_name: str = ""
    buyer_name: str = ""


class AdminOrderStatusIn(BaseModel):
    status: str = Field(pattern="^(pending|confirmed|in_delivery|delivered|cancelled)$")
    note: str = ""


# ---------- v1.5: shopping ----------
class AddressIn(BaseModel):
    label: str = ""
    recipient: str = ""
    phone: str = ""
    city: str = Field(min_length=2)
    district: str = ""
    street: str = ""
    building: str = ""
    notes: str = ""
    lat: Optional[float] = None
    lng: Optional[float] = None
    is_default: bool = False


class AddressOut(ORM):
    id: int
    label: str
    recipient: str
    phone: str
    city: str
    district: str
    street: str
    building: str
    notes: str
    lat: Optional[float]
    lng: Optional[float]
    is_default: bool
    formatted: str = ""


class CartAddIn(BaseModel):
    offer_id: int
    quantity: float = Field(default=1, gt=0)


class CartQtyIn(BaseModel):
    quantity: float = Field(gt=0)


class CartSyncIn(BaseModel):
    items: list[CartAddIn] = []


class CartItemOut(BaseModel):
    id: int
    offer_id: int
    quantity: float
    offer: OfferOut
    line_total: float


class CartGroupOut(BaseModel):
    supplier: SupplierBrief
    items: list[CartItemOut]
    subtotal: float
    delivery_fee: float
    free_delivery_over: Optional[float] = None
    min_order_amount: float = 0
    below_minimum: bool = False


class CartOut(BaseModel):
    groups: list[CartGroupOut]
    item_count: int
    subtotal: float
    delivery_total: float
    discount: float = 0
    coupon_code: str = ""
    coupon_error: str = ""
    vat: float
    total: float


class CartCheckoutIn(BaseModel):
    address_id: Optional[int] = None
    delivery_address: str = ""
    coupon_code: str = ""
    notes: str = ""


class GroupCheckoutIn(BaseModel):
    order_ids: list[int] = Field(min_length=1)
    method: str = Field(default="card", pattern="^(card|mada|applepay|stcpay|bank_transfer)$")


class GroupCheckoutOut(BaseModel):
    group_ref: str
    checkout_url: str
    total: float
    method: str
    status: str
    bank_instructions: str = ""
    payments: list[PaymentOut] = []


class ProductReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    title: str = ""
    comment: str = ""


class ProductReviewOut(ORM):
    id: int
    product_id: int
    user_id: int
    rating: int
    title: str
    comment: str
    verified: bool
    created_at: datetime
    author: str = ""
    product_name_ar: str = ""
    product_name_en: str = ""


class SupplierProductIn(BaseModel):
    """Create a new catalog product and the supplier's own price for it in one step."""
    category_id: int
    name_ar: str = Field(min_length=2)
    name_en: str = Field(min_length=2)
    brand: str = ""
    unit: str = "piece"
    description: str = ""
    spec: dict = {}
    price: float = Field(gt=0)
    city: str = ""
    available_qty: Optional[float] = None
    min_qty: float = 1
    rental_period: str = Field(default="", pattern="^(|day|week|month)$")
    includes_vat: bool = False
    delivery_included: bool = False
