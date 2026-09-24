"""Coupon validation and application (discount on the order subtotal, before VAT)."""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models import Coupon, Order, utcnow


def validate(db: Session, code: str, buyer_id: int, subtotal: float) -> tuple[Coupon, float]:
    c = db.query(Coupon).filter(Coupon.code == code.strip().upper()).first()
    if not c or not c.is_active:
        raise HTTPException(400, "Coupon code is not valid")
    if c.expires_at and c.expires_at < utcnow():
        raise HTTPException(400, "Coupon has expired")
    if c.max_uses is not None and c.used >= c.max_uses:
        raise HTTPException(400, "Coupon usage limit reached")
    if subtotal < c.min_order:
        raise HTTPException(400, f"Coupon requires a minimum order of {c.min_order:,.0f} SAR")
    if c.audience == "new" and db.query(Order).filter(Order.buyer_id == buyer_id, Order.status != "cancelled").count():
        raise HTTPException(400, "Coupon is for first orders only")
    discount = round(subtotal * c.value / 100, 2) if c.kind == "percent" else min(c.value, subtotal)
    if c.max_discount is not None:
        discount = min(discount, c.max_discount)
    return c, round(discount, 2)
