from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from .. import config
from ..db import get_db
from ..models import Category, Product
from ..services import pricing

router = APIRouter(prefix="/market", tags=["market"])


@router.get("/stats")
def stats(db: Session = Depends(get_db)):
    return pricing.public_stats(db)


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
