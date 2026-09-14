"""Import price lists from CSV/JSON (uploads, supplier bulk import or external feeds).

Accepted columns (case-insensitive, extra columns ignored):
  sku | product_name | name_ar | name_en | brand | category | unit | price | city |
  min_qty | includes_vat | stock_status | supplier | supplier_url | notes
Rows are matched to an existing product by sku, else by exact name (ar or en). Unknown
products are created under the given category slug (or "other").
"""
import csv
import io
import json
import re
from datetime import datetime

import httpx
from sqlalchemy.orm import Session

from ..models import Category, Offer, PriceSource, Product, Supplier, utcnow
from .pricing import record_history

_TRUE = {"1", "true", "yes", "y", "نعم"}


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:60] or "item"


def _to_float(v) -> float | None:
    try:
        return float(str(v).replace(",", "").replace("SAR", "").replace("ر.س", "").strip())
    except (TypeError, ValueError):
        return None


def parse_rows(content: bytes, kind: str = "csv") -> list[dict]:
    text = content.decode("utf-8-sig", errors="replace")
    if kind == "json":
        data = json.loads(text)
        rows = data.get("items", data) if isinstance(data, dict) else data
        return [{str(k).strip().lower(): v for k, v in r.items()} for r in rows]
    reader = csv.DictReader(io.StringIO(text))
    return [{(k or "").strip().lower(): (v or "").strip() for k, v in r.items()} for r in reader]


def _resolve_product(db: Session, row: dict, created_by: int | None, result: dict) -> Product | None:
    sku = str(row.get("sku") or "").strip()
    name = str(row.get("product_name") or row.get("name_en") or row.get("name") or "").strip()
    name_ar = str(row.get("name_ar") or "").strip()
    product = None
    if sku:
        product = db.query(Product).filter(Product.sku == sku).first()
    if not product and (name or name_ar):
        conds = []
        if name:
            conds.append(Product.name_en == name)
        if name_ar:
            conds.append(Product.name_ar == name_ar)
        from sqlalchemy import or_
        product = db.query(Product).filter(or_(*conds)).first()
    if product:
        return product
    if not (name or name_ar):
        return None
    cat_slug = str(row.get("category") or "other").strip()
    category = db.query(Category).filter(Category.slug == cat_slug).first()
    if not category:
        category = db.query(Category).filter(Category.name_en == cat_slug).first() or \
                   db.query(Category).filter(Category.name_ar == cat_slug).first()
    if not category:
        category = db.query(Category).filter(Category.slug == "other").first()
        if not category:
            category = Category(slug="other", name_ar="أخرى", name_en="Other", sort_order=999)
            db.add(category)
            db.flush()
    if not sku:
        sku = f"IMP-{_slug(name or name_ar).upper()}"
        n = 1
        base = sku
        while db.query(Product).filter(Product.sku == sku).first():
            n += 1
            sku = f"{base}-{n}"
    product = Product(category_id=category.id, sku=sku, name_ar=name_ar or name, name_en=name or name_ar,
                      brand=str(row.get("brand") or ""), unit=str(row.get("unit") or "piece"), created_by=created_by)
    db.add(product)
    db.flush()
    result["created_products"] += 1
    return product


def _resolve_supplier(db: Session, row: dict, default: Supplier | None) -> Supplier | None:
    if default:
        return default
    name = str(row.get("supplier") or "").strip()
    if not name:
        return None
    supplier = db.query(Supplier).filter(Supplier.name == name).first()
    if not supplier:
        supplier = Supplier(name=name, is_external=True, verified=False, website=str(row.get("supplier_url") or ""),
                            city=str(row.get("city") or ""), delivery_available=False)
        db.add(supplier)
        db.flush()
    return supplier


def import_rows(db: Session, rows: list[dict], supplier: Supplier | None = None, source: str = "import",
                source_name: str = "", default_city: str = "", created_by: int | None = None) -> dict:
    result = {"created_products": 0, "created_offers": 0, "updated_offers": 0, "skipped": 0, "errors": []}
    for idx, row in enumerate(rows, start=2):
        price = _to_float(row.get("price"))
        if price is None or price <= 0:
            result["skipped"] += 1
            result["errors"].append(f"row {idx}: missing/invalid price")
            continue
        try:
            product = _resolve_product(db, row, created_by, result)
            sup = _resolve_supplier(db, row, supplier)
            if not product or not sup:
                result["skipped"] += 1
                result["errors"].append(f"row {idx}: product or supplier could not be resolved")
                continue
            city = str(row.get("city") or default_city or sup.city or "")
            offer = db.query(Offer).filter(Offer.supplier_id == sup.id, Offer.product_id == product.id, Offer.city == city).first()
            payload = dict(
                price=price, unit=str(row.get("unit") or product.unit), city=city,
                min_qty=_to_float(row.get("min_qty")) or 1,
                includes_vat=str(row.get("includes_vat", "")).lower() in _TRUE,
                stock_status=str(row.get("stock_status") or "in_stock"),
                source=source if not sup.is_external else "external",
                source_name=source_name or str(row.get("supplier") or ""),
                source_url=str(row.get("supplier_url") or ""),
                notes=str(row.get("notes") or ""),
            )
            if offer:
                for k, v in payload.items():
                    setattr(offer, k, v)
                offer.updated_at = utcnow()
                result["updated_offers"] += 1
            else:
                offer = Offer(supplier_id=sup.id, product_id=product.id, **payload)
                db.add(offer)
                db.flush()
                result["created_offers"] += 1
            record_history(db, offer)
        except Exception as exc:  # keep going, report the row
            db.rollback()
            result["skipped"] += 1
            result["errors"].append(f"row {idx}: {exc}")
    db.commit()
    result["errors"] = result["errors"][:50]
    return result


def fetch_source(db: Session, source: PriceSource) -> dict:
    """Pull a CSV/JSON feed from its URL and import it."""
    if source.kind == "manual" or not source.url:
        return {"created_products": 0, "created_offers": 0, "updated_offers": 0, "skipped": 0,
                "errors": ["source has no URL — upload a file instead"]}
    try:
        resp = httpx.get(source.url, timeout=30, follow_redirects=True)
        resp.raise_for_status()
        rows = parse_rows(resp.content, source.kind)
    except Exception as exc:
        source.last_status = f"fetch failed: {exc}"[:300]
        source.last_fetched_at = utcnow()
        db.commit()
        return {"created_products": 0, "created_offers": 0, "updated_offers": 0, "skipped": 0, "errors": [str(exc)]}
    supplier = db.get(Supplier, source.supplier_id) if source.supplier_id else None
    result = import_rows(db, rows, supplier=supplier, source="external", source_name=source.name, default_city=source.city)
    source.last_fetched_at = utcnow()
    source.imported_rows = result["created_offers"] + result["updated_offers"]
    source.last_status = f"ok: {source.imported_rows} rows, {result['skipped']} skipped"
    db.commit()
    return result
