"""End-to-end flow: search → compare → RFQ → bids → award → order → review, plus admin and ingestion."""
import io

from conftest import auth

API = "/api/v1"


def test_health_and_seed(client):
    assert client.get(f"{API}/health").json()["status"] == "ok"
    stats = client.get(f"{API}/market/stats").json()
    assert stats["products"] > 40 and stats["suppliers"] >= 7 and stats["offers"] > 100


def test_register_and_me(client):
    r = client.post(f"{API}/auth/register", json={"email": "new.buyer@test.sa", "password": "Secret123!",
                                                  "full_name": "Test Buyer", "role": "buyer", "city": "الرياض"})
    assert r.status_code == 201
    token = r.json()["access_token"]
    me = client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"}).json()
    assert me["role"] == "buyer" and me["supplier_id"] is None
    dup = client.post(f"{API}/auth/register", json={"email": "new.buyer@test.sa", "password": "Secret123!", "full_name": "xx"})
    assert dup.status_code == 409
    r = client.post(f"{API}/auth/register", json={"email": "new.sup@test.sa", "password": "Secret123!", "full_name": "Supplier Test",
                                                  "role": "supplier", "company_name": "مورد جديد", "city": "جدة"})
    assert r.status_code == 201 and r.json()["user"]["supplier_id"]


def test_catalog_search_and_compare(client):
    cats = client.get(f"{API}/catalog/categories").json()
    assert any(c["slug"] == "cement" for c in cats)
    res = client.get(f"{API}/catalog/products", params={"q": "أسمنت", "sort": "price_asc"}).json()
    assert res["total"] >= 4
    first = res["items"][0]
    assert first["summary"]["offer_count"] > 0
    detail = client.get(f"{API}/catalog/products/{first['id']}").json()
    assert detail["offers"] and detail["offers"][0]["price_ex_vat"] <= detail["offers"][-1]["price_ex_vat"]
    assert detail["summary"]["min_price"] == detail["offers"][0]["price_ex_vat"]
    assert len(detail["history"]) > 5
    ids = ",".join(str(p["id"]) for p in res["items"][:3])
    cmp = client.get(f"{API}/catalog/compare", params={"ids": ids}).json()
    assert len(cmp) == 3
    riyadh = client.get(f"{API}/catalog/products", params={"city": "الرياض"}).json()
    assert riyadh["total"] > 0
    assert client.get(f"{API}/market/index").json()
    assert isinstance(client.get(f"{API}/market/trending").json(), list)


def test_supplier_offers_and_import(client):
    h = auth(client, "supplier1@demo.sa")
    dash = client.get(f"{API}/suppliers/me/dashboard", headers=h).json()
    assert dash["offers"] > 0
    product = client.get(f"{API}/catalog/products", params={"q": "PPR"}).json()["items"][0]
    r = client.post(f"{API}/suppliers/me/offers", headers=h, json={"product_id": product["id"], "price": 20.5, "city": "الرياض"})
    assert r.status_code == 201 and r.json()["price"] == 20.5
    offer_id = r.json()["id"]
    r = client.patch(f"{API}/suppliers/me/offers/{offer_id}", headers=h, json={"price": 19.9, "stock_status": "limited"})
    assert r.json()["price"] == 19.9 and r.json()["stock_status"] == "limited"
    csv_data = "sku,product_name,category,unit,price,city\nCEM-YAM-50,,cement,bag,13.25,جدة\n,منتج جديد للاختبار,paint,pail,99,الرياض\nbad,,,,,\n"
    r = client.post(f"{API}/suppliers/me/offers/import", headers=h, files={"file": ("prices.csv", io.BytesIO(csv_data.encode()), "text/csv")})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["created_products"] == 1 and body["created_offers"] + body["updated_offers"] == 2 and body["skipped"] == 1
    mine = client.get(f"{API}/suppliers/me/offers", headers=h).json()
    assert any(o["product"]["name_ar"] == "منتج جديد للاختبار" for o in mine)
    # buyer cannot manage offers
    assert client.get(f"{API}/suppliers/me/offers", headers=auth(client, "buyer@demo.sa")).status_code == 403
    r = client.delete(f"{API}/suppliers/me/offers/{offer_id}", headers=h)
    assert r.status_code == 204


def test_rfq_bidding_award_order_review(client):
    buyer = auth(client, "buyer@demo.sa")
    s1, s2 = auth(client, "supplier1@demo.sa"), auth(client, "supplier2@demo.sa")
    products = client.get(f"{API}/catalog/products", params={"q": "حديد تسليح"}).json()["items"]
    cement = client.get(f"{API}/catalog/products", params={"q": "CEM-YAM-50"}).json()["items"][0]
    payload = {"title": "توريد حديد وأسمنت — فيلا الياسمين", "city": "الرياض", "delivery_address": "حي الياسمين، الرياض",
               "items": [{"product_id": products[0]["id"], "quantity": 20, "unit": "ton"},
                         {"product_id": cement["id"], "quantity": 500},
                         {"description": "شبك حديد A142", "quantity": 40, "unit": "sheet"}]}
    r = client.post(f"{API}/rfq", headers=buyer, json=payload)
    assert r.status_code == 201, r.text
    rfq = r.json()
    assert rfq["status"] == "open" and len(rfq["items"]) == 3 and rfq["items"][0]["market_min"]
    rfq_id = rfq["id"]
    # suppliers see it in their open list and were notified
    open_list = client.get(f"{API}/rfq/open", headers=s1).json()
    assert any(x["id"] == rfq_id for x in open_list)
    notes = client.get(f"{API}/notifications", headers=s1, params={"unread_only": True}).json()
    assert any(n["ref_id"] == rfq_id and n["kind"] == "rfq" for n in notes)
    # bids
    items = rfq["items"]
    bid1 = {"items": [{"rfq_item_id": items[0]["id"], "unit_price": 2500}, {"rfq_item_id": items[1]["id"], "unit_price": 14},
                      {"rfq_item_id": items[2]["id"], "unit_price": 90}], "delivery_days": 2, "delivery_fee": 500}
    r = client.post(f"{API}/rfq/{rfq_id}/bids", headers=s1, json=bid1)
    assert r.status_code == 201, r.text
    b1 = r.json()
    assert b1["subtotal"] == 2500 * 20 + 14 * 500 + 90 * 40 + 500
    assert b1["total"] == round(b1["subtotal"] * 1.15, 2)
    bid2 = {"items": [{"rfq_item_id": items[0]["id"], "unit_price": 2450}, {"rfq_item_id": items[1]["id"], "unit_price": 13.5},
                      {"rfq_item_id": items[2]["id"], "unit_price": 95}], "delivery_days": 4}
    r = client.post(f"{API}/rfq/{rfq_id}/bids", headers=s2, json=bid2)
    assert r.status_code == 201
    b2 = r.json()
    # supplier re-submits (replaces) its bid
    bid1["delivery_fee"] = 0
    b1 = client.post(f"{API}/rfq/{rfq_id}/bids", headers=s1, json=bid1).json()
    assert b1["delivery_fee"] == 0
    # supplier cannot see competitor bids; buyer sees ranked bids
    view_s = client.get(f"{API}/rfq/{rfq_id}", headers=s1).json()
    assert view_s["bids"] == [] and view_s["my_bid"]["id"] == b1["id"] and view_s["bid_count"] == 2
    view_b = client.get(f"{API}/rfq/{rfq_id}", headers=buyer).json()
    assert [b["rank"] for b in view_b["bids"]] == [1, 2] and view_b["bids"][0]["total"] <= view_b["bids"][1]["total"]
    assert view_b["best_total"] == view_b["bids"][0]["total"]
    # other buyer cannot view
    other = client.post(f"{API}/auth/register", json={"email": "other@test.sa", "password": "Secret123!", "full_name": "Other Buyer"}).json()
    assert client.get(f"{API}/rfq/{rfq_id}", headers={"Authorization": f"Bearer {other['access_token']}"}).status_code == 403
    # award cheapest
    winner = view_b["bids"][0]
    r = client.post(f"{API}/rfq/{rfq_id}/award/{winner['id']}", headers=buyer)
    assert r.status_code == 200, r.text
    order_id = r.json()["order_id"]
    assert client.get(f"{API}/rfq/{rfq_id}", headers=buyer).json()["status"] == "awarded"
    statuses = {b["supplier_id"]: b["status"] for b in client.get(f"{API}/rfq/{rfq_id}", headers=buyer).json()["bids"]}
    assert set(statuses.values()) == {"awarded", "rejected"}
    # late bid rejected
    assert client.post(f"{API}/rfq/{rfq_id}/bids", headers=s1, json=bid1).status_code == 400
    # order lifecycle by the winning supplier
    win_h = s1 if winner["supplier_id"] == b1["supplier_id"] else s2
    order = client.get(f"{API}/orders/{order_id}", headers=buyer).json()
    assert order["status"] == "pending" and order["total"] == winner["total"] and len(order["items"]) == 3
    assert client.patch(f"{API}/orders/{order_id}/status", headers=buyer, json={"status": "confirmed"}).status_code == 403
    for st in ("confirmed", "in_delivery", "delivered"):
        r = client.patch(f"{API}/orders/{order_id}/status", headers=win_h, json={"status": st})
        assert r.status_code == 200, r.text
    assert client.patch(f"{API}/orders/{order_id}/status", headers=win_h, json={"status": "cancelled"}).status_code == 400
    r = client.post(f"{API}/orders/{order_id}/review", headers=buyer, json={"rating": 5, "comment": "ممتاز"})
    assert r.status_code == 201 and r.json()["rating_count"] >= 1
    assert client.post(f"{API}/orders/{order_id}/review", headers=buyer, json={"rating": 4}).status_code == 409
    assert any(o["id"] == order_id for o in client.get(f"{API}/orders/mine", headers=buyer).json())
    assert any(b["rfq_id"] == rfq_id for b in client.get(f"{API}/rfq/bids/mine", headers=s1).json())


def test_invited_rfq_and_close(client):
    buyer = auth(client, "buyer@demo.sa")
    s3 = auth(client, "supplier3@demo.sa")
    sup3 = client.get(f"{API}/suppliers/me", headers=s3).json()
    tile = client.get(f"{API}/catalog/products", params={"q": "بورسلان"}).json()["items"][0]
    r = client.post(f"{API}/rfq", headers=buyer, json={"title": "بلاط بورسلان", "visibility": "invited",
                                                        "invited_supplier_ids": [sup3["id"]],
                                                        "items": [{"product_id": tile["id"], "quantity": 300}]})
    rfq_id = r.json()["id"]
    assert client.get(f"{API}/rfq/{rfq_id}", headers=auth(client, "supplier1@demo.sa")).status_code == 403
    assert client.get(f"{API}/rfq/{rfq_id}", headers=s3).status_code == 200
    r = client.post(f"{API}/rfq/{rfq_id}/close", headers=buyer)
    assert r.json()["status"] == "closed"


def test_direct_order_and_alerts(client):
    buyer = auth(client, "buyer@demo.sa")
    p = client.get(f"{API}/catalog/products", params={"q": "بلوك أسمنتي 20"}).json()["items"][0]
    detail = client.get(f"{API}/catalog/products/{p['id']}").json()
    offer = next(o for o in detail["offers"] if not o["supplier"]["is_external"])
    r = client.post(f"{API}/orders/direct", headers=buyer, json={"offer_id": offer["id"], "quantity": max(offer["min_qty"], 1000),
                                                                  "delivery_address": "موقع المشروع"})
    assert r.status_code == 201, r.text
    assert r.json()["total"] == round(r.json()["subtotal"] * 1.15, 2)
    ext = next((o for o in detail["offers"] if o["supplier"]["is_external"]), None)
    if ext:
        assert client.post(f"{API}/orders/direct", headers=buyer, json={"offer_id": ext["id"], "quantity": 10}).status_code == 400
    r = client.post(f"{API}/catalog/alerts", headers=buyer, json={"product_id": p["id"], "target_price": 2.0})
    assert r.status_code == 201
    alerts = client.get(f"{API}/catalog/alerts", headers=buyer).json()
    assert alerts and alerts[0]["current_min"]
    assert client.delete(f"{API}/catalog/alerts/{alerts[0]['id']}", headers=buyer).status_code == 204


def test_admin(client):
    admin = auth(client, "admin@mysupplier.sa", "Admin@2026")
    assert client.get(f"{API}/admin/dashboard", headers=auth(client, "buyer@demo.sa")).status_code == 403
    dash = client.get(f"{API}/admin/dashboard", headers=admin).json()
    assert dash["suppliers"] >= 7 and dash["orders"] >= 2 and len(dash["series"]) == 30
    pending = client.get(f"{API}/admin/suppliers", headers=admin, params={"verified": False}).json()
    assert pending
    r = client.post(f"{API}/admin/suppliers/{pending[0]['id']}/verify", headers=admin, params={"plan": "pro"})
    assert r.json()["verified"] is True and r.json()["plan"] == "pro"
    users = client.get(f"{API}/admin/users", headers=admin, params={"role": "buyer"}).json()
    assert users
    r = client.post(f"{API}/admin/sources", headers=admin, json={"name": "قائمة يدوية", "kind": "manual", "city": "الرياض"})
    assert r.status_code == 201
    sid = r.json()["id"]
    csv_data = "sku,price,supplier,city\nRB-12,2490,مورد خارجي للاختبار,الرياض\nCEM-SAU-50,13.1,مورد خارجي للاختبار,الرياض\n"
    r = client.post(f"{API}/admin/sources/{sid}/upload", headers=admin, files={"file": ("ext.csv", io.BytesIO(csv_data.encode()), "text/csv")})
    assert r.status_code == 200 and r.json()["created_offers"] == 2
    rb = client.get(f"{API}/catalog/products", params={"q": "RB-12"}).json()["items"][0]
    detail = client.get(f"{API}/catalog/products/{rb['id']}").json()
    assert any(o["source"] == "external" and o["supplier"]["name"] == "مورد خارجي للاختبار" for o in detail["offers"])
    alerts = client.get(f"{API}/admin/price-alerts", headers=admin).json()
    assert "stale" in alerts and "outliers" in alerts
    assert isinstance(client.get(f"{API}/admin/audit", headers=admin).json(), list)
