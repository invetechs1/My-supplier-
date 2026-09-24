"""Shopping cart (multi-supplier) and checkout that splits into one order per supplier."""
import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..config import VAT_RATE
from ..db import get_db
from ..models import Address, CartItem, Offer, Order, OrderItem, Supplier, User
from ..schemas import CartAddIn, CartCheckoutIn, CartGroupOut, CartItemOut, CartOut, CartQtyIn, CartSyncIn, OrderOut
from ..security import require_buyer
from ..services import coupons, inventory, pricing, settings as platform_settings
from ..services.notify import notify
from ..services.orders import add_event
from .catalog import offer_out
from .orders import order_out

router = APIRouter(prefix="/cart", tags=["cart"])


def _delivery_fee(supplier, subtotal: float) -> float:
    if supplier.free_delivery_over is not None and subtotal >= supplier.free_delivery_over:
        return 0.0
    return float(supplier.delivery_fee or 0)


def build_cart(db: Session, user: User, coupon_code: str = "") -> CartOut:
    rows = db.query(CartItem).filter(CartItem.user_id == user.id).order_by(CartItem.id).all()
    groups: dict[int, list[CartItem]] = {}
    for r in rows:
        if not r.offer or not r.offer.product or not r.offer.product.is_active:
            db.delete(r)
            continue
        groups.setdefault(r.offer.supplier_id, []).append(r)
    db.flush()
    out_groups, subtotal, delivery_total, count = [], 0.0, 0.0, 0
    for sid, items in groups.items():
        sup = items[0].offer.supplier
        its = []
        g_sub = 0.0
        for r in items:
            unit, _ = pricing.offer_prices(r.offer)
            line = round(unit * r.quantity, 2)
            g_sub += line
            count += 1
            its.append(CartItemOut(id=r.id, offer_id=r.offer_id, quantity=r.quantity, offer=offer_out(r.offer, with_product=True), line_total=line))
        fee = _delivery_fee(sup, g_sub)
        subtotal += g_sub
        delivery_total += fee
        out_groups.append(CartGroupOut(supplier=sup, items=its, subtotal=round(g_sub, 2), delivery_fee=fee, free_delivery_over=sup.free_delivery_over,
                                       min_order_amount=sup.min_order_amount or 0, below_minimum=g_sub < (sup.min_order_amount or 0)))
    discount, err, code = 0.0, "", ""
    if coupon_code and subtotal > 0:
        try:
            c, discount = coupons.validate(db, coupon_code, user.id, subtotal)
            code = c.code
        except HTTPException as exc:
            err = str(exc.detail)
    taxable = round(subtotal - discount + delivery_total, 2)
    vat = round(taxable * VAT_RATE, 2)
    return CartOut(groups=out_groups, item_count=count, subtotal=round(subtotal, 2), delivery_total=round(delivery_total, 2), discount=discount,
                   coupon_code=code, coupon_error=err, vat=vat, total=round(taxable + vat, 2))


@router.get("", response_model=CartOut)
def get_cart(coupon_code: str = "", user: User = Depends(require_buyer), db: Session = Depends(get_db)):
    cart = build_cart(db, user, coupon_code)
    db.commit()
    return cart


@router.post("/items", response_model=CartOut, status_code=201)
def add_item(body: CartAddIn, user: User = Depends(require_buyer), db: Session = Depends(get_db)):
    offer = db.get(Offer, body.offer_id)
    if not offer or offer.stock_status == "out_of_stock" or not offer.product.is_active:
        raise HTTPException(400, "This offer is not available")
    if offer.supplier.is_external or not offer.supplier.user_id:
        raise HTTPException(400, "Reference prices cannot be ordered — request a quote instead")
    row = db.query(CartItem).filter(CartItem.user_id == user.id, CartItem.offer_id == offer.id).first()
    qty = (row.quantity if row else 0) + body.quantity
    qty = max(qty, offer.min_qty or 1)
    if offer.available_qty is not None and qty > offer.available_qty:
        raise HTTPException(400, f"Only {offer.available_qty:g} available")
    if row:
        row.quantity = qty
    else:
        db.add(CartItem(user_id=user.id, offer_id=offer.id, quantity=qty))
    db.flush()
    cart = build_cart(db, user)
    db.commit()
    return cart


@router.patch("/items/{item_id}", response_model=CartOut)
def set_qty(item_id: int, body: CartQtyIn, user: User = Depends(require_buyer), db: Session = Depends(get_db)):
    row = db.get(CartItem, item_id)
    if not row or row.user_id != user.id:
        raise HTTPException(404, "Cart item not found")
    if row.offer.available_qty is not None and body.quantity > row.offer.available_qty:
        raise HTTPException(400, f"Only {row.offer.available_qty:g} available")
    row.quantity = max(body.quantity, row.offer.min_qty or 1)
    db.flush()
    cart = build_cart(db, user)
    db.commit()
    return cart


@router.delete("/items/{item_id}", response_model=CartOut)
def remove_item(item_id: int, user: User = Depends(require_buyer), db: Session = Depends(get_db)):
    row = db.get(CartItem, item_id)
    if row and row.user_id == user.id:
        db.delete(row)
        db.flush()
    cart = build_cart(db, user)
    db.commit()
    return cart


@router.delete("", status_code=204)
def clear_cart(user: User = Depends(require_buyer), db: Session = Depends(get_db)):
    db.query(CartItem).filter(CartItem.user_id == user.id).delete()
    db.commit()


@router.post("/sync", response_model=CartOut)
def sync_cart(body: CartSyncIn, user: User = Depends(require_buyer), db: Session = Depends(get_db)):
    """Merge a guest (browser) cart into the account cart after login."""
    for it in body.items:
        offer = db.get(Offer, it.offer_id)
        if not offer or offer.supplier.is_external or offer.stock_status == "out_of_stock":
            continue
        row = db.query(CartItem).filter(CartItem.user_id == user.id, CartItem.offer_id == offer.id).first()
        if row:
            row.quantity = max(row.quantity, it.quantity)
        else:
            db.add(CartItem(user_id=user.id, offer_id=offer.id, quantity=max(it.quantity, offer.min_qty or 1)))
    db.flush()
    cart = build_cart(db, user)
    db.commit()
    return cart


@router.post("/checkout", response_model=list[OrderOut], status_code=201)
def checkout(body: CartCheckoutIn, user: User = Depends(require_buyer), db: Session = Depends(get_db)):
    """Turn the cart into one order per supplier (escrow payment is done next with /payments/checkout-group)."""
    cart = build_cart(db, user, body.coupon_code)
    if not cart.groups:
        raise HTTPException(400, "Cart is empty")
    if cart.coupon_error:
        raise HTTPException(400, cart.coupon_error)
    below = [g for g in cart.groups if g.below_minimum]
    if below:
        raise HTTPException(400, f"Minimum order for {below[0].supplier.name} is {below[0].min_order_amount:,.0f} SAR")
    platform_min = platform_settings.get(db, "min_order_amount")
    if cart.subtotal < platform_min:
        raise HTTPException(400, f"Minimum order amount is {platform_min:,.0f} SAR")
    address = body.delivery_address
    city = ""
    if body.address_id:
        a = db.get(Address, body.address_id)
        if not a or a.user_id != user.id:
            raise HTTPException(404, "Address not found")
        address, city = a.as_text(), a.city
    if not address:
        default = db.query(Address).filter(Address.user_id == user.id, Address.is_default.is_(True)).first()
        if default:
            address, city = default.as_text(), default.city
    coupon = None
    if cart.coupon_code:
        coupon, _ = coupons.validate(db, cart.coupon_code, user.id, cart.subtotal)
    group_ref = "cart-" + secrets.token_hex(6)
    orders = []
    for g in cart.groups:
        share = (g.subtotal / cart.subtotal) if cart.subtotal else 0
        discount = round(cart.discount * share, 2)
        taxable = round(g.subtotal - discount + g.delivery_fee, 2)
        vat = round(taxable * VAT_RATE, 2)
        order = Order(buyer_id=user.id, supplier_id=g.supplier.id, subtotal=g.subtotal, discount=discount, coupon_code=coupon.code if coupon else "",
                      delivery_fee=g.delivery_fee, vat=vat, total=round(taxable + vat, 2), delivery_address=address, city=city or g.items[0].offer.city,
                      notes=(body.notes + f"\n[{group_ref}]").strip())
        db.add(order)
        db.flush()
        for it in g.items:
            offer = db.get(Offer, it.offer_id)
            inventory.reserve(db, offer, it.quantity)
            unit, _ = pricing.offer_prices(offer)
            db.add(OrderItem(order_id=order.id, product_id=offer.product_id, offer_id=offer.id, description=offer.product.name_ar + (f" ({offer.rental_period})" if offer.rental_period else ""),
                             quantity=it.quantity, unit=offer.unit or offer.product.unit, unit_price=unit, line_total=it.line_total))
        add_event(db, order, "pending", "تم إنشاء الطلب من السلة", user.id)
        sup = db.get(Supplier, g.supplier.id)
        if sup and sup.user_id:
            notify(db, sup.user_id, f"طلب شراء جديد #{order.id}", f"{len(g.items)} بند — {order.total:,.2f} ر.س", "order", "order", order.id)
        orders.append(order)
    if coupon:
        coupon.used += 1
    db.query(CartItem).filter(CartItem.user_id == user.id).delete()
    db.commit()
    return [order_out(o, db) for o in orders]
