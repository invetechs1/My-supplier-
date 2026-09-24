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
    ("tools", "العدد والأدوات", "Tools & Equipment", "🧰", [("power-tools", "عدد كهربائية", "Power Tools"), ("hand-tools", "عدد يدوية", "Hand Tools"),
                                                        ("measuring", "أدوات قياس", "Measuring Tools")]),
    ("heavy-equipment", "المعدات الثقيلة", "Heavy Equipment", "🚜", [("excavation", "حفر وتحميل", "Excavation & Loading"), ("cranes", "رافعات", "Cranes"),
                                                                    ("compaction", "دك وتسوية", "Compaction & Grading"), ("trucks", "شاحنات ومركبات", "Trucks & Vehicles"),
                                                                    ("forklifts", "رافعات شوكية", "Forklifts & Telehandlers")]),
    ("power-air", "المولدات والضواغط", "Generators & Compressors", "🔌", [("generators", "مولدات كهربائية", "Generators"), ("compressors", "ضواغط هواء", "Air Compressors"),
                                                                       ("welding", "معدات لحام", "Welding"), ("pumps", "مضخات", "Pumps")]),
    ("concrete-equipment", "معدات الخرسانة والحديد", "Concrete & Rebar Equipment", "🧱", []),
    ("scaffolding", "السقالات والشدات", "Scaffolding & Formwork", "🏗️", [("scaffold", "سقالات", "Scaffolding"), ("formwork", "شدات وقوالب", "Formwork & Props")]),
    ("lifting", "معدات الرفع", "Lifting & Hoisting", "🪝", []),
    ("safety", "السلامة ومعدات الوقاية", "Safety & PPE", "🦺", [("ppe", "معدات الوقاية الشخصية", "Personal Protective Equipment"), ("site-safety", "سلامة الموقع", "Site Safety"),
                                                            ("fire", "الإطفاء والإنذار", "Fire Fighting & Alarm")]),
    ("surveying", "أجهزة المساحة", "Surveying Instruments", "📐", []),
    ("site-facilities", "مرافق الموقع", "Site Facilities", "🏠", []),
    ("hvac", "التكييف والتهوية", "HVAC & Ventilation", "❄️", []),
    ("glass-aluminium", "الزجاج والألمنيوم والكلادينج", "Glass, Aluminium & Cladding", "🪟", []),
    ("roads", "الأسفلت والطرق", "Roads & Asphalt", "🛣️", []),
    ("landscaping", "تنسيق المواقع", "Landscaping", "🌳", []),
    ("prefab-steel", "الهياكل والمباني الجاهزة", "Steel Structures & Prefab", "🏭", []),
    ("finishes", "التشطيبات والديكور", "Finishes & Interiors", "🪞", []),
    ("chemicals", "الكيماويات الإنشائية", "Construction Chemicals", "🧪", []),
    ("consumables", "قطع الغيار والمستهلكات", "Spare Parts & Consumables", "⚙️", [("fasteners", "مسامير وبراغي وأنكر", "Fasteners & Anchors"),
                                                                              ("abrasives", "أقراص قطع وجلخ", "Cutting & Grinding"), ("parts", "قطع غيار معدات", "Equipment Parts")]),
    ("other", "أخرى", "Other", "📦", []),
]

# products whose main offers are rentals get unit "unit"; rental prices are per day/week/month on the offer
EQUIPMENT_PRODUCTS = [
    # (category slug, sku, name_ar, name_en, brand, unit, sale price SAR ex-VAT or None, spec, rent/day SAR or None)
    ("excavation", "EXC-20T", "حفار مجنزر 20 طن", "Crawler Excavator 20t", "CAT 320", "unit", 480000, {"weight_t": 20, "bucket_m3": 1.0}, 1800),
    ("excavation", "EXC-30T", "حفار مجنزر 30 طن", "Crawler Excavator 30t", "Komatsu PC300", "unit", 720000, {"weight_t": 30}, 2600),
    ("excavation", "EXC-MINI", "حفار صغير 3 طن", "Mini Excavator 3t", "Kubota", "unit", 145000, {"weight_t": 3}, 650),
    ("excavation", "BKH-3CX", "حفار خلفي (بوكلين) 3CX", "Backhoe Loader 3CX", "JCB", "unit", 285000, {}, 900),
    ("excavation", "WLD-950", "لودر عجل 3 م³", "Wheel Loader 3m³", "CAT 950", "unit", 890000, {"bucket_m3": 3}, 2000),
    ("excavation", "DZR-D6", "بلدوزر D6", "Bulldozer D6", "CAT D6", "unit", 1150000, {}, 2500),
    ("excavation", "SKD-STR", "لودر انزلاقي (بوبكات)", "Skid Steer Loader", "Bobcat S650", "unit", 165000, {}, 600),
    ("cranes", "CRN-50T", "رافعة متحركة 50 طن", "Mobile Crane 50t", "Grove", "unit", 1650000, {"capacity_t": 50}, 3500),
    ("cranes", "CRN-100T", "رافعة متحركة 100 طن", "Mobile Crane 100t", "Liebherr", "unit", 3200000, {"capacity_t": 100}, 6500),
    ("cranes", "TWR-CRN", "رافعة برجية 8 طن", "Tower Crane 8t", "Potain", "unit", 1900000, {"capacity_t": 8}, 1600),
    ("cranes", "CRN-BOOM", "شاحنة برافعة (بوم تراك) 10 طن", "Boom Truck 10t", "Hiab", "unit", 420000, {}, 1100),
    ("compaction", "RLR-10T", "مدحلة اهتزازية 10 طن", "Vibratory Roller 10t", "Bomag", "unit", 380000, {"weight_t": 10}, 1200),
    ("compaction", "GRD-140", "جريدر 140", "Motor Grader 140", "CAT 140", "unit", 1250000, {}, 2200),
    ("compaction", "PLT-CMP", "دكاكة يدوية (بليت)", "Plate Compactor", "Wacker", "piece", 6500, {}, 120),
    ("compaction", "RMR-JMP", "دكاكة قافزة", "Jumping Jack Rammer", "Wacker", "piece", 8200, {}, 150),
    ("trucks", "TRK-TIP", "شاحنة قلاب 18 م³", "Tipper Truck 18m³", "Mercedes Actros", "unit", 520000, {}, 1300),
    ("trucks", "TRK-WTR", "صهريج ماء 20,000 لتر", "Water Tanker 20,000L", "", "unit", 380000, {}, 900),
    ("trucks", "TRK-MIX", "شاحنة خلاطة خرسانة 8 م³", "Concrete Mixer Truck 8m³", "", "unit", 610000, {}, 1500),
    ("trucks", "PMP-CON", "مضخة خرسانة 36 م", "Concrete Pump Truck 36m", "Putzmeister", "unit", 1450000, {}, 2800),
    ("trucks", "TRK-PKP", "بيك أب ديزل دبل كابينة", "Diesel Double-Cab Pickup", "Toyota Hilux", "unit", 125000, {}, 350),
    ("trucks", "TRK-LOW", "شاحنة نقل معدات (لوبد)", "Lowbed Trailer Transport", "", "trip", None, {}, 2200),
    ("forklifts", "FRK-3T", "رافعة شوكية ديزل 3 طن", "Diesel Forklift 3t", "Toyota", "unit", 95000, {"capacity_t": 3}, 350),
    ("forklifts", "FRK-5T", "رافعة شوكية ديزل 5 طن", "Diesel Forklift 5t", "", "unit", 140000, {"capacity_t": 5}, 500),
    ("forklifts", "TLH-17", "رافعة تلسكوبية 17 م", "Telehandler 17m", "JCB", "unit", 390000, {}, 900),
    ("forklifts", "SCS-LFT", "منصة رفع مقصية 12 م", "Scissor Lift 12m", "Genie", "unit", 125000, {}, 400),
    ("forklifts", "BOM-LFT", "منصة رفع ذراعية 20 م", "Boom Lift 20m", "JLG", "unit", 320000, {}, 750),
    ("generators", "GEN-20", "مولد ديزل 20 كيلو فولت أمبير", "Diesel Generator 20 kVA", "Perkins", "unit", 22000, {"kva": 20}, 180),
    ("generators", "GEN-100", "مولد ديزل 100 كيلو فولت أمبير", "Diesel Generator 100 kVA", "Perkins", "unit", 85000, {"kva": 100}, 450),
    ("generators", "GEN-250", "مولد ديزل 250 كيلو فولت أمبير", "Diesel Generator 250 kVA", "Cummins", "unit", 165000, {"kva": 250}, 900),
    ("generators", "GEN-500", "مولد ديزل 500 كيلو فولت أمبير", "Diesel Generator 500 kVA", "Cummins", "unit", 320000, {"kva": 500}, 1600),
    ("generators", "LGT-TWR", "برج إنارة متنقل", "Mobile Light Tower", "", "unit", 38000, {}, 250),
    ("compressors", "CMP-185", "ضاغط هواء 185 CFM", "Air Compressor 185 CFM", "Atlas Copco", "unit", 68000, {"cfm": 185}, 350),
    ("compressors", "CMP-375", "ضاغط هواء 375 CFM", "Air Compressor 375 CFM", "Atlas Copco", "unit", 125000, {"cfm": 375}, 600),
    ("compressors", "JCK-HMR", "هيلتي هوائي (جاك همر)", "Pneumatic Breaker", "", "piece", 4800, {}, 90),
    ("welding", "WLD-400", "ماكينة لحام 400 أمبير", "Welding Machine 400A", "Lincoln", "piece", 6500, {"amps": 400}, 120),
    ("welding", "WLD-DSL", "ماكينة لحام ديزل متنقلة", "Diesel Welder Generator", "Miller", "unit", 28000, {}, 220),
    ("welding", "WLD-INV", "ماكينة لحام إنفرتر 200 أمبير", "Inverter Welder 200A", "", "piece", 1250, {}, None),
    ("pumps", "PMP-3IN", "مضخة مياه 3 بوصة", "Water Pump 3in", "Honda", "piece", 1800, {}, 80),
    ("pumps", "PMP-DEW", "مضخة نزح غاطسة 4 بوصة", "Submersible Dewatering Pump 4in", "Tsurumi", "piece", 6200, {}, 150),
    ("pumps", "PMP-SLR", "مضخة طينية 6 بوصة", "Slurry Pump 6in", "", "unit", 32000, {}, 450),
    ("concrete-equipment", "MIX-350", "خلاطة خرسانة 350 لتر", "Concrete Mixer 350L", "", "piece", 3800, {}, 90),
    ("concrete-equipment", "VIB-CON", "هزاز خرسانة كهربائي", "Concrete Vibrator", "", "piece", 1650, {}, 60),
    ("concrete-equipment", "TRW-PWR", "هليكوبتر تنعيم خرسانة", "Power Trowel 36in", "", "piece", 4500, {}, 150),
    ("concrete-equipment", "SCR-VIB", "مسطرة اهتزازية", "Vibrating Screed", "", "piece", 3200, {}, 100),
    ("concrete-equipment", "RBR-CUT", "قصاصة حديد تسليح 32 مم", "Rebar Cutter 32mm", "", "piece", 12000, {}, 200),
    ("concrete-equipment", "RBR-BND", "ثناية حديد تسليح 32 مم", "Rebar Bender 32mm", "", "piece", 14000, {}, 220),
    ("concrete-equipment", "BLK-MCH", "ماكينة بلوك أوتوماتيك", "Automatic Block Machine", "", "unit", 380000, {}, None),
    ("concrete-equipment", "CUT-CON", "منشار قطع خرسانة", "Concrete Cut-off Saw", "Stihl", "piece", 4200, {}, 120),
    ("concrete-equipment", "COR-DRL", "دريل كور خرسانة", "Core Drilling Machine", "Hilti", "piece", 9800, {}, 220),
    ("scaffold", "SCF-FRM", "إطار سقالة 1.7 م", "Scaffolding Frame 1.7m", "", "piece", 95, {}, None),
    ("scaffold", "SCF-CUP", "قائم كب لوك 3 م", "Cuplock Standard 3m", "", "piece", 85, {}, None),
    ("scaffold", "SCF-LDG", "عارضة كب لوك 1.8 م", "Cuplock Ledger 1.8m", "", "piece", 42, {}, None),
    ("scaffold", "SCF-PLK", "لوح سقالة معدني 4 م", "Steel Plank 4m", "", "piece", 120, {}, None),
    ("scaffold", "SCF-CLP", "كلامب سقالة", "Scaffold Coupler", "", "piece", 9, {}, None),
    ("scaffold", "SCF-MOB", "سقالة متحركة ألمنيوم 6 م", "Mobile Aluminium Tower 6m", "", "set", 9500, {}, 180),
    ("scaffold", "SCF-SET", "سقالات كاملة (إيجار شهري / 100 م²)", "Scaffolding Package (100m² monthly)", "", "set", None, {}, None),
    ("formwork", "FRM-PRP", "دعامة معدنية (أكرو) 3.5 م", "Acrow Prop 3.5m", "", "piece", 65, {}, None),
    ("formwork", "FRM-PNL", "لوح شدة معدني 60×120", "Steel Formwork Panel 60x120", "", "piece", 180, {}, None),
    ("formwork", "FRM-TIE", "تاي رود شدة", "Tie Rod", "", "piece", 14, {}, None),
    ("formwork", "FRM-BEM", "عارضة H20 خشبية 3 م", "H20 Timber Beam 3m", "Doka", "piece", 120, {}, None),
    ("formwork", "FRM-TBL", "شدة أسقف (طاولة) م²", "Table Formwork (m²)", "", "m2", 260, {}, None),
    ("lifting", "HST-2T", "ونش سلسلة 2 طن", "Chain Hoist 2t", "", "piece", 850, {}, None),
    ("lifting", "WNC-5T", "ونش كهربائي 5 طن", "Electric Winch 5t", "", "piece", 4200, {}, 120),
    ("lifting", "SLG-2T", "سلنج رفع 2 طن", "Lifting Sling 2t", "", "piece", 120, {}, None),
    ("lifting", "HST-MAT", "مصعد مواد للمباني", "Construction Material Hoist", "", "unit", 145000, {}, 300),
    ("lifting", "HST-PAS", "مصعد أفراد ومواد 2 طن", "Passenger & Material Hoist 2t", "", "unit", 380000, {}, 700),
    ("lifting", "ELV-PAS", "مصعد ركاب 8 أشخاص", "Passenger Elevator 8 persons", "Otis", "unit", 185000, {}, None),
    ("ppe", "PPE-HLM", "خوذة سلامة", "Safety Helmet", "3M", "piece", 18, {}, None),
    ("ppe", "PPE-VST", "سترة عاكسة", "Hi-Vis Vest", "", "piece", 12, {}, None),
    ("ppe", "PPE-BOT", "حذاء سلامة", "Safety Boots", "", "pair", 120, {}, None),
    ("ppe", "PPE-GLV", "قفازات عمل", "Work Gloves", "", "pair", 8, {}, None),
    ("ppe", "PPE-GLS", "نظارة واقية", "Safety Glasses", "3M", "piece", 10, {}, None),
    ("ppe", "PPE-HRN", "حزام أمان كامل", "Full-Body Harness", "", "piece", 180, {}, None),
    ("ppe", "PPE-MSK", "كمامة غبار N95 (علبة 20)", "N95 Dust Mask (box of 20)", "3M", "box", 45, {}, None),
    ("site-safety", "SFT-CON", "مخروط مروري", "Traffic Cone", "", "piece", 35, {}, None),
    ("site-safety", "SFT-BAR", "حاجز بلاستيك مائي", "Water-Filled Barrier", "", "piece", 220, {}, None),
    ("site-safety", "SFT-SGN", "لوحة سلامة", "Safety Sign", "", "piece", 40, {}, None),
    ("site-safety", "SFT-NET", "شبك سلامة (لفة 50 م)", "Safety Net (50m roll)", "", "roll", 180, {}, None),
    ("site-safety", "SFT-KIT", "حقيبة إسعافات أولية", "First Aid Kit", "", "piece", 220, {}, None),
    ("fire", "FIR-EXT", "طفاية حريق بودرة 6 كجم", "Fire Extinguisher 6kg", "", "piece", 160, {}, None),
    ("fire", "FIR-HSE", "بكرة خرطوم حريق", "Fire Hose Reel", "", "piece", 850, {}, None),
    ("fire", "FIR-CAB", "خزانة حريق", "Fire Hose Cabinet", "", "piece", 1200, {}, None),
    ("fire", "FIR-SPR", "رشاش حريق", "Fire Sprinkler Head", "", "piece", 22, {}, None),
    ("fire", "FIR-DET", "كاشف دخان", "Smoke Detector", "", "piece", 95, {}, None),
    ("fire", "FIR-PMP", "طقم مضخات حريق", "Fire Pump Set", "", "set", 48000, {}, None),
    ("power-tools", "GRN-7", "صاروخ جلخ 7 بوصة", "Angle Grinder 7in", "Makita", "piece", 480, {}, None),
    ("power-tools", "GRN-4", "صاروخ جلخ 4.5 بوصة", "Angle Grinder 4.5in", "Bosch", "piece", 260, {}, None),
    ("power-tools", "HMR-ROT", "هيلتي دريل دقاق", "Rotary Hammer SDS-Max", "Hilti", "piece", 1250, {}, 60),
    ("power-tools", "SAW-CIR", "منشار دائري 7 بوصة", "Circular Saw 7in", "Makita", "piece", 520, {}, None),
    ("power-tools", "CUT-TIL", "ماكينة قطع سيراميك", "Tile Cutter", "Rubi", "piece", 650, {}, None),
    ("power-tools", "MIX-PNT", "خلاط دهان كهربائي", "Paint Mixer", "", "piece", 380, {}, None),
    ("hand-tools", "TRW-STL", "مسطرين", "Trowel", "", "piece", 25, {}, None),
    ("hand-tools", "SHV-STL", "كوريك", "Shovel", "", "piece", 45, {}, None),
    ("hand-tools", "HMR-SLG", "مطرقة ثقيلة 5 كجم", "Sledge Hammer 5kg", "", "piece", 65, {}, None),
    ("hand-tools", "LVL-60", "ميزان ماء 60 سم", "Spirit Level 60cm", "Stabila", "piece", 55, {}, None),
    ("hand-tools", "TPE-8M", "متر قياس 8 م", "Tape Measure 8m", "Stanley", "piece", 25, {}, None),
    ("hand-tools", "LDR-6M", "سلم ألمنيوم 6 م", "Aluminium Ladder 6m", "", "piece", 480, {}, None),
    ("measuring", "LVL-LSR", "ميزان ليزر", "Laser Level", "Bosch", "piece", 380, {}, None),
    ("measuring", "DST-LSR", "متر ليزر", "Laser Distance Meter", "Leica", "piece", 260, {}, None),
    ("surveying", "SRV-TS", "محطة رصد شاملة", "Total Station", "Leica", "piece", 38000, {}, 350),
    ("surveying", "SRV-LVL", "ميزان قامة أوتوماتيكي", "Automatic Level", "Topcon", "piece", 1900, {}, None),
    ("surveying", "SRV-GPS", "جهاز GPS مساحي RTK", "GNSS RTK Receiver", "Trimble", "set", 65000, {}, 600),
    ("site-facilities", "CAB-3X6", "كرفان مكتب 3×6 م", "Porta Cabin Office 3x6m", "", "unit", 18000, {}, None),
    ("site-facilities", "CNT-20", "حاوية 20 قدم", "20ft Container", "", "unit", 12500, {}, None),
    ("site-facilities", "WC-PRT", "دورة مياه متنقلة", "Portable Toilet", "", "unit", 3800, {}, None),
    ("site-facilities", "TNK-5000", "خزان ماء 5000 لتر", "Water Tank 5000L", "", "piece", 2900, {}, None),
    ("site-facilities", "FNC-PNL", "سياج موقع معدني 2 م", "Site Fence Panel 2m", "", "piece", 210, {}, None),
    ("site-facilities", "LGT-SIT", "كشاف موقع LED 200 واط", "Site Floodlight 200W", "", "piece", 380, {}, None),
    ("site-facilities", "CAB-LAB", "سكن عمال 12 م (كرفان)", "Labour Cabin 12m", "", "unit", 32000, {}, None),
    ("hvac", "AC-SPL-2", "مكيف سبليت 2 طن", "Split AC 2 Ton", "Gree", "piece", 2400, {}, None),
    ("hvac", "AC-CON-3", "مكيف مركزي 3 طن", "Ducted AC 3 Ton", "Carrier", "piece", 6800, {}, None),
    ("hvac", "DCT-M2", "دكت تكييف مجلفن (م²)", "GI Duct (m²)", "", "m2", 95, {}, None),
    ("hvac", "FAN-EXH", "مروحة شفط صناعية", "Industrial Exhaust Fan", "", "piece", 220, {}, None),
    ("hvac", "CHL-30", "تشيلر 30 طن", "Chiller 30 Ton", "", "unit", 145000, {}, None),
    ("glass-aluminium", "GLS-TMP", "زجاج مقسى 10 مم (م²)", "Tempered Glass 10mm (m²)", "", "m2", 190, {}, None),
    ("glass-aluminium", "GLS-DBL", "زجاج مزدوج عازل (م²)", "Double-Glazed Unit (m²)", "", "m2", 320, {}, None),
    ("glass-aluminium", "CRT-WAL", "واجهة زجاجية كيرتن وول (م²)", "Curtain Wall (m²)", "", "m2", 850, {}, None),
    ("glass-aluminium", "CLD-ACP", "كلادينج ألمنيوم مركب (م²)", "Aluminium Composite Cladding (m²)", "Alucobond", "m2", 220, {}, None),
    ("glass-aluminium", "ALU-PRF", "بروفيل ألمنيوم (كجم)", "Aluminium Profile (kg)", "", "kg", 18, {}, None),
    ("roads", "ASP-HMX", "أسفلت ساخن (طن)", "Hot-Mix Asphalt (ton)", "", "ton", 240, {}, None),
    ("roads", "BIT-DRM", "بيتومين (برميل 180 كجم)", "Bitumen (180kg drum)", "", "drum", 1150, {}, None),
    ("roads", "CRB-STN", "بردورة خرسانية", "Concrete Kerb Stone", "", "piece", 32, {}, None),
    ("roads", "INT-LCK", "إنترلوك (م²)", "Interlock Pavers (m²)", "", "m2", 38, {}, None),
    ("roads", "PNT-RD", "دهان خطوط طرق 20 لتر", "Road Marking Paint 20L", "", "pail", 380, {}, None),
    ("roads", "ASP-PVR", "فرّادة أسفلت", "Asphalt Paver", "Vögele", "unit", 1450000, {}, 3200),
    ("landscaping", "TRF-M2", "ثيل طبيعي (م²)", "Natural Turf (m²)", "", "m2", 28, {}, None),
    ("landscaping", "TRF-ART", "عشب صناعي (م²)", "Artificial Grass (m²)", "", "m2", 65, {}, None),
    ("landscaping", "IRR-DRP", "خرطوم ري بالتنقيط (لفة 100 م)", "Drip Irrigation Pipe (100m)", "", "roll", 210, {}, None),
    ("landscaping", "SOIL-M3", "تربة زراعية (م³)", "Agricultural Soil (m³)", "", "m3", 120, {}, None),
    ("landscaping", "TRE-PLM", "نخلة واشنطونيا 3 م", "Washingtonia Palm 3m", "", "piece", 650, {}, None),
    ("prefab-steel", "SND-PNL", "ساندويتش بانل 50 مم (م²)", "Sandwich Panel 50mm (m²)", "", "m2", 95, {}, None),
    ("prefab-steel", "STL-STR", "هيكل حديدي مصنّع (طن)", "Fabricated Steel Structure (ton)", "", "ton", 7800, {}, None),
    ("prefab-steel", "PEB-M2", "مبنى معدني جاهز (م²)", "Pre-Engineered Building (m²)", "Zamil", "m2", 650, {}, None),
    ("prefab-steel", "STL-PRL", "مدادات حديد C/Z (طن)", "Steel Purlins (ton)", "", "ton", 5200, {}, None),
    ("prefab-steel", "PRC-WAL", "جدار خرساني مسبق الصب (م²)", "Precast Wall Panel (m²)", "", "m2", 380, {}, None),
    ("finishes", "PRQ-M2", "باركيه HDF (م²)", "HDF Parquet (m²)", "", "m2", 85, {}, None),
    ("finishes", "WLP-ROL", "ورق جدران (لفة)", "Wallpaper (roll)", "", "roll", 120, {}, None),
    ("finishes", "KIT-LM", "مطبخ ألمنيوم (متر طولي)", "Aluminium Kitchen (linear m)", "", "lm", 1800, {}, None),
    ("finishes", "WRD-M2", "خزانة ملابس (م²)", "Wardrobe (m²)", "", "m2", 750, {}, None),
    ("finishes", "CEL-M2", "سقف مستعار ألمنيوم (م²)", "Aluminium False Ceiling (m²)", "", "m2", 70, {}, None),
    ("chemicals", "ADM-200", "إضافة خرسانة ملدنة (200 لتر)", "Concrete Superplasticizer (200L)", "Sika", "drum", 1650, {}, None),
    ("chemicals", "EPX-20", "إيبوكسي أرضيات 20 كجم", "Epoxy Floor Coating 20kg", "Jotun", "set", 420, {}, None),
    ("chemicals", "GRT-25", "جراوت غير منكمش 25 كجم", "Non-Shrink Grout 25kg", "Sika", "bag", 48, {}, None),
    ("chemicals", "SLN-600", "سيليكون مانع تسرب 600 مل", "Silicone Sealant 600ml", "", "piece", 22, {}, None),
    ("chemicals", "CUR-200", "مركب معالجة خرسانة (200 لتر)", "Curing Compound (200L)", "", "drum", 1350, {}, None),
    ("chemicals", "WPC-20", "دهان عزل مائي 20 كجم", "Waterproof Coating 20kg", "", "pail", 260, {}, None),
    ("chemicals", "TIL-ADH", "لاصق بلاط 25 كجم", "Tile Adhesive 25kg", "", "bag", 28, {}, None),
    ("fasteners", "ANC-M12", "أنكر بولت M12 (علبة 50)", "Anchor Bolt M12 (box 50)", "Hilti", "box", 165, {}, None),
    ("fasteners", "SCR-DRY", "براغي جبس (علبة 1000)", "Drywall Screws (box 1000)", "", "box", 35, {}, None),
    ("fasteners", "NAL-25", "مسامير 25 كجم", "Nails 25kg", "", "box", 110, {}, None),
    ("fasteners", "WIR-BND", "سلك رباط 25 كجم", "Binding Wire 25kg", "", "roll", 95, {}, None),
    ("abrasives", "DSC-CUT", "أقراص قطع 4.5 بوصة (علبة 25)", "Cutting Discs 4.5in (box 25)", "Norton", "box", 95, {}, None),
    ("abrasives", "DSC-DIA", "قرص ماسي 9 بوصة", "Diamond Blade 9in", "", "piece", 180, {}, None),
    ("abrasives", "BIT-SET", "طقم ريش دريل", "Drill Bit Set", "Bosch", "set", 85, {}, None),
    ("abrasives", "ELC-5KG", "أسياخ لحام 5 كجم", "Welding Electrodes 5kg", "", "box", 55, {}, None),
    ("parts", "FLT-OIL", "فلتر زيت معدات ثقيلة", "Heavy Equipment Oil Filter", "CAT", "piece", 120, {}, None),
    ("parts", "TYR-LDR", "إطار لودر 23.5-25", "Loader Tyre 23.5-25", "", "piece", 4800, {}, None),
    ("parts", "BKT-TTH", "سن باكت حفار", "Excavator Bucket Tooth", "", "piece", 95, {}, None),
    ("parts", "OIL-HYD", "زيت هيدروليك 208 لتر", "Hydraulic Oil 208L", "Shell", "drum", 2100, {}, None),
]

# demo suppliers for equipment & site supplies: (email, name, city, category slugs, verified, rating)
EQUIPMENT_SUPPLIERS = [
    ("rental1@demo.sa", "الشركة الوطنية لتأجير المعدات الثقيلة", "الرياض", ["heavy-equipment", "power-air", "lifting", "concrete-equipment", "roads"], True, 4.5),
    ("rental2@demo.sa", "معدات الشرقية للتأجير والبيع", "الدمام", ["heavy-equipment", "power-air", "scaffolding", "site-facilities"], True, 4.2),
    ("safety1@demo.sa", "مستودع السلامة والعدد — جدة", "جدة", ["safety", "tools", "consumables", "surveying", "chemicals"], True, 4.7),
    ("build1@demo.sa", "مصنع الهياكل والمباني الجاهزة", "الرياض", ["prefab-steel", "glass-aluminium", "hvac", "finishes", "landscaping"], False, 4.0),
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
    """Create any category missing from CATEGORIES (safe to run on an existing database)."""
    existing = {c.slug: c for c in db.query(Category).all()}
    for order, (slug, ar, en, icon, children) in enumerate(CATEGORIES):
        parent = existing.get(slug)
        if not parent:
            parent = Category(slug=slug, name_ar=ar, name_en=en, icon=icon, sort_order=order)
            db.add(parent)
            db.flush()
            existing[slug] = parent
        for j, (cslug, car, cen) in enumerate(children):
            if cslug not in existing:
                child = Category(slug=cslug, name_ar=car, name_en=cen, parent_id=parent.id, icon=icon, sort_order=j)
                db.add(child)
                db.flush()
                existing[cslug] = child
    db.commit()
    return existing


def _ensure_products(db: Session, cats: dict[str, Category]) -> dict[str, Product]:
    """Create any product missing from PRODUCTS / EQUIPMENT_PRODUCTS (safe on an existing database)."""
    existing = {p.sku: p for p in db.query(Product).all()}
    rows = [(slug, sku, ar, en, brand, unit, price, spec, None) for slug, sku, ar, en, brand, unit, price, spec in PRODUCTS] + EQUIPMENT_PRODUCTS
    for slug, sku, ar, en, brand, unit, price, spec, rent in rows:
        if sku in existing:
            continue
        cat = cats.get(slug) or cats["other"]
        meta = {**spec}
        if price is not None:
            meta["base_price"] = price
        if rent is not None:
            meta["base_rent_day"] = rent
        p = Product(category_id=cat.id, sku=sku, name_ar=ar, name_en=en, brand=brand, unit=unit, spec=meta)
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
        if "base_price" not in p.spec:  # rental-only equipment gets no synthetic sale price
            continue
        base = p.spec["base_price"]
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


def _demo_equipment(db: Session, cats: dict[str, Category], products: dict[str, Product]) -> None:
    """Demo suppliers and sale/rental offers for the equipment catalog (only adds what is missing)."""
    rnd = random.Random(2027)
    top_of = {c.id: (c.parent_id or c.id) for c in cats.values()}
    suppliers = []  # (supplier, is_rental_company)
    for email, name, city, slugs, verified, rating in EQUIPMENT_SUPPLIERS:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            user = User(email=email, password_hash=hash_password("Demo@2026"), full_name=name, role="supplier",
                        company_name=name, city=city, phone="+9665" + str(rnd.randint(10000000, 99999999)))
            db.add(user)
            db.flush()
            sup = Supplier(user_id=user.id, name=name, city=city, category_ids=[cats[x].id for x in slugs if x in cats], verified=verified,
                           rating=rating, rating_count=rnd.randint(5, 30), cr_number=str(rnd.randint(1010000000, 1019999999)),
                           regions=[city], lead_time_days=rnd.randint(1, 4), plan="pro" if verified else "free",
                           description="تأجير وبيع معدات الإنشاء ومستلزمات المواقع — توصيل لكل مناطق المملكة.")
            db.add(sup)
            db.flush()
        suppliers.append((db.query(Supplier).filter(Supplier.user_id == user.id).first(), email.startswith("rental")))
    now = utcnow()
    for slug, sku, *_rest in EQUIPMENT_PRODUCTS:
        p = products[sku]
        base, rent = p.spec.get("base_price"), p.spec.get("base_rent_day")
        top = top_of[p.category_id]
        for s, is_rental in suppliers:
            if top not in (s.category_ids or []):
                continue
            city = s.city
            if base is not None and not db.query(Offer).filter(Offer.supplier_id == s.id, Offer.product_id == p.id, Offer.city == city, Offer.rental_period == "").first():
                price = round(base * rnd.uniform(0.95, 1.1), 2)
                db.add(Offer(supplier_id=s.id, product_id=p.id, price=price, unit=p.unit, city=city, min_qty=1,
                             stock_status=rnd.choice(["in_stock"] * 7 + ["limited"]), updated_at=now - timedelta(days=rnd.randint(0, 10))))
                db.add(PriceHistory(product_id=p.id, supplier_id=s.id, city=city, price=price, recorded_at=now - timedelta(days=1)))
            if rent is not None and is_rental:
                for period, factor in (("day", 1.0), ("week", 5.5), ("month", 18.0)):
                    if not db.query(Offer).filter(Offer.supplier_id == s.id, Offer.product_id == p.id, Offer.city == city, Offer.rental_period == period).first():
                        db.add(Offer(supplier_id=s.id, product_id=p.id, price=round(rent * factor * rnd.uniform(0.95, 1.08), 2), unit=p.unit, city=city,
                                     min_qty=1, rental_period=period, delivery_included=False, notes="شامل المشغّل" if period != "day" and rnd.random() < 0.4 else "",
                                     updated_at=now - timedelta(days=rnd.randint(0, 10))))
    db.commit()


def seed(db: Session) -> None:
    _ensure_admin(db)
    cats = _ensure_categories(db)
    products = _ensure_products(db, cats)
    if SEED_DEMO_DATA:
        _demo_data(db, cats, products)
        _demo_equipment(db, cats, products)
