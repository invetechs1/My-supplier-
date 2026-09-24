from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from .. import config
from ..db import get_db
from ..models import Category, Coupon, Product, Supplier, utcnow
from .catalog import product_out
from ..services import pricing, settings as platform_settings

router = APIRouter(prefix="/market", tags=["market"])


@router.get("/stats")
def stats(db: Session = Depends(get_db)):
    return {**pricing.public_stats(db), "settings": platform_settings.public(db)}


@router.get("/settings")
def public_settings(db: Session = Depends(get_db)):
    return platform_settings.public(db)


@router.get("/index")
def index(category_id: int | None = None, city: str | None = None, db: Session = Depends(get_db)):
    return pricing.market_index(db, category_id, city)


@router.get("/trending")
def trending_products(limit: int = 8, city: str | None = None, db: Session = Depends(get_db)):
    return pricing.trending(db, limit, city)


@router.get("/sitemap.xml", include_in_schema=False)
def sitemap(db: Session = Depends(get_db)):
    base = config.WEB_BASE_URL
    urls = [f"{base}/", f"{base}/catalog", f"{base}/suppliers", f"{base}/market", f"{base}/about", f"{base}/contact"]
    urls += [f"{base}/catalog?category_id={c.id}" for c in db.query(Category).all()]
    urls += [f"{base}/products/{p.id}" for p in db.query(Product).filter(Product.is_active.is_(True)).all()]
    body = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + "".join(f"<url><loc>{u.replace('&', '&amp;')}</loc></url>" for u in urls) + "</urlset>"
    return Response(body, media_type="application/xml")


@router.get("/home")
def home(db: Session = Depends(get_db)):
    """Storefront sections: best sellers, most viewed, new arrivals, top-rated suppliers, active deals."""
    def pack(prods):
        summaries = pricing.bulk_summaries(db, [p.id for p in prods])
        return [product_out(p, summaries.get(p.id)).model_dump() for p in prods]
    active = db.query(Product).filter(Product.is_active.is_(True))
    best = active.filter(Product.sold_qty > 0).order_by(Product.sold_qty.desc()).limit(8).all()
    if len(best) < 8:
        seen = {p.id for p in best}
        best += [p for p in active.order_by(Product.views.desc()).limit(16).all() if p.id not in seen][:8 - len(best)]
    popular = active.order_by(Product.views.desc(), Product.id.desc()).limit(8).all()
    newest = active.order_by(Product.id.desc()).limit(8).all()
    top_rated = active.filter(Product.rating_count > 0).order_by(Product.rating.desc(), Product.rating_count.desc()).limit(8).all()
    suppliers = (db.query(Supplier).filter(Supplier.is_external.is_(False), Supplier.verified.is_(True))
                 .order_by(Supplier.rating.desc(), Supplier.rating_count.desc()).limit(8).all())
    deals = db.query(Coupon).filter(Coupon.is_active.is_(True)).filter((Coupon.expires_at.is_(None)) | (Coupon.expires_at > utcnow())).order_by(Coupon.id.desc()).limit(4).all()
    return {
        "best_sellers": pack(best), "popular": pack(popular), "new_arrivals": pack(newest), "top_rated": pack(top_rated),
        "top_suppliers": [{"id": s.id, "name": s.name, "city": s.city, "rating": s.rating, "rating_count": s.rating_count, "logo_url": s.logo_url,
                           "category_ids": s.category_ids} for s in suppliers],
        "deals": [{"code": c.code, "kind": c.kind, "value": c.value, "min_order": c.min_order, "audience": c.audience, "expires_at": c.expires_at} for c in deals],
    }
