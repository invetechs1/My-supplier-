"""Platform administration: KPIs, users, supplier verification, categories, external price sources."""
from datetime import timedelta

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..config import STALE_OFFER_DAYS
from ..db import get_db
from ..models import (RFQ, AuditLog, Bid, Category, Dispute, JobRun, NotificationDelivery, Offer, Order, Payment, Payout,
                      PriceSource, Product, Supplier, SupplierDocument, User, utcnow)
from ..schemas import (CategoryIn, CategoryOut, DeliveryOut, DisputeOut, DisputeResolveIn, DocumentReviewIn, ImportResult, PaymentOut,
                       PayoutOut, PriceSourceIn, PriceSourceOut, SupplierDocumentOut, SupplierOut, UserOut)
from ..security import require_admin
from ..services import ingestion, jobs, payments, pricing
from ..services.notify import notify
from .suppliers import supplier_out

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db)):
    now = utcnow()
    month_ago = now - timedelta(days=30)
    orders = db.query(Order).all()
    gmv = sum(o.total for o in orders if o.status != "cancelled")
    gmv_30d = sum(o.total for o in orders if o.status != "cancelled" and o.created_at >= month_ago)
    by_status = {}
    for o in orders:
        by_status[o.status] = by_status.get(o.status, 0) + 1
    cat_counts = (db.query(Category.name_ar, Category.name_en, func.count(Product.id))
                  .join(Product, Product.category_id == Category.id).group_by(Category.id)
                  .order_by(func.count(Product.id).desc()).limit(8).all())
    # daily series for the last 30 days: RFQs and orders
    series = []
    for i in range(29, -1, -1):
        day = (now - timedelta(days=i)).date()
        series.append({
            "date": day.isoformat(),
            "rfqs": db.query(func.count(RFQ.id)).filter(func.date(RFQ.created_at) == day.isoformat()).scalar() or 0,
            "orders": db.query(func.count(Order.id)).filter(func.date(Order.created_at) == day.isoformat()).scalar() or 0,
            "gmv": round(db.query(func.coalesce(func.sum(Order.total), 0)).filter(func.date(Order.created_at) == day.isoformat(),
                         Order.status != "cancelled").scalar() or 0, 2),
        })
    return {
        "users": db.query(func.count(User.id)).scalar(),
        "buyers": db.query(func.count(User.id)).filter(User.role == "buyer").scalar(),
        "suppliers": db.query(func.count(Supplier.id)).filter(Supplier.is_external.is_(False)).scalar(),
        "suppliers_pending": db.query(func.count(Supplier.id)).filter(Supplier.is_external.is_(False), Supplier.verified.is_(False)).scalar(),
        "external_sources": db.query(func.count(Supplier.id)).filter(Supplier.is_external.is_(True)).scalar(),
        "products": db.query(func.count(Product.id)).scalar(),
        "offers": db.query(func.count(Offer.id)).scalar(),
        "stale_offers": db.query(func.count(Offer.id)).filter(Offer.updated_at < now - timedelta(days=STALE_OFFER_DAYS)).scalar(),
        "rfqs_open": db.query(func.count(RFQ.id)).filter(RFQ.status == "open").scalar(),
        "rfqs_total": db.query(func.count(RFQ.id)).scalar(),
        "bids": db.query(func.count(Bid.id)).scalar(),
        "orders": len(orders),
        "orders_by_status": by_status,
        "gmv": round(gmv, 2),
        "gmv_30d": round(gmv_30d, 2),
        "take_rate_pct": 2.5,
        "est_revenue_30d": round(gmv_30d * 0.025, 2),
        "top_categories": [{"name_ar": a, "name_en": b, "products": c} for a, b, c in cat_counts],
        "series": series,
        "new_users_7d": db.query(func.count(User.id)).filter(User.created_at >= now - timedelta(days=7)).scalar(),
    }


@router.get("/users", response_model=list[UserOut])
def users(role: str | None = None, q: str = "", db: Session = Depends(get_db)):
    query = db.query(User)
    if role:
        query = query.filter(User.role == role)
    if q:
        like = f"%{q}%"
        query = query.filter((User.email.ilike(like)) | (User.full_name.ilike(like)) | (User.company_name.ilike(like)))
    out = []
    for u in query.order_by(User.created_at.desc()).limit(500).all():
        item = UserOut.model_validate(u)
        item.supplier_id = u.supplier.id if u.supplier else None
        out.append(item)
    return out


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, is_active: bool | None = None, role: str | None = None, db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    if is_active is not None:
        u.is_active = is_active
    if role in ("buyer", "supplier", "admin"):
        u.role = role
        if role == "supplier" and not u.supplier:
            db.add(Supplier(user_id=u.id, name=u.company_name or u.full_name, city=u.city))
    db.commit()
    db.refresh(u)
    item = UserOut.model_validate(u)
    item.supplier_id = u.supplier.id if u.supplier else None
    return item


@router.get("/suppliers", response_model=list[SupplierOut])
def suppliers(verified: bool | None = None, db: Session = Depends(get_db)):
    q = db.query(Supplier).filter(Supplier.is_external.is_(False))
    if verified is not None:
        q = q.filter(Supplier.verified.is_(verified))
    return [supplier_out(s, db) for s in q.order_by(Supplier.created_at.desc()).all()]


@router.post("/suppliers/{supplier_id}/verify", response_model=SupplierOut)
def verify_supplier(supplier_id: int, verified: bool = True, plan: str | None = None, db: Session = Depends(get_db)):
    s = db.get(Supplier, supplier_id)
    if not s:
        raise HTTPException(404, "Supplier not found")
    s.verified = verified
    if plan in ("free", "pro", "enterprise"):
        s.plan = plan
    if s.user_id:
        notify(db, s.user_id, "تم توثيق حسابكم كمورّد ✅" if verified else "تم إيقاف توثيق حسابكم", "", "account")
    db.commit()
    return supplier_out(s, db)


@router.post("/categories", response_model=CategoryOut, status_code=201)
def create_category(body: CategoryIn, db: Session = Depends(get_db)):
    if db.query(Category).filter(Category.slug == body.slug).first():
        raise HTTPException(409, "Slug exists")
    c = Category(**body.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    return CategoryOut.model_validate(c)


@router.put("/categories/{category_id}", response_model=CategoryOut)
def update_category(category_id: int, body: CategoryIn, db: Session = Depends(get_db)):
    c = db.get(Category, category_id)
    if not c:
        raise HTTPException(404, "Category not found")
    for k, v in body.model_dump().items():
        setattr(c, k, v)
    db.commit()
    return CategoryOut.model_validate(c)


@router.delete("/products/{product_id}", status_code=204)
def deactivate_product(product_id: int, db: Session = Depends(get_db)):
    p = db.get(Product, product_id)
    if not p:
        raise HTTPException(404, "Product not found")
    p.is_active = False
    db.commit()


@router.get("/price-alerts")
def price_alerts(db: Session = Depends(get_db)):
    """Data-quality view: stale offers and outliers far from the product median."""
    stale_cutoff = utcnow() - timedelta(days=STALE_OFFER_DAYS)
    stale = db.query(Offer).filter(Offer.updated_at < stale_cutoff).order_by(Offer.updated_at).limit(100).all()
    outliers = []
    for pid, in db.query(Offer.product_id).distinct().all():
        s = pricing.summarize(db, pid)
        med = s.get("median_price")
        if not med or s.get("offer_count", 0) < 3:
            continue
        for o in pricing.active_offers_query(db, pid).all():
            ex, _ = pricing.offer_prices(o)
            dev = (ex - med) / med * 100
            if abs(dev) > 35:
                outliers.append({"offer_id": o.id, "product": o.product.name_ar, "supplier": o.supplier.name, "city": o.city,
                                 "price": ex, "median": med, "deviation_pct": round(dev, 1)})
    return {
        "stale": [{"offer_id": o.id, "product": o.product.name_ar, "supplier": o.supplier.name, "city": o.city,
                   "price": o.price, "updated_at": o.updated_at} for o in stale],
        "outliers": sorted(outliers, key=lambda r: -abs(r["deviation_pct"]))[:100],
    }


# ---- external price sources ----
@router.get("/sources", response_model=list[PriceSourceOut])
def sources(db: Session = Depends(get_db)):
    return db.query(PriceSource).order_by(PriceSource.created_at.desc()).all()


@router.post("/sources", response_model=PriceSourceOut, status_code=201)
def create_source(body: PriceSourceIn, db: Session = Depends(get_db)):
    s = PriceSource(**body.model_dump())
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@router.delete("/sources/{source_id}", status_code=204)
def delete_source(source_id: int, db: Session = Depends(get_db)):
    s = db.get(PriceSource, source_id)
    if s:
        db.delete(s)
        db.commit()


@router.post("/sources/{source_id}/fetch", response_model=ImportResult)
def fetch(source_id: int, db: Session = Depends(get_db)):
    s = db.get(PriceSource, source_id)
    if not s:
        raise HTTPException(404, "Source not found")
    return ingestion.fetch_source(db, s)


@router.post("/sources/{source_id}/upload", response_model=ImportResult)
async def upload(source_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    s = db.get(PriceSource, source_id)
    if not s:
        raise HTTPException(404, "Source not found")
    content = await file.read()
    kind = "json" if (file.filename or "").lower().endswith(".json") else "csv"
    try:
        rows = ingestion.parse_rows(content, kind)
    except Exception as exc:
        raise HTTPException(400, f"Could not parse file: {exc}")
    supplier = db.get(Supplier, s.supplier_id) if s.supplier_id else None
    result = ingestion.import_rows(db, rows, supplier=supplier, source="external", source_name=s.name, default_city=s.city)
    s.last_fetched_at = utcnow()
    s.imported_rows = result["created_offers"] + result["updated_offers"]
    s.last_status = f"upload ok: {s.imported_rows} rows"
    db.commit()
    return result


@router.get("/audit")
def audit(limit: int = 100, db: Session = Depends(get_db)):
    rows = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).all()
    return [{"id": r.id, "actor_id": r.actor_id, "action": r.action, "entity": r.entity, "entity_id": r.entity_id,
             "detail": r.detail, "created_at": r.created_at} for r in rows]


# ---- finance ----
def _payment_out(p: Payment) -> PaymentOut:
    out = PaymentOut.model_validate(p)
    out.supplier_name = p.supplier.name if p.supplier else ""
    out.buyer_name = (p.buyer.company_name or p.buyer.full_name) if p.buyer else ""
    return out


@router.get("/finance")
def finance(db: Session = Depends(get_db)):
    pays = db.query(Payment).all()
    payouts = db.query(Payout).all()
    month_ago = utcnow() - timedelta(days=30)
    paid = [p for p in pays if p.status in ("paid", "released")]
    return {
        "volume_paid": round(sum(p.amount for p in paid), 2),
        "volume_paid_30d": round(sum(p.amount for p in paid if p.paid_at and p.paid_at >= month_ago), 2),
        "fees_earned": round(sum(p.platform_fee for p in paid), 2),
        "fees_earned_30d": round(sum(p.platform_fee for p in paid if p.paid_at and p.paid_at >= month_ago), 2),
        "escrow_held": round(sum(p.supplier_net for p in pays if p.status == "paid"), 2),
        "payouts_pending": round(sum(x.amount for x in payouts if x.status == "pending"), 2),
        "payouts_paid": round(sum(x.amount for x in payouts if x.status == "paid"), 2),
        "refunded": round(sum(p.amount for p in pays if p.status == "refunded"), 2),
        "pending_transfers": sum(1 for p in pays if p.status == "pending_transfer"),
        "by_method": {m: sum(1 for p in paid if p.method == m) for m in {p.method for p in paid}},
        "fee_pct": payments.config.PLATFORM_FEE_PCT,
        "provider": payments.config.PAYMENT_PROVIDER,
    }


@router.get("/payments", response_model=list[PaymentOut])
def admin_payments(status: str | None = None, db: Session = Depends(get_db)):
    q = db.query(Payment)
    if status:
        q = q.filter(Payment.status == status)
    return [_payment_out(p) for p in q.order_by(Payment.id.desc()).limit(300).all()]


@router.post("/payments/{payment_id}/confirm-transfer", response_model=PaymentOut)
def confirm_transfer(payment_id: int, reference: str = "", db: Session = Depends(get_db)):
    p = db.get(Payment, payment_id)
    if not p or p.status != "pending_transfer":
        raise HTTPException(400, "Payment is not awaiting a bank transfer")
    return _payment_out(payments.mark_paid(db, p, reference=reference))


@router.post("/payments/{payment_id}/refund", response_model=PaymentOut)
def admin_refund(payment_id: int, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    p = db.get(Payment, payment_id)
    if not p:
        raise HTTPException(404, "Payment not found")
    return _payment_out(payments.refund(db, p, user))


@router.get("/payouts", response_model=list[PayoutOut])
def admin_payouts(status: str | None = None, db: Session = Depends(get_db)):
    q = db.query(Payout)
    if status:
        q = q.filter(Payout.status == status)
    out = []
    for x in q.order_by(Payout.id.desc()).limit(300).all():
        o = PayoutOut.model_validate(x)
        o.supplier_name = x.supplier.name if x.supplier else ""
        out.append(o)
    return out


@router.post("/payouts/{payout_id}/paid", response_model=PayoutOut)
def mark_payout_paid(payout_id: int, reference: str = "", db: Session = Depends(get_db)):
    x = db.get(Payout, payout_id)
    if not x or x.status == "paid":
        raise HTTPException(400, "Payout not found or already paid")
    x.status, x.reference, x.paid_at = "paid", reference, utcnow()
    if x.supplier and x.supplier.user_id:
        notify(db, x.supplier.user_id, f"تم تحويل {x.amount:,.2f} ر.س إلى حسابكم", f"مرجع التحويل: {reference}", "payout", "order", x.order_id)
    db.commit()
    o = PayoutOut.model_validate(x)
    o.supplier_name = x.supplier.name if x.supplier else ""
    return o


@router.get("/deliveries", response_model=list[DeliveryOut])
def deliveries(status: str | None = None, db: Session = Depends(get_db)):
    q = db.query(NotificationDelivery)
    if status:
        q = q.filter(NotificationDelivery.status == status)
    return q.order_by(NotificationDelivery.id.desc()).limit(300).all()


@router.post("/deliveries/{delivery_id}/retry", response_model=DeliveryOut)
def retry_delivery(delivery_id: int, db: Session = Depends(get_db)):
    d = db.get(NotificationDelivery, delivery_id)
    if not d:
        raise HTTPException(404, "Delivery not found")
    d.status, d.attempts, d.next_attempt_at = "queued", 0, utcnow()
    db.commit()
    return d


@router.get("/jobs")
def job_runs(db: Session = Depends(get_db)):
    rows = db.query(JobRun).order_by(JobRun.id.desc()).limit(50).all()
    return {"jobs": list(jobs.JOBS.keys()),
            "runs": [{"id": r.id, "name": r.name, "status": r.status, "detail": r.detail, "started_at": r.started_at, "finished_at": r.finished_at} for r in rows]}


@router.post("/jobs/{name}/run")
def run_job_now(name: str, db: Session = Depends(get_db)):
    if name not in jobs.JOBS:
        raise HTTPException(404, "Unknown job")
    return {"name": name, "result": jobs.run_job(name, db)}


# ---- supplier documents ----
@router.get("/documents", response_model=list[SupplierDocumentOut])
def documents(status: str | None = "pending", supplier_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(SupplierDocument)
    if status:
        q = q.filter(SupplierDocument.status == status)
    if supplier_id:
        q = q.filter(SupplierDocument.supplier_id == supplier_id)
    out = []
    for d in q.order_by(SupplierDocument.id.desc()).limit(300).all():
        o = SupplierDocumentOut.model_validate(d)
        s = db.get(Supplier, d.supplier_id)
        o.supplier_name = s.name if s else ""
        out.append(o)
    return out


@router.post("/documents/{doc_id}/review", response_model=SupplierDocumentOut)
def review_document(doc_id: int, body: DocumentReviewIn, db: Session = Depends(get_db)):
    d = db.get(SupplierDocument, doc_id)
    if not d:
        raise HTTPException(404, "Document not found")
    d.status, d.note, d.expires_at, d.reviewed_at = body.status, body.note, body.expires_at, utcnow()
    s = db.get(Supplier, d.supplier_id)
    if s and s.user_id:
        notify(db, s.user_id, f"مستند {d.kind}: {'مقبول ✅' if body.status == 'approved' else 'مرفوض'}", body.note, "account")
    db.commit()
    o = SupplierDocumentOut.model_validate(d)
    o.supplier_name = s.name if s else ""
    return o


# ---- disputes ----
@router.get("/disputes", response_model=list[DisputeOut])
def disputes(status: str | None = "open", db: Session = Depends(get_db)):
    from .orders import _dispute_out
    q = db.query(Dispute)
    if status:
        q = q.filter(Dispute.status == status)
    return [_dispute_out(d, db) for d in q.order_by(Dispute.id.desc()).limit(300).all()]


@router.post("/disputes/{dispute_id}/resolve", response_model=DisputeOut)
def resolve_dispute(dispute_id: int, body: DisputeResolveIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    from .orders import _dispute_out
    d = db.get(Dispute, dispute_id)
    if not d or d.status != "open":
        raise HTTPException(400, "Dispute not found or already closed")
    d.status, d.resolution, d.resolved_at = body.status, body.resolution, utcnow()
    o = db.get(Order, d.order_id)
    if body.refund:
        paid = db.query(Payment).filter(Payment.order_id == o.id, Payment.status == "paid").first()
        if paid:
            payments.refund(db, paid, user)
            d.refunded = True
        o.status = "cancelled"
    for uid in {o.buyer_id, o.supplier.user_id}:
        if uid:
            notify(db, uid, f"قرار النزاع على الطلب #{o.id}: {body.status}", body.resolution, "dispute", "order", o.id)
    db.commit()
    return _dispute_out(d, db)


# ======================================================================
# v1.4 — e-commerce back office: orders, RFQs, catalog, settings, coupons, broadcast, reviews, exports
# ======================================================================
import csv
import io

from fastapi.responses import StreamingResponse

from ..models import Coupon, Review, RFQ as _RFQ
from ..schemas import AdminOrderStatusIn, BroadcastIn, CouponIn, CouponOut, OrderOut, ProductIn, ProductOut, ReviewOut, RFQOut, SettingsIn
from ..services import settings as platform_settings
from .catalog import product_out
from .orders import order_out
from .rfq import rfq_out


# ---- orders ----
@router.get("/orders", response_model=list[OrderOut])
def admin_orders(status: str | None = None, payment_status: str | None = None, q: str = "", supplier_id: int | None = None,
                 limit: int = 300, db: Session = Depends(get_db)):
    query = db.query(Order)
    if status:
        query = query.filter(Order.status == status)
    if payment_status:
        query = query.filter(Order.payment_status == payment_status)
    if supplier_id:
        query = query.filter(Order.supplier_id == supplier_id)
    rows = query.order_by(Order.id.desc()).limit(limit).all()
    if q:
        ql = q.lower()
        rows = [o for o in rows if ql in (o.buyer.company_name or o.buyer.full_name or "").lower() or ql in (o.supplier.name or "").lower() or ql == str(o.id)]
    return [order_out(o, db) for o in rows]


@router.get("/orders/{order_id}", response_model=OrderOut)
def admin_order(order_id: int, db: Session = Depends(get_db)):
    o = db.get(Order, order_id)
    if not o:
        raise HTTPException(404, "Order not found")
    return order_out(o, db)


@router.patch("/orders/{order_id}/status", response_model=OrderOut)
def admin_order_status(order_id: int, body: AdminOrderStatusIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Admin override of the order state machine (support cases). Delivered releases escrow; cancelled refunds."""
    o = db.get(Order, order_id)
    if not o:
        raise HTTPException(404, "Order not found")
    prev = o.status
    o.status = body.status
    if body.note:
        o.notes = (o.notes + f"\n[admin] {body.note}").strip()
    if body.status == "delivered" and prev != "delivered":
        payments.release_escrow(db, o)
    if body.status == "cancelled":
        paid = db.query(Payment).filter(Payment.order_id == o.id, Payment.status == "paid").first()
        if paid:
            payments.refund(db, paid, user)
    for uid in {o.buyer_id, o.supplier.user_id if o.supplier else None}:
        if uid:
            notify(db, uid, f"تحديث الطلب #{o.id} من إدارة المنصة: {body.status}", body.note, "order", "order", o.id)
    db.add(AuditLog(actor_id=user.id, action="order.admin_status", entity="order", entity_id=o.id, detail={"from": prev, "to": body.status}))
    db.commit()
    db.refresh(o)
    return order_out(o, db)


# ---- RFQs ----
@router.get("/rfqs", response_model=list[RFQOut])
def admin_rfqs(status: str | None = None, limit: int = 300, db: Session = Depends(get_db)):
    q = db.query(_RFQ)
    if status:
        q = q.filter(_RFQ.status == status)
    return [rfq_out(r, db) for r in q.order_by(_RFQ.id.desc()).limit(limit).all()]


@router.post("/rfqs/{rfq_id}/close", response_model=RFQOut)
def admin_close_rfq(rfq_id: int, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    r = db.get(_RFQ, rfq_id)
    if not r:
        raise HTTPException(404, "RFQ not found")
    r.status = "cancelled" if r.status == "draft" else "closed"
    db.add(AuditLog(actor_id=user.id, action="rfq.admin_close", entity="rfq", entity_id=r.id))
    db.commit()
    return rfq_out(r, db)


# ---- catalog management ----
@router.get("/products", response_model=list[ProductOut])
def admin_products(q: str = "", category_id: int | None = None, include_inactive: bool = True, limit: int = 500, db: Session = Depends(get_db)):
    query = db.query(Product)
    if not include_inactive:
        query = query.filter(Product.is_active.is_(True))
    if category_id:
        query = query.filter(Product.category_id == category_id)
    if q:
        like = f"%{q}%"
        query = query.filter((Product.name_ar.ilike(like)) | (Product.name_en.ilike(like)) | (Product.sku.ilike(like)) | (Product.brand.ilike(like)))
    rows = query.order_by(Product.id.desc()).limit(limit).all()
    summaries = pricing.bulk_summaries(db, [p.id for p in rows])
    return [product_out(p, summaries.get(p.id)) for p in rows]


@router.post("/products/{product_id}/activate", response_model=ProductOut)
def activate_product(product_id: int, db: Session = Depends(get_db)):
    p = db.get(Product, product_id)
    if not p:
        raise HTTPException(404, "Product not found")
    p.is_active = True
    db.commit()
    return product_out(p)


@router.put("/products/{product_id}", response_model=ProductOut)
def admin_update_product(product_id: int, body: ProductIn, db: Session = Depends(get_db)):
    p = db.get(Product, product_id)
    if not p:
        raise HTTPException(404, "Product not found")
    if body.sku and body.sku != p.sku and db.query(Product).filter(Product.sku == body.sku).first():
        raise HTTPException(409, "SKU already exists")
    for k, v in body.model_dump().items():
        if k == "sku" and not v:
            continue
        setattr(p, k, v)
    db.commit()
    db.refresh(p)
    return product_out(p)


@router.delete("/categories/{category_id}", status_code=204)
def delete_category(category_id: int, db: Session = Depends(get_db)):
    c = db.get(Category, category_id)
    if not c:
        raise HTTPException(404, "Category not found")
    if db.query(Product).filter(Product.category_id == c.id).count() or db.query(Category).filter(Category.parent_id == c.id).count():
        raise HTTPException(400, "Category still has products or sub-categories")
    db.delete(c)
    db.commit()


# ---- settings ----
@router.get("/settings")
def get_settings(db: Session = Depends(get_db)):
    return {"values": platform_settings.get_all(db),
            "schema": [{"key": k, "type": t, "description": d, "default": dflt} for k, (dflt, t, d) in platform_settings.DEFAULTS.items()]}


@router.put("/settings")
def put_settings(body: SettingsIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    values = platform_settings.set_many(db, body.values)
    db.add(AuditLog(actor_id=user.id, action="settings.update", entity="settings", detail={"keys": list(body.values.keys())}))
    db.commit()
    return {"values": values}


# ---- coupons ----
@router.get("/coupons", response_model=list[CouponOut])
def coupons_list(db: Session = Depends(get_db)):
    return db.query(Coupon).order_by(Coupon.id.desc()).all()


@router.post("/coupons", response_model=CouponOut, status_code=201)
def coupon_create(body: CouponIn, db: Session = Depends(get_db)):
    code = body.code.strip().upper()
    if db.query(Coupon).filter(Coupon.code == code).first():
        raise HTTPException(409, "Coupon code exists")
    c = Coupon(**{**body.model_dump(), "code": code})
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@router.put("/coupons/{coupon_id}", response_model=CouponOut)
def coupon_update(coupon_id: int, body: CouponIn, db: Session = Depends(get_db)):
    c = db.get(Coupon, coupon_id)
    if not c:
        raise HTTPException(404, "Coupon not found")
    for k, v in body.model_dump().items():
        setattr(c, k, v.strip().upper() if k == "code" else v)
    db.commit()
    return c


@router.delete("/coupons/{coupon_id}", status_code=204)
def coupon_delete(coupon_id: int, db: Session = Depends(get_db)):
    c = db.get(Coupon, coupon_id)
    if c:
        db.delete(c)
        db.commit()


# ---- broadcast announcements ----
@router.post("/broadcast")
def broadcast(body: BroadcastIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    q = db.query(User).filter(User.is_active.is_(True))
    if body.audience == "buyers":
        q = q.filter(User.role == "buyer")
    elif body.audience == "suppliers":
        q = q.filter(User.role == "supplier")
    n = 0
    for u in q.all():
        notify(db, u.id, body.title, body.body, "announcement")
        n += 1
    db.add(AuditLog(actor_id=user.id, action="broadcast", entity="notification", detail={"audience": body.audience, "recipients": n, "title": body.title}))
    db.commit()
    return {"recipients": n}


# ---- reviews moderation ----
@router.get("/reviews", response_model=list[ReviewOut])
def reviews(limit: int = 300, db: Session = Depends(get_db)):
    out = []
    for r in db.query(Review).order_by(Review.id.desc()).limit(limit).all():
        o = ReviewOut.model_validate(r)
        s = db.get(Supplier, r.supplier_id)
        b = db.get(User, r.buyer_id)
        o.supplier_name = s.name if s else ""
        o.buyer_name = (b.company_name or b.full_name) if b else ""
        out.append(o)
    return out


@router.delete("/reviews/{review_id}", status_code=204)
def delete_review(review_id: int, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    r = db.get(Review, review_id)
    if not r:
        raise HTTPException(404, "Review not found")
    s = db.get(Supplier, r.supplier_id)
    if s and s.rating_count > 1:
        s.rating = round((s.rating * s.rating_count - r.rating) / (s.rating_count - 1), 2)
        s.rating_count -= 1
    elif s:
        s.rating, s.rating_count = 0.0, 0
    db.delete(r)
    db.add(AuditLog(actor_id=user.id, action="review.delete", entity="review", entity_id=review_id))
    db.commit()


# ---- CSV exports ----
_EXPORTS = {
    "orders": (Order, ["id", "created_at", "status", "payment_status", "buyer_id", "supplier_id", "rfq_id", "subtotal", "discount", "vat", "delivery_fee", "total", "city", "coupon_code"]),
    "payments": (Payment, ["id", "created_at", "order_id", "provider", "method", "amount", "platform_fee", "supplier_net", "status", "provider_ref", "paid_at", "released_at", "refunded_at"]),
    "payouts": (Payout, ["id", "created_at", "supplier_id", "order_id", "amount", "status", "reference", "paid_at"]),
    "users": (User, ["id", "created_at", "email", "phone", "full_name", "role", "company_name", "city", "is_active", "phone_verified", "last_login_at"]),
    "suppliers": (Supplier, ["id", "created_at", "name", "city", "cr_number", "vat_number", "verified", "plan", "rating", "rating_count", "phone"]),
    "products": (Product, ["id", "sku", "category_id", "name_ar", "name_en", "brand", "unit", "is_active"]),
    "offers": (Offer, ["id", "supplier_id", "product_id", "city", "price", "includes_vat", "rental_period", "min_qty", "stock_status", "source", "updated_at"]),
    "rfqs": (_RFQ, ["id", "created_at", "buyer_id", "title", "city", "status", "visibility", "closes_at"]),
}


@router.get("/export/{name}.csv")
def export_csv(name: str, db: Session = Depends(get_db)):
    if name not in _EXPORTS:
        raise HTTPException(404, f"Unknown export — one of {', '.join(_EXPORTS)}")
    model, cols = _EXPORTS[name]
    buf = io.StringIO()
    buf.write("﻿")  # BOM so Excel opens Arabic correctly
    w = csv.writer(buf)
    w.writerow(cols)
    for row in db.query(model).order_by(model.id).all():
        w.writerow([getattr(row, c) for c in cols])
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="{name}.csv"'})


# ---- richer analytics for the dashboard ----
@router.get("/analytics")
def analytics(db: Session = Depends(get_db)):
    orders = db.query(Order).filter(Order.status != "cancelled").all()
    by_sup: dict[int, float] = {}
    for o in orders:
        by_sup[o.supplier_id] = by_sup.get(o.supplier_id, 0) + o.total
    sup_names = {s.id: s.name for s in db.query(Supplier).filter(Supplier.id.in_(list(by_sup) or [0])).all()}
    top_suppliers = sorted(({"supplier_id": k, "name": sup_names.get(k, ""), "gmv": round(v, 2)} for k, v in by_sup.items()), key=lambda r: -r["gmv"])[:8]
    demand: dict[int, float] = {}
    from ..models import RFQItem
    for it in db.query(RFQItem).filter(RFQItem.product_id.isnot(None)).all():
        demand[it.product_id] = demand.get(it.product_id, 0) + 1
    prods = {p.id: p for p in db.query(Product).filter(Product.id.in_(list(demand) or [0])).all()}
    top_demand = sorted(({"product_id": k, "name_ar": prods[k].name_ar, "name_en": prods[k].name_en, "rfq_lines": int(v)} for k, v in demand.items() if k in prods), key=lambda r: -r["rfq_lines"])[:8]
    rfqs = db.query(_RFQ).all()
    bids_total = db.query(func.count(Bid.id)).scalar() or 0
    funnel = {
        "rfqs": len(rfqs),
        "rfqs_with_bids": sum(1 for r in rfqs if any(b.status != "withdrawn" for b in r.bids)),
        "awarded": sum(1 for r in rfqs if r.status == "awarded"),
        "avg_bids_per_rfq": round(bids_total / len(rfqs), 2) if rfqs else 0,
        "orders_paid": sum(1 for o in orders if o.payment_status in ("paid", "released")),
        "orders_delivered": sum(1 for o in orders if o.status == "delivered"),
    }
    cities = {}
    for o in orders:
        cities[o.city or "—"] = cities.get(o.city or "—", 0) + o.total
    return {"top_suppliers": top_suppliers, "top_demand": top_demand, "funnel": funnel,
            "gmv_by_city": sorted(({"city": k, "gmv": round(v, 2)} for k, v in cities.items()), key=lambda r: -r["gmv"]),
            "avg_order_value": round(sum(o.total for o in orders) / len(orders), 2) if orders else 0}
