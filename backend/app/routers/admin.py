"""Platform administration: KPIs, users, supplier verification, categories, external price sources."""
from datetime import timedelta

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..config import STALE_OFFER_DAYS
from ..db import get_db
from ..models import (RFQ, AuditLog, Bid, Category, JobRun, NotificationDelivery, Offer, Order, Payment, Payout, PriceSource,
                      Product, Supplier, User, utcnow)
from ..schemas import (CategoryIn, CategoryOut, DeliveryOut, ImportResult, PaymentOut, PayoutOut, PriceSourceIn, PriceSourceOut,
                       SupplierOut, UserOut)
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
