"""Order helpers shared by the direct-order, cart and RFQ flows."""
from sqlalchemy.orm import Session

from ..models import Order, OrderEvent, Product


def add_event(db: Session, order: Order, status: str, note: str = "", actor_id: int | None = None) -> OrderEvent:
    ev = OrderEvent(order_id=order.id, status=status, note=note[:300], actor_id=actor_id)
    db.add(ev)
    return ev


def count_sales(db: Session, order: Order) -> None:
    for it in order.items:
        if it.product_id:
            p = db.get(Product, it.product_id)
            if p:
                p.sold_qty = (p.sold_qty or 0) + it.quantity
