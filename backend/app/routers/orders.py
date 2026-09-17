from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..config import VAT_RATE
from ..db import get_db
from ..models import ORDER_TRANSITIONS, Offer, Order, OrderItem, Review, Supplier, User, utcnow
from ..schemas import DirectOrderIn, DisputeIn, DisputeOut, OrderOut, OrderStatusIn, ReviewIn
from ..security import get_current_user, get_my_supplier, require_buyer
from ..models import Dispute, Payment
from ..services import payments, pricing
from ..services.notify import notify

router = APIRouter(prefix="/orders", tags=["orders"])


def order_out(o: Order, db: Session) -> OrderOut:
    out = OrderOut.model_validate(o)
    out.supplier = o.supplier
    out.buyer_name = (o.buyer.company_name or o.buyer.full_name) if o.buyer else ""
    out.has_review = db.query(Review).filter(Review.order_id == o.id).first() is not None
    return out


@router.post("/direct", response_model=OrderOut, status_code=201)
def direct_order(body: DirectOrderIn, user: User = Depends(require_buyer), db: Session = Depends(get_db)):
    offer = db.get(Offer, body.offer_id)
    if not offer or offer.stock_status == "out_of_stock":
        raise HTTPException(400, "Offer is not available")
    if offer.supplier.is_external or not offer.supplier.user_id:
        raise HTTPException(400, "This is a reference price from an external source — request a quote instead")
    if body.quantity < offer.min_qty:
        raise HTTPException(400, f"Minimum quantity is {offer.min_qty}")
    unit_price, _ = pricing.offer_prices(offer)
    subtotal = round(unit_price * body.quantity, 2)
    vat = round(subtotal * VAT_RATE, 2)
    order = Order(buyer_id=user.id, supplier_id=offer.supplier_id, subtotal=subtotal, vat=vat, total=round(subtotal + vat, 2),
                  delivery_address=body.delivery_address, city=offer.city, notes=body.notes)
    db.add(order)
    db.flush()
    db.add(OrderItem(order_id=order.id, product_id=offer.product_id, description=offer.product.name_ar, quantity=body.quantity,
                     unit=offer.unit or offer.product.unit, unit_price=unit_price, line_total=subtotal))
    notify(db, offer.supplier.user_id, f"طلب شراء جديد #{order.id}", f"{offer.product.name_ar} × {body.quantity:g}", "order", "order", order.id)
    db.commit()
    db.refresh(order)
    return order_out(order, db)


@router.get("/mine", response_model=list[OrderOut])
def my_orders(user: User = Depends(require_buyer), db: Session = Depends(get_db)):
    rows = db.query(Order).filter(Order.buyer_id == user.id).order_by(Order.created_at.desc()).all()
    return [order_out(o, db) for o in rows]


@router.get("/supplier", response_model=list[OrderOut])
def supplier_orders(supplier: Supplier = Depends(get_my_supplier), db: Session = Depends(get_db)):
    rows = db.query(Order).filter(Order.supplier_id == supplier.id).order_by(Order.created_at.desc()).all()
    return [order_out(o, db) for o in rows]


@router.get("/{order_id}", response_model=OrderOut)
def order_detail(order_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    o = db.get(Order, order_id)
    if not o:
        raise HTTPException(404, "Order not found")
    allowed = user.role == "admin" or o.buyer_id == user.id or (o.supplier.user_id == user.id)
    if not allowed:
        raise HTTPException(403, "Not your order")
    return order_out(o, db)


@router.patch("/{order_id}/status", response_model=OrderOut)
def update_status(order_id: int, body: OrderStatusIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    o = db.get(Order, order_id)
    if not o:
        raise HTTPException(404, "Order not found")
    is_supplier = o.supplier.user_id == user.id
    is_buyer = o.buyer_id == user.id
    if not (is_supplier or is_buyer or user.role == "admin"):
        raise HTTPException(403, "Not your order")
    if is_buyer and user.role != "admin" and body.status != "cancelled":
        raise HTTPException(403, "Buyers can only cancel orders")
    if body.status not in ORDER_TRANSITIONS[o.status]:
        raise HTTPException(400, f"Cannot move order from {o.status} to {body.status}")
    o.status = body.status
    if body.notes:
        o.notes = (o.notes + "\n" + body.notes).strip()
    o.updated_at = utcnow()
    if body.status == "delivered":
        payments.release_escrow(db, o)
    elif body.status == "cancelled":
        paid = db.query(Payment).filter(Payment.order_id == o.id, Payment.status == "paid").first()
        if paid:
            payments.refund(db, paid, user)
    target = o.buyer_id if is_supplier else o.supplier.user_id
    if target:
        notify(db, target, f"تحديث حالة الطلب #{o.id}: {body.status}", body.notes, "order", "order", o.id)
    db.commit()
    db.refresh(o)
    return order_out(o, db)


@router.post("/{order_id}/review", status_code=201)
def review(order_id: int, body: ReviewIn, user: User = Depends(require_buyer), db: Session = Depends(get_db)):
    o = db.get(Order, order_id)
    if not o or o.buyer_id != user.id:
        raise HTTPException(404, "Order not found")
    if o.status != "delivered":
        raise HTTPException(400, "Only delivered orders can be reviewed")
    if db.query(Review).filter(Review.order_id == o.id).first():
        raise HTTPException(409, "Order already reviewed")
    db.add(Review(order_id=o.id, supplier_id=o.supplier_id, buyer_id=user.id, rating=body.rating, comment=body.comment))
    s = o.supplier
    s.rating = round((s.rating * s.rating_count + body.rating) / (s.rating_count + 1), 2)
    s.rating_count += 1
    db.commit()
    return {"ok": True, "supplier_rating": s.rating, "rating_count": s.rating_count}


@router.post("/{order_id}/dispute", response_model=DisputeOut, status_code=201)
def open_dispute(order_id: int, body: DisputeIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    o = db.get(Order, order_id)
    if not o:
        raise HTTPException(404, "Order not found")
    is_buyer, is_supplier = o.buyer_id == user.id, o.supplier.user_id == user.id
    if not (is_buyer or is_supplier):
        raise HTTPException(403, "Not your order")
    if db.query(Dispute).filter(Dispute.order_id == o.id, Dispute.status == "open").first():
        raise HTTPException(409, "A dispute is already open for this order")
    d = Dispute(order_id=o.id, opened_by=user.id, role="buyer" if is_buyer else "supplier", reason=body.reason)
    db.add(d)
    target = o.supplier.user_id if is_buyer else o.buyer_id
    if target:
        notify(db, target, f"تم فتح نزاع على الطلب #{o.id}", body.reason[:200], "dispute", "order", o.id)
    for admin in db.query(User).filter(User.role == "admin").all():
        notify(db, admin.id, f"نزاع جديد على الطلب #{o.id}", body.reason[:200], "dispute", "order", o.id)
    db.commit()
    db.refresh(d)
    return _dispute_out(d, db)


@router.get("/{order_id}/disputes", response_model=list[DisputeOut])
def order_disputes(order_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    o = db.get(Order, order_id)
    if not o or not (user.role == "admin" or o.buyer_id == user.id or o.supplier.user_id == user.id):
        raise HTTPException(404, "Order not found")
    return [_dispute_out(d, db) for d in db.query(Dispute).filter(Dispute.order_id == o.id).order_by(Dispute.id.desc()).all()]


def _dispute_out(d: Dispute, db: Session) -> DisputeOut:
    out = DisputeOut.model_validate(d)
    o = db.get(Order, d.order_id)
    if o:
        out.order_total = o.total
        out.buyer_name = (o.buyer.company_name or o.buyer.full_name) if o.buyer else ""
        out.supplier_name = o.supplier.name if o.supplier else ""
    return out
