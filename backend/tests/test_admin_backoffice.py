"""Admin back office: orders, RFQs, catalog, settings, coupons, broadcast, reviews, exports, analytics."""
from conftest import auth

API = "/api/v1"


def _admin(client):
    return auth(client, "admin@mysupplier.sa", "Admin@2026")


def test_settings_and_public_exposure(client):
    admin = _admin(client)
    r = client.get(f"{API}/admin/settings", headers=admin).json()
    assert r["values"]["platform_fee_pct"] == "2.5" and any(s["key"] == "home_banner_text" for s in r["schema"])
    r = client.put(f"{API}/admin/settings", headers=admin, json={"values": {"platform_fee_pct": "3", "home_banner_text": "عرض الافتتاح: رسوم 0% أول شهر", "support_phone": "+966500000000", "unknown_key": "x"}})
    assert r.json()["values"]["platform_fee_pct"] == "3" and "unknown_key" not in r.json()["values"]
    pub = client.get(f"{API}/market/settings").json()
    assert pub["home_banner_text"].startswith("عرض") and pub["support_phone"] == "+966500000000" and "platform_vat_number" not in pub
    assert client.get(f"{API}/market/stats").json()["settings"]["support_phone"] == "+966500000000"
    # fee change applies to new checkouts
    buyer = auth(client, "buyer@demo.sa")
    p = client.get(f"{API}/catalog/products", params={"q": "PPE-HLM"}).json()["items"][0]
    offer = next(o for o in client.get(f"{API}/catalog/products/{p['id']}").json()["offers"] if not o["supplier"]["is_external"])
    order = client.post(f"{API}/orders/direct", headers=buyer, json={"offer_id": offer["id"], "quantity": 100}).json()
    pay = client.post(f"{API}/payments/checkout", headers=buyer, json={"order_id": order["id"]}).json()
    assert pay["platform_fee"] == round(order["total"] * 0.03, 2)
    client.put(f"{API}/admin/settings", headers=admin, json={"values": {"platform_fee_pct": "2.5"}})
    # registration toggle
    client.put(f"{API}/admin/settings", headers=admin, json={"values": {"supplier_registration_open": "0"}})
    r = client.post(f"{API}/auth/register", json={"email": "closed@test.sa", "password": "Secret123!", "full_name": "Closed Reg", "role": "supplier", "company_name": "x"})
    assert r.status_code == 403
    client.put(f"{API}/admin/settings", headers=admin, json={"values": {"supplier_registration_open": "1"}})


def test_coupons_on_direct_orders(client):
    admin = _admin(client)
    buyer = auth(client, "buyer@demo.sa")
    r = client.post(f"{API}/admin/coupons", headers=admin, json={"code": "build10", "kind": "percent", "value": 10, "min_order": 100, "max_discount": 500, "max_uses": 2})
    assert r.status_code == 201 and r.json()["code"] == "BUILD10"
    assert client.post(f"{API}/admin/coupons", headers=admin, json={"code": "BUILD10", "value": 5}).status_code == 409
    p = client.get(f"{API}/catalog/products", params={"q": "PPE-VST"}).json()["items"][0]
    offer = next(o for o in client.get(f"{API}/catalog/products/{p['id']}").json()["offers"] if not o["supplier"]["is_external"])
    order = client.post(f"{API}/orders/direct", headers=buyer, json={"offer_id": offer["id"], "quantity": 200, "coupon_code": "build10"}).json()
    assert order["coupon_code"] == "BUILD10" and order["discount"] == round(order["subtotal"] * 0.10, 2)
    assert order["total"] == round((order["subtotal"] - order["discount"]) * 1.15, 2)
    bad = client.post(f"{API}/orders/direct", headers=buyer, json={"offer_id": offer["id"], "quantity": 1, "coupon_code": "NOPE"})
    assert bad.status_code == 400
    coupons = client.get(f"{API}/admin/coupons", headers=admin).json()
    assert next(c for c in coupons if c["code"] == "BUILD10")["used"] == 1


def test_admin_orders_rfqs_catalog_reviews_broadcast_exports(client):
    admin = _admin(client)
    buyer = auth(client, "buyer@demo.sa")
    orders = client.get(f"{API}/admin/orders", headers=admin).json()
    assert orders and "buyer_name" in orders[0]
    o = next(x for x in orders if x["status"] == "pending")
    r = client.patch(f"{API}/admin/orders/{o['id']}/status", headers=admin, json={"status": "cancelled", "note": "مكرر"})
    assert r.json()["status"] == "cancelled" and "[admin]" in r.json()["notes"]
    assert client.get(f"{API}/admin/orders", headers=admin, params={"status": "cancelled"}).json()
    cement = client.get(f"{API}/catalog/products", params={"q": "CEM-YAM-50"}).json()["items"][0]
    client.post(f"{API}/rfq", headers=buyer, json={"title": "طلب للإدارة", "items": [{"product_id": cement["id"], "quantity": 5}]})
    rfqs = client.get(f"{API}/admin/rfqs", headers=admin).json()
    assert rfqs and "buyer_name" in rfqs[0]
    open_rfq = next(r for r in rfqs if r["status"] == "open")
    assert client.post(f"{API}/admin/rfqs/{open_rfq['id']}/close", headers=admin).json()["status"] == "closed"
    # catalog: edit a product, deactivate, reactivate, category delete guard
    prods = client.get(f"{API}/admin/products", headers=admin, params={"q": "PPE-HLM"}).json()
    p = prods[0]
    r = client.put(f"{API}/admin/products/{p['id']}", headers=admin, json={"category_id": p["category_id"], "name_ar": "خوذة سلامة معتمدة", "name_en": "Certified Safety Helmet", "brand": "3M", "unit": "piece", "spec": {"standard": "EN 397"}})
    assert r.json()["name_ar"] == "خوذة سلامة معتمدة" and r.json()["sku"] == p["sku"]
    assert client.delete(f"{API}/admin/products/{p['id']}", headers=admin).status_code == 204
    assert client.get(f"{API}/catalog/products/{p['id']}").status_code == 404
    assert client.post(f"{API}/admin/products/{p['id']}/activate", headers=admin).json()["is_active"] is True
    assert client.delete(f"{API}/admin/categories/{p['category_id']}", headers=admin).status_code == 400
    c = client.post(f"{API}/admin/categories", headers=admin, json={"slug": "temp-cat", "name_ar": "مؤقت", "name_en": "Temp"}).json()
    assert client.delete(f"{API}/admin/categories/{c['id']}", headers=admin).status_code == 204
    # reviews moderation
    reviews = client.get(f"{API}/admin/reviews", headers=admin).json()
    if reviews:
        rid = reviews[0]["id"]
        assert client.delete(f"{API}/admin/reviews/{rid}", headers=admin).status_code == 204
        assert all(x["id"] != rid for x in client.get(f"{API}/admin/reviews", headers=admin).json())
    # broadcast
    r = client.post(f"{API}/admin/broadcast", headers=admin, json={"title": "صيانة مجدولة", "body": "الجمعة 2 صباحاً", "audience": "suppliers"})
    assert r.json()["recipients"] >= 7
    sup = auth(client, "supplier1@demo.sa")
    assert any(n["kind"] == "announcement" for n in client.get(f"{API}/notifications", headers=sup).json())
    assert not any(n["kind"] == "announcement" for n in client.get(f"{API}/notifications", headers=buyer).json())
    # exports + analytics
    for name in ("orders", "payments", "users", "products", "offers", "rfqs", "suppliers", "payouts"):
        r = client.get(f"{API}/admin/export/{name}.csv", headers=admin)
        assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv") and "id," in r.text[:20]
    assert client.get(f"{API}/admin/export/nope.csv", headers=admin).status_code == 404
    a = client.get(f"{API}/admin/analytics", headers=admin).json()
    assert a["funnel"]["rfqs"] >= 1 and isinstance(a["top_suppliers"], list) and a["avg_order_value"] > 0
    assert client.get(f"{API}/admin/orders", headers=buyer).status_code == 403
