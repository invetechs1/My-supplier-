"""Initial data: admin user, category tree, Saudi building-materials catalog, demo suppliers with prices and history."""
import random
from datetime import timedelta

from sqlalchemy.orm import Session

from .config import ADMIN_EMAIL, ADMIN_PASSWORD, SEED_DEMO_DATA
from .models import Category, Offer, PriceHistory, PriceSource, Product, Supplier, User, utcnow
from .security import hash_password

CATEGORIES = [
    ("cement", "الأسمنت", "Cement", "🏗️", [("cement-opc", "أسمنت بورتلاندي عادي", "Ordinary Portland Cement"),
                                        ("cement-src", "أسمنت مقاوم للكبريتات", "Sulphate Resistant Cement"),
                                        ("cement-white", "أسمنت أبيض", "White Cement")]),
    ("steel", "الحديد", "Steel & Rebar", "🔩", [("rebar", "حديد تسليح", "Rebar"), ("steel-mesh", "شبك حديد", "Wire Mesh"),
                                             ("steel-sections", "مقاطع حديدية", "Steel Sections")]),
    ("blocks", "البلوك والطوب", "Blocks & Bricks", "🧱", [("blocks-concrete", "بلوك أسمنتي", "Concrete Blocks"),
                                                       ("blocks-insulated", "بلوك معزول", "Insulated Blocks"),
                                                       ("bricks", "طوب أحمر", "Clay Bricks")]),
    ("aggregates", "الرمل والبحص", "Sand & Aggregates", "⛰️", [("sand", "رمل", "Sand"), ("gravel", "بحص", "Gravel")]),
    ("concrete", "الخرسانة الجاهزة", "Ready-Mix Concrete", "🚛", []),
    ("tiles", "البلاط والرخام", "Tiles & Marble", "◼️", [("ceramic", "سيراميك", "Ceramic"), ("porcelain", "بورسلان", "Porcelain"),
                                                      ("marble", "رخام وجرانيت", "Marble & Granite")]),
    ("paint", "الدهانات", "Paints & Coatings", "🎨", []),
    ("plumbing", "السباكة", "Plumbing", "🚿", [("pipes-pvc", "مواسير PVC/UPVC", "PVC/UPVC Pipes"), ("pipes-ppr", "مواسير PPR", "PPR Pipes"),
                                             ("sanitary", "أدوات صحية", "Sanitary Ware")]),
    ("electrical", "الكهرباء", "Electrical", "⚡", [("cables", "كابلات وأسلاك", "Cables & Wires"), ("lighting", "إنارة", "Lighting"),
                                                  ("switches", "مفاتيح وأفياش", "Switches & Sockets")]),
    ("wood", "الأخشاب", "Timber & Plywood", "🪵", []),
    ("insulation", "العزل", "Insulation & Waterproofing", "🛡️", []),
    ("gypsum", "الجبس والأسقف", "Gypsum & Ceilings", "⬜", []),
    ("doors", "الأبواب والنوافذ", "Doors & Windows", "🚪", []),
    ("tools", "العدد والأدوات", "Tools & Equipment", "🧰", []),
    ("other", "أخرى", "Other", "📦", []),
]

# (category slug, sku, name_ar, name_en, brand, unit, base price SAR ex-VAT, spec)
PRODUCTS = [
    ("cement-opc", "CEM-YAM-50", "أسمنت بورتلاندي عادي 50 كجم", "OPC Cement 50kg", "اليمامة", "bag", 14.5, {"weight_kg": 50, "type": "OPC 42.5N"}),
    ("cement-opc", "CEM-SAU-50", "أسمنت بورتلاندي عادي 50 كجم", "OPC Cement 50kg", "أسمنت السعودية", "bag", 14.0, {"weight_kg": 50}),
    ("cement-opc", "CEM-QAS-50", "أسمنت بورتلاندي عادي 50 كجم", "OPC Cement 50kg", "أسمنت القصيم", "bag", 13.8, {"weight_kg": 50}),
    ("cement-opc", "CEM-BULK-T", "أسمنت سائب (طن)", "Bulk Cement (ton)", "اليمامة", "ton", 255.0, {}),
    ("cement-src", "SRC-YAM-50", "أسمنت مقاوم للكبريتات 50 كجم", "SRC Cement 50kg", "اليمامة", "bag", 16.0, {"type": "SRC"}),
    ("cement-white", "WCEM-25", "أسمنت أبيض 25 كجم", "White Cement 25kg", "الأسمنت الأبيض السعودي", "bag", 32.0, {}),
    ("rebar", "RB-8", "حديد تسليح قطر 8 مم", "Rebar 8mm", "حديد", "ton", 2650.0, {"diameter_mm": 8, "grade": "B500B"}),
    ("rebar", "RB-10", "حديد تسليح قطر 10 مم", "Rebar 10mm", "حديد", "ton", 2600.0, {"diameter_mm": 10}),
    ("rebar", "RB-12", "حديد تسليح قطر 12 مم", "Rebar 12mm", "حديد", "ton", 2580.0, {"diameter_mm": 12}),
    ("rebar", "RB-16", "حديد تسليح قطر 16 مم", "Rebar 16mm", "حديد", "ton", 2560.0, {"diameter_mm": 16}),
    ("rebar", "RB-20", "حديد تسليح قطر 20 مم", "Rebar 20mm", "حديد", "ton", 2560.0, {"diameter_mm": 20}),
    ("rebar", "RB-12-RAJ", "حديد تسليح قطر 12 مم", "Rebar 12mm", "الراجحي للحديد", "ton", 2540.0, {"diameter_mm": 12}),
    ("steel-mesh", "MESH-A142", "شبك حديد A142 (2×6م)", "Wire Mesh A142 2x6m", "", "sheet", 95.0, {}),
    ("steel-sections", "IPE-200", "عمود حديد IPE 200", "IPE 200 Beam", "", "ton", 3400.0, {}),
    ("blocks-concrete", "BLK-20", "بلوك أسمنتي 20 سم", "Concrete Block 20cm", "", "piece", 3.1, {"size": "40x20x20"}),
    ("blocks-concrete", "BLK-15", "بلوك أسمنتي 15 سم", "Concrete Block 15cm", "", "piece", 2.7, {"size": "40x20x15"}),
    ("blocks-concrete", "BLK-10", "بلوك أسمنتي 10 سم", "Concrete Block 10cm", "", "piece", 2.3, {"size": "40x20x10"}),
    ("blocks-insulated", "BLK-INS-20", "بلوك معزول 20 سم", "Insulated Block 20cm", "", "piece", 5.4, {}),
    ("bricks", "BRICK-RED", "طوب أحمر", "Red Clay Brick", "", "piece", 0.95, {}),
    ("sand", "SAND-WHT", "رمل أبيض (تريلا 20م³)", "White Sand (20m³ truck)", "", "load", 850.0, {"m3": 20}),
    ("sand", "SAND-RED", "رمل أحمر (تريلا 20م³)", "Red Sand (20m³ truck)", "", "load", 650.0, {"m3": 20}),
    ("gravel", "GRV-34", "بحص 3/4 (تريلا 20م³)", "Aggregate 3/4 (20m³)", "", "load", 1150.0, {"m3": 20}),
    ("gravel", "GRV-38", "بحص 3/8 (تريلا 20م³)", "Aggregate 3/8 (20m³)", "", "load", 1100.0, {"m3": 20}),
    ("concrete", "RMC-25", "خرسانة جاهزة 250 كجم/سم²", "Ready-Mix Concrete C25", "", "m3", 205.0, {"grade": "C25"}),
    ("concrete", "RMC-30", "خرسانة جاهزة 300 كجم/سم²", "Ready-Mix Concrete C30", "", "m3", 215.0, {"grade": "C30"}),
    ("concrete", "RMC-35", "خرسانة جاهزة 350 كجم/سم²", "Ready-Mix Concrete C35", "", "m3", 228.0, {"grade": "C35"}),
    ("ceramic", "CER-60", "سيراميك أرضيات 60×60", "Ceramic Floor Tile 60x60", "الخزف السعودي", "m2", 32.0, {}),
    ("ceramic", "CER-30-W", "سيراميك جدران 30×60", "Ceramic Wall Tile 30x60", "الخزف السعودي", "m2", 28.0, {}),
    ("porcelain", "POR-60", "بورسلان 60×60", "Porcelain Tile 60x60", "RAK", "m2", 48.0, {}),
    ("porcelain", "POR-120", "بورسلان 120×60", "Porcelain Tile 120x60", "RAK", "m2", 68.0, {}),
    ("marble", "MRB-CARR", "رخام كرارة", "Carrara Marble", "", "m2", 260.0, {}),
    ("marble", "GRN-BLK", "جرانيت أسود", "Black Granite", "", "m2", 190.0, {}),
    ("paint", "PNT-INT-18", "دهان داخلي 18 لتر", "Interior Emulsion 18L", "الجزيرة", "pail", 165.0, {"liters": 18}),
    ("paint", "PNT-EXT-18", "دهان خارجي 18 لتر", "Exterior Paint 18L", "الجزيرة", "pail", 210.0, {"liters": 18}),
    ("paint", "PNT-PRM-18", "برايمر 18 لتر", "Primer 18L", "جوتن", "pail", 140.0, {"liters": 18}),
    ("paint", "PUTTY-25", "معجون 25 كجم", "Wall Putty 25kg", "", "bag", 38.0, {}),
    ("pipes-pvc", "UPVC-4", "ماسورة UPVC قطر 4 بوصة (6م)", "UPVC Pipe 4in 6m", "", "piece", 68.0, {}),
    ("pipes-pvc", "UPVC-2", "ماسورة UPVC قطر 2 بوصة (6م)", "UPVC Pipe 2in 6m", "", "piece", 30.0, {}),
    ("pipes-ppr", "PPR-25", "ماسورة PPR قطر 25 مم (4م)", "PPR Pipe 25mm 4m", "", "piece", 22.0, {}),
    ("pipes-ppr", "PPR-32", "ماسورة PPR قطر 32 مم (4م)", "PPR Pipe 32mm 4m", "", "piece", 34.0, {}),
    ("sanitary", "WC-SET", "طقم مرحاض إفرنجي", "WC Set", "", "set", 480.0, {}),
    ("sanitary", "BASIN", "مغسلة", "Wash Basin", "", "piece", 260.0, {}),
    ("cables", "CBL-2.5", "سلك كهرباء 2.5 مم (لفة 100م)", "Cable 2.5mm² 100m", "الكابلات السعودية", "roll", 265.0, {}),
    ("cables", "CBL-4", "سلك كهرباء 4 مم (لفة 100م)", "Cable 4mm² 100m", "الكابلات السعودية", "roll", 410.0, {}),
    ("cables", "CBL-6", "سلك كهرباء 6 مم (لفة 100م)", "Cable 6mm² 100m", "الكابلات السعودية", "roll", 610.0, {}),
    ("lighting", "LED-PNL", "لوحة LED 60×60", "LED Panel 60x60", "", "piece", 55.0, {}),
    ("switches", "SW-1G", "مفتاح إنارة مفرد", "1-Gang Switch", "", "piece", 14.0, {}),
    ("switches", "SKT-13", "فيش كهرباء 13 أمبير", "13A Socket", "", "piece", 16.0, {}),
    ("wood", "PLY-18", "خشب أبلكاش 18 مم (122×244)", "Plywood 18mm", "", "sheet", 95.0, {}),
    ("wood", "WOOD-2x4", "عرق خشب 2×4 (4م)", "Timber 2x4 4m", "", "piece", 28.0, {}),
    ("insulation", "INS-XPS-5", "عازل حراري XPS 5 سم", "XPS Insulation 5cm", "", "m2", 22.0, {}),
    ("insulation", "WP-MEMB-4", "رولات عزل مائي 4 مم", "Bitumen Membrane 4mm", "", "roll", 120.0, {}),
    ("gypsum", "GYP-12", "لوح جبس 12 مم (120×240)", "Gypsum Board 12mm", "", "sheet", 32.0, {}),
    ("gypsum", "GYP-PLST-25", "جبس بورد بودرة 25 كجم", "Gypsum Plaster 25kg", "", "bag", 18.0, {}),
    ("doors", "DR-WOOD", "باب خشب داخلي", "Interior Wooden Door", "", "piece", 650.0, {}),
    ("doors", "WIN-ALU-M2", "نافذة ألمنيوم (م²)", "Aluminium Window (m²)", "", "m2", 420.0, {}),
    ("tools", "DRILL-18V", "دريل شحن 18 فولت", "Cordless Drill 18V", "Bosch", "piece", 390.0, {}),
    ("tools", "WHLBRW", "عربة يد", "Wheelbarrow", "", "piece", 160.0, {}),
]

CITIES = ["الرياض", "جدة", "الدمام", "مكة المكرمة", "المدينة المنورة"]

# demo suppliers: (email, name, city, category slugs (top-level), verified, rating)
DEMO_SUPPLIERS = [
    ("supplier1@demo.sa", "مؤسسة البناء الحديث لمواد البناء", "الرياض", ["cement", "steel", "blocks", "aggregates"], True, 4.6),
    ("supplier2@demo.sa", "شركة الخليج للحديد والأسمنت", "الدمام", ["cement", "steel"], True, 4.3),
    ("supplier3@demo.sa", "مستودعات جدة للسيراميك والدهانات", "جدة", ["tiles", "paint", "gypsum"], True, 4.8),
    ("supplier4@demo.sa", "الرائد للكهرباء والسباكة", "الرياض", ["plumbing", "electrical", "tools"], False, 4.1),
    ("supplier5@demo.sa", "خرسانة الوسط الجاهزة", "الرياض", ["concrete", "aggregates"], True, 4.4),
    ("supplier6@demo.sa", "مصنع الشرقية للبلوك", "الدمام", ["blocks", "aggregates", "insulation"], True, 4.0),
    ("supplier7@demo.sa", "أخشاب وأبواب الحرمين", "مكة المكرمة", ["wood", "doors", "gypsum", "insulation"], False, 3.9),
]

EXTERNAL_SOURCES = [
    ("مؤشر أسعار السوق — مرجع", "https://example.com/market-index", "الرياض"),
    ("قائمة أسعار مورد خارجي (جدة)", "https://example.com/jeddah-prices", "جدة"),
]


def _ensure_admin(db: Session) -> None:
    if not db.query(User).filter(User.email == ADMIN_EMAIL.lower()).first():
        db.add(User(email=ADMIN_EMAIL.lower(), password_hash=hash_password(ADMIN_PASSWORD), full_name="مدير المنصة",
                    role="admin", company_name="My Supplier", city="الرياض"))
        db.commit()


def _ensure_categories(db: Session) -> dict[str, Category]:
    existing = {c.slug: c for c in db.query(Category).all()}
    if existing:
        return existing
    for order, (slug, ar, en, icon, children) in enumerate(CATEGORIES):
        parent = Category(slug=slug, name_ar=ar, name_en=en, icon=icon, sort_order=order)
        db.add(parent)
        db.flush()
        existing[slug] = parent
        for j, (cslug, car, cen) in enumerate(children):
            child = Category(slug=cslug, name_ar=car, name_en=cen, parent_id=parent.id, icon=icon, sort_order=j)
            db.add(child)
            db.flush()
            existing[cslug] = child
    db.commit()
    return existing


def _ensure_products(db: Session, cats: dict[str, Category]) -> dict[str, Product]:
    existing = {p.sku: p for p in db.query(Product).all()}
    if existing:
        return existing
    for slug, sku, ar, en, brand, unit, price, spec in PRODUCTS:
        cat = cats.get(slug) or cats["other"]
        p = Product(category_id=cat.id, sku=sku, name_ar=ar, name_en=en, brand=brand, unit=unit, spec={**spec, "base_price": price})
        db.add(p)
        existing[sku] = p
    db.commit()
    return existing


def _demo_data(db: Session, cats: dict[str, Category], products: dict[str, Product]) -> None:
    if db.query(Supplier).count():
        return
    rnd = random.Random(2026)
    top_of = {}
    for c in cats.values():
        top_of[c.id] = c.parent_id or c.id
    suppliers = []
    for email, name, city, slugs, verified, rating in DEMO_SUPPLIERS:
        user = User(email=email, password_hash=hash_password("Demo@2026"), full_name=name, role="supplier",
                    company_name=name, city=city, phone="+9665" + str(rnd.randint(10000000, 99999999)))
        db.add(user)
        db.flush()
        s = Supplier(user_id=user.id, name=name, city=city, category_ids=[cats[s].id for s in slugs], verified=verified,
                     rating=rating, rating_count=rnd.randint(4, 40), cr_number=str(rnd.randint(1010000000, 1019999999)),
                     vat_number="3" + str(rnd.randint(10**13, 10**14 - 1)), regions=[city], lead_time_days=rnd.randint(1, 5),
                     description="مورد معتمد لمواد البناء — توريد وتوصيل لمواقع المشاريع.", plan="pro" if verified else "free")
        db.add(s)
        db.flush()
        suppliers.append(s)
    externals = []
    for name, url, city in EXTERNAL_SOURCES:
        s = Supplier(name=name, city=city, is_external=True, verified=False, website=url, delivery_available=False)
        db.add(s)
        db.flush()
        externals.append(s)
        db.add(PriceSource(name=name, kind="csv", url=url, city=city, supplier_id=s.id, last_status="not fetched yet"))
    buyer = User(email="buyer@demo.sa", password_hash=hash_password("Demo@2026"), full_name="م. خالد العتيبي", role="buyer",
                 company_name="شركة الإنشاءات المتقدمة", city="الرياض", phone="+966501234567")
    db.add(buyer)
    now = utcnow()
    for p in products.values():
        base = p.spec.get("base_price", 10)
        top = top_of[p.category_id]
        for s in suppliers:
            if top not in s.category_ids:
                continue
            for city in {s.city, *rnd.sample(CITIES, 1)}:
                factor = rnd.uniform(0.94, 1.12)
                price = round(base * factor, 2)
                offer = Offer(supplier_id=s.id, product_id=p.id, price=price, unit=p.unit, city=city,
                              min_qty=rnd.choice([1, 1, 1, 10, 50]), includes_vat=False, delivery_included=rnd.random() < 0.3,
                              stock_status=rnd.choice(["in_stock"] * 8 + ["limited"]),
                              updated_at=now - timedelta(days=rnd.randint(0, 12)))
                db.add(offer)
                # 90-day history with a gentle trend + noise
                trend = rnd.uniform(-0.06, 0.08)
                for d in range(90, -1, -6):
                    hist_price = round(base * factor * (1 - trend * d / 90) * rnd.uniform(0.985, 1.015), 2)
                    db.add(PriceHistory(product_id=p.id, supplier_id=s.id, city=city, price=hist_price,
                                        recorded_at=now - timedelta(days=d)))
        for ext in externals:
            if rnd.random() < 0.6:
                price = round(base * rnd.uniform(0.97, 1.08), 2)
                db.add(Offer(supplier_id=ext.id, product_id=p.id, price=price, unit=p.unit, city=ext.city, source="external",
                             source_name=ext.name, source_url=ext.website, updated_at=now - timedelta(days=rnd.randint(0, 20))))
                db.add(PriceHistory(product_id=p.id, supplier_id=ext.id, city=ext.city, price=price, recorded_at=now - timedelta(days=1)))
    db.commit()


def seed(db: Session) -> None:
    _ensure_admin(db)
    cats = _ensure_categories(db)
    products = _ensure_products(db, cats)
    if SEED_DEMO_DATA:
        _demo_data(db, cats, products)
