from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Category, Offer, PriceAlert, Product, User
from ..schemas import (CategoryOut, HistoryPoint, OfferOut, PagedProducts, PriceAlertIn, PriceAlertOut, PriceSummary, ProductDetailOut,
                       ProductIn, ProductOut)
from ..security import get_current_user, require_roles
from ..services import pricing, storage

router = APIRouter(prefix="/catalog", tags=["catalog"])


def product_out(p: Product, summary: dict | None = None) -> ProductOut:
    out = ProductOut.model_validate(p)
    if p.category:
        out.category_name_ar, out.category_name_en = p.category.name_ar, p.category.name_en
    if summary is not None:
        out.summary = PriceSummary(**summary)
    return out


def offer_out(o: Offer, with_product: bool = False) -> OfferOut:
    out = OfferOut.model_validate(o)
    out.price_ex_vat, out.price_inc_vat = pricing.offer_prices(o)
    if with_product:
        out.product = product_out(o.product)
    return out


@router.get("/categories", response_model=list[CategoryOut])
def categories(db: Session = Depends(get_db)):
    counts = dict(db.query(Product.category_id, func.count(Product.id)).filter(Product.is_active.is_(True))
                  .group_by(Product.category_id).all())
    cats = db.query(Category).order_by(Category.sort_order, Category.name_en).all()
    out = []
    for c in cats:
        item = CategoryOut.model_validate(c)
        item.product_count = counts.get(c.id, 0) + sum(counts.get(ch.id, 0) for ch in cats if ch.parent_id == c.id)
        out.append(item)
    return out


@router.get("/products", response_model=PagedProducts)
def products(q: str = "", category_id: int | None = None, city: str | None = None, brand: str | None = None,
             sort: str = Query("relevance", pattern="^(relevance|price_asc|price_desc|offers)$"),
             page: int = Query(1, ge=1), size: int = Query(24, ge=1, le=100), only_with_offers: bool = False,
             db: Session = Depends(get_db)):
    items, total, summaries = pricing.search_products(db, q, category_id, city, brand, sort, page, size, only_with_offers)
    return PagedProducts(items=[product_out(p, summaries[p.id]) for p in items], total=total, page=page, size=size)


@router.get("/brands", response_model=list[str])
def brands(db: Session = Depends(get_db)):
    return [b for (b,) in db.query(Product.brand).filter(Product.brand != "").distinct().order_by(Product.brand).all()]


@router.get("/cities", response_model=list[str])
def cities(db: Session = Depends(get_db)):
    return [c for (c,) in db.query(Offer.city).filter(Offer.city != "").distinct().order_by(Offer.city).all()]


@router.get("/products/{product_id}", response_model=ProductDetailOut)
def product_detail(product_id: int, city: str | None = None, db: Session = Depends(get_db)):
    p = db.get(Product, product_id)
    if not p or not p.is_active:
        raise HTTPException(404, "Product not found")
    offers = pricing.active_offers_query(db, product_id, city).all()
    offers.sort(key=lambda o: (o.rental_period != '', o.rental_period, pricing.offer_prices(o)[0], not o.supplier.verified))
    related = db.query(Product).filter(Product.category_id == p.category_id, Product.id != p.id, Product.is_active.is_(True)).limit(6).all()
    rel_summaries = pricing.bulk_summaries(db, [r.id for r in related], city)
    out = ProductDetailOut(**product_out(p, pricing.summarize(db, product_id, city)).model_dump())
    out.offers = [offer_out(o) for o in offers]
    out.history = [HistoryPoint(**h) for h in pricing.history_series(db, product_id, 90, city)]
    out.related = [product_out(r, rel_summaries[r.id]) for r in related]
    return out


@router.get("/compare", response_model=list[ProductDetailOut])
def compare(ids: str = Query(..., description="comma separated product ids"), city: str | None = None,
            db: Session = Depends(get_db)):
    pids = [int(x) for x in ids.split(",") if x.strip().isdigit()][:10]
    return [product_detail(pid, city, db) for pid in pids if db.get(Product, pid)]


@router.post("/products", response_model=ProductOut, status_code=201)
def create_product(body: ProductIn, user: User = Depends(require_roles("supplier", "admin")), db: Session = Depends(get_db)):
    if not db.get(Category, body.category_id):
        raise HTTPException(400, "Unknown category")
    sku = body.sku.strip() or f"P-{int(datetime.now().timestamp())}"
    if db.query(Product).filter(Product.sku == sku).first():
        raise HTTPException(409, "SKU already exists")
    p = Product(**body.model_dump(exclude={"sku"}), sku=sku, created_by=user.id)
    db.add(p)
    db.commit()
    db.refresh(p)
    return product_out(p)


@router.put("/products/{product_id}", response_model=ProductOut)
def update_product(product_id: int, body: ProductIn, user: User = Depends(require_roles("supplier", "admin")),
                   db: Session = Depends(get_db)):
    p = db.get(Product, product_id)
    if not p:
        raise HTTPException(404, "Product not found")
    if user.role != "admin" and p.created_by != user.id:
        raise HTTPException(403, "Only the creator or an admin can edit this product")
    for k, v in body.model_dump(exclude={"sku"}).items():
        setattr(p, k, v)
    db.commit()
    db.refresh(p)
    return product_out(p)


@router.post("/products/{product_id}/image", response_model=ProductOut)
async def upload_product_image(product_id: int, file: UploadFile = File(...), user: User = Depends(require_roles("supplier", "admin")),
                               db: Session = Depends(get_db)):
    p = db.get(Product, product_id)
    if not p:
        raise HTTPException(404, "Product not found")
    if user.role != "admin" and p.created_by != user.id:
        raise HTTPException(403, "Only the creator or an admin can change the image")
    data, ext, mime = await storage.read_upload(file, ("png", "jpg", "webp"))
    p.image_url = storage.save(data, ext, mime, "products")
    db.commit()
    return product_out(p)


# ---- price alerts (watchlist) ----
@router.get("/alerts", response_model=list[PriceAlertOut])
def my_alerts(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    alerts = db.query(PriceAlert).filter(PriceAlert.user_id == user.id, PriceAlert.is_active.is_(True)).all()
    out = []
    for a in alerts:
        item = PriceAlertOut.model_validate(a)
        p = db.get(Product, a.product_id)
        summary = pricing.summarize(db, a.product_id, a.city or None)
        item.product = product_out(p, summary) if p else None
        item.current_min = summary.get("min_price")
        out.append(item)
    return out


@router.post("/alerts", response_model=PriceAlertOut, status_code=201)
def add_alert(body: PriceAlertIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not db.get(Product, body.product_id):
        raise HTTPException(404, "Product not found")
    a = PriceAlert(user_id=user.id, **body.model_dump())
    db.add(a)
    db.commit()
    db.refresh(a)
    return PriceAlertOut.model_validate(a)


@router.delete("/alerts/{alert_id}", status_code=204)
def remove_alert(alert_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = db.get(PriceAlert, alert_id)
    if not a or a.user_id != user.id:
        raise HTTPException(404, "Alert not found")
    db.delete(a)
    db.commit()
