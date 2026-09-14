"""Buyer RFQs and supplier bidding."""
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..config import VAT_RATE
from ..db import get_db
from ..models import RFQ, AuditLog, Bid, BidItem, Order, OrderItem, Product, RFQInvite, RFQItem, Supplier, User, utcnow
from ..schemas import BidIn, BidItemOut, BidOut, RFQDetailOut, RFQIn, RFQItemOut, RFQOut
from ..security import get_current_user, get_my_supplier, require_buyer
from ..services import matching, pricing
from ..services.notify import notify
from .catalog import product_out

router = APIRouter(prefix="/rfq", tags=["rfq"])


def bid_out(b: Bid, rank: int | None = None) -> BidOut:
    out = BidOut.model_validate(b)
    out.supplier = b.supplier
    out.items = []
    for it in b.items:
        io = BidItemOut.model_validate(it)
        io.line_total = round(it.unit_price * it.quantity, 2)
        out.items.append(io)
    out.rank = rank
    out.rfq_title = b.rfq.title if b.rfq else ""
    return out


def rfq_out(r: RFQ, db: Session, viewer: User | None = None, detail: bool = False,
            my_supplier: Supplier | None = None) -> RFQOut | RFQDetailOut:
    base = RFQDetailOut if detail else RFQOut
    out = base.model_validate(r)
    out.buyer_name = r.buyer.company_name or r.buyer.full_name if r.buyer else ""
    out.items = []
    for it in r.items:
        io = RFQItemOut.model_validate(it)
        if it.product:
            s = pricing.summarize(db, it.product_id, r.city or None) if detail else {}
            io.product = product_out(it.product)
            io.market_min, io.market_avg = s.get("min_price"), s.get("avg_price")
        out.items.append(io)
    live = [b for b in r.bids if b.status != "withdrawn"]
    out.bid_count = len(live)
    out.best_total = min((b.total for b in live), default=None)
    if my_supplier:
        mine = next((b for b in r.bids if b.supplier_id == my_supplier.id), None)
        out.my_bid = bid_out(mine) if mine else None
    if detail:
        is_owner = viewer and (viewer.id == r.buyer_id or viewer.role == "admin")
        if is_owner:
            ranked = sorted(live, key=lambda b: b.total)
            out.bids = [bid_out(b, i + 1) for i, b in enumerate(ranked)]
        else:
            out.bids = []
    return out


def _totals(items: list[BidItem], delivery_fee: float) -> tuple[float, float, float]:
    subtotal = round(sum(i.unit_price * i.quantity for i in items) + delivery_fee, 2)
    vat = round(subtotal * VAT_RATE, 2)
    return subtotal, vat, round(subtotal + vat, 2)


@router.post("", response_model=RFQDetailOut, status_code=201)
def create_rfq(body: RFQIn, user: User = Depends(require_buyer), db: Session = Depends(get_db)):
    rfq = RFQ(buyer_id=user.id, title=body.title, description=body.description, project_name=body.project_name,
              city=body.city or user.city, delivery_address=body.delivery_address, needed_by=body.needed_by,
              closes_at=body.closes_at or (utcnow() + timedelta(days=7)), visibility=body.visibility,
              status="open" if body.publish else "draft")
    db.add(rfq)
    db.flush()
    for it in body.items:
        product = db.get(Product, it.product_id) if it.product_id else None
        desc = it.description or (product.name_ar if product else "")
        if not desc:
            raise HTTPException(400, "Each item needs a product or a description")
        db.add(RFQItem(rfq_id=rfq.id, product_id=it.product_id, description=desc, quantity=it.quantity,
                       unit=it.unit or (product.unit if product else ""), target_price=it.target_price, notes=it.notes))
    db.flush()
    db.refresh(rfq)
    rfq.category_ids = matching.rfq_category_ids(db, rfq)
    for sid in body.invited_supplier_ids:
        if db.get(Supplier, sid):
            db.add(RFQInvite(rfq_id=rfq.id, supplier_id=sid))
    if rfq.status == "open":
        _notify_suppliers(db, rfq)
    db.add(AuditLog(actor_id=user.id, action="rfq.create", entity="rfq", entity_id=rfq.id))
    db.commit()
    db.refresh(rfq)
    return rfq_out(rfq, db, user, detail=True)


def _notify_suppliers(db: Session, rfq: RFQ) -> int:
    if rfq.visibility == "invited":
        targets = [db.get(Supplier, inv.supplier_id) for inv in rfq.invites]
    else:
        targets = matching.matching_suppliers(db, rfq)
    n = 0
    for s in targets:
        if s and s.user_id:
            notify(db, s.user_id, f"طلب تسعير جديد: {rfq.title}", f"{len(rfq.items)} بند — {rfq.city}", "rfq", "rfq", rfq.id)
            n += 1
    return n


@router.get("/mine", response_model=list[RFQOut])
def my_rfqs(status: str | None = None, user: User = Depends(require_buyer), db: Session = Depends(get_db)):
    q = db.query(RFQ).filter(RFQ.buyer_id == user.id)
    if status:
        q = q.filter(RFQ.status == status)
    return [rfq_out(r, db, user) for r in q.order_by(RFQ.created_at.desc()).all()]


@router.get("/open", response_model=list[RFQOut])
def open_rfqs(city: str | None = None, only_matching: bool = True, page: int = Query(1, ge=1), size: int = Query(20, le=100),
              supplier: Supplier = Depends(get_my_supplier), db: Session = Depends(get_db)):
    """RFQs a supplier can bid on: public ones (matching its categories) plus the ones it was invited to."""
    q = db.query(RFQ).filter(RFQ.status == "open")
    if city:
        q = q.filter(RFQ.city == city)
    rows = q.order_by(RFQ.created_at.desc()).all()
    invited = {inv.rfq_id for inv in db.query(RFQInvite).filter(RFQInvite.supplier_id == supplier.id).all()}
    my_cats = set(supplier.category_ids or [])
    out = []
    for r in rows:
        if r.visibility == "invited" and r.id not in invited:
            continue
        if only_matching and my_cats and r.category_ids and not (my_cats & set(r.category_ids)) and r.id not in invited:
            continue
        out.append(rfq_out(r, db, my_supplier=supplier))
    start = (page - 1) * size
    return out[start:start + size]


@router.get("/bids/mine", response_model=list[BidOut])
def my_bids(supplier: Supplier = Depends(get_my_supplier), db: Session = Depends(get_db)):
    rows = db.query(Bid).filter(Bid.supplier_id == supplier.id).order_by(Bid.updated_at.desc()).all()
    return [bid_out(b) for b in rows]


@router.get("/{rfq_id}", response_model=RFQDetailOut)
def rfq_detail(rfq_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.get(RFQ, rfq_id)
    if not r:
        raise HTTPException(404, "RFQ not found")
    my_supplier = None
    if user.role == "supplier":
        my_supplier = db.query(Supplier).filter(Supplier.user_id == user.id).first()
        invited = my_supplier and db.get(RFQInvite, (r.id, my_supplier.id))
        if r.status == "draft" or (r.visibility == "invited" and not invited):
            raise HTTPException(403, "Not allowed to view this RFQ")
    elif user.role == "buyer" and r.buyer_id != user.id:
        raise HTTPException(403, "Not your RFQ")
    return rfq_out(r, db, user, detail=True, my_supplier=my_supplier)


@router.post("/{rfq_id}/publish", response_model=RFQDetailOut)
def publish(rfq_id: int, user: User = Depends(require_buyer), db: Session = Depends(get_db)):
    r = db.get(RFQ, rfq_id)
    if not r or (r.buyer_id != user.id and user.role != "admin"):
        raise HTTPException(404, "RFQ not found")
    if r.status != "draft":
        raise HTTPException(400, "Only drafts can be published")
    r.status = "open"
    r.closes_at = r.closes_at or utcnow() + timedelta(days=7)
    _notify_suppliers(db, r)
    db.commit()
    return rfq_out(r, db, user, detail=True)


@router.post("/{rfq_id}/close", response_model=RFQDetailOut)
def close(rfq_id: int, user: User = Depends(require_buyer), db: Session = Depends(get_db)):
    r = db.get(RFQ, rfq_id)
    if not r or (r.buyer_id != user.id and user.role != "admin"):
        raise HTTPException(404, "RFQ not found")
    if r.status not in ("open", "draft"):
        raise HTTPException(400, f"Cannot close an RFQ in status {r.status}")
    r.status = "cancelled" if r.status == "draft" else "closed"
    db.commit()
    return rfq_out(r, db, user, detail=True)


@router.post("/{rfq_id}/bids", response_model=BidOut, status_code=201)
def submit_bid(rfq_id: int, body: BidIn, supplier: Supplier = Depends(get_my_supplier), db: Session = Depends(get_db)):
    r = db.get(RFQ, rfq_id)
    if not r or r.status != "open":
        raise HTTPException(400, "RFQ is not open for bids")
    if r.closes_at and r.closes_at < utcnow():
        r.status = "closed"
        db.commit()
        raise HTTPException(400, "RFQ deadline has passed")
    if r.visibility == "invited" and not db.get(RFQInvite, (r.id, supplier.id)):
        raise HTTPException(403, "You were not invited to this RFQ")
    items_by_id = {it.id: it for it in r.items}
    bid = db.query(Bid).filter(Bid.rfq_id == r.id, Bid.supplier_id == supplier.id).first()
    if bid and bid.status in ("awarded", "rejected"):
        raise HTTPException(400, "This bid has already been decided")
    if not bid:
        bid = Bid(rfq_id=r.id, supplier_id=supplier.id)
        db.add(bid)
        db.flush()
    else:
        for old in list(bid.items):
            db.delete(old)
        db.flush()
    new_items = []
    for it in body.items:
        rfq_item = items_by_id.get(it.rfq_item_id)
        if not rfq_item:
            raise HTTPException(400, f"Unknown RFQ item {it.rfq_item_id}")
        bi = BidItem(bid_id=bid.id, rfq_item_id=rfq_item.id, unit_price=it.unit_price,
                     quantity=it.quantity or rfq_item.quantity, brand=it.brand, notes=it.notes)
        db.add(bi)
        new_items.append(bi)
    bid.delivery_days, bid.delivery_fee = body.delivery_days, body.delivery_fee
    bid.valid_until, bid.payment_terms, bid.notes = body.valid_until, body.payment_terms, body.notes
    bid.status = "submitted"
    bid.subtotal, bid.vat, bid.total = _totals(new_items, body.delivery_fee)
    bid.updated_at = utcnow()
    notify(db, r.buyer_id, f"عرض سعر جديد على «{r.title}»", f"{supplier.name}: {bid.total:,.2f} ر.س شامل الضريبة",
           "bid", "rfq", r.id)
    db.commit()
    db.refresh(bid)
    return bid_out(bid)


@router.post("/{rfq_id}/bids/{bid_id}/withdraw", response_model=BidOut)
def withdraw_bid(rfq_id: int, bid_id: int, supplier: Supplier = Depends(get_my_supplier), db: Session = Depends(get_db)):
    bid = db.get(Bid, bid_id)
    if not bid or bid.rfq_id != rfq_id or bid.supplier_id != supplier.id:
        raise HTTPException(404, "Bid not found")
    if bid.status != "submitted":
        raise HTTPException(400, "Only submitted bids can be withdrawn")
    bid.status = "withdrawn"
    db.commit()
    return bid_out(bid)


@router.post("/{rfq_id}/award/{bid_id}")
def award(rfq_id: int, bid_id: int, user: User = Depends(require_buyer), db: Session = Depends(get_db)):
    r = db.get(RFQ, rfq_id)
    if not r or (r.buyer_id != user.id and user.role != "admin"):
        raise HTTPException(404, "RFQ not found")
    if r.status not in ("open", "closed"):
        raise HTTPException(400, f"Cannot award an RFQ in status {r.status}")
    winner = db.get(Bid, bid_id)
    if not winner or winner.rfq_id != r.id or winner.status != "submitted":
        raise HTTPException(400, "Bid is not eligible")
    items_by_id = {it.id: it for it in r.items}
    order = Order(buyer_id=r.buyer_id, supplier_id=winner.supplier_id, rfq_id=r.id, bid_id=winner.id,
                  subtotal=winner.subtotal, vat=winner.vat, delivery_fee=winner.delivery_fee, total=winner.total,
                  delivery_address=r.delivery_address, city=r.city, notes=f"Awarded from RFQ #{r.id}")
    db.add(order)
    db.flush()
    for bi in winner.items:
        ri = items_by_id[bi.rfq_item_id]
        db.add(OrderItem(order_id=order.id, product_id=ri.product_id, description=ri.description, quantity=bi.quantity,
                         unit=ri.unit, unit_price=bi.unit_price, line_total=round(bi.unit_price * bi.quantity, 2)))
    for b in r.bids:
        if b.id == winner.id:
            b.status = "awarded"
            notify(db, b.supplier.user_id, f"🎉 تمت ترسية «{r.title}» عليكم", f"طلب رقم #{order.id} بقيمة {b.total:,.2f} ر.س",
                   "award", "order", order.id) if b.supplier.user_id else None
        elif b.status == "submitted":
            b.status = "rejected"
            if b.supplier.user_id:
                notify(db, b.supplier.user_id, f"لم تتم الترسية عليكم: «{r.title}»", "", "bid_lost", "rfq", r.id)
    r.status = "awarded"
    db.add(AuditLog(actor_id=user.id, action="rfq.award", entity="rfq", entity_id=r.id, detail={"bid_id": winner.id, "order_id": order.id}))
    db.commit()
    return {"rfq_id": r.id, "order_id": order.id, "bid_id": winner.id, "total": winner.total}
