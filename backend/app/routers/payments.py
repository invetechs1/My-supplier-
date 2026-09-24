"""Buyer checkout, gateway callbacks, invoices and supplier payouts."""
import hmac

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session

from .. import config
from ..db import get_db
from ..models import Invoice, Order, Payment, Payout, Supplier, User
from ..schemas import CheckoutIn, InvoiceOut, PaymentOut, PayoutOut
from ..security import get_current_user, get_my_supplier, require_buyer
from ..services import payments

router = APIRouter(prefix="/payments", tags=["payments"])


def payment_out(p: Payment) -> PaymentOut:
    out = PaymentOut.model_validate(p)
    out.supplier_name = p.supplier.name if p.supplier else ""
    out.buyer_name = (p.buyer.company_name or p.buyer.full_name) if p.buyer else ""
    if p.method == "bank_transfer":
        from ..services import settings as _settings
        from ..db import SessionLocal
        with SessionLocal() as _db:
            out.bank_instructions = f"{_settings.get(_db, 'bank_instructions')} — Reference: MS-{p.id}"
    if p.provider == "moyasar":
        out.publishable_key = config.MOYASAR_PUBLISHABLE_KEY
    return out


def _can_view(p: Payment, user: User) -> bool:
    return user.role == "admin" or p.buyer_id == user.id or (p.supplier and p.supplier.user_id == user.id)


@router.post("/checkout", response_model=PaymentOut, status_code=201)
def checkout(body: CheckoutIn, user: User = Depends(require_buyer), db: Session = Depends(get_db)):
    order = db.get(Order, body.order_id)
    if not order:
        raise HTTPException(404, "Order not found")
    return payment_out(payments.start_checkout(db, order, user, body.method))


@router.get("/mine", response_model=list[PaymentOut])
def my_payments(user: User = Depends(require_buyer), db: Session = Depends(get_db)):
    return [payment_out(p) for p in db.query(Payment).filter(Payment.buyer_id == user.id).order_by(Payment.id.desc()).all()]


@router.get("/order/{order_id}", response_model=list[PaymentOut])
def order_payments(order_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(Payment).filter(Payment.order_id == order_id).order_by(Payment.id.desc()).all()
    return [payment_out(p) for p in rows if _can_view(p, user)]


@router.post("/{payment_id}/sync", response_model=PaymentOut)
def sync(payment_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Reconcile with the gateway after the buyer returns from the hosted page (webhooks may lag)."""
    p = db.get(Payment, payment_id)
    if not p or not _can_view(p, user):
        raise HTTPException(404, "Payment not found")
    if p.status == "initiated":
        status = payments.provider().fetch_status(p)
        if status == "paid":
            payments.mark_paid(db, p)
        elif status == "failed":
            payments.mark_failed(db, p, "gateway reported failure")
    return payment_out(p)


@router.post("/{payment_id}/cancel", response_model=PaymentOut)
def cancel_attempt(payment_id: int, user: User = Depends(require_buyer), db: Session = Depends(get_db)):
    p = db.get(Payment, payment_id)
    if not p or p.buyer_id != user.id:
        raise HTTPException(404, "Payment not found")
    if p.status not in ("initiated", "pending_transfer"):
        raise HTTPException(400, "Only open payment attempts can be cancelled")
    return payment_out(payments.mark_failed(db, p, "cancelled by buyer"))


# ---- gateway webhooks ----
@router.post("/webhook/moyasar")
async def moyasar_webhook(request: Request, db: Session = Depends(get_db)):
    body = await request.json()
    secret = request.headers.get("X-Webhook-Secret") or body.get("secret_token", "")
    if not config.MOYASAR_WEBHOOK_SECRET or not hmac.compare_digest(str(secret), config.MOYASAR_WEBHOOK_SECRET):
        raise HTTPException(401, "Invalid webhook secret")
    data = body.get("data", body)
    meta = data.get("metadata") or {}
    p = None
    if meta.get("payment_id"):
        p = db.get(Payment, int(meta["payment_id"]))
    if not p and data.get("invoice_id"):
        p = db.query(Payment).filter(Payment.provider_ref == data["invoice_id"]).first()
    if not p and data.get("id"):
        p = db.query(Payment).filter(Payment.provider_ref == data["id"]).first()
    if not p:
        return {"ok": False, "reason": "payment not found"}
    # Never trust the payload alone: confirm against the gateway API.
    status = payments.provider().fetch_status(p) if config.PAYMENT_PROVIDER == "moyasar" else data.get("status")
    if status == "paid":
        payments.mark_paid(db, p, provider_ref=p.provider_ref or data.get("id"))
    elif status in ("failed", "canceled", "expired"):
        payments.mark_failed(db, p, f"gateway: {status}")
    return {"ok": True, "status": p.status}


# ---- mock gateway (dev/test) ----
@router.get("/mock/checkout/{payment_id}", response_class=HTMLResponse, include_in_schema=False)
def mock_checkout(payment_id: int, db: Session = Depends(get_db)):
    p = db.get(Payment, payment_id)
    if not p:
        raise HTTPException(404)
    return f"""<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>Mock Gateway</title>
<style>body{{font-family:sans-serif;background:#F5F8F6;display:grid;place-items:center;height:100vh;margin:0}}
.c{{background:#fff;padding:28px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.1);max-width:380px;text-align:center}}
button{{padding:10px 18px;border-radius:8px;border:0;font-size:15px;margin:6px;cursor:pointer}}.p{{background:#175934;color:#fff}}.f{{background:#eee}}</style></head>
<body><div class="c"><h2>بوابة دفع تجريبية</h2><p>الطلب #{p.order_id} — <b>{p.amount:,.2f} ر.س</b> ({p.method})</p>
<p style="color:#888;font-size:13px">هذه صفحة محاكاة. في الإنتاج يُستبدل بها صفحة Moyasar (مدى، فيزا، Apple Pay، STC Pay).</p>
<form method="post" action="/api/v1/payments/mock/confirm/{p.id}"><button class="p" name="result" value="paid">ادفع الآن ✓</button>
<button class="f" name="result" value="failed">فشل الدفع ✕</button></form></div></body></html>"""


@router.post("/mock/confirm/{payment_id}", include_in_schema=False)
async def mock_confirm(payment_id: int, request: Request, db: Session = Depends(get_db)):
    p = db.get(Payment, payment_id)
    if not p or p.provider != "mock":
        raise HTTPException(404)
    form = await request.form()
    result = form.get("result", "paid")
    if result == "paid":
        payments.mark_paid(db, p, provider_ref=f"mock-{p.id}")
    else:
        payments.mark_failed(db, p, "declined (mock)")
    return RedirectResponse(f"{config.WEB_BASE_URL}/buyer/orders?paid={p.id}&status={p.status}", status_code=303)


# ---- invoices ----
@router.get("/invoices/order/{order_id}", response_model=list[InvoiceOut])
def order_invoices(order_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    o = db.get(Order, order_id)
    if not o:
        raise HTTPException(404, "Order not found")
    if not (user.role == "admin" or o.buyer_id == user.id or o.supplier.user_id == user.id):
        raise HTTPException(403, "Not your order")
    rows = db.query(Invoice).filter(Invoice.order_id == order_id).all()
    if user.role != "admin" and o.buyer_id == user.id:
        rows = [r for r in rows if r.kind == "tax_invoice"]
    return rows


@router.get("/invoices/{invoice_id}.html", response_class=HTMLResponse, include_in_schema=False)
def invoice_html(invoice_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    inv = db.get(Invoice, invoice_id)
    if not inv:
        raise HTTPException(404)
    o = db.get(Order, inv.order_id)
    if not (user.role == "admin" or o.buyer_id == user.id or o.supplier.user_id == user.id):
        raise HTTPException(403)
    rows = "".join(f"<tr><td>{l['description']}</td><td class=n>{l['quantity']:g} {l.get('unit','')}</td><td class=n>{l['unit_price']:,.2f}</td><td class=n>{l['line_total']:,.2f}</td></tr>" for l in inv.lines)
    title = "فاتورة ضريبية مبسطة — Simplified Tax Invoice" if inv.kind == "tax_invoice" else "فاتورة رسوم المنصة — Platform Fee Invoice"
    return f"""<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>{inv.number}</title>
<style>body{{font-family:sans-serif;max-width:800px;margin:30px auto;padding:0 16px;color:#182420}}table{{width:100%;border-collapse:collapse;margin:16px 0}}
td,th{{padding:8px;border-bottom:1px solid #E1EAE3;text-align:right}}.n{{font-family:monospace;direction:ltr;text-align:left}}.hd{{display:flex;justify-content:space-between;align-items:flex-start}}
.tot td{{font-weight:700}}@media print{{button{{display:none}}}}</style></head><body>
<div class=hd><div><h2 style="margin:0;color:#175934">{title}</h2><div>{inv.number} · {inv.issued_at:%Y-%m-%d %H:%M}</div></div><div>{payments.qr_svg(inv.qr_tlv_base64)}</div></div>
<table><tr><th>البائع / Seller</th><td>{inv.seller_name}<br>VAT: <span class=n>{inv.seller_vat}</span></td><th>المشتري / Buyer</th><td>{inv.buyer_name}<br><span class=n>{inv.buyer_vat}</span></td></tr></table>
<table><thead><tr><th>البند</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead><tbody>{rows}</tbody>
<tfoot><tr><td colspan=3>المجموع قبل الضريبة</td><td class=n>{inv.subtotal:,.2f}</td></tr><tr><td colspan=3>ضريبة القيمة المضافة 15%</td><td class=n>{inv.vat:,.2f}</td></tr>
<tr class=tot><td colspan=3>الإجمالي شامل الضريبة (ر.س)</td><td class=n>{inv.total:,.2f}</td></tr></tfoot></table>
<p style="color:#888;font-size:12px">الطلب #{inv.order_id} · {config.PLATFORM_NAME} — <b style="color:#2E9E5B">{config.PLATFORM_TAGLINE}</b> · QR: ZATCA TLV</p><button onclick="print()">طباعة / Print</button></body></html>"""


# ---- supplier payouts ----
@router.get("/payouts/mine", response_model=list[PayoutOut])
def my_payouts(supplier: Supplier = Depends(get_my_supplier), db: Session = Depends(get_db)):
    rows = db.query(Payout).filter(Payout.supplier_id == supplier.id).order_by(Payout.id.desc()).all()
    out = []
    for x in rows:
        o = PayoutOut.model_validate(x)
        o.supplier_name = supplier.name
        out.append(o)
    return out


@router.get("/supplier/summary")
def supplier_finance(supplier: Supplier = Depends(get_my_supplier), db: Session = Depends(get_db)):
    pays = db.query(Payment).filter(Payment.supplier_id == supplier.id).all()
    payouts = db.query(Payout).filter(Payout.supplier_id == supplier.id).all()
    return {
        "in_escrow": round(sum(p.supplier_net for p in pays if p.status == "paid"), 2),
        "payouts_pending": round(sum(x.amount for x in payouts if x.status == "pending"), 2),
        "payouts_paid": round(sum(x.amount for x in payouts if x.status == "paid"), 2),
        "fees_paid": round(sum(p.platform_fee for p in pays if p.status in ("paid", "released")), 2),
        "iban_set": bool(supplier.iban),
    }
