from datetime import timedelta

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Bid, Offer, Order, Product, Supplier, SupplierDocument, User, utcnow
from ..schemas import ImportResult, OfferIn, OfferOut, OfferUpdateIn, SupplierDocumentOut, SupplierOut, SupplierProductIn, SupplierUpdateIn
from ..security import get_my_supplier, require_supplier
from ..services import ingestion, pricing, storage
from .catalog import offer_out

router = APIRouter(prefix="/suppliers", tags=["suppliers"])


def supplier_out(s: Supplier, db: Session) -> SupplierOut:
    out = SupplierOut.model_validate(s)
    out.offer_count = db.query(func.count(Offer.id)).filter(Offer.supplier_id == s.id).scalar() or 0
    from ..services.payments import mask_iban
    out.iban_masked = mask_iban(s.iban)
    return out


@router.get("", response_model=list[SupplierOut])
def list_suppliers(city: str | None = None, category_id: int | None = None, include_external: bool = False,
                   db: Session = Depends(get_db)):
    q = db.query(Supplier)
    if not include_external:
        q = q.filter(Supplier.is_external.is_(False))
    if city:
        q = q.filter(Supplier.city == city)
    rows = q.order_by(Supplier.verified.desc(), Supplier.rating.desc(), Supplier.name).all()
    if category_id:
        rows = [s for s in rows if category_id in (s.category_ids or [])]
    return [supplier_out(s, db) for s in rows]


@router.get("/me", response_model=SupplierOut)
def my_profile(supplier: Supplier = Depends(get_my_supplier), db: Session = Depends(get_db)):
    return supplier_out(supplier, db)


@router.put("/me", response_model=SupplierOut)
def update_profile(body: SupplierUpdateIn, supplier: Supplier = Depends(get_my_supplier), db: Session = Depends(get_db)):
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(supplier, k, v)
    db.commit()
    db.refresh(supplier)
    return supplier_out(supplier, db)


@router.get("/me/dashboard")
def my_dashboard(supplier: Supplier = Depends(get_my_supplier), db: Session = Depends(get_db)):
    offers = db.query(Offer).filter(Offer.supplier_id == supplier.id).all()
    bids = db.query(Bid).filter(Bid.supplier_id == supplier.id).all()
    orders = db.query(Order).filter(Order.supplier_id == supplier.id).all()
    stale_cutoff = utcnow() - timedelta(days=30)
    awarded = [b for b in bids if b.status == "awarded"]
    decided = [b for b in bids if b.status in ("awarded", "rejected")]
    # how many of my offers are the cheapest for their product/city
    best = 0
    for o in offers:
        s = pricing.summarize(db, o.product_id, o.city or None)
        if s.get("min_price") is not None and abs(pricing.offer_prices(o)[0] - s["min_price"]) < 0.005:
            best += 1
    return {
        "offers": len(offers),
        "stale_offers": sum(1 for o in offers if o.updated_at < stale_cutoff),
        "best_price_offers": best,
        "bids": len(bids),
        "bids_awarded": len(awarded),
        "win_rate_pct": round(len(awarded) / len(decided) * 100, 1) if decided else None,
        "orders": len(orders),
        "orders_open": sum(1 for o in orders if o.status in ("pending", "confirmed", "in_delivery")),
        "revenue": round(sum(o.total for o in orders if o.status == "delivered"), 2),
        "pipeline": round(sum(o.total for o in orders if o.status in ("pending", "confirmed", "in_delivery")), 2),
        "rating": supplier.rating, "rating_count": supplier.rating_count, "verified": supplier.verified, "plan": supplier.plan,
    }


@router.get("/me/offers", response_model=list[OfferOut])
def my_offers(supplier: Supplier = Depends(get_my_supplier), db: Session = Depends(get_db)):
    rows = db.query(Offer).filter(Offer.supplier_id == supplier.id).order_by(Offer.updated_at.desc()).all()
    return [offer_out(o, with_product=True) for o in rows]


@router.post("/me/offers", response_model=OfferOut, status_code=201)
def upsert_offer(body: OfferIn, supplier: Supplier = Depends(get_my_supplier), db: Session = Depends(get_db)):
    product = db.get(Product, body.product_id)
    if not product:
        raise HTTPException(404, "Product not found")
    city = body.city or supplier.city
    offer = db.query(Offer).filter(Offer.supplier_id == supplier.id, Offer.product_id == product.id, Offer.city == city,
                                   Offer.rental_period == body.rental_period).first()
    data = body.model_dump()
    data["city"] = city
    data["unit"] = data["unit"] or product.unit
    if offer:
        for k, v in data.items():
            setattr(offer, k, v)
        offer.updated_at = utcnow()
    else:
        offer = Offer(supplier_id=supplier.id, source="supplier", **data)
        db.add(offer)
        db.flush()
    pricing.record_history(db, offer)
    db.commit()
    db.refresh(offer)
    return offer_out(offer, with_product=True)


@router.get("/me/products", response_model=list[OfferOut])
def my_products(q: str = "", supplier: Supplier = Depends(get_my_supplier), db: Session = Depends(get_db)):
    """The supplier's storefront: every item they list, with image, price, available quantity and stock state."""
    rows = db.query(Offer).filter(Offer.supplier_id == supplier.id).order_by(Offer.updated_at.desc()).all()
    if q:
        ql = q.lower()
        rows = [o for o in rows if ql in o.product.name_ar.lower() or ql in o.product.name_en.lower() or ql in o.product.sku.lower()]
    return [offer_out(o, with_product=True) for o in rows]


@router.post("/me/products", response_model=OfferOut, status_code=201)
def create_my_product(body: SupplierProductIn, supplier: Supplier = Depends(get_my_supplier), user: User = Depends(require_supplier),
                      db: Session = Depends(get_db)):
    """Create a brand-new catalog item (not in the catalog yet) together with this supplier's price and stock."""
    from datetime import datetime as _dt
    if not db.get(__import__("app.models", fromlist=["Category"]).Category, body.category_id):
        raise HTTPException(400, "Unknown category")
    existing = db.query(Product).filter((Product.name_ar == body.name_ar.strip()) | (Product.name_en == body.name_en.strip())).first()
    product = existing or Product(category_id=body.category_id, sku=f"S{supplier.id}-{int(_dt.now().timestamp())}", name_ar=body.name_ar.strip(),
                                  name_en=body.name_en.strip(), brand=body.brand, unit=body.unit, description=body.description, spec=body.spec, created_by=user.id)
    if not existing:
        db.add(product)
        db.flush()
    city = body.city or supplier.city
    offer = db.query(Offer).filter(Offer.supplier_id == supplier.id, Offer.product_id == product.id, Offer.city == city, Offer.rental_period == body.rental_period).first()
    if not offer:
        offer = Offer(supplier_id=supplier.id, product_id=product.id, source="supplier")
        db.add(offer)
    offer.price, offer.city, offer.unit, offer.min_qty = body.price, city, body.unit or product.unit, body.min_qty
    offer.available_qty, offer.rental_period, offer.includes_vat, offer.delivery_included = body.available_qty, body.rental_period, body.includes_vat, body.delivery_included
    offer.stock_status = "out_of_stock" if (body.available_qty is not None and body.available_qty <= 0) else "in_stock"
    offer.updated_at = utcnow()
    db.flush()
    pricing.record_history(db, offer)
    db.commit()
    db.refresh(offer)
    return offer_out(offer, with_product=True)


@router.post("/me/offers/{offer_id}/image", response_model=OfferOut)
async def upload_offer_image(offer_id: int, file: UploadFile = File(...), supplier: Supplier = Depends(get_my_supplier), db: Session = Depends(get_db)):
    offer = db.get(Offer, offer_id)
    if not offer or offer.supplier_id != supplier.id:
        raise HTTPException(404, "Offer not found")
    data, ext, mime = await storage.read_upload(file, ("png", "jpg", "webp"))
    offer.image_url = storage.save(data, ext, mime, f"offers/{supplier.id}")
    if not offer.product.image_url:  # first photo also becomes the catalog image
        offer.product.image_url = offer.image_url
    db.commit()
    db.refresh(offer)
    return offer_out(offer, with_product=True)


@router.patch("/me/offers/{offer_id}", response_model=OfferOut)
def update_offer(offer_id: int, body: OfferUpdateIn, supplier: Supplier = Depends(get_my_supplier), db: Session = Depends(get_db)):
    offer = db.get(Offer, offer_id)
    if not offer or offer.supplier_id != supplier.id:
        raise HTTPException(404, "Offer not found")
    data = body.model_dump(exclude_none=True)
    clear = data.pop("clear_qty", False)
    for k, v in data.items():
        setattr(offer, k, v)
    if clear:
        offer.available_qty = None
    if "available_qty" in data or clear:
        if offer.available_qty is not None and offer.available_qty <= 0:
            offer.stock_status = "out_of_stock"
        elif "stock_status" not in data and offer.stock_status == "out_of_stock":
            offer.stock_status = "in_stock"
    offer.updated_at = utcnow()
    pricing.record_history(db, offer)
    db.commit()
    db.refresh(offer)
    return offer_out(offer, with_product=True)


@router.delete("/me/offers/{offer_id}", status_code=204)
def delete_offer(offer_id: int, supplier: Supplier = Depends(get_my_supplier), db: Session = Depends(get_db)):
    offer = db.get(Offer, offer_id)
    if not offer or offer.supplier_id != supplier.id:
        raise HTTPException(404, "Offer not found")
    db.delete(offer)
    db.commit()


@router.post("/me/offers/import", response_model=ImportResult)
async def import_offers(file: UploadFile = File(...), supplier: Supplier = Depends(get_my_supplier),
                        user: User = Depends(require_supplier), db: Session = Depends(get_db)):
    content = await file.read()
    kind = "json" if (file.filename or "").lower().endswith(".json") else "csv"
    try:
        rows = ingestion.parse_rows(content, kind)
    except Exception as exc:
        raise HTTPException(400, f"Could not parse file: {exc}")
    return ingestion.import_rows(db, rows, supplier=supplier, source="import", source_name=supplier.name,
                                 default_city=supplier.city, created_by=user.id)


@router.post("/me/logo", response_model=SupplierOut)
async def upload_logo(file: UploadFile = File(...), supplier: Supplier = Depends(get_my_supplier), db: Session = Depends(get_db)):
    data, ext, mime = await storage.read_upload(file, ("png", "jpg", "webp"))
    supplier.logo_url = storage.save(data, ext, mime, "logos")
    db.commit()
    return supplier_out(supplier, db)


@router.get("/me/documents", response_model=list[SupplierDocumentOut])
def my_documents(supplier: Supplier = Depends(get_my_supplier), db: Session = Depends(get_db)):
    return db.query(SupplierDocument).filter(SupplierDocument.supplier_id == supplier.id).order_by(SupplierDocument.id.desc()).all()


@router.post("/me/documents", response_model=SupplierDocumentOut, status_code=201)
async def upload_document(kind: str = "other", file: UploadFile = File(...), supplier: Supplier = Depends(get_my_supplier),
                          db: Session = Depends(get_db)):
    if kind not in ("cr", "vat", "classification", "bank", "other"):
        raise HTTPException(400, "kind must be cr | vat | classification | bank | other")
    data, ext, mime = await storage.read_upload(file, ("png", "jpg", "webp", "pdf"))
    url = storage.save(data, ext, mime, f"documents/{supplier.id}")
    doc = SupplierDocument(supplier_id=supplier.id, kind=kind, file_url=url, filename=file.filename or "")
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


@router.get("/{supplier_id}", response_model=SupplierOut)
def supplier_profile(supplier_id: int, db: Session = Depends(get_db)):
    s = db.get(Supplier, supplier_id)
    if not s:
        raise HTTPException(404, "Supplier not found")
    return supplier_out(s, db)


@router.get("/{supplier_id}/offers", response_model=list[OfferOut])
def supplier_offers(supplier_id: int, db: Session = Depends(get_db)):
    rows = pricing.active_offers_query(db).filter(Offer.supplier_id == supplier_id).all()
    return [offer_out(o, with_product=True) for o in rows]
