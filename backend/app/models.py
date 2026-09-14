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
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    category: Mapped["Category"] = relationship()
    offers: Mapped[list["Offer"]] = relationship(back_populates="product", cascade="all, delete-orphan")


class Offer(Base):
    """A supplier's current price for a product in a given city."""
    __tablename__ = "offers"
    __table_args__ = (UniqueConstraint("supplier_id", "product_id", "city", name="uq_offer_supplier_product_city"),)
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
    total: Mapped[float] = mapped_column(Float, default=0)
    currency: Mapped[str] = mapped_column(String(3), default="SAR")
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
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
