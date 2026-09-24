"""Escrow payments with pluggable gateway providers, payouts and ZATCA-style invoices.

Flow: buyer → checkout (gateway hosted page or bank transfer) → paid (webhook/sync/admin confirm)
     → order delivered → escrow released → payout to supplier (minus platform fee) → admin marks payout paid.
"""
import base64
import io
import logging
from datetime import timedelta

import httpx
from fastapi import HTTPException
from sqlalchemy.orm import Session

from .. import config
from ..models import Invoice, Order, Payment, Payout, Supplier, User, utcnow
from .notify import notify

log = logging.getLogger("mysupplier.payments")


# ------------------------------------------------------------------ providers
class MockProvider:
    """Dev/test gateway: a hosted-looking page on our own API that confirms or fails the payment."""
    name = "mock"

    def create_checkout(self, payment: Payment, order: Order, amount: float | None = None) -> str:
        return f"{config.PUBLIC_BASE_URL}/api/v1/payments/mock/checkout/{payment.id}"

    def fetch_status(self, payment: Payment) -> str:
        return payment.status

    def refund(self, payment: Payment) -> str:
        return f"mock-refund-{payment.id}"


class MoyasarProvider:
    """Moyasar (mada, Visa/Mastercard, Apple Pay, STC Pay) — hosted invoice page + webhook/API verification."""
    name = "moyasar"

    def _auth(self):
        if not config.MOYASAR_SECRET_KEY:
            raise HTTPException(500, "MOYASAR_SECRET_KEY is not configured")
        return (config.MOYASAR_SECRET_KEY, "")

    def create_checkout(self, payment: Payment, order: Order, amount: float | None = None) -> str:
        r = httpx.post(f"{config.MOYASAR_API_BASE}/invoices", auth=self._auth(), timeout=30, json={
            "amount": int(round((amount or payment.amount) * 100)), "currency": payment.currency,
            "description": f"{config.PLATFORM_NAME} order #{order.id}" + (f" (+{payment.group_ref})" if payment.group_ref else ""),
            "callback_url": f"{config.WEB_BASE_URL}/buyer/orders?paid={payment.id}",
            "expired_at": (utcnow() + timedelta(hours=24)).isoformat() + "Z",
            "metadata": {"payment_id": str(payment.id), "order_id": str(order.id)},
        })
        if r.status_code >= 400:
            raise HTTPException(502, f"Moyasar error: {r.text[:200]}")
        data = r.json()
        payment.provider_ref = data.get("id", "")
        return data.get("url", "")

    def fetch_status(self, payment: Payment) -> str:
        if not payment.provider_ref:
            return payment.status
        r = httpx.get(f"{config.MOYASAR_API_BASE}/invoices/{payment.provider_ref}", auth=self._auth(), timeout=30)
        if r.status_code >= 400:
            return payment.status
        status = r.json().get("status", "")
        return {"paid": "paid", "failed": "failed", "canceled": "failed", "expired": "failed"}.get(status, payment.status)

    def refund(self, payment: Payment) -> str:
        # Invoices hold one or more payments; refund the paid one.
        r = httpx.get(f"{config.MOYASAR_API_BASE}/invoices/{payment.provider_ref}", auth=self._auth(), timeout=30)
        r.raise_for_status()
        pays = [p for p in r.json().get("payments", []) if p.get("status") == "paid"]
        if not pays:
            raise HTTPException(400, "No paid Moyasar payment found to refund")
        rr = httpx.post(f"{config.MOYASAR_API_BASE}/payments/{pays[0]['id']}/refund", auth=self._auth(), timeout=30)
        rr.raise_for_status()
        return rr.json().get("id", "")


def provider():
    return MoyasarProvider() if config.PAYMENT_PROVIDER == "moyasar" else MockProvider()


# ------------------------------------------------------------------ helpers
def fee_split(amount: float, pct: float | None = None) -> tuple[float, float]:
    pct = config.PLATFORM_FEE_PCT if pct is None else pct
    fee = round(amount * pct / 100, 2)
    return fee, round(amount - fee, 2)


def mask_iban(iban: str) -> str:
    iban = (iban or "").replace(" ", "")
    return f"{iban[:4]}…{iban[-4:]}" if len(iban) > 8 else ("****" if iban else "")


def zatca_tlv(seller: str, vat: str, timestamp: str, total: float, vat_amount: float) -> str:
    """ZATCA phase-1 QR: TLV of seller name, VAT number, ISO timestamp, total (inc. VAT), VAT amount → base64."""
    out = b""
    for tag, value in enumerate([seller, vat, timestamp, f"{total:.2f}", f"{vat_amount:.2f}"], start=1):
        b = value.encode("utf-8")
        out += bytes([tag, len(b)]) + b
    return base64.b64encode(out).decode()


def qr_svg(payload: str) -> str:
    import qrcode
    import qrcode.image.svg
    img = qrcode.make(payload, image_factory=qrcode.image.svg.SvgPathImage, box_size=6, border=1)
    buf = io.BytesIO()
    img.save(buf)
    return buf.getvalue().decode()


def next_invoice_number(db: Session, kind: str) -> str:
    prefix = "INV" if kind == "tax_invoice" else "FEE"
    year = utcnow().year
    n = db.query(Invoice).filter(Invoice.kind == kind).count() + 1
    return f"{prefix}-{year}-{n:06d}"


# ------------------------------------------------------------------ lifecycle
def start_checkout(db: Session, order: Order, buyer: User, method: str = "card") -> Payment:
    if order.buyer_id != buyer.id and buyer.role != "admin":
        raise HTTPException(403, "Not your order")
    if order.status == "cancelled":
        raise HTTPException(400, "Order is cancelled")
    if order.payment_status in ("paid", "released"):
        raise HTTPException(400, "Order is already paid")
    existing = (db.query(Payment).filter(Payment.order_id == order.id, Payment.status.in_(["initiated", "pending_transfer"]))
                .order_by(Payment.id.desc()).first())
    if existing and existing.method == method and existing.status == "initiated" and existing.created_at > utcnow() - timedelta(hours=1):
        return existing
    from . import settings as _settings
    fee, net = fee_split(order.total, _settings.get(db, "platform_fee_pct"))
    p = Payment(order_id=order.id, buyer_id=order.buyer_id, supplier_id=order.supplier_id, amount=round(order.total, 2),
                platform_fee=fee, supplier_net=net, method=method)
    if method == "bank_transfer":
        p.provider, p.status = "bank_transfer", "pending_transfer"
        order.payment_status = "pending"
    else:
        prov = provider()
        p.provider = prov.name
        db.add(p)
        db.flush()
        p.checkout_url = prov.create_checkout(p, order)
        order.payment_status = "pending"
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def group_members(db: Session, payment: Payment) -> list[Payment]:
    if not payment.group_ref:
        return [payment]
    return db.query(Payment).filter(Payment.group_ref == payment.group_ref).all()


def mark_paid(db: Session, payment: Payment, provider_ref: str | None = None, reference: str = "") -> Payment:
    if payment.group_ref and not getattr(payment, "_in_group", False):
        for m in group_members(db, payment):
            m._in_group = True
            mark_paid(db, m, provider_ref, reference)
        return payment
    if payment.status in ("paid", "released"):
        return payment
    payment.status, payment.paid_at = "paid", utcnow()
    if provider_ref:
        payment.provider_ref = provider_ref
    if reference:
        payment.transfer_reference = reference
    order = db.get(Order, payment.order_id)
    order.payment_status = "paid"
    from .orders import add_event
    add_event(db, order, "paid", f"تم استلام الدفع ({payment.method}) — {payment.amount:,.2f} ر.س", order.buyer_id)
    # cancel other open attempts for this order
    for other in db.query(Payment).filter(Payment.order_id == order.id, Payment.id != payment.id, Payment.status.in_(["initiated", "pending_transfer"])).all():
        other.status, other.failure_reason = "failed", "superseded"
    issue_invoices(db, order, payment)
    supplier = db.get(Supplier, order.supplier_id)
    notify(db, order.buyer_id, f"تم استلام دفعتك للطلب #{order.id} ✅", f"{payment.amount:,.2f} ر.س محفوظة لدى المنصة وتُحوّل للمورّد بعد التسليم", "payment", "order", order.id)
    if supplier and supplier.user_id:
        notify(db, supplier.user_id, f"الطلب #{order.id} مدفوع — ابدأ التوريد", f"صافي مستحقك بعد التسليم: {payment.supplier_net:,.2f} ر.س", "payment", "order", order.id)
    db.commit()
    db.refresh(payment)
    return payment


def mark_failed(db: Session, payment: Payment, reason: str = "") -> Payment:
    for m in group_members(db, payment):
        if m.status in ("paid", "released", "refunded"):
            continue
        m.status, m.failure_reason = "failed", reason[:300]
        order = db.get(Order, m.order_id)
        if order.payment_status == "pending":
            order.payment_status = "unpaid"
    db.commit()
    return payment


def start_group_checkout(db: Session, orders: list[Order], buyer: User, method: str = "card") -> list[Payment]:
    """One hosted checkout (or one bank transfer) covering several orders of the same buyer (multi-supplier cart)."""
    import secrets as _secrets
    from . import settings as _settings
    for o in orders:
        if o.buyer_id != buyer.id and buyer.role != "admin":
            raise HTTPException(403, "Not your order")
        if o.status == "cancelled" or o.payment_status in ("paid", "released"):
            raise HTTPException(400, f"Order #{o.id} cannot be paid")
    pct = _settings.get(db, "platform_fee_pct")
    group_ref = "grp-" + _secrets.token_hex(6)
    pays = []
    for o in orders:
        for other in db.query(Payment).filter(Payment.order_id == o.id, Payment.status.in_(["initiated", "pending_transfer"])).all():
            other.status, other.failure_reason = "failed", "superseded"
        fee, net = fee_split(o.total, pct)
        p = Payment(order_id=o.id, buyer_id=o.buyer_id, supplier_id=o.supplier_id, amount=round(o.total, 2), platform_fee=fee, supplier_net=net,
                    method=method, group_ref=group_ref, provider="bank_transfer" if method == "bank_transfer" else provider().name,
                    status="pending_transfer" if method == "bank_transfer" else "initiated")
        db.add(p)
        o.payment_status = "pending"
        pays.append(p)
    db.flush()
    if method != "bank_transfer":
        total = round(sum(p.amount for p in pays), 2)
        url = provider().create_checkout(pays[0], orders[0], amount=total)
        for p in pays:
            p.checkout_url, p.provider_ref = url, pays[0].provider_ref
    db.commit()
    for p in pays:
        db.refresh(p)
    return pays


def release_escrow(db: Session, order: Order) -> Payout | None:
    """Called when an order is delivered: move the paid amount to a pending payout for the supplier."""
    payment = db.query(Payment).filter(Payment.order_id == order.id, Payment.status == "paid").first()
    if not payment:
        return None
    payment.status, payment.released_at = "released", utcnow()
    order.payment_status = "released"
    supplier = db.get(Supplier, order.supplier_id)
    payout = Payout(supplier_id=order.supplier_id, payment_id=payment.id, order_id=order.id, amount=payment.supplier_net,
                    iban_masked=mask_iban(supplier.iban if supplier else ""))
    db.add(payout)
    if supplier and supplier.user_id:
        notify(db, supplier.user_id, f"تحويل مستحقاتك عن الطلب #{order.id} قيد التنفيذ", f"{payment.supplier_net:,.2f} ر.س" + ("" if supplier.iban else " — أضف الآيبان في ملفك لتسريع التحويل"), "payout", "order", order.id)
    return payout


def refund(db: Session, payment: Payment, actor: User) -> Payment:
    if payment.status not in ("paid",):
        raise HTTPException(400, "Only paid (unreleased) payments can be refunded")
    ref = provider().refund(payment) if payment.provider != "bank_transfer" else "manual-refund"
    payment.status, payment.refunded_at, payment.transfer_reference = "refunded", utcnow(), ref
    order = db.get(Order, payment.order_id)
    order.payment_status = "refunded"
    notify(db, order.buyer_id, f"تم رد مبلغ الطلب #{order.id}", f"{payment.amount:,.2f} ر.س", "payment", "order", order.id)
    db.commit()
    return payment


def issue_invoices(db: Session, order: Order, payment: Payment) -> list[Invoice]:
    if db.query(Invoice).filter(Invoice.order_id == order.id, Invoice.kind == "tax_invoice").first():
        return []
    supplier = db.get(Supplier, order.supplier_id)
    buyer = db.get(User, order.buyer_id)
    ts = utcnow().replace(microsecond=0).isoformat() + "Z"
    lines = [{"description": i.description, "quantity": i.quantity, "unit": i.unit, "unit_price": i.unit_price, "line_total": i.line_total} for i in order.items]
    tax = Invoice(number=next_invoice_number(db, "tax_invoice"), kind="tax_invoice", order_id=order.id, payment_id=payment.id,
                  seller_name=supplier.name if supplier else "", seller_vat=supplier.vat_number if supplier else "",
                  buyer_name=(buyer.company_name or buyer.full_name) if buyer else "", subtotal=order.subtotal + order.delivery_fee,
                  vat=order.vat, total=order.total, lines=lines,
                  qr_tlv_base64=zatca_tlv(supplier.name if supplier else "", supplier.vat_number if supplier else "", ts, order.total, order.vat))
    fee_vat = round(payment.platform_fee * config.VAT_RATE / (1 + config.VAT_RATE), 2)  # fee is VAT-inclusive
    fee = Invoice(number=next_invoice_number(db, "platform_fee"), kind="platform_fee", order_id=order.id, payment_id=payment.id,
                  seller_name=config.PLATFORM_NAME, seller_vat=config.PLATFORM_VAT_NUMBER, buyer_name=supplier.name if supplier else "",
                  buyer_vat=supplier.vat_number if supplier else "", subtotal=round(payment.platform_fee - fee_vat, 2), vat=fee_vat,
                  total=payment.platform_fee, lines=[{"description": f"Platform fee {config.PLATFORM_FEE_PCT}% — order #{order.id}", "quantity": 1, "unit": "", "unit_price": payment.platform_fee, "line_total": payment.platform_fee}],
                  qr_tlv_base64=zatca_tlv(config.PLATFORM_NAME, config.PLATFORM_VAT_NUMBER, ts, payment.platform_fee, fee_vat))
    db.add_all([tax, fee])
    db.flush()
    return [tax, fee]


def expire_stale(db: Session) -> int:
    cutoff = utcnow() - timedelta(hours=24)
    rows = db.query(Payment).filter(Payment.status == "initiated", Payment.created_at < cutoff).all()
    for p in rows:
        mark_failed(db, p, "expired")
    return len(rows)
