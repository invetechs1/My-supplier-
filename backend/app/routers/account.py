"""Buyer account extras: delivery addresses, favorites (wishlist)."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Address, Favorite, Product, User
from ..schemas import AddressIn, AddressOut, ProductOut
from ..security import get_current_user
from ..services import pricing
from .catalog import product_out

router = APIRouter(prefix="/account", tags=["account"])


def _addr(a: Address) -> AddressOut:
    o = AddressOut.model_validate(a)
    o.formatted = a.as_text()
    return o


@router.get("/addresses", response_model=list[AddressOut])
def addresses(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [_addr(a) for a in db.query(Address).filter(Address.user_id == user.id).order_by(Address.is_default.desc(), Address.id).all()]


@router.post("/addresses", response_model=AddressOut, status_code=201)
def add_address(body: AddressIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    first = db.query(Address).filter(Address.user_id == user.id).count() == 0
    if body.is_default or first:
        db.query(Address).filter(Address.user_id == user.id).update({"is_default": False})
    a = Address(user_id=user.id, **{**body.model_dump(), "is_default": body.is_default or first})
    db.add(a)
    db.commit()
    db.refresh(a)
    return _addr(a)


@router.put("/addresses/{address_id}", response_model=AddressOut)
def update_address(address_id: int, body: AddressIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = db.get(Address, address_id)
    if not a or a.user_id != user.id:
        raise HTTPException(404, "Address not found")
    if body.is_default:
        db.query(Address).filter(Address.user_id == user.id).update({"is_default": False})
    for k, v in body.model_dump().items():
        setattr(a, k, v)
    db.commit()
    return _addr(a)


@router.delete("/addresses/{address_id}", status_code=204)
def delete_address(address_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = db.get(Address, address_id)
    if a and a.user_id == user.id:
        db.delete(a)
        db.commit()


@router.get("/favorites", response_model=list[ProductOut])
def favorites(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ids = [f.product_id for f in db.query(Favorite).filter(Favorite.user_id == user.id).order_by(Favorite.id.desc()).all()]
    if not ids:
        return []
    prods = {p.id: p for p in db.query(Product).filter(Product.id.in_(ids), Product.is_active.is_(True)).all()}
    summaries = pricing.bulk_summaries(db, list(prods))
    out = []
    for pid in ids:
        if pid in prods:
            o = product_out(prods[pid], summaries.get(pid))
            o.is_favorite = True
            out.append(o)
    return out


@router.post("/favorites/{product_id}", status_code=201)
def add_favorite(product_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not db.get(Product, product_id):
        raise HTTPException(404, "Product not found")
    if not db.query(Favorite).filter(Favorite.user_id == user.id, Favorite.product_id == product_id).first():
        db.add(Favorite(user_id=user.id, product_id=product_id))
        db.commit()
    return {"product_id": product_id, "is_favorite": True}


@router.delete("/favorites/{product_id}")
def remove_favorite(product_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(Favorite).filter(Favorite.user_id == user.id, Favorite.product_id == product_id).delete()
    db.commit()
    return {"product_id": product_id, "is_favorite": False}
