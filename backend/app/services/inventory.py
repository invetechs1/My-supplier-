"""Stock tracking on offers: reserve on purchase, restore on cancellation, low-stock alerts."""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models import Offer, utcnow
from .notify import notify


def reserve(db: Session, offer: Offer, qty: float) -> None:
    if offer.available_qty is None:
        return
    if offer.available_qty < qty:
        raise HTTPException(400, f"Only {offer.available_qty:g} available for {offer.product.name_ar}")
    offer.available_qty = round(offer.available_qty - qty, 3)
    offer.updated_at = utcnow()
    sup_user = offer.supplier.user_id if offer.supplier else None
    if offer.available_qty <= 0:
        offer.stock_status = "out_of_stock"
        if sup_user:
            notify(db, sup_user, f"نفدت كمية {offer.product.name_ar}", f"{offer.city} — حدّث الكمية المتوفرة لإعادة العرض", "stock", "product", offer.product_id)
    elif offer.low_stock_threshold and offer.available_qty <= offer.low_stock_threshold:
        offer.stock_status = "limited"
        if sup_user:
            notify(db, sup_user, f"الكمية منخفضة: {offer.product.name_ar}", f"المتبقي {offer.available_qty:g} {offer.unit} في {offer.city}", "stock", "product", offer.product_id)


def restore(db: Session, offer: Offer, qty: float) -> None:
    if offer.available_qty is None:
        return
    offer.available_qty = round(offer.available_qty + qty, 3)
    if offer.available_qty > 0 and offer.stock_status == "out_of_stock":
        offer.stock_status = "limited" if offer.low_stock_threshold and offer.available_qty <= offer.low_stock_threshold else "in_stock"
