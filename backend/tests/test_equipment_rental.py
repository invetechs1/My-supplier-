"""Equipment catalog: new categories/products exist, rental offers compared per basis, seeding is incremental."""
from conftest import auth

from app.db import SessionLocal
from app.models import Category, Product
from app.seed import seed

API = "/api/v1"


def test_equipment_categories_and_products(client):
    cats = client.get(f"{API}/catalog/categories").json()
    slugs = {c["slug"] for c in cats}
    for s in ("heavy-equipment", "excavation", "cranes", "generators", "scaffolding", "safety", "ppe", "fire", "surveying",
              "site-facilities", "hvac", "roads", "prefab-steel", "chemicals", "consumables", "power-tools"):
        assert s in slugs, s
    heavy = next(c for c in cats if c["slug"] == "heavy-equipment")
    assert heavy["product_count"] >= 20
    total = client.get(f"{API}/catalog/products", params={"size": 1}).json()["total"]
    assert total >= 200
    res = client.get(f"{API}/catalog/products", params={"q": "حفار"}).json()
    assert res["total"] >= 3


def test_rental_and_sale_offers(client):
    exc = client.get(f"{API}/catalog/products", params={"q": "EXC-20T"}).json()["items"][0]
    s = exc["summary"]
    assert s["basis"] == "" and s["min_price"] > 100000  # sale price is the main comparison
    assert s["rental_basis"] == "day" and 1000 < s["rental_min_price"] < 3000
    detail = client.get(f"{API}/catalog/products/{exc['id']}").json()
    periods = {o["rental_period"] for o in detail["offers"]}
    assert {"", "day", "week", "month"} <= periods
    assert detail["offers"][0]["rental_period"] == ""  # sale offers listed first
    # a rental-only product is compared per day
    low = client.get(f"{API}/catalog/products", params={"q": "TRK-LOW"}).json()["items"][0]
    assert low["summary"]["basis"] == "day" and low["summary"]["min_price"] > 0
    # supplier can add both a sale and a daily rental price for the same product in the same city
    h = auth(client, "rental1@demo.sa")
    gen = client.get(f"{API}/catalog/products", params={"q": "LGT-TWR"}).json()["items"][0]
    r1 = client.post(f"{API}/suppliers/me/offers", headers=h, json={"product_id": gen["id"], "price": 36000, "city": "جدة"})
    r2 = client.post(f"{API}/suppliers/me/offers", headers=h, json={"product_id": gen["id"], "price": 240, "city": "جدة", "rental_period": "day"})
    assert r1.status_code == 201 and r2.status_code == 201 and r1.json()["id"] != r2.json()["id"]
    csv_data = "sku,price,city,rental_period\nGEN-100,470,جدة,day\nGEN-100,82000,جدة,\n"
    import io
    r = client.post(f"{API}/suppliers/me/offers/import", headers=h, files={"file": ("p.csv", io.BytesIO(csv_data.encode()), "text/csv")})
    assert r.json()["created_offers"] == 2


def test_seed_is_incremental(client):
    with SessionLocal() as db:
        before_c, before_p = db.query(Category).count(), db.query(Product).count()
        seed(db)
        assert db.query(Category).count() == before_c and db.query(Product).count() == before_p
