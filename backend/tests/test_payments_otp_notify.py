"""Payments (escrow → payout), invoices, OTP flows, notification outbox, background jobs."""
from datetime import timedelta

from conftest import auth

from app.db import SessionLocal
from app.models import RFQ, NotificationDelivery, PriceAlert, utcnow
from app.services import channels, jobs

API = "/api/v1"


def _new_order(client, buyer):
    p = client.get(f"{API}/catalog/products", params={"q": "بلوك أسمنتي 15"}).json()["items"][0]
    detail = client.get(f"{API}/catalog/products/{p['id']}").json()
    offer = next(o for o in detail["offers"] if not o["supplier"]["is_external"])
    r = client.post(f"{API}/orders/direct", headers=buyer, json={"offer_id": offer["id"], "quantity": max(offer["min_qty"], 500), "delivery_address": "موقع"})
    assert r.status_code == 201, r.text
    return r.json()


def _supplier_headers_for(client, order):
    for i in range(1, 8):
        h = auth(client, f"supplier{i}@demo.sa")
        me = client.get(f"{API}/suppliers/me", headers=h).json()
        if me["id"] == order["supplier_id"]:
            return h
    raise AssertionError("supplier not found")


def test_mock_checkout_escrow_payout_and_invoices(client):
    buyer = auth(client, "buyer@demo.sa")
    admin = auth(client, "admin@mysupplier.sa", "Admin@2026")
    order = _new_order(client, buyer)
    assert order["payment_status"] == "unpaid"
    r = client.post(f"{API}/payments/checkout", headers=buyer, json={"order_id": order["id"], "method": "mada"})
    assert r.status_code == 201, r.text
    pay = r.json()
    assert pay["status"] == "initiated" and pay["checkout_url"].endswith(f"/mock/checkout/{pay['id']}")
    assert pay["platform_fee"] == round(order["total"] * 0.025, 2) and pay["supplier_net"] == round(order["total"] - pay["platform_fee"], 2)
    # same open attempt is reused
    assert client.post(f"{API}/payments/checkout", headers=buyer, json={"order_id": order["id"], "method": "mada"}).json()["id"] == pay["id"]
    # hosted mock page renders, then the buyer pays
    assert "بوابة دفع" in client.get(pay["checkout_url"].replace("http://localhost:8000", "")).text
    r = client.post(f"{API}/payments/mock/confirm/{pay['id']}", data={"result": "paid"}, follow_redirects=False)
    assert r.status_code == 303 and f"paid={pay['id']}" in r.headers["location"]
    pay = client.post(f"{API}/payments/{pay['id']}/sync", headers=buyer).json()
    assert pay["status"] == "paid"
    o = client.get(f"{API}/orders/{order['id']}", headers=buyer).json()
    assert o["payment_status"] == "paid"
    # invoices: buyer sees the tax invoice only; admin sees both; HTML renders with QR
    inv = client.get(f"{API}/payments/invoices/order/{order['id']}", headers=buyer).json()
    assert len(inv) == 1 and inv[0]["kind"] == "tax_invoice" and inv[0]["total"] == order["total"] and inv[0]["qr_tlv_base64"]
    both = client.get(f"{API}/payments/invoices/order/{order['id']}", headers=admin).json()
    assert {i["kind"] for i in both} == {"tax_invoice", "platform_fee"}
    html = client.get(f"{API}/payments/invoices/{inv[0]['id']}.html", headers=buyer).text
    assert "<svg" in html and inv[0]["number"] in html
    # cannot pay twice
    assert client.post(f"{API}/payments/checkout", headers=buyer, json={"order_id": order["id"]}).status_code == 400
    # supplier delivers → escrow released → payout pending
    sup = _supplier_headers_for(client, order)
    for st in ("confirmed", "in_delivery", "delivered"):
        assert client.patch(f"{API}/orders/{order['id']}/status", headers=sup, json={"status": st}).status_code == 200
    assert client.get(f"{API}/orders/{order['id']}", headers=buyer).json()["payment_status"] == "released"
    payouts = client.get(f"{API}/payments/payouts/mine", headers=sup).json()
    mine = [x for x in payouts if x["order_id"] == order["id"]]
    assert mine and mine[0]["status"] == "pending" and mine[0]["amount"] == pay["supplier_net"]
    summary = client.get(f"{API}/payments/supplier/summary", headers=sup).json()
    assert summary["payouts_pending"] >= pay["supplier_net"]
    # admin finance + mark payout paid
    fin = client.get(f"{API}/admin/finance", headers=admin).json()
    assert fin["fees_earned"] >= pay["platform_fee"] and fin["payouts_pending"] >= pay["supplier_net"]
    r = client.post(f"{API}/admin/payouts/{mine[0]['id']}/paid", headers=admin, params={"reference": "TRF-001"})
    assert r.json()["status"] == "paid"
    assert client.get(f"{API}/payments/mine", headers=buyer).json()[0]["order_id"] == order["id"]


def test_bank_transfer_confirm_and_refund_on_cancel(client):
    buyer = auth(client, "buyer@demo.sa")
    admin = auth(client, "admin@mysupplier.sa", "Admin@2026")
    order = _new_order(client, buyer)
    pay = client.post(f"{API}/payments/checkout", headers=buyer, json={"order_id": order["id"], "method": "bank_transfer"}).json()
    assert pay["status"] == "pending_transfer" and f"MS-{pay['id']}" in pay["bank_instructions"]
    assert client.get(f"{API}/orders/{order['id']}", headers=buyer).json()["payment_status"] == "pending"
    r = client.post(f"{API}/admin/payments/{pay['id']}/confirm-transfer", headers=admin, params={"reference": "BT-77"})
    assert r.json()["status"] == "paid" and r.json()["transfer_reference"] == "BT-77"
    # buyer cancels a paid, undelivered order → automatic refund
    r = client.patch(f"{API}/orders/{order['id']}/status", headers=buyer, json={"status": "cancelled"})
    assert r.status_code == 200 and r.json()["payment_status"] == "refunded"
    assert client.get(f"{API}/payments/order/{order['id']}", headers=buyer).json()[0]["status"] == "refunded"


def test_failed_payment_and_webhook(client):
    buyer = auth(client, "buyer@demo.sa")
    order = _new_order(client, buyer)
    pay = client.post(f"{API}/payments/checkout", headers=buyer, json={"order_id": order["id"]}).json()
    client.post(f"{API}/payments/mock/confirm/{pay['id']}", data={"result": "failed"}, follow_redirects=False)
    assert client.post(f"{API}/payments/{pay['id']}/sync", headers=buyer).json()["status"] == "failed"
    assert client.get(f"{API}/orders/{order['id']}", headers=buyer).json()["payment_status"] == "unpaid"
    # a new attempt can be started; webhook with bad secret is rejected, good secret marks paid
    pay2 = client.post(f"{API}/payments/checkout", headers=buyer, json={"order_id": order["id"]}).json()
    assert pay2["id"] != pay["id"]
    bad = client.post(f"{API}/payments/webhook/moyasar", json={"secret_token": "nope", "data": {"metadata": {"payment_id": pay2["id"]}, "status": "paid"}})
    assert bad.status_code == 401
    ok = client.post(f"{API}/payments/webhook/moyasar", headers={"X-Webhook-Secret": "whsec-test"},
                     json={"data": {"id": "inv_123", "metadata": {"payment_id": str(pay2["id"])}, "status": "paid"}})
    assert ok.status_code == 200 and ok.json()["status"] == "paid"
    assert client.get(f"{API}/orders/{order['id']}", headers=buyer).json()["payment_status"] == "paid"


def test_otp_register_login_reset(client):
    r = client.post(f"{API}/auth/otp/request", json={"destination": "0551234567", "purpose": "register"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["destination"] == "+966551234567" and body["channel"] == "sms" and body.get("debug_code")
    # wrong code counts an attempt, right code returns a token
    assert client.post(f"{API}/auth/otp/verify", json={"destination": "0551234567", "code": "000000"}).status_code == 400
    v = client.post(f"{API}/auth/otp/verify", json={"destination": "+966 55 123 4567", "code": body["debug_code"]}).json()
    assert v["verification_token"]
    # code cannot be reused
    assert client.post(f"{API}/auth/otp/verify", json={"destination": "0551234567", "code": body["debug_code"]}).status_code == 400
    r = client.post(f"{API}/auth/register", json={"email": "otp.user@test.sa", "password": "Secret123!", "full_name": "OTP User",
                                                  "otp_token": v["verification_token"]})
    assert r.status_code == 201, r.text
    u = r.json()["user"]
    assert u["phone"] == "+966551234567" and u["phone_verified"] is True
    # token bound to purpose: register token cannot reset a password
    assert client.post(f"{API}/auth/password/reset", json={"verification_token": v["verification_token"], "new_password": "Another123!"}).status_code == 400
    # passwordless login by phone
    code = client.post(f"{API}/auth/otp/request", json={"destination": "0551234567", "purpose": "login"}).json()["debug_code"]
    login = client.post(f"{API}/auth/otp/verify", json={"destination": "0551234567", "code": code, "purpose": "login"}).json()
    assert login["access_token"] and login["user"]["email"] == "otp.user@test.sa"
    # password reset via email OTP
    assert client.post(f"{API}/auth/otp/request", json={"destination": "nobody@test.sa", "purpose": "reset"}).status_code == 404
    code = client.post(f"{API}/auth/otp/request", json={"destination": "otp.user@test.sa", "purpose": "reset"}).json()["debug_code"]
    tok = client.post(f"{API}/auth/otp/verify", json={"destination": "otp.user@test.sa", "code": code, "purpose": "reset"}).json()["verification_token"]
    assert client.post(f"{API}/auth/password/reset", json={"verification_token": tok, "new_password": "Changed123!"}).status_code == 204
    assert client.post(f"{API}/auth/login", json={"email": "otp.user@test.sa", "password": "Changed123!"}).status_code == 200
    # rate limit on requests per destination
    for _ in range(3):
        client.post(f"{API}/auth/otp/request", json={"destination": "0559999999"})
    assert client.post(f"{API}/auth/otp/request", json={"destination": "0559999999"}).status_code == 429


def test_notification_outbox_devices_and_prefs(client):
    buyer = auth(client, "buyer@demo.sa")
    r = client.post(f"{API}/notifications/devices", headers=buyer, json={"token": "ExponentPushToken[test-device-1]", "platform": "expo", "device_name": "iPhone"})
    assert r.status_code == 201
    assert client.post(f"{API}/notifications/devices", headers=buyer, json={"token": "ExponentPushToken[test-device-1]"}).status_code == 201  # idempotent
    me = client.patch(f"{API}/auth/me/notifications", headers=buyer, json={"notify_sms": False, "notify_whatsapp": True}).json()
    assert me["notify_sms"] is False and me["notify_whatsapp"] is True
    before = max([d["id"] for d in client.get(f"{API}/notifications/deliveries", headers=buyer).json()] or [0])
    # trigger a notification (direct order → supplier) and one to the buyer (payment)
    order = _new_order(client, buyer)
    pay = client.post(f"{API}/payments/checkout", headers=buyer, json={"order_id": order["id"]}).json()
    client.post(f"{API}/payments/mock/confirm/{pay['id']}", data={"result": "paid"}, follow_redirects=False)
    with SessionLocal() as db:
        queued = db.query(NotificationDelivery).filter(NotificationDelivery.status == "queued").count()
        assert queued > 0
        result = channels.process_queue(db)
        assert result["sent"] > 0 and result["failed"] == 0
    mine = [d for d in client.get(f"{API}/notifications/deliveries", headers=buyer).json() if d["id"] > before]
    chans = {d["channel"] for d in mine}
    assert "push" in chans and "email" in chans and "whatsapp" in chans and "sms" not in chans
    assert all(d["status"] == "sent" for d in mine)
    admin = auth(client, "admin@mysupplier.sa", "Admin@2026")
    rows = client.get(f"{API}/admin/deliveries", headers=admin, params={"status": "sent"}).json()
    assert rows
    assert client.post(f"{API}/admin/deliveries/{rows[0]['id']}/retry", headers=admin).json()["status"] == "queued"
    assert client.delete(f"{API}/notifications/devices/ExponentPushToken[test-device-1]", headers=buyer).status_code == 204


def test_jobs_expire_rfq_and_price_alert(client):
    buyer = auth(client, "buyer@demo.sa")
    admin = auth(client, "admin@mysupplier.sa", "Admin@2026")
    cement = client.get(f"{API}/catalog/products", params={"q": "CEM-QAS-50"}).json()["items"][0]
    rfq = client.post(f"{API}/rfq", headers=buyer, json={"title": "طلب سينتهي", "items": [{"product_id": cement["id"], "quantity": 10}]}).json()
    with SessionLocal() as db:
        db.get(RFQ, rfq["id"]).closes_at = utcnow() - timedelta(minutes=1)
        db.commit()
    r = client.post(f"{API}/admin/jobs/close_expired_rfqs/run", headers=admin)
    assert r.json()["result"]["closed"] >= 1
    assert client.get(f"{API}/rfq/{rfq['id']}", headers=buyer).json()["status"] == "closed"
    # price alert: baseline is set on first run, then a target above the current best fires immediately
    a = client.post(f"{API}/catalog/alerts", headers=buyer, json={"product_id": cement["id"], "target_price": 99999}).json()
    client.post(f"{API}/admin/jobs/price_alerts/run", headers=admin)  # sets baseline
    res = client.post(f"{API}/admin/jobs/price_alerts/run", headers=admin).json()["result"]
    assert res["fired"] >= 1
    notes = client.get(f"{API}/notifications", headers=buyer, params={"unread_only": True}).json()
    assert any(n["kind"] == "price_alert" and n["ref_id"] == cement["id"] for n in notes)
    with SessionLocal() as db:
        assert db.get(PriceAlert, a["id"]).last_notified_at is not None
    runs = client.get(f"{API}/admin/jobs", headers=admin).json()
    assert "outbox" in runs["jobs"] and any(x["name"] == "price_alerts" for x in runs["runs"])
    assert "sent" in jobs.run_job("outbox", record=False)
