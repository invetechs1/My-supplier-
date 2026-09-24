"""Price aggregation across suppliers and external sources."""
from collections import defaultdict
from datetime import datetime, timedelta
from statistics import median

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..config import VAT_RATE
from ..models import Category, Offer, PriceHistory, Product, Supplier, utcnow


def offer_prices(offer: Offer) -> tuple[float, float]:
    """Return (price_ex_vat, price_inc_vat) normalised regardless of how the supplier entered it."""
    if offer.includes_vat:
        inc = offer.price
        ex = round(offer.price / (1 + VAT_RATE), 2)
    else:
        ex = offer.price
        inc = round(offer.price * (1 + VAT_RATE), 2)
    return ex, inc


def active_offers_query(db: Session, product_id: int | None = None, city: str | None = None):
    q = db.query(Offer).join(Product).filter(Product.is_active.is_(True), Offer.stock_status != "out_of_stock")
    q = q.filter(or_(Offer.valid_until.is_(None), Offer.valid_until >= utcnow()))
    if product_id is not None:
        q = q.filter(Offer.product_id == product_id)
    if city:
        q = q.filter(Offer.city == city)
    return q


def split_basis(offers: list[Offer]) -> tuple[list[Offer], str, dict]:
    """Sale offers are compared with sale offers; if a product is only rented, compare per the most common rental basis.
    Returns (offers used for the main stats, basis, extra rental info)."""
    sale = [o for o in offers if not o.rental_period]
    rent = [o for o in offers if o.rental_period]
    extra = {}
    if rent:
        _pref = {"day": 3, "week": 2, "month": 1}
        basis = max({o.rental_period for o in rent}, key=lambda b: (sum(1 for o in rent if o.rental_period == b), _pref.get(b, 0)))
        same = [o for o in rent if o.rental_period == basis]
        extra = {"rental_min_price": round(min(offer_prices(o)[0] for o in same), 2), "rental_basis": basis}
    if sale:
        return sale, "", extra
    return [o for o in rent if o.rental_period == extra["rental_basis"]], extra["rental_basis"], extra


def summarize(db: Session, product_id: int, city: str | None = None) -> dict:
    offers = active_offers_query(db, product_id, city).all()
    if not offers:
        return {"offer_count": 0, "supplier_count": 0, "registered_supplier_count": 0, "cities": []}
    all_offers = offers
    offers, basis, extra = split_basis(offers)
    prices = [offer_prices(o)[0] for o in offers]
    suppliers = {o.supplier_id for o in offers}
    registered = {o.supplier_id for o in offers if o.supplier and not o.supplier.is_external}
    cities = sorted({o.city for o in offers if o.city})
    cutoff = utcnow() - timedelta(days=30)
    past = (db.query(func.avg(PriceHistory.price)).filter(PriceHistory.product_id == product_id,
            PriceHistory.recorded_at <= cutoff, PriceHistory.recorded_at >= cutoff - timedelta(days=7)).scalar())
    avg_now = sum(prices) / len(prices)
    change = round((avg_now - past) / past * 100, 2) if past else None
    return {
        "min_price": round(min(prices), 2),
        "max_price": round(max(prices), 2),
        "avg_price": round(avg_now, 2),
        "median_price": round(median(prices), 2),
        "offer_count": len(all_offers),
        "supplier_count": len({o.supplier_id for o in all_offers}),
        "registered_supplier_count": len({o.supplier_id for o in all_offers if o.supplier and not o.supplier.is_external}),
        "last_updated": max(o.updated_at for o in all_offers),
        "change_30d_pct": change,
        "cities": sorted({o.city for o in all_offers if o.city}),
        "basis": basis,
        **extra,
    }


def bulk_summaries(db: Session, product_ids: list[int], city: str | None = None) -> dict[int, dict]:
    """One query for many products (used by search listings)."""
    if not product_ids:
        return {}
    q = active_offers_query(db, None, city).filter(Offer.product_id.in_(product_ids))
    grouped: dict[int, list[Offer]] = defaultdict(list)
    for o in q.all():
        grouped[o.product_id].append(o)
    cutoff = utcnow() - timedelta(days=30)
    hist_q = db.query(PriceHistory.product_id, func.avg(PriceHistory.price)).filter(
        PriceHistory.product_id.in_(product_ids), PriceHistory.recorded_at <= cutoff,
        PriceHistory.recorded_at >= cutoff - timedelta(days=7))
    if city:
        hist_q = hist_q.filter(PriceHistory.city == city)
    past = dict(hist_q.group_by(PriceHistory.product_id).all())
    out = {}
    for pid in product_ids:
        all_offers = grouped.get(pid, [])
        if not all_offers:
            out[pid] = {"offer_count": 0, "supplier_count": 0, "registered_supplier_count": 0, "cities": []}
            continue
        offers, basis, extra = split_basis(all_offers)
        prices = [offer_prices(o)[0] for o in offers]
        out[pid] = {
            "min_price": round(min(prices), 2),
            "max_price": round(max(prices), 2),
            "avg_price": round(sum(prices) / len(prices), 2),
            "median_price": round(median(prices), 2),
            "offer_count": len(all_offers),
            "supplier_count": len({o.supplier_id for o in all_offers}),
            "registered_supplier_count": len({o.supplier_id for o in all_offers if o.supplier and not o.supplier.is_external}),
            "last_updated": max(o.updated_at for o in all_offers),
            "cities": sorted({o.city for o in all_offers if o.city}),
            "basis": basis,
            **extra,
        }
        avg_now = out[pid]["avg_price"]
        out[pid]["change_30d_pct"] = round((avg_now - past[pid]) / past[pid] * 100, 2) if past.get(pid) else None
    return out


def history_series(db: Session, product_id: int, days: int = 90, city: str | None = None) -> list[dict]:
    since = utcnow() - timedelta(days=days)
    q = db.query(PriceHistory).filter(PriceHistory.product_id == product_id, PriceHistory.recorded_at >= since)
    if city:
        q = q.filter(PriceHistory.city == city)
    by_day: dict[str, list[float]] = defaultdict(list)
    for row in q.all():
        by_day[row.recorded_at.strftime("%Y-%m-%d")].append(row.price)
    return [{"date": d, "min_price": round(min(v), 2), "avg_price": round(sum(v) / len(v), 2), "max_price": round(max(v), 2)}
            for d, v in sorted(by_day.items())]


def record_history(db: Session, offer: Offer) -> None:
    if offer.rental_period:
        return
    ex, _ = offer_prices(offer)
    db.add(PriceHistory(product_id=offer.product_id, supplier_id=offer.supplier_id, city=offer.city, price=ex))


def search_products(db: Session, q: str = "", category_id: int | None = None, city: str | None = None,
                    brand: str | None = None, sort: str = "relevance", page: int = 1, size: int = 24,
                    only_with_offers: bool = False, price_min: float | None = None, price_max: float | None = None,
                    basis: str | None = None, in_stock: bool = False):
    query = db.query(Product).filter(Product.is_active.is_(True))
    if category_id:
        ids = [category_id] + [c.id for c in db.query(Category).filter(Category.parent_id == category_id).all()]
        query = query.filter(Product.category_id.in_(ids))
    if brand:
        query = query.filter(Product.brand == brand)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(Product.name_ar.ilike(like), Product.name_en.ilike(like),
                                 Product.brand.ilike(like), Product.sku.ilike(like)))
    if only_with_offers or city:
        sub = active_offers_query(db, None, city).with_entities(Offer.product_id).distinct()
        query = query.filter(Product.id.in_(sub))
    products = query.order_by(Product.name_en).all()
    summaries = bulk_summaries(db, [p.id for p in products], city)
    if price_min is not None:
        products = [p for p in products if (summaries[p.id].get("min_price") or 0) >= price_min]
    if price_max is not None:
        products = [p for p in products if summaries[p.id].get("min_price") is not None and summaries[p.id]["min_price"] <= price_max]
    if basis == "rent":
        products = [p for p in products if summaries[p.id].get("basis") or summaries[p.id].get("rental_min_price") is not None]
    elif basis == "sale":
        products = [p for p in products if summaries[p.id].get("offer_count", 0) and not summaries[p.id].get("basis")]
    if in_stock:
        products = [p for p in products if summaries[p.id].get("offer_count", 0) > 0]
    total = len(products)
    if sort in ("price_asc", "price_desc"):
        products.sort(key=lambda p: summaries[p.id].get("min_price") or 1e12, reverse=(sort == "price_desc"))
    elif sort == "offers":
        products.sort(key=lambda p: summaries[p.id].get("offer_count", 0), reverse=True)
    elif sort == "rating":
        products.sort(key=lambda p: ((p.rating or 0), (p.rating_count or 0)), reverse=True)
    elif sort == "newest":
        products.sort(key=lambda p: p.id, reverse=True)
    elif sort == "popular":
        products.sort(key=lambda p: ((p.sold_qty or 0), (p.views or 0)), reverse=True)
    start = (page - 1) * size
    return products[start:start + size], total, summaries


def market_index(db: Session, category_id: int | None = None, city: str | None = None) -> list[dict]:
    """Per-category price movement: avg of product averages now vs 30 days ago."""
    cats = db.query(Category).filter(Category.parent_id.is_(None)).order_by(Category.sort_order).all()
    if category_id:
        cats = [c for c in cats if c.id == category_id]
    out = []
    now = utcnow()
    for cat in cats:
        cat_ids = [cat.id] + [c.id for c in db.query(Category).filter(Category.parent_id == cat.id).all()]
        pids = [p.id for p in db.query(Product.id).filter(Product.category_id.in_(cat_ids), Product.is_active.is_(True)).all()]
        if not pids:
            continue
        summaries = bulk_summaries(db, pids, city)
        avgs = [s["avg_price"] for s in summaries.values() if s.get("avg_price")]
        hist_q = db.query(PriceHistory.product_id, func.avg(PriceHistory.price)).filter(
            PriceHistory.product_id.in_(pids), PriceHistory.recorded_at <= now - timedelta(days=30),
            PriceHistory.recorded_at >= now - timedelta(days=37))
        if city:
            hist_q = hist_q.filter(PriceHistory.city == city)
        past = dict(hist_q.group_by(PriceHistory.product_id).all())
        deltas = []
        for pid, s in summaries.items():
            if s.get("avg_price") and past.get(pid):
                deltas.append((s["avg_price"] - past[pid]) / past[pid] * 100)
        out.append({
            "category_id": cat.id, "slug": cat.slug, "name_ar": cat.name_ar, "name_en": cat.name_en, "icon": cat.icon,
            "products": len(pids),
            "priced_products": len(avgs),
            "offers": sum(s.get("offer_count", 0) for s in summaries.values()),
            "change_30d_pct": round(sum(deltas) / len(deltas), 2) if deltas else None,
        })
    return out


def trending(db: Session, limit: int = 8, city: str | None = None) -> list[dict]:
    """Products with the largest 30-day price movement (either direction)."""
    now = utcnow()
    hist_q = db.query(PriceHistory.product_id, func.avg(PriceHistory.price)).filter(
        PriceHistory.recorded_at <= now - timedelta(days=30), PriceHistory.recorded_at >= now - timedelta(days=37))
    if city:
        hist_q = hist_q.filter(PriceHistory.city == city)
    past = dict(hist_q.group_by(PriceHistory.product_id).all())
    if not past:
        return []
    summaries = bulk_summaries(db, list(past.keys()), city)
    rows = []
    for pid, s in summaries.items():
        if s.get("avg_price") and past.get(pid):
            rows.append({"product_id": pid, "avg_price": s["avg_price"], "min_price": s["min_price"],
                         "change_30d_pct": round((s["avg_price"] - past[pid]) / past[pid] * 100, 2)})
    rows.sort(key=lambda r: abs(r["change_30d_pct"]), reverse=True)
    rows = rows[:limit]
    products = {p.id: p for p in db.query(Product).filter(Product.id.in_([r["product_id"] for r in rows])).all()}
    for r in rows:
        p = products[r["product_id"]]
        r.update({"name_ar": p.name_ar, "name_en": p.name_en, "unit": p.unit, "brand": p.brand})
    return rows


def average_saving_pct(db: Session) -> float | None:
    """How much cheaper the best offer is than the average offer, averaged over products with 2+ offers."""
    pids = [p.id for p in db.query(Product.id).filter(Product.is_active.is_(True)).all()]
    savings = [(s["avg_price"] - s["min_price"]) / s["avg_price"] * 100
               for s in bulk_summaries(db, pids).values() if s.get("offer_count", 0) >= 2 and s.get("avg_price")]
    return round(sum(savings) / len(savings), 1) if savings else None


def public_stats(db: Session) -> dict:
    return {
        "tagline": "Build for Less",
        "avg_saving_pct": average_saving_pct(db),
        "products": db.query(func.count(Product.id)).filter(Product.is_active.is_(True)).scalar() or 0,
        "suppliers": db.query(func.count(Supplier.id)).filter(Supplier.is_external.is_(False)).scalar() or 0,
        "verified_suppliers": db.query(func.count(Supplier.id)).filter(Supplier.verified.is_(True)).scalar() or 0,
        "offers": active_offers_query(db).count(),
        "cities": [c[0] for c in db.query(Offer.city).filter(Offer.city != "").distinct().order_by(Offer.city).all()],
    }
