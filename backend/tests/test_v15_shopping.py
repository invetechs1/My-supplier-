"""v1.5 storefront layer: cart → multi-supplier checkout → group payment, stock, favorites, addresses, reviews, supplier 'my products'."""
import io
import struct
import zlib

from conftest import auth

API = "/api/v1"


def _png() -> bytes:
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(b"\x00\xff\x00\x00")) + chunk(b"IEND", b"")


def _internal_offer(client, q):
    p = client.get(f"{API}/catalog/products", params={"q": q}).json()["items"][0]
    detail = client.get(f"{API}/catalog/products/{p['id']}").json()
    return p, next(o for o in detail["offers"] if not o["supplier"]["is_external"] and o["stock_status"] != "out_of_stock")


def test_catalog_filters_suggest_and_home(client):
    s = client.get(f"{API}/catalog/suggest", params={"q": "أسمنت"}).json()
    assert s["products"] and any("أسمنت" in x["name_ar"] for x in s["products"])
    res = client.get(f"{API}/catalog/products", params={"basis": "rent", "sort": "newest"}).json()
    assert res["total"] > 0 and all(i["summary"]["basis"] or i["summary"]["rental_min_price"] is not None for i in res["items"])
    res = client.get(f"{API}/catalog/products", params={"price_min": 100, "price_max": 200, "basis": "sale", "in_stock": True}).json()
    assert all(100 <= i["summary"]["min_price"] <= 200 for i in res["items"])
    assert client.get(f"{API}/catalog/products", params={"sort": "popular"}).status_code == 200
    home = client.get(f"{API}/market/home").json()
    for key in ("best_sellers", "popular", "new_arrivals", "top_rated", "top_suppliers", "deals"):
        assert key in home
    assert home["new_arrivals"] and home["top_suppliers"]
    p = client.get(f"{API}/catalog/products", params={"q": "أسمنت"}).json()["items"][0]
    assert p["image_url"]
    assert client.get(f"{API}/catalog/products/{p['id']}/image.svg").headers["content-type"].startswith("image/svg")
    views_before = client.get(f"{API}/catalog/products/{p['id']}").json()["views"]
    assert client.get(f"{API}/catalog/products/{p['id']}").json()["views"] == views_before + 1


def test_cart_group_checkout_and_stock(client):
    buyer = auth(client, "buyer@demo.sa")
    client.delete(f"{API}/cart", headers=buyer)
    assert client.get(f"{API}/cart", headers=buyer).json()["item_count"] == 0
    p1, o1 = _internal_offer(client, "أسمنت بورتلاندي")
    p2, o2 = _internal_offer(client, "حديد تسليح")
    r = client.post(f"{API}/cart/items", headers=buyer, json={"offer_id": o1["id"], "quantity": max(o1["min_qty"], 10)})
    assert r.status_code == 201, r.text
    r = client.post(f"{API}/cart/items", headers=buyer, json={"offer_id": o2["id"], "quantity": max(o2["min_qty"], 2)})
    cart = r.json()
    assert cart["item_count"] == 2 and cart["total"] > cart["subtotal"] > 0
    # one group per supplier
    assert len(cart["groups"]) == len({o1["supplier"]["id"], o2["supplier"]["id"]})
    # quantity edit, over-stock rejected
    item = cart["groups"][0]["items"][0]
    avail = item["offer"]["available_qty"]
    if avail is not None:
        assert client.patch(f"{API}/cart/items/{item['id']}", headers=buyer, json={"quantity": avail + 1}).status_code == 400
    r = client.patch(f"{API}/cart/items/{item['id']}", headers=buyer, json={"quantity": item["quantity"] + 1})
    assert r.status_code == 200 and any(i["quantity"] == item["quantity"] + 1 for g in r.json()["groups"] for i in g["items"])
    # guest cart merge keeps the larger quantity
    merged = client.post(f"{API}/cart/sync", headers=buyer, json={"items": [{"offer_id": o1["id"], "quantity": 1}]}).json()
    assert merged["item_count"] == 2
    # external (reference) offers cannot be carted
    ext = next((o for o in client.get(f"{API}/catalog/products/{p1['id']}").json()["offers"] if o["supplier"]["is_external"]), None)
    if ext:
        assert client.post(f"{API}/cart/items", headers=buyer, json={"offer_id": ext["id"], "quantity": 1}).status_code == 400
    # address + coupon preview
    addr = client.post(f"{API}/account/addresses", headers=buyer, json={"label": "المشروع", "city": "الرياض", "district": "العليا", "street": "شارع التخصصي"}).json()
    assert addr["is_default"] is True
    bad = client.get(f"{API}/cart", headers=buyer, params={"coupon_code": "NOPE"}).json()
    assert bad["coupon_error"] and bad["discount"] == 0
    stock_before = {i["offer_id"]: i["offer"]["available_qty"] for g in merged["groups"] for i in g["items"]}
    qty_by_offer = {i["offer_id"]: i["quantity"] for g in merged["groups"] for i in g["items"]}
    r = client.post(f"{API}/cart/checkout", headers=buyer, json={"address_id": addr["id"], "notes": "توصيل صباحاً"})
    assert r.status_code == 201, r.text
    orders = r.json()
    assert len(orders) == len(merged["groups"]) and all(o["status"] == "pending" for o in orders)
    assert all("الرياض" in o["delivery_address"] for o in orders)
    assert orders[0]["events"] and orders[0]["events"][0]["status"] == "pending"
    assert client.get(f"{API}/cart", headers=buyer).json()["item_count"] == 0
    # stock was deducted
    for oid, before in stock_before.items():
        if before is not None:
            offer = client.get(f"{API}/catalog/products/{[o for o in (p1, p2)][0]['id']}").json()
    d1 = client.get(f"{API}/catalog/products/{p1['id']}").json()
    now = next(o for o in d1["offers"] if o["id"] == o1["id"])
    if stock_before.get(o1["id"]) is not None:
        assert now["available_qty"] == stock_before[o1["id"]] - qty_by_offer[o1["id"]]
    # group payment: one checkout for all orders
    r = client.post(f"{API}/payments/checkout-group", headers=buyer, json={"order_ids": [o["id"] for o in orders], "method": "card"})
    assert r.status_code == 201, r.text
    grp = r.json()
    assert grp["group_ref"].startswith("cart-") or grp["group_ref"]
    assert abs(grp["total"] - round(sum(o["total"] for o in orders), 2)) < 0.05
    assert len(grp["payments"]) == len(orders) and all(p["group_ref"] == grp["group_ref"] for p in grp["payments"])
    first = grp["payments"][0]
    page = client.get(grp["checkout_url"].replace("http://localhost:8000", ""))
    assert page.status_code == 200
    client.post(f"{API}/payments/mock/confirm/{first['id']}", data={"result": "paid"}, follow_redirects=False)
    for o in orders:
        got = client.get(f"{API}/orders/{o['id']}", headers=buyer).json()
        assert got["payment_status"] == "paid", got
        assert any(e["status"] == "paid" for e in got["events"])
    # cancelling restores the stock
    sup_email = None
    for o in orders:
        if o["supplier"]["id"] == o1["supplier"]["id"]:
            admin = auth(client, "admin@mysupplier.sa", "Admin@2026")
            r = client.patch(f"{API}/orders/{o['id']}/status", headers=admin, json={"status": "cancelled", "note": "اختبار"})
            assert r.status_code == 200, r.text
            d1 = client.get(f"{API}/catalog/products/{p1['id']}").json()
            now2 = next(x for x in d1["offers"] if x["id"] == o1["id"])
            if stock_before.get(o1["id"]) is not None:
                assert now2["available_qty"] == stock_before[o1["id"]]
            assert any(e["status"] == "cancelled" for e in r.json()["events"])


def test_favorites_addresses_reviews(client):
    buyer = auth(client, "buyer@demo.sa")
    p = client.get(f"{API}/catalog/products", params={"q": "طوب"}).json()["items"][0]
    assert client.post(f"{API}/account/favorites/{p['id']}", headers=buyer).status_code == 201
    assert client.post(f"{API}/account/favorites/{p['id']}", headers=buyer).status_code in (200, 201)
    favs = client.get(f"{API}/account/favorites", headers=buyer).json()
    assert any(f["id"] == p["id"] and f["is_favorite"] for f in favs)
    assert client.get(f"{API}/catalog/products/{p['id']}", headers=buyer).json()["is_favorite"] is True
    assert client.delete(f"{API}/account/favorites/{p['id']}", headers=buyer).status_code == 200
    assert not any(f["id"] == p["id"] for f in client.get(f"{API}/account/favorites", headers=buyer).json())
    # addresses
    a = client.post(f"{API}/account/addresses", headers=buyer, json={"label": "المستودع", "city": "جدة", "district": "الصناعية"}).json()
    b = client.post(f"{API}/account/addresses", headers=buyer, json={"label": "المكتب", "city": "جدة", "is_default": True}).json()
    lst = client.get(f"{API}/account/addresses", headers=buyer).json()
    assert sum(1 for x in lst if x["is_default"]) == 1 and next(x for x in lst if x["id"] == b["id"])["is_default"]
    u = client.put(f"{API}/account/addresses/{a['id']}", headers=buyer, json={"label": "المستودع 2", "city": "جدة"}).json()
    assert u["label"] == "المستودع 2"
    assert client.delete(f"{API}/account/addresses/{a['id']}", headers=buyer).status_code == 204
    assert client.get(f"{API}/account/addresses/", headers=buyer).status_code in (200, 307)
    # reviews (verified if the buyer has a delivered order with the product)
    r = client.post(f"{API}/catalog/products/{p['id']}/reviews", headers=buyer, json={"rating": 5, "title": "ممتاز", "comment": "جودة عالية"})
    assert r.status_code == 201, r.text
    assert r.json()["author"]
    assert client.post(f"{API}/catalog/products/{p['id']}/reviews", headers=buyer, json={"rating": 1}).status_code == 409
    rv = client.get(f"{API}/catalog/products/{p['id']}/reviews").json()
    assert rv and rv[0]["rating"] == 5
    assert client.get(f"{API}/catalog/products/{p['id']}").json()["rating_count"] >= 1
    admin = auth(client, "admin@mysupplier.sa", "Admin@2026")
    lst = client.get(f"{API}/admin/product-reviews", headers=admin).json()
    rows = lst["items"] if isinstance(lst, dict) else lst
    assert any(x["id"] == rv[0]["id"] for x in rows)
    assert client.delete(f"{API}/admin/product-reviews/{rv[0]['id']}", headers=admin).status_code in (200, 204)
    assert client.get(f"{API}/catalog/products/{p['id']}/reviews").json() == []


def test_supplier_my_products(client):
    sup = auth(client, "supplier1@demo.sa")
    mine = client.get(f"{API}/suppliers/me/products", headers=sup).json()
    assert mine and "available_qty" in mine[0] and "image_url" in mine[0] and mine[0]["product"]
    first = mine[0]
    r = client.patch(f"{API}/suppliers/me/offers/{first['id']}", headers=sup, json={"price": first["price"] + 1, "available_qty": 42, "low_stock_threshold": 5})
    assert r.status_code == 200, r.text
    assert r.json()["available_qty"] == 42 and r.json()["price"] == first["price"] + 1
    r = client.patch(f"{API}/suppliers/me/offers/{first['id']}", headers=sup, json={"available_qty": 0})
    assert r.json()["stock_status"] == "out_of_stock"
    r = client.patch(f"{API}/suppliers/me/offers/{first['id']}", headers=sup, json={"available_qty": 500, "price": first["price"]})
    assert r.json()["stock_status"] == "in_stock"
    r = client.patch(f"{API}/suppliers/me/offers/{first['id']}", headers=sup, json={"clear_qty": True})
    assert r.json()["available_qty"] is None
    # image upload
    r = client.post(f"{API}/suppliers/me/offers/{first['id']}/image", headers=sup, files={"file": ("p.png", io.BytesIO(_png()), "image/png")})
    assert r.status_code == 200 and "/uploads/" in r.json()["image_url"]
    # the storefront shows the supplier's image on the product card
    detail = client.get(f"{API}/catalog/products/{first['product']['id']}").json()
    assert any(o["image_url"] == r.json()["image_url"] for o in detail["offers"])
    # create a brand-new product in one step
    cats = client.get(f"{API}/catalog/categories").json()
    r = client.post(f"{API}/suppliers/me/products", headers=sup, json={"category_id": cats[0]["id"], "name_ar": "منتج جديد للاختبار", "name_en": "Test new item",
                                                                         "unit": "piece", "price": 99.5, "city": "الرياض", "available_qty": 10})
    assert r.status_code == 201, r.text
    assert r.json()["product"]["name_ar"] == "منتج جديد للاختبار"
    q = client.get(f"{API}/suppliers/me/products", headers=sup, params={"q": "للاختبار"}).json()
    assert len(q) == 1
    assert client.get(f"{API}/catalog/products", params={"q": "منتج جديد للاختبار"}).json()["total"] == 1
    # supplier shipping settings
    r = client.put(f"{API}/suppliers/me", headers=sup, json={"delivery_fee": 150, "free_delivery_over": 5000, "min_order_amount": 300})
    assert r.status_code == 200, r.text
    assert r.json()["delivery_fee"] == 150 and r.json()["free_delivery_over"] == 5000
    buyer = auth(client, "buyer@demo.sa")
    client.delete(f"{API}/cart", headers=buyer)
    cart = client.post(f"{API}/cart/items", headers=buyer, json={"offer_id": first["id"], "quantity": max(first["min_qty"], 1)}).json()
    g = cart["groups"][0]
    assert g["delivery_fee"] in (0, 150) and g["free_delivery_over"] == 5000
    client.delete(f"{API}/cart", headers=buyer)
    client.put(f"{API}/suppliers/me", headers=sup, json={"delivery_fee": 0, "free_delivery_over": None, "min_order_amount": 0})
