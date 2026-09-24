"""Database models for My Supplier."""
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(190), unique=True, index=True)
    phone: Mapped[str] = mapped_column(String(32), default="")
    password_hash: Mapped[str] = mapped_column(String(200))
    full_name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(20), default="buyer", index=True)  # buyer | supplier | admin
    company_name: Mapped[str] = mapped_column(String(160), default="")
    city: Mapped[str] = mapped_column(String(80), default="")
    locale: Mapped[str] = mapped_column(String(5), default="ar")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    phone_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    notify_email: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_sms: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_whatsapp: Mapped[bool] = mapped_column(Boolean, default=False)
    notify_push: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    supplier: Mapped["Supplier | None"] = relationship(back_populates="owner", uselist=False)


class Supplier(Base):
    __tablename__ = "suppliers"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, unique=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    cr_number: Mapped[str] = mapped_column(String(40), default="")
    vat_number: Mapped[str] = mapped_column(String(40), default="")
    city: Mapped[str] = mapped_column(String(80), default="", index=True)
    regions: Mapped[list] = mapped_column(JSON, default=list)
    category_ids: Mapped[list] = mapped_column(JSON, default=list)
    description: Mapped[str] = mapped_column(Text, default="")
    logo_url: Mapped[str] = mapped_column(String(400), default="")
    website: Mapped[str] = mapped_column(String(300), default="")
    phone: Mapped[str] = mapped_column(String(32), default="")
    verified: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    is_external: Mapped[bool] = mapped_column(Boolean, default=False)  # price reference only, not registered
    delivery_available: Mapped[bool] = mapped_column(Boolean, default=True)
    lead_time_days: Mapped[int] = mapped_column(Integer, default=3)
    rating: Mapped[float] = mapped_column(Float, default=0.0)
    rating_count: Mapped[int] = mapped_column(Integer, default=0)
    plan: Mapped[str] = mapped_column(String(20), default="free")  # free | pro | enterprise
    iban: Mapped[str] = mapped_column(String(40), default="")
    bank_name: Mapped[str] = mapped_column(String(120), default="")
    delivery_fee: Mapped[float] = mapped_column(Float, default=0)          # flat fee per order
    free_delivery_over: Mapped[float | None] = mapped_column(Float, nullable=True)
    min_order_amount: Mapped[float] = mapped_column(Float, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    owner: Mapped["User | None"] = relationship(back_populates="supplier")
    offers: Mapped[list["Offer"]] = relationship(back_populates="supplier", cascade="all, delete-orphan")


class Category(Base):
    __tablename__ = "categories"
    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True)
    name_ar: Mapped[str] = mapped_column(String(120))
    name_en: Mapped[str] = mapped_column(String(120))
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True)
    icon: Mapped[str] = mapped_column(String(16), default="")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class Product(Base):
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"), index=True)
    sku: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name_ar: Mapped[str] = mapped_column(String(200), index=True)
    name_en: Mapped[str] = mapped_column(String(200), index=True)
    brand: Mapped[str] = mapped_column(String(120), default="", index=True)
    unit: Mapped[str] = mapped_column(String(32), default="piece")
    spec: Mapped[dict] = mapped_column(JSON, default=dict)
    description: Mapped[str] = mapped_column(Text, default="")
    image_url: Mapped[str] = mapped_column(String(400), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    views: Mapped[int] = mapped_column(Integer, default=0)
    sold_qty: Mapped[float] = mapped_column(Float, default=0)
    rating: Mapped[float] = mapped_column(Float, default=0)
    rating_count: Mapped[int] = mapped_column(Integer, default=0)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    category: Mapped["Category"] = relationship()
    offers: Mapped[list["Offer"]] = relationship(back_populates="product", cascade="all, delete-orphan")


class Offer(Base):
    """A supplier's current price for a product in a given city."""
    __tablename__ = "offers"
    __table_args__ = (UniqueConstraint("supplier_id", "product_id", "city", "rental_period", name="uq_offer_supplier_product_city_basis"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    price: Mapped[float] = mapped_column(Float)
    currency: Mapped[str] = mapped_column(String(3), default="SAR")
    unit: Mapped[str] = mapped_column(String(32), default="")
    min_qty: Mapped[float] = mapped_column(Float, default=1)
    city: Mapped[str] = mapped_column(String(80), default="", index=True)
    includes_vat: Mapped[bool] = mapped_column(Boolean, default=False)
    delivery_included: Mapped[bool] = mapped_column(Boolean, default=False)
    stock_status: Mapped[str] = mapped_column(String(20), default="in_stock")  # in_stock | limited | out_of_stock
    rental_period: Mapped[str] = mapped_column(String(10), default="", index=True)  # '' = sale | day | week | month (equipment rental)
    available_qty: Mapped[float | None] = mapped_column(Float, nullable=True)  # None = not tracked
    low_stock_threshold: Mapped[float] = mapped_column(Float, default=0)
    image_url: Mapped[str] = mapped_column(String(400), default="")  # supplier's own photo of the item
    valid_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    source: Mapped[str] = mapped_column(String(20), default="supplier")  # supplier | import | external
    source_name: Mapped[str] = mapped_column(String(160), default="")
    source_url: Mapped[str] = mapped_column(String(400), default="")
    notes: Mapped[str] = mapped_column(String(400), default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, index=True)

    supplier: Mapped["Supplier"] = relationship(back_populates="offers")
    product: Mapped["Product"] = relationship(back_populates="offers")


class PriceHistory(Base):
    __tablename__ = "price_history"
    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    supplier_id: Mapped[int | None] = mapped_column(ForeignKey("suppliers.id"), nullable=True)
    city: Mapped[str] = mapped_column(String(80), default="")
    price: Mapped[float] = mapped_column(Float)
    recorded_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class PriceSource(Base):
    """External price feed (CSV/JSON URL or manual uploads) used to enrich comparisons."""
    __tablename__ = "price_sources"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    kind: Mapped[str] = mapped_column(String(20), default="csv")  # csv | json | manual
    url: Mapped[str] = mapped_column(String(500), default="")
    city: Mapped[str] = mapped_column(String(80), default="")
    supplier_id: Mapped[int | None] = mapped_column(ForeignKey("suppliers.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_fetched_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_status: Mapped[str] = mapped_column(String(300), default="")
    imported_rows: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class RFQ(Base):
    """Request for quotation posted by a buyer; suppliers bid on it."""
    __tablename__ = "rfqs"
    id: Mapped[int] = mapped_column(primary_key=True)
    buyer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    project_name: Mapped[str] = mapped_column(String(200), default="")
    city: Mapped[str] = mapped_column(String(80), default="", index=True)
    delivery_address: Mapped[str] = mapped_column(String(400), default="")
    needed_by: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    closes_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="open", index=True)  # draft|open|closed|awarded|cancelled
    visibility: Mapped[str] = mapped_column(String(20), default="public")  # public | invited
    category_ids: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)

    buyer: Mapped["User"] = relationship()
    items: Mapped[list["RFQItem"]] = relationship(back_populates="rfq", cascade="all, delete-orphan")
    bids: Mapped[list["Bid"]] = relationship(back_populates="rfq", cascade="all, delete-orphan")
    invites: Mapped[list["RFQInvite"]] = relationship(cascade="all, delete-orphan")


class RFQItem(Base):
    __tablename__ = "rfq_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    rfq_id: Mapped[int] = mapped_column(ForeignKey("rfqs.id"), index=True)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"), nullable=True)
    description: Mapped[str] = mapped_column(String(300))
    quantity: Mapped[float] = mapped_column(Float, default=1)
    unit: Mapped[str] = mapped_column(String(32), default="")
    target_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str] = mapped_column(String(400), default="")

    rfq: Mapped["RFQ"] = relationship(back_populates="items")
    product: Mapped["Product | None"] = relationship()


class RFQInvite(Base):
    __tablename__ = "rfq_invites"
    rfq_id: Mapped[int] = mapped_column(ForeignKey("rfqs.id"), primary_key=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"), primary_key=True)
    notified_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Bid(Base):
    __tablename__ = "bids"
    __table_args__ = (UniqueConstraint("rfq_id", "supplier_id", name="uq_bid_rfq_supplier"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    rfq_id: Mapped[int] = mapped_column(ForeignKey("rfqs.id"), index=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"), index=True)
    subtotal: Mapped[float] = mapped_column(Float, default=0)
    vat: Mapped[float] = mapped_column(Float, default=0)
    total: Mapped[float] = mapped_column(Float, default=0)
    delivery_days: Mapped[int] = mapped_column(Integer, default=3)
    delivery_fee: Mapped[float] = mapped_column(Float, default=0)
    valid_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    payment_terms: Mapped[str] = mapped_column(String(300), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="submitted", index=True)  # submitted|withdrawn|awarded|rejected
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    rfq: Mapped["RFQ"] = relationship(back_populates="bids")
    supplier: Mapped["Supplier"] = relationship()
    items: Mapped[list["BidItem"]] = relationship(back_populates="bid", cascade="all, delete-orphan")


class BidItem(Base):
    __tablename__ = "bid_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    bid_id: Mapped[int] = mapped_column(ForeignKey("bids.id"), index=True)
    rfq_item_id: Mapped[int] = mapped_column(ForeignKey("rfq_items.id"))
    unit_price: Mapped[float] = mapped_column(Float)
    quantity: Mapped[float] = mapped_column(Float)
    brand: Mapped[str] = mapped_column(String(120), default="")
    notes: Mapped[str] = mapped_column(String(300), default="")

    bid: Mapped["Bid"] = relationship(back_populates="items")


ORDER_TRANSITIONS = {
    "pending": {"confirmed", "cancelled"},
    "confirmed": {"in_delivery", "cancelled"},
    "in_delivery": {"delivered"},
    "delivered": set(),
    "cancelled": set(),
}


class Order(Base):
    __tablename__ = "orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    buyer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"), index=True)
    rfq_id: Mapped[int | None] = mapped_column(ForeignKey("rfqs.id"), nullable=True)
    bid_id: Mapped[int | None] = mapped_column(ForeignKey("bids.id"), nullable=True)
    subtotal: Mapped[float] = mapped_column(Float, default=0)
    vat: Mapped[float] = mapped_column(Float, default=0)
    delivery_fee: Mapped[float] = mapped_column(Float, default=0)
    discount: Mapped[float] = mapped_column(Float, default=0)
    coupon_code: Mapped[str] = mapped_column(String(40), default="")
    total: Mapped[float] = mapped_column(Float, default=0)
    currency: Mapped[str] = mapped_column(String(3), default="SAR")
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    payment_status: Mapped[str] = mapped_column(String(20), default="unpaid", index=True)  # unpaid|pending|paid|released|refunded
    delivery_address: Mapped[str] = mapped_column(String(400), default="")
    city: Mapped[str] = mapped_column(String(80), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    buyer: Mapped["User"] = relationship()
    supplier: Mapped["Supplier"] = relationship()
    items: Mapped[list["OrderItem"]] = relationship(back_populates="order", cascade="all, delete-orphan")


class OrderItem(Base):
    __tablename__ = "order_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"), nullable=True)
    offer_id: Mapped[int | None] = mapped_column(ForeignKey("offers.id"), nullable=True)
    description: Mapped[str] = mapped_column(String(300))
    quantity: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(32), default="")
    unit_price: Mapped[float] = mapped_column(Float)
    line_total: Mapped[float] = mapped_column(Float)

    order: Mapped["Order"] = relationship(back_populates="items")


class Review(Base):
    __tablename__ = "reviews"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), unique=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"), index=True)
    buyer_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    rating: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    kind: Mapped[str] = mapped_column(String(30), default="info")
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, default="")
    ref_type: Mapped[str] = mapped_column(String(30), default="")
    ref_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class PriceAlert(Base):
    """Buyer watches a product and is notified when the best price drops to the target."""
    __tablename__ = "price_alerts"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    city: Mapped[str] = mapped_column(String(80), default="")
    target_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    baseline_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_notified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(60), index=True)
    entity: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


# ---------------------------------------------------------------------------
# Payments, payouts, invoices
# ---------------------------------------------------------------------------
PAYMENT_STATUSES = ("initiated", "pending_transfer", "paid", "failed", "released", "refunded")


class Payment(Base):
    """Escrow payment: the buyer pays the platform for an order; the supplier is paid out after delivery."""
    __tablename__ = "payments"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    buyer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"), index=True)
    provider: Mapped[str] = mapped_column(String(20), default="mock")  # mock | moyasar | bank_transfer
    provider_ref: Mapped[str] = mapped_column(String(120), default="", index=True)
    group_ref: Mapped[str] = mapped_column(String(40), default="", index=True)  # one hosted checkout for a multi-supplier cart
    method: Mapped[str] = mapped_column(String(20), default="card")  # card | mada | applepay | stcpay | bank_transfer
    amount: Mapped[float] = mapped_column(Float)          # order total incl. VAT, SAR
    currency: Mapped[str] = mapped_column(String(3), default="SAR")
    platform_fee: Mapped[float] = mapped_column(Float, default=0)   # take rate, deducted from supplier payout
    supplier_net: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String(20), default="initiated", index=True)
    checkout_url: Mapped[str] = mapped_column(String(500), default="")
    failure_reason: Mapped[str] = mapped_column(String(300), default="")
    transfer_reference: Mapped[str] = mapped_column(String(120), default="")
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    released_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    order: Mapped["Order"] = relationship()
    supplier: Mapped["Supplier"] = relationship()
    buyer: Mapped["User"] = relationship()


class Payout(Base):
    __tablename__ = "payouts"
    id: Mapped[int] = mapped_column(primary_key=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"), index=True)
    payment_id: Mapped[int] = mapped_column(ForeignKey("payments.id"), unique=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"))
    amount: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)  # pending | paid | failed
    reference: Mapped[str] = mapped_column(String(120), default="")
    iban_masked: Mapped[str] = mapped_column(String(40), default="")
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)

    supplier: Mapped["Supplier"] = relationship()


class Invoice(Base):
    """ZATCA phase-1 style simplified tax invoice (seller, VAT no., timestamp, total, VAT) with TLV QR payload."""
    __tablename__ = "invoices"
    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[str] = mapped_column(String(40), unique=True)
    kind: Mapped[str] = mapped_column(String(20), default="tax_invoice")  # tax_invoice | platform_fee
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    payment_id: Mapped[int | None] = mapped_column(ForeignKey("payments.id"), nullable=True)
    seller_name: Mapped[str] = mapped_column(String(200))
    seller_vat: Mapped[str] = mapped_column(String(40), default="")
    buyer_name: Mapped[str] = mapped_column(String(200), default="")
    buyer_vat: Mapped[str] = mapped_column(String(40), default="")
    subtotal: Mapped[float] = mapped_column(Float)
    vat: Mapped[float] = mapped_column(Float)
    total: Mapped[float] = mapped_column(Float)
    lines: Mapped[list] = mapped_column(JSON, default=list)
    qr_tlv_base64: Mapped[str] = mapped_column(Text, default="")
    issued_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


# ---------------------------------------------------------------------------
# OTP, devices, notification deliveries
# ---------------------------------------------------------------------------
class OTPCode(Base):
    __tablename__ = "otp_codes"
    id: Mapped[int] = mapped_column(primary_key=True)
    destination: Mapped[str] = mapped_column(String(190), index=True)  # phone or email
    channel: Mapped[str] = mapped_column(String(10), default="sms")  # sms | email | whatsapp
    purpose: Mapped[str] = mapped_column(String(20), default="register")  # register | login | reset | verify
    code_hash: Mapped[str] = mapped_column(String(128))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    consumed: Mapped[bool] = mapped_column(Boolean, default=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class DeviceToken(Base):
    __tablename__ = "device_tokens"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    token: Mapped[str] = mapped_column(String(300), unique=True)
    platform: Mapped[str] = mapped_column(String(10), default="expo")  # expo | ios | android | web
    device_name: Mapped[str] = mapped_column(String(120), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class NotificationDelivery(Base):
    """Outbox row per (notification, channel). A background worker sends it and records the result."""
    __tablename__ = "notification_deliveries"
    id: Mapped[int] = mapped_column(primary_key=True)
    notification_id: Mapped[int] = mapped_column(ForeignKey("notifications.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    channel: Mapped[str] = mapped_column(String(10))  # email | sms | whatsapp | push
    destination: Mapped[str] = mapped_column(String(300), default="")
    status: Mapped[str] = mapped_column(String(10), default="queued", index=True)  # queued | sent | failed
    provider: Mapped[str] = mapped_column(String(20), default="")
    provider_ref: Mapped[str] = mapped_column(String(200), default="")
    error: Mapped[str] = mapped_column(String(400), default="")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class JobRun(Base):
    __tablename__ = "job_runs"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(60), index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(10), default="ok")
    detail: Mapped[dict] = mapped_column(JSON, default=dict)


class SupplierDocument(Base):
    """Compliance documents (CR, VAT certificate, SCA classification…) reviewed by the platform."""
    __tablename__ = "supplier_documents"
    id: Mapped[int] = mapped_column(primary_key=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"), index=True)
    kind: Mapped[str] = mapped_column(String(30), default="other")  # cr | vat | classification | bank | other
    file_url: Mapped[str] = mapped_column(String(500))
    filename: Mapped[str] = mapped_column(String(200), default="")
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)  # pending | approved | rejected
    note: Mapped[str] = mapped_column(String(400), default="")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Dispute(Base):
    __tablename__ = "disputes"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    opened_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    role: Mapped[str] = mapped_column(String(10), default="buyer")  # buyer | supplier
    kind: Mapped[str] = mapped_column(String(10), default="dispute")  # dispute | return
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="open", index=True)  # open | resolved | rejected
    resolution: Mapped[str] = mapped_column(Text, default="")
    refunded: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class PlatformSetting(Base):
    """Admin-editable settings that override environment defaults (fee %, bank details, banner, toggles)."""
    __tablename__ = "platform_settings"
    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class Coupon(Base):
    __tablename__ = "coupons"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    kind: Mapped[str] = mapped_column(String(10), default="percent")  # percent | fixed
    value: Mapped[float] = mapped_column(Float)
    min_order: Mapped[float] = mapped_column(Float, default=0)
    max_discount: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_uses: Mapped[int | None] = mapped_column(Integer, nullable=True)
    used: Mapped[int] = mapped_column(Integer, default=0)
    audience: Mapped[str] = mapped_column(String(10), default="all")  # all | new (first order only)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


# ---------------------------------------------------------------------------
# Shopping: addresses, cart, favorites, product reviews, order timeline
# ---------------------------------------------------------------------------
class Address(Base):
    __tablename__ = "addresses"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    label: Mapped[str] = mapped_column(String(60), default="")  # site / office / warehouse
    recipient: Mapped[str] = mapped_column(String(120), default="")
    phone: Mapped[str] = mapped_column(String(32), default="")
    city: Mapped[str] = mapped_column(String(80))
    district: Mapped[str] = mapped_column(String(120), default="")
    street: Mapped[str] = mapped_column(String(200), default="")
    building: Mapped[str] = mapped_column(String(80), default="")
    notes: Mapped[str] = mapped_column(String(300), default="")
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    def as_text(self) -> str:
        parts = [self.label, self.district, self.street, self.building, self.city]
        return "، ".join(p for p in parts if p)


class CartItem(Base):
    __tablename__ = "cart_items"
    __table_args__ = (UniqueConstraint("user_id", "offer_id", name="uq_cart_user_offer"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    offer_id: Mapped[int] = mapped_column(ForeignKey("offers.id"))
    quantity: Mapped[float] = mapped_column(Float, default=1)
    added_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    offer: Mapped["Offer"] = relationship()


class Favorite(Base):
    __tablename__ = "favorites"
    __table_args__ = (UniqueConstraint("user_id", "product_id", name="uq_fav_user_product"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class ProductReview(Base):
    __tablename__ = "product_reviews"
    __table_args__ = (UniqueConstraint("user_id", "product_id", name="uq_review_user_product"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    rating: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(160), default="")
    comment: Mapped[str] = mapped_column(Text, default="")
    verified: Mapped[bool] = mapped_column(Boolean, default=False)  # bought it on the platform
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class OrderEvent(Base):
    __tablename__ = "order_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    status: Mapped[str] = mapped_column(String(20))
    note: Mapped[str] = mapped_column(String(300), default="")
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
