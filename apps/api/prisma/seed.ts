/* eslint-disable no-console */
import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_RATES } from "../src/services/shipping";

const prisma = new PrismaClient();

// ---------------------------------------------------------------- reference data
const categories = [
  { slug: "cement-concrete", name: "Cement & Concrete", nameAr: "الأسمنت والخرسانة", icon: "🧱" },
  { slug: "steel-rebar", name: "Steel & Rebar", nameAr: "الحديد والتسليح", icon: "🏗️" },
  { slug: "blocks-bricks", name: "Blocks & Bricks", nameAr: "البلوك والطوب", icon: "🧱" },
  { slug: "aggregates-sand", name: "Aggregates & Sand", nameAr: "الركام والرمل", icon: "⛰️" },
  { slug: "tiles-flooring", name: "Tiles & Flooring", nameAr: "البلاط والأرضيات", icon: "◼️" },
  { slug: "paints-coatings", name: "Paints & Coatings", nameAr: "الدهانات والطلاء", icon: "🎨" },
  { slug: "plumbing", name: "Plumbing & Pipes", nameAr: "السباكة والأنابيب", icon: "🚰" },
  { slug: "electrical", name: "Electrical", nameAr: "الكهرباء", icon: "⚡" },
  { slug: "insulation-waterproofing", name: "Insulation & Waterproofing", nameAr: "العزل ومنع التسرب", icon: "🛡️" },
  { slug: "timber-formwork", name: "Timber & Formwork", nameAr: "الأخشاب والشدات", icon: "🪵" },
  { slug: "gypsum-ceilings", name: "Gypsum & Ceilings", nameAr: "الجبس والأسقف", icon: "⬜" },
  { slug: "doors-windows", name: "Doors, Windows & Glass", nameAr: "الأبواب والنوافذ والزجاج", icon: "🚪" },
  { slug: "tools-equipment", name: "Tools & Equipment", nameAr: "العدد والمعدات", icon: "🛠️" },
  { slug: "safety-ppe", name: "Safety & PPE", nameAr: "السلامة ومعدات الوقاية", icon: "🦺" },
  { slug: "hardware-fasteners", name: "Hardware & Fasteners", nameAr: "الخردوات والمثبتات", icon: "🔩" },
  { slug: "hvac", name: "HVAC & Ventilation", nameAr: "التكييف والتهوية", icon: "❄️" },
  { slug: "sanitary-ware", name: "Sanitary Ware & Kitchens", nameAr: "الأدوات الصحية والمطابخ", icon: "🚿" },
  { slug: "lighting", name: "Lighting & Switchgear", nameAr: "الإنارة والمفاتيح", icon: "💡" },
  { slug: "scaffolding-access", name: "Scaffolding & Access", nameAr: "السقالات ومعدات الوصول", icon: "🪜" },
  { slug: "roofing-cladding", name: "Roofing & Cladding", nameAr: "الأسقف والتكسيات", icon: "🏠" },
  { slug: "chemicals-adhesives", name: "Chemicals, Adhesives & Admixtures", nameAr: "الكيماويات واللواصق والإضافات", icon: "🧪" },
  { slug: "landscaping-precast", name: "Landscaping & Precast", nameAr: "تنسيق المواقع والخرسانة مسبقة الصب", icon: "🌳" },
  { slug: "heavy-equipment", name: "Heavy Equipment & Machinery", nameAr: "المعدات الثقيلة والآليات", icon: "🚜" },
  { slug: "concrete-compaction", name: "Concrete & Compaction Machinery", nameAr: "معدات الخرسانة والدك", icon: "🏗️" },
  { slug: "generators-compressors-pumps", name: "Generators, Compressors & Pumps", nameAr: "المولدات والضواغط والمضخات", icon: "🔌" },
  { slug: "welding-fabrication", name: "Welding & Metal Fabrication", nameAr: "اللحام وتشكيل المعادن", icon: "🔥" },
  { slug: "lifting-rigging", name: "Lifting, Hoists & Rigging", nameAr: "معدات الرفع والونشات", icon: "⛓️" },
  { slug: "surveying-instruments", name: "Surveying, Testing & Measuring", nameAr: "أجهزة المساحة والاختبار والقياس", icon: "📐" },
  { slug: "site-facilities", name: "Site Facilities & Temporary Works", nameAr: "مرافق الموقع والأعمال المؤقتة", icon: "🏕️" },
  { slug: "fire-safety", name: "Fire Protection Systems", nameAr: "أنظمة الحماية من الحريق", icon: "🧯" },
  { slug: "elevators-gates", name: "Elevators, Gates & Automation", nameAr: "المصاعد والبوابات والأتمتة", icon: "🛗" },
  { slug: "solar-energy", name: "Solar & Energy Systems", nameAr: "الطاقة الشمسية وأنظمة الطاقة", icon: "🔆" },
];

type M = { sku: string; name: string; nameAr: string; unit: string; cat: string; brand?: string; base: number; specs?: Record<string, string | number>; featured?: boolean; tags?: string[] };
const materials: M[] = [
  // Cement & concrete
  { featured: true, sku: "CEM-OPC-50", name: "Ordinary Portland Cement Type I (50kg bag)", nameAr: "أسمنت بورتلاندي عادي نوع 1 (50 كجم)", unit: "bag", cat: "cement-concrete", brand: "Yamama Cement", base: 15.5, specs: { standard: "SASO 2847", weight_kg: 50 } },
  { sku: "CEM-SRC-50", name: "Sulphate Resistant Cement Type V (50kg bag)", nameAr: "أسمنت مقاوم للكبريتات نوع 5 (50 كجم)", unit: "bag", cat: "cement-concrete", brand: "Saudi Cement", base: 17.25, specs: { standard: "ASTM C150 Type V" } },
  { sku: "CEM-WHT-50", name: "White Cement (50kg bag)", nameAr: "أسمنت أبيض (50 كجم)", unit: "bag", cat: "cement-concrete", brand: "Riyadh Cement", base: 42, },
  { sku: "CEM-BULK-T", name: "Bulk OPC Cement (per ton)", nameAr: "أسمنت سائب (طن)", unit: "ton", cat: "cement-concrete", brand: "Qassim Cement", base: 255 },
  { sku: "RMC-C25", name: "Ready Mix Concrete C25 (per m³)", nameAr: "خرسانة جاهزة C25 (م³)", unit: "m3", cat: "cement-concrete", base: 215, specs: { strength_mpa: 25, slump_mm: 100 } },
  { featured: true, sku: "RMC-C30", name: "Ready Mix Concrete C30 (per m³)", nameAr: "خرسانة جاهزة C30 (م³)", unit: "m3", cat: "cement-concrete", base: 232, specs: { strength_mpa: 30 } },
  { sku: "RMC-C40", name: "Ready Mix Concrete C40 (per m³)", nameAr: "خرسانة جاهزة C40 (م³)", unit: "m3", cat: "cement-concrete", base: 265, specs: { strength_mpa: 40 } },
  // Steel
  { sku: "RBR-8", name: "Deformed Rebar 8mm Grade 60 (per ton)", nameAr: "حديد تسليح 8 مم درجة 60 (طن)", unit: "ton", cat: "steel-rebar", brand: "SABIC Hadeed", base: 2780, specs: { grade: "B500B", diameter_mm: 8 } },
  { sku: "RBR-10", name: "Deformed Rebar 10mm Grade 60 (per ton)", nameAr: "حديد تسليح 10 مم (طن)", unit: "ton", cat: "steel-rebar", brand: "SABIC Hadeed", base: 2720, specs: { diameter_mm: 10 } },
  { sku: "RBR-12", name: "Deformed Rebar 12mm Grade 60 (per ton)", nameAr: "حديد تسليح 12 مم (طن)", unit: "ton", cat: "steel-rebar", brand: "Rajhi Steel", base: 2690, specs: { diameter_mm: 12 } },
  { featured: true, sku: "RBR-16", name: "Deformed Rebar 16mm Grade 60 (per ton)", nameAr: "حديد تسليح 16 مم (طن)", unit: "ton", cat: "steel-rebar", brand: "Rajhi Steel", base: 2660, specs: { diameter_mm: 16 } },
  { sku: "RBR-20", name: "Deformed Rebar 20mm Grade 60 (per ton)", nameAr: "حديد تسليح 20 مم (طن)", unit: "ton", cat: "steel-rebar", brand: "Ittefaq Steel", base: 2650, specs: { diameter_mm: 20 } },
  { sku: "RBR-25", name: "Deformed Rebar 25mm Grade 60 (per ton)", nameAr: "حديد تسليح 25 مم (طن)", unit: "ton", cat: "steel-rebar", brand: "Ittefaq Steel", base: 2650, specs: { diameter_mm: 25 } },
  { sku: "STL-MESH-A142", name: "Welded Wire Mesh A142 (6m x 2.4m sheet)", nameAr: "شبك حديد ملحوم A142", unit: "sheet", cat: "steel-rebar", base: 165 },
  { sku: "STL-IPE-200", name: "IPE 200 Steel Beam (per ton)", nameAr: "كمرة حديد IPE 200 (طن)", unit: "ton", cat: "steel-rebar", base: 3350 },
  { sku: "STL-HSS-50", name: "Square Hollow Section 50x50x3mm (6m)", nameAr: "ماسورة مربعة 50×50×3 مم (6م)", unit: "piece", cat: "steel-rebar", base: 78 },
  // Blocks
  { featured: true, sku: "BLK-HOL-20", name: "Hollow Concrete Block 20cm (40x20x20)", nameAr: "بلوك أسمنتي مفرغ 20 سم", unit: "piece", cat: "blocks-bricks", base: 2.85 },
  { sku: "BLK-HOL-15", name: "Hollow Concrete Block 15cm (40x20x15)", nameAr: "بلوك أسمنتي مفرغ 15 سم", unit: "piece", cat: "blocks-bricks", base: 2.45 },
  { sku: "BLK-SOL-10", name: "Solid Concrete Block 10cm", nameAr: "بلوك أسمنتي مصمت 10 سم", unit: "piece", cat: "blocks-bricks", base: 2.1 },
  { sku: "BLK-INS-20", name: "Insulated Thermal Block 20cm", nameAr: "بلوك عازل حراري 20 سم", unit: "piece", cat: "blocks-bricks", base: 6.4 },
  { sku: "BLK-AAC-20", name: "AAC Lightweight Block 60x20x20", nameAr: "بلوك خفيف AAC 60×20×20", unit: "piece", cat: "blocks-bricks", brand: "Siporex", base: 9.8 },
  { sku: "BRK-RED", name: "Red Clay Brick (standard)", nameAr: "طوب أحمر طيني", unit: "piece", cat: "blocks-bricks", base: 0.95 },
  { sku: "PAV-INT-6", name: "Interlock Paver 6cm (per m²)", nameAr: "إنترلوك 6 سم (م²)", unit: "m2", cat: "blocks-bricks", base: 28 },
  { sku: "CRB-STD", name: "Concrete Curbstone 50cm", nameAr: "بردورة خرسانية 50 سم", unit: "piece", cat: "blocks-bricks", base: 14 },
  // Aggregates
  { sku: "AGG-3/4", name: "Crushed Aggregate 3/4\" (per m³)", nameAr: "بحص 3/4 بوصة (م³)", unit: "m3", cat: "aggregates-sand", base: 55 },
  { sku: "AGG-3/8", name: "Crushed Aggregate 3/8\" (per m³)", nameAr: "بحص 3/8 بوصة (م³)", unit: "m3", cat: "aggregates-sand", base: 58 },
  { sku: "SND-WASH", name: "Washed Sand (per m³)", nameAr: "رمل مغسول (م³)", unit: "m3", cat: "aggregates-sand", base: 48 },
  { sku: "SND-RED", name: "Red Sand / Fill (per m³)", nameAr: "رمل أحمر / دفان (م³)", unit: "m3", cat: "aggregates-sand", base: 32 },
  { sku: "AGG-SUB", name: "Sub-base Material Class A (per m³)", nameAr: "طبقة أساس فئة أ (م³)", unit: "m3", cat: "aggregates-sand", base: 42 },
  // Tiles
  { featured: true, sku: "TIL-POR-60", name: "Porcelain Tile 60x60 Matt (per m²)", nameAr: "بورسلان 60×60 مطفي (م²)", unit: "m2", cat: "tiles-flooring", brand: "Saudi Ceramics", base: 48 },
  { sku: "TIL-POR-120", name: "Porcelain Tile 120x60 Polished (per m²)", nameAr: "بورسلان 120×60 لامع (م²)", unit: "m2", cat: "tiles-flooring", brand: "RAK Ceramics", base: 79 },
  { sku: "TIL-CER-30", name: "Ceramic Wall Tile 30x60 (per m²)", nameAr: "سيراميك جدران 30×60 (م²)", unit: "m2", cat: "tiles-flooring", brand: "Saudi Ceramics", base: 32 },
  { sku: "MRB-CAR", name: "Carrara Marble Slab 2cm (per m²)", nameAr: "رخام كرارا 2 سم (م²)", unit: "m2", cat: "tiles-flooring", base: 260 },
  { sku: "GRT-BLK", name: "Black Granite 2cm (per m²)", nameAr: "جرانيت أسود 2 سم (م²)", unit: "m2", cat: "tiles-flooring", base: 190 },
  { sku: "TIL-ADH-25", name: "Tile Adhesive C2 (25kg bag)", nameAr: "لاصق بلاط C2 (25 كجم)", unit: "bag", cat: "tiles-flooring", brand: "Weber Saudi", base: 28 },
  // Paints
  { featured: true, sku: "PNT-EMU-INT", name: "Interior Emulsion Paint (18L drum)", nameAr: "دهان داخلي إيملشن (18 لتر)", unit: "drum", cat: "paints-coatings", brand: "Jotun", base: 235 },
  { sku: "PNT-EXT-ACR", name: "Exterior Acrylic Paint (18L drum)", nameAr: "دهان خارجي أكريليك (18 لتر)", unit: "drum", cat: "paints-coatings", brand: "National Paints", base: 290 },
  { sku: "PNT-PRM", name: "Wall Primer Sealer (18L drum)", nameAr: "أساس جدران (18 لتر)", unit: "drum", cat: "paints-coatings", brand: "Sipes", base: 150 },
  { sku: "PNT-PUT-25", name: "Wall Putty (25kg bag)", nameAr: "معجون جدران (25 كجم)", unit: "bag", cat: "paints-coatings", brand: "Sipes", base: 38 },
  { sku: "PNT-EPX-FLR", name: "Epoxy Floor Coating (20L kit)", nameAr: "إيبوكسي أرضيات (20 لتر)", unit: "drum", cat: "paints-coatings", brand: "Hempel", base: 640 },
  // Plumbing
  { sku: "PVC-110", name: "uPVC Drainage Pipe 110mm (6m)", nameAr: "ماسورة صرف uPVC 110 مم (6م)", unit: "piece", cat: "plumbing", brand: "Saudi Pipes", base: 62 },
  { sku: "PVC-160", name: "uPVC Drainage Pipe 160mm (6m)", nameAr: "ماسورة صرف uPVC 160 مم (6م)", unit: "piece", cat: "plumbing", brand: "Amiantit", base: 128 },
  { featured: true, sku: "PPR-25", name: "PPR Pipe PN20 25mm (4m)", nameAr: "ماسورة PPR PN20 25 مم (4م)", unit: "piece", cat: "plumbing", brand: "Aquatherm", base: 21 },
  { sku: "PPR-32", name: "PPR Pipe PN20 32mm (4m)", nameAr: "ماسورة PPR PN20 32 مم (4م)", unit: "piece", cat: "plumbing", brand: "Aquatherm", base: 34 },
  { sku: "HDPE-63", name: "HDPE Pipe PE100 63mm PN16 (per m)", nameAr: "ماسورة HDPE 63 مم (م)", unit: "m", cat: "plumbing", base: 19 },
  { sku: "WTR-TNK-2000", name: "Water Tank Polyethylene 2000L", nameAr: "خزان مياه بولي إيثيلين 2000 لتر", unit: "piece", cat: "plumbing", brand: "Al Rashed", base: 880 },
  // Electrical
  { featured: true, sku: "CBL-2.5", name: "Copper Cable 2.5mm² Single Core (100m roll)", nameAr: "كابل نحاس 2.5 مم² (100م)", unit: "roll", cat: "electrical", brand: "Riyadh Cables", base: 245 },
  { sku: "CBL-4", name: "Copper Cable 4mm² Single Core (100m roll)", nameAr: "كابل نحاس 4 مم² (100م)", unit: "roll", cat: "electrical", brand: "Riyadh Cables", base: 385 },
  { sku: "CBL-16-4C", name: "Armoured Cable 4x16mm² (per m)", nameAr: "كابل مسلح 4×16 مم² (م)", unit: "m", cat: "electrical", brand: "Saudi Cable", base: 54 },
  { sku: "CND-20", name: "PVC Conduit 20mm (3m)", nameAr: "ماسورة كهرباء PVC 20 مم (3م)", unit: "piece", cat: "electrical", base: 4.2 },
  { sku: "DB-12W", name: "Distribution Board 12-way", nameAr: "لوحة توزيع 12 خط", unit: "piece", cat: "electrical", brand: "Schneider", base: 420 },
  { sku: "MCB-32", name: "MCB 32A Single Pole", nameAr: "قاطع 32 أمبير", unit: "piece", cat: "electrical", brand: "ABB", base: 28 },
  // Insulation
  { featured: true, sku: "INS-XPS-50", name: "XPS Insulation Board 50mm (per m²)", nameAr: "لوح عزل XPS 50 مم (م²)", unit: "m2", cat: "insulation-waterproofing", brand: "Dow", base: 24 },
  { sku: "INS-PU-50", name: "Polyurethane Board 50mm (per m²)", nameAr: "لوح بولي يوريثان 50 مم (م²)", unit: "m2", cat: "insulation-waterproofing", base: 34 },
  { sku: "WP-MEM-4", name: "Bituminous Membrane 4mm (10m² roll)", nameAr: "لفة عزل بيتوميني 4 مم (10 م²)", unit: "roll", cat: "insulation-waterproofing", brand: "Bitumat", base: 145 },
  { sku: "WP-CEM-20", name: "Cementitious Waterproofing (20kg)", nameAr: "عزل أسمنتي (20 كجم)", unit: "bag", cat: "insulation-waterproofing", brand: "Sika", base: 165 },
  { sku: "INS-RW-50", name: "Rockwool Slab 50mm 60kg/m³ (per m²)", nameAr: "صوف صخري 50 مم (م²)", unit: "m2", cat: "insulation-waterproofing", base: 22 },
  // Timber
  { sku: "PLY-18", name: "Film-faced Plywood 18mm (122x244cm)", nameAr: "بلايوود مغلف 18 مم", unit: "sheet", cat: "timber-formwork", base: 118 },
  { sku: "TMB-2x4", name: "Timber 2x4\" x 4m (white wood)", nameAr: "خشب أبيض 2×4 بوصة (4م)", unit: "piece", cat: "timber-formwork", base: 26 },
  { sku: "TMB-4x4", name: "Timber 4x4\" x 4m (white wood)", nameAr: "خشب أبيض 4×4 بوصة (4م)", unit: "piece", cat: "timber-formwork", base: 58 },
  { sku: "SCF-PROP", name: "Steel Adjustable Prop 3.5m", nameAr: "جاك حديد 3.5 م", unit: "piece", cat: "timber-formwork", base: 95 },
  // Gypsum
  { featured: true, sku: "GYP-BRD-12", name: "Gypsum Board 12.5mm (120x240cm)", nameAr: "لوح جبس 12.5 مم", unit: "sheet", cat: "gypsum-ceilings", brand: "Gyproc", base: 29 },
  { sku: "GYP-MR-12", name: "Moisture Resistant Gypsum Board 12.5mm", nameAr: "لوح جبس مقاوم للرطوبة 12.5 مم", unit: "sheet", cat: "gypsum-ceilings", brand: "Knauf", base: 41 },
  { sku: "GYP-PLS-25", name: "Gypsum Plaster (25kg bag)", nameAr: "جبس بورد لصق (25 كجم)", unit: "bag", cat: "gypsum-ceilings", base: 17 },
  { sku: "CLG-TILE-60", name: "Mineral Fiber Ceiling Tile 60x60 (per m²)", nameAr: "سقف مستعار 60×60 (م²)", unit: "m2", cat: "gypsum-ceilings", brand: "Armstrong", base: 38 },
  // Doors & windows
  { sku: "DR-STL-FIRE", name: "Fire Rated Steel Door 90min (single leaf)", nameAr: "باب حديد مقاوم للحريق 90 دقيقة", unit: "piece", cat: "doors-windows", base: 1850 },
  { sku: "DR-WD-INT", name: "Interior Wooden Door (complete set)", nameAr: "باب خشب داخلي (طقم كامل)", unit: "piece", cat: "doors-windows", base: 950 },
  { sku: "WIN-ALU-DG", name: "Aluminium Window Double Glazed (per m²)", nameAr: "نافذة ألمنيوم زجاج مزدوج (م²)", unit: "m2", cat: "doors-windows", brand: "Alupco", base: 620 },
  { sku: "GLS-TMP-10", name: "Tempered Glass 10mm Clear (per m²)", nameAr: "زجاج مقسى 10 مم (م²)", unit: "m2", cat: "doors-windows", base: 210 },
  // Tools & equipment
  { sku: "TL-DRL-HAM", name: "Rotary Hammer Drill SDS-Plus 800W", nameAr: "دريل هيلتي 800 واط", unit: "piece", cat: "tools-equipment", brand: "Bosch", base: 690, featured: true, tags: ["drill", "hilti"] },
  { sku: "TL-GRD-115", name: "Angle Grinder 115mm 900W", nameAr: "صاروخ جلخ 115 مم", unit: "piece", cat: "tools-equipment", brand: "Makita", base: 260 },
  { sku: "TL-MIX-350", name: "Concrete Mixer 350L Diesel", nameAr: "خلاطة خرسانة 350 لتر ديزل", unit: "piece", cat: "tools-equipment", base: 7800 },
  { sku: "TL-VIB-45", name: "Concrete Vibrator 45mm Poker + Motor", nameAr: "هزاز خرسانة 45 مم", unit: "piece", cat: "tools-equipment", base: 1450 },
  { sku: "TL-LVL-LAS", name: "Laser Level Cross-Line Green", nameAr: "ميزان ليزر أخضر", unit: "piece", cat: "tools-equipment", brand: "DeWalt", base: 540 },
  { sku: "TL-WHB", name: "Wheelbarrow Heavy Duty 100L", nameAr: "عربة يد 100 لتر", unit: "piece", cat: "tools-equipment", base: 185 },
  { sku: "TL-CUT-TIL", name: "Manual Tile Cutter 800mm", nameAr: "قطاعة بلاط يدوية 80 سم", unit: "piece", cat: "tools-equipment", brand: "Rubi", base: 720 },
  // Safety
  { sku: "PPE-HLM", name: "Safety Helmet with Ratchet (EN 397)", nameAr: "خوذة سلامة", unit: "piece", cat: "safety-ppe", brand: "3M", base: 28, featured: true, tags: ["helmet", "hard hat"] },
  { sku: "PPE-VST", name: "Hi-Vis Safety Vest Class 2", nameAr: "سترة عاكسة", unit: "piece", cat: "safety-ppe", base: 12 },
  { sku: "PPE-BOOT", name: "Steel Toe Safety Boots S3", nameAr: "حذاء سلامة S3", unit: "piece", cat: "safety-ppe", brand: "Safety Jogger", base: 145 },
  { sku: "PPE-GLV", name: "Nitrile Coated Work Gloves (12 pairs)", nameAr: "قفازات عمل (12 زوج)", unit: "bundle", cat: "safety-ppe", base: 48 },
  { sku: "PPE-HRN", name: "Full Body Safety Harness + Lanyard", nameAr: "حزام أمان كامل مع حبل", unit: "piece", cat: "safety-ppe", base: 210 },
  { sku: "PPE-CONE", name: "Traffic Cone 75cm Reflective", nameAr: "قمع مرور 75 سم", unit: "piece", cat: "safety-ppe", base: 32 },
  // Hardware & fasteners
  { sku: "HW-ANC-M12", name: "Expansion Anchor Bolt M12x100 (box of 50)", nameAr: "مسمار فيشر M12 (50 حبة)", unit: "piece", cat: "hardware-fasteners", brand: "Hilti", base: 165 },
  { sku: "HW-SCR-DW", name: "Drywall Screws 25mm (box of 1000)", nameAr: "براغي جبس 25 مم (1000)", unit: "piece", cat: "hardware-fasteners", base: 34 },
  { sku: "HW-NAIL-3", name: "Common Wire Nails 3 inch (25kg)", nameAr: "مسامير 3 بوصة (25 كجم)", unit: "piece", cat: "hardware-fasteners", base: 95 },
  { sku: "HW-TW-16", name: "Binding Wire 16 gauge (25kg coil)", nameAr: "سلك رباط 16 (25 كجم)", unit: "piece", cat: "hardware-fasteners", base: 110 },
  { sku: "HW-BLT-HDG", name: "HDG Bolt Nut Washer M16x60 (box of 25)", nameAr: "برغي مجلفن M16 (25)", unit: "piece", cat: "hardware-fasteners", base: 88 },
  { sku: "HW-CHM-ANC", name: "Chemical Anchor Epoxy 400ml", nameAr: "كيميكال أنكر 400 مل", unit: "piece", cat: "hardware-fasteners", brand: "Fischer", base: 78 },
  // HVAC
  { sku: "HV-SPL-24", name: "Split AC 24,000 BTU Inverter", nameAr: "مكيف سبليت 24 ألف وحدة انفرتر", unit: "piece", cat: "hvac", brand: "Gree", base: 2650, featured: true, tags: ["ac", "air conditioner"] },
  { sku: "HV-SPL-18", name: "Split AC 18,000 BTU", nameAr: "مكيف سبليت 18 ألف وحدة", unit: "piece", cat: "hvac", brand: "LG", base: 1950 },
  { sku: "HV-DCT-GI", name: "GI Duct Sheet 0.8mm (per m²)", nameAr: "صاج دكت مجلفن 0.8 مم (م²)", unit: "m2", cat: "hvac", base: 62 },
  { sku: "HV-CU-3/8", name: "Copper Pipe 3/8 inch (15m coil)", nameAr: "ماسورة نحاس 3/8 بوصة (15م)", unit: "roll", cat: "hvac", base: 240 },
  { sku: "HV-EXF-12", name: "Exhaust Fan 12 inch Wall Mounted", nameAr: "شفاط هواء 12 بوصة", unit: "piece", cat: "hvac", base: 165 },
  // Sanitary
  { sku: "SN-WC-WH", name: "Wall-Hung WC with Concealed Cistern", nameAr: "كرسي معلق مع صندوق مخفي", unit: "piece", cat: "sanitary-ware", brand: "Ideal Standard", base: 1450, featured: true },
  { sku: "SN-WB-60", name: "Washbasin 60cm with Pedestal", nameAr: "مغسلة 60 سم مع قاعدة", unit: "piece", cat: "sanitary-ware", brand: "Saudi Ceramics", base: 380 },
  { sku: "SN-MIX-BAS", name: "Basin Mixer Chrome", nameAr: "خلاط مغسلة كروم", unit: "piece", cat: "sanitary-ware", brand: "Grohe", base: 420 },
  { sku: "SN-SHW-SET", name: "Shower Set Rain Head + Hand Shower", nameAr: "طقم دش مطري", unit: "piece", cat: "sanitary-ware", base: 560 },
  { sku: "SN-WH-50", name: "Electric Water Heater 50L", nameAr: "سخان مياه كهربائي 50 لتر", unit: "piece", cat: "sanitary-ware", brand: "Ariston", base: 520 },
  { sku: "SN-SNK-SS", name: "Stainless Steel Kitchen Sink Double Bowl", nameAr: "حوض مطبخ ستانلس حوضين", unit: "piece", cat: "sanitary-ware", base: 480 },
  // Lighting
  { sku: "LT-PNL-60", name: "LED Panel 60x60 40W 6500K", nameAr: "لوح إضاءة LED 60×60 40 واط", unit: "piece", cat: "lighting", brand: "Philips", base: 85, featured: true },
  { sku: "LT-FLD-100", name: "LED Flood Light 100W IP65", nameAr: "كشاف LED 100 واط", unit: "piece", cat: "lighting", base: 120 },
  { sku: "LT-DWN-12", name: "LED Downlight 12W Recessed", nameAr: "سبوت لايت LED 12 واط", unit: "piece", cat: "lighting", base: 22 },
  { sku: "LT-SW-1G", name: "1-Gang 2-Way Switch 10A", nameAr: "مفتاح إنارة مفرد", unit: "piece", cat: "lighting", brand: "Legrand", base: 14 },
  { sku: "LT-SKT-13", name: "13A Switched Socket Outlet", nameAr: "فيش كهرباء 13 أمبير", unit: "piece", cat: "lighting", brand: "MK", base: 18 },
  // Scaffolding
  { sku: "SC-FRM-1.7", name: "Scaffold H-Frame 1.7m x 1.2m", nameAr: "إطار سقالة 1.7×1.2 م", unit: "piece", cat: "scaffolding-access", base: 145 },
  { sku: "SC-TUBE-6", name: "Scaffold Tube 48.3mm x 6m", nameAr: "ماسورة سقالة 6 م", unit: "piece", cat: "scaffolding-access", base: 118 },
  { sku: "SC-CPL-SW", name: "Swivel Coupler (box of 25)", nameAr: "كوبلر دوار (25)", unit: "piece", cat: "scaffolding-access", base: 210 },
  { sku: "SC-PLK-AL", name: "Aluminium Scaffold Plank 3m", nameAr: "لوح سقالة ألمنيوم 3 م", unit: "piece", cat: "scaffolding-access", base: 480 },
  { sku: "SC-LDR-6", name: "Aluminium Extension Ladder 6m", nameAr: "سلم ألمنيوم 6 م", unit: "piece", cat: "scaffolding-access", base: 620 },
  // Roofing & cladding
  { sku: "RF-SND-50", name: "Sandwich Panel PU 50mm Roof (per m²)", nameAr: "ساندوتش بانل 50 مم سقف (م²)", unit: "m2", cat: "roofing-cladding", brand: "Kirby", base: 92, featured: true },
  { sku: "RF-ACP-4", name: "Aluminium Composite Panel 4mm (per m²)", nameAr: "كلادينج ألمنيوم 4 مم (م²)", unit: "m2", cat: "roofing-cladding", brand: "Alucobond", base: 135 },
  { sku: "RF-GI-SHT", name: "Corrugated GI Roof Sheet 0.5mm (per m²)", nameAr: "صاج مموج مجلفن 0.5 مم (م²)", unit: "m2", cat: "roofing-cladding", base: 38 },
  { sku: "RF-CLAY-TL", name: "Clay Roof Tile (per m²)", nameAr: "قرميد طيني (م²)", unit: "m2", cat: "roofing-cladding", base: 95 },
  { sku: "RF-GRP-LIN", name: "GRP Roofing Liner 1.5mm (per m²)", nameAr: "بطانة فيبرجلاس 1.5 مم (م²)", unit: "m2", cat: "roofing-cladding", base: 48 },
  // Chemicals
  { sku: "CH-SP-ADM", name: "Superplasticizer Admixture (200L drum)", nameAr: "ملدن خرسانة (200 لتر)", unit: "drum", cat: "chemicals-adhesives", brand: "Sika", base: 1650 },
  { sku: "CH-CUR-20", name: "Concrete Curing Compound (20L)", nameAr: "مركب معالجة خرسانة (20 لتر)", unit: "drum", cat: "chemicals-adhesives", brand: "Fosroc", base: 190 },
  { sku: "CH-GRT-25", name: "Non-Shrink Grout (25kg)", nameAr: "جراوت غير منكمش (25 كجم)", unit: "bag", cat: "chemicals-adhesives", brand: "BASF", base: 45 },
  { sku: "CH-EPX-ADH", name: "Epoxy Bonding Adhesive 5kg Kit", nameAr: "لاصق إيبوكسي 5 كجم", unit: "piece", cat: "chemicals-adhesives", brand: "Sika", base: 260 },
  { sku: "CH-SIL-300", name: "Silicone Sealant Neutral 300ml (box of 24)", nameAr: "سيليكون 300 مل (24)", unit: "piece", cat: "chemicals-adhesives", base: 220 },
  { sku: "CH-BIT-PRM", name: "Bitumen Primer (20L)", nameAr: "برايمر بيتومين (20 لتر)", unit: "drum", cat: "chemicals-adhesives", brand: "Bitumat", base: 165 },
  // Landscaping & precast
  { sku: "LS-PVR-8", name: "Interlock Paver 8cm Heavy Duty (per m²)", nameAr: "إنترلوك 8 سم ثقيل (م²)", unit: "m2", cat: "landscaping-precast", base: 34 },
  { sku: "LS-MH-RNG", name: "Precast Manhole Ring 1200mm", nameAr: "حلقة منهول خرسانية 1200 مم", unit: "piece", cat: "landscaping-precast", base: 780 },
  { sku: "LS-BAR-NJ", name: "New Jersey Concrete Barrier 3m", nameAr: "حاجز خرساني نيوجيرسي 3 م", unit: "piece", cat: "landscaping-precast", base: 1350 },
  { sku: "LS-PIPE-RC", name: "RC Pipe 600mm Class III (2.5m)", nameAr: "ماسورة خرسانية مسلحة 600 مم", unit: "piece", cat: "landscaping-precast", base: 920 },
  { sku: "LS-SOIL", name: "Agricultural Soil (per m³)", nameAr: "تربة زراعية (م³)", unit: "m3", cat: "landscaping-precast", base: 65 },
  { sku: "LS-GRS-ART", name: "Artificial Grass 35mm (per m²)", nameAr: "عشب صناعي 35 مم (م²)", unit: "m2", cat: "landscaping-precast", base: 48 },
  // ---------------------------------------------------------------- equipment & industry
  // Heavy equipment & machinery
  { featured: true, sku: "HE-EXC-MINI", name: "Mini Excavator 3.5 ton", nameAr: "حفار صغير 3.5 طن", unit: "piece", cat: "heavy-equipment", brand: "Kubota", base: 165000, specs: { operating_weight_kg: 3500, engine_kw: 18 }, tags: ["excavator", "digger", "حفار"] },
  { sku: "HE-EXC-20", name: "Crawler Excavator 20 ton", nameAr: "حفار مجنزر 20 طن", unit: "piece", cat: "heavy-equipment", brand: "Komatsu", base: 520000, specs: { operating_weight_kg: 20000, bucket_m3: 0.9 }, tags: ["excavator", "حفار"] },
  { sku: "HE-BHL", name: "Backhoe Loader 4x4", nameAr: "بوكلين 4×4", unit: "piece", cat: "heavy-equipment", brand: "JCB", base: 285000, specs: { engine_hp: 92 }, tags: ["backhoe", "بوكلين"] },
  { sku: "HE-WL-3", name: "Wheel Loader 3 m³ Bucket", nameAr: "شيول (لودر) 3 م³", unit: "piece", cat: "heavy-equipment", brand: "Caterpillar", base: 610000, specs: { bucket_m3: 3 }, tags: ["loader", "شيول"] },
  { sku: "HE-SKID", name: "Skid Steer Loader 70hp", nameAr: "بوبكات 70 حصان", unit: "piece", cat: "heavy-equipment", brand: "Bobcat", base: 175000, tags: ["skid steer", "بوبكات"] },
  { sku: "HE-TLH-17", name: "Telehandler 17m 4 ton", nameAr: "رافعة تلسكوبية 17 م 4 طن", unit: "piece", cat: "heavy-equipment", brand: "Manitou", base: 390000, specs: { lift_height_m: 17, capacity_kg: 4000 } },
  { sku: "HE-DUMP-20", name: "Dump Truck 6x4 20 m³", nameAr: "قلاب 6×4 سعة 20 م³", unit: "piece", cat: "heavy-equipment", base: 380000, specs: { body_m3: 20 }, tags: ["tipper", "قلاب"] },
  { sku: "HE-ROLL-10", name: "Vibratory Road Roller 10 ton", nameAr: "مدحلة اهتزازية 10 طن", unit: "piece", cat: "heavy-equipment", brand: "Dynapac", base: 340000, tags: ["roller", "رصاصة"] },
  { sku: "HE-GRDR", name: "Motor Grader 140hp", nameAr: "قريدر 140 حصان", unit: "piece", cat: "heavy-equipment", base: 720000, tags: ["grader", "قريدر"] },
  { sku: "HE-FL-3", name: "Diesel Forklift 3 ton", nameAr: "رافعة شوكية ديزل 3 طن", unit: "piece", cat: "heavy-equipment", brand: "Toyota", base: 98000, specs: { capacity_kg: 3000 }, tags: ["forklift", "فوركلفت"] },
  { sku: "HE-BRK-ATT", name: "Hydraulic Breaker Attachment (20t excavator)", nameAr: "كسارة هيدروليكية لحفار 20 طن", unit: "piece", cat: "heavy-equipment", base: 65000 },
  { sku: "HE-BKT-1", name: "Excavator GP Bucket 1.0 m³", nameAr: "قادوس حفار 1 م³", unit: "piece", cat: "heavy-equipment", base: 9800 },
  { sku: "HE-TRK-WTR", name: "Water Tanker Truck 20,000 L", nameAr: "صهريج مياه 20,000 لتر", unit: "piece", cat: "heavy-equipment", base: 310000, tags: ["tanker", "وايت"] },
  // Concrete & compaction machinery
  { sku: "CM-MIX-500", name: "Concrete Mixer 500L Diesel", nameAr: "خلاطة خرسانة 500 لتر ديزل", unit: "piece", cat: "concrete-compaction", base: 9800, tags: ["mixer", "خلاطة"] },
  { featured: true, sku: "CM-PLT-90", name: "Plate Compactor 90kg Petrol", nameAr: "دكاكة صفيحة 90 كجم بنزين", unit: "piece", cat: "concrete-compaction", brand: "Wacker Neuson", base: 4200, tags: ["compactor", "دكاكة"] },
  { sku: "CM-RAM-70", name: "Jumping Jack Rammer 70kg", nameAr: "دكاكة قفز (كنغر) 70 كجم", unit: "piece", cat: "concrete-compaction", brand: "Bomag", base: 7900 },
  { sku: "CM-TRW-36", name: "Power Trowel 36 inch Petrol", nameAr: "هليكوبتر تنعيم خرسانة 36 بوصة", unit: "piece", cat: "concrete-compaction", base: 6800, tags: ["trowel", "هليكوبتر"] },
  { sku: "CM-SCR-VIB", name: "Vibrating Screed 3m Petrol", nameAr: "مسطرة اهتزازية 3 م", unit: "piece", cat: "concrete-compaction", base: 4100 },
  { sku: "CM-VIB-HF", name: "High-Frequency Concrete Vibrator 58mm", nameAr: "هزاز خرسانة عالي التردد 58 مم", unit: "piece", cat: "concrete-compaction", base: 3900 },
  { sku: "CM-RBC-32", name: "Electric Rebar Cutter 32mm", nameAr: "قطاعة حديد كهربائية 32 مم", unit: "piece", cat: "concrete-compaction", base: 5400 },
  { sku: "CM-RBB-32", name: "Electric Rebar Bender 32mm", nameAr: "ثناية حديد كهربائية 32 مم", unit: "piece", cat: "concrete-compaction", base: 7200 },
  { sku: "CM-PUMP-40", name: "Stationary Concrete Pump 40 m³/h", nameAr: "مضخة خرسانة ثابتة 40 م³/ساعة", unit: "piece", cat: "concrete-compaction", base: 245000 },
  { sku: "CM-SAW-FLR", name: "Floor Saw 14 inch Petrol", nameAr: "منشار أرضيات 14 بوصة", unit: "piece", cat: "concrete-compaction", base: 8900 },
  { sku: "CM-BLK-MCH", name: "Block Making Machine Semi-Automatic", nameAr: "ماكينة بلوك نصف آلية", unit: "piece", cat: "concrete-compaction", base: 145000 },
  { sku: "CM-GRT-PMP", name: "Electric Grout Pump", nameAr: "مضخة جراوت كهربائية", unit: "piece", cat: "concrete-compaction", base: 12500 },
  { sku: "CM-CORE-250", name: "Core Drill Rig 250mm with Stand", nameAr: "ماكينة كور 250 مم مع حامل", unit: "piece", cat: "concrete-compaction", brand: "Hilti", base: 6300 },
  // Generators, compressors & pumps
  { featured: true, sku: "GN-DSL-30", name: "Diesel Generator 30 kVA Silent", nameAr: "مولد ديزل 30 كي في إيه صامت", unit: "piece", cat: "generators-compressors-pumps", brand: "Perkins", base: 38500, specs: { kva: 30 }, tags: ["generator", "genset", "مولد"] },
  { sku: "GN-DSL-100", name: "Diesel Generator 100 kVA Silent", nameAr: "مولد ديزل 100 كي في إيه صامت", unit: "piece", cat: "generators-compressors-pumps", brand: "Cummins", base: 89000, specs: { kva: 100 } },
  { sku: "GN-DSL-250", name: "Diesel Generator 250 kVA", nameAr: "مولد ديزل 250 كي في إيه", unit: "piece", cat: "generators-compressors-pumps", base: 165000, specs: { kva: 250 } },
  { sku: "GN-PET-7", name: "Petrol Generator 7.5 kVA Portable", nameAr: "مولد بنزين 7.5 كي في إيه", unit: "piece", cat: "generators-compressors-pumps", brand: "Honda", base: 6900 },
  { sku: "GN-CMP-185", name: "Portable Diesel Air Compressor 185 CFM", nameAr: "ضاغط هواء ديزل 185 قدم مكعب", unit: "piece", cat: "generators-compressors-pumps", brand: "Atlas Copco", base: 72000, tags: ["compressor", "كمبروسر"] },
  { sku: "GN-CMP-500", name: "Electric Air Compressor 500L 10HP", nameAr: "كمبروسر كهربائي 500 لتر 10 حصان", unit: "piece", cat: "generators-compressors-pumps", base: 9800 },
  { sku: "GN-PMP-3D", name: "Diesel Dewatering Pump 3 inch", nameAr: "مضخة نزح مياه ديزل 3 بوصة", unit: "piece", cat: "generators-compressors-pumps", base: 4800, tags: ["pump", "مضخة"] },
  { sku: "GN-PMP-SUB", name: "Submersible Drainage Pump 2 inch 1.5kW", nameAr: "غطاس تصريف 2 بوصة", unit: "piece", cat: "generators-compressors-pumps", brand: "Grundfos", base: 2300, tags: ["submersible", "غطاس"] },
  { sku: "GN-PMP-TRSH", name: "Trash Pump 4 inch Diesel", nameAr: "مضخة طين 4 بوصة ديزل", unit: "piece", cat: "generators-compressors-pumps", base: 14500 },
  { sku: "GN-LT-TWR", name: "Mobile Lighting Tower 4x1000W LED Diesel", nameAr: "برج إنارة متنقل ديزل", unit: "piece", cat: "generators-compressors-pumps", base: 42000 },
  { sku: "GN-ATS-100", name: "Automatic Transfer Switch 100A", nameAr: "مفتاح تحويل أوتوماتيكي 100 أمبير", unit: "piece", cat: "generators-compressors-pumps", base: 3200 },
  { sku: "GN-DST-DB", name: "Site Distribution Board 63A IP44", nameAr: "لوحة توزيع موقع 63 أمبير", unit: "piece", cat: "generators-compressors-pumps", base: 1450 },
  // Welding & metal fabrication
  { featured: true, sku: "WL-INV-200", name: "Inverter Welding Machine 200A", nameAr: "ماكينة لحام إنفرتر 200 أمبير", unit: "piece", cat: "welding-fabrication", brand: "Lincoln Electric", base: 1650, tags: ["welder", "لحام"] },
  { sku: "WL-MIG-350", name: "MIG/MAG Welder 350A", nameAr: "ماكينة لحام ميج 350 أمبير", unit: "piece", cat: "welding-fabrication", brand: "ESAB", base: 9800 },
  { sku: "WL-DSL-400", name: "Diesel Engine Welder 400A", nameAr: "ماكينة لحام ديزل 400 أمبير", unit: "piece", cat: "welding-fabrication", brand: "Miller", base: 38000 },
  { sku: "WL-ELC-6013", name: "Welding Electrodes E6013 3.2mm (20kg carton)", nameAr: "إلكترود لحام 6013 مقاس 3.2 مم (20 كجم)", unit: "piece", cat: "welding-fabrication", base: 240 },
  { sku: "WL-ELC-7018", name: "Welding Electrodes E7018 4mm (20kg carton)", nameAr: "إلكترود لحام 7018 مقاس 4 مم (20 كجم)", unit: "piece", cat: "welding-fabrication", base: 310 },
  { sku: "WL-CUT-PLS", name: "Plasma Cutter 60A", nameAr: "قطاعة بلازما 60 أمبير", unit: "piece", cat: "welding-fabrication", base: 6200 },
  { sku: "WL-OXY-SET", name: "Oxy-Acetylene Cutting Set with Regulators", nameAr: "طقم قص أوكسجين أسيتيلين", unit: "piece", cat: "welding-fabrication", base: 1450 },
  { sku: "WL-DRL-MAG", name: "Magnetic Drill Press 35mm", nameAr: "دريل مغناطيسي 35 مم", unit: "piece", cat: "welding-fabrication", base: 3900 },
  { sku: "WL-BND-HYD", name: "Hydraulic Pipe Bender 2 inch", nameAr: "ثناية مواسير هيدروليكية 2 بوصة", unit: "piece", cat: "welding-fabrication", base: 2100 },
  { sku: "WL-HLM-AUTO", name: "Auto-Darkening Welding Helmet", nameAr: "خوذة لحام أوتوماتيكية", unit: "piece", cat: "welding-fabrication", brand: "3M Speedglas", base: 950 },
  // Lifting, hoists & rigging
  { featured: true, sku: "LF-CHN-3T", name: "Manual Chain Hoist 3 ton 6m", nameAr: "ونش سلسلة يدوي 3 طن 6 م", unit: "piece", cat: "lifting-rigging", brand: "Kito", base: 1850, tags: ["hoist", "ونش"] },
  { sku: "LF-ELC-1T", name: "Electric Chain Hoist 1 ton 380V", nameAr: "ونش كهربائي 1 طن", unit: "piece", cat: "lifting-rigging", base: 6400 },
  { sku: "LF-MAT-500", name: "Construction Material Hoist 500kg 30m", nameAr: "ونش مواد بناء 500 كجم 30 م", unit: "piece", cat: "lifting-rigging", base: 24000 },
  { sku: "LF-SLG-WEB", name: "Polyester Webbing Sling 3 ton 4m", nameAr: "حبل رفع نسيجي 3 طن 4 م", unit: "piece", cat: "lifting-rigging", base: 95, tags: ["sling"] },
  { sku: "LF-SLG-WR", name: "Wire Rope Sling 5 ton 3m", nameAr: "حبل رفع سلك 5 طن 3 م", unit: "piece", cat: "lifting-rigging", base: 260 },
  { sku: "LF-SHK-8.5", name: "Bow Shackle 8.5 ton Grade S", nameAr: "شاكل 8.5 طن", unit: "piece", cat: "lifting-rigging", brand: "Crosby", base: 68 },
  { sku: "LF-JCK-20", name: "Hydraulic Bottle Jack 20 ton", nameAr: "جك هيدروليكي 20 طن", unit: "piece", cat: "lifting-rigging", base: 320 },
  { sku: "LF-PLT-JCK", name: "Hydraulic Pallet Truck 2.5 ton", nameAr: "رافعة بليت يدوية 2.5 طن", unit: "piece", cat: "lifting-rigging", base: 1350 },
  { sku: "LF-PAS-HST", name: "Passenger & Material Hoist 2 ton 50m", nameAr: "مصعد عمال ومواد 2 طن 50 م", unit: "piece", cat: "lifting-rigging", base: 185000 },
  { sku: "LF-TWR-CRN", name: "Tower Crane 6 ton 50m Jib", nameAr: "كرين برجي 6 طن ذراع 50 م", unit: "piece", cat: "lifting-rigging", base: 1450000, tags: ["crane", "كرين"] },
  { sku: "LF-MOB-CRN", name: "Rough Terrain Mobile Crane 50 ton", nameAr: "كرين متحرك 50 طن", unit: "piece", cat: "lifting-rigging", base: 1650000, tags: ["crane", "كرين"] },
  // Surveying, testing & measuring
  { featured: true, sku: "SV-TS-2", name: "Total Station 2 inch Reflectorless", nameAr: "جهاز توتال ستيشن 2 ثانية", unit: "piece", cat: "surveying-instruments", brand: "Leica", base: 42000, tags: ["total station", "توتال"] },
  { sku: "SV-AL-32", name: "Automatic Level 32x with Tripod & Staff", nameAr: "ميزان قامة أوتوماتيكي 32× مع حامل وقامة", unit: "piece", cat: "surveying-instruments", brand: "Topcon", base: 1450 },
  { sku: "SV-GNSS", name: "GNSS RTK Rover Receiver", nameAr: "جهاز GPS مساحي RTK", unit: "piece", cat: "surveying-instruments", brand: "Trimble", base: 65000 },
  { sku: "SV-LDM-100", name: "Laser Distance Meter 100m", nameAr: "جهاز قياس مسافة ليزر 100 م", unit: "piece", cat: "surveying-instruments", brand: "Bosch", base: 420 },
  { sku: "SV-RL-360", name: "Rotary Laser Level Self-Levelling with Receiver", nameAr: "ميزان ليزر دوار مع مستقبل", unit: "piece", cat: "surveying-instruments", base: 2600 },
  { sku: "SV-MW", name: "Measuring Wheel 10,000m", nameAr: "عجلة قياس", unit: "piece", cat: "surveying-instruments", base: 180 },
  { sku: "SV-TPD", name: "Aluminium Tripod Heavy Duty", nameAr: "حامل ثلاثي ألمنيوم", unit: "piece", cat: "surveying-instruments", base: 380 },
  { sku: "SV-PRM", name: "Prism with Pole 2.5m", nameAr: "عاكس مع عصا 2.5 م", unit: "piece", cat: "surveying-instruments", base: 650 },
  { sku: "SV-RBR-SCN", name: "Rebar Scanner / Cover Meter", nameAr: "جهاز كشف حديد التسليح", unit: "piece", cat: "surveying-instruments", brand: "Hilti", base: 12500 },
  { sku: "SV-THK-UT", name: "Ultrasonic Thickness Gauge", nameAr: "جهاز قياس سماكة بالموجات فوق الصوتية", unit: "piece", cat: "surveying-instruments", base: 2400 },
  { sku: "SV-CUBE-MLD", name: "Concrete Cube Mould 150mm Steel (set of 3)", nameAr: "قالب مكعبات خرسانة 150 مم (3)", unit: "piece", cat: "surveying-instruments", base: 420 },
  { sku: "SV-SLUMP", name: "Slump Test Set", nameAr: "طقم اختبار الهبوط", unit: "piece", cat: "surveying-instruments", base: 260 },
  // Site facilities & temporary works
  { featured: true, sku: "SF-CAB-6", name: "Portable Office Cabin 6x3m Insulated with A/C", nameAr: "كرفان مكتب 6×3 م معزول مع مكيف", unit: "piece", cat: "site-facilities", base: 32000, tags: ["porta cabin", "كرفان", "بورتاكابين"] },
  { sku: "SF-CAB-12", name: "Labour Accommodation Cabin 12x3m", nameAr: "كرفان سكن عمال 12×3 م", unit: "piece", cat: "site-facilities", base: 58000 },
  { sku: "SF-WC-MOB", name: "Portable Toilet Unit", nameAr: "دورة مياه متنقلة", unit: "piece", cat: "site-facilities", base: 4200 },
  { sku: "SF-GRD-HSE", name: "Security Guard House 2x2m", nameAr: "غرفة حراسة 2×2 م", unit: "piece", cat: "site-facilities", base: 9500 },
  { sku: "SF-FNC-PNL", name: "Temporary Fence Panel 3.5x2m with Base", nameAr: "سياج مؤقت 3.5×2 م مع قاعدة", unit: "piece", cat: "site-facilities", base: 165, tags: ["fence", "سياج"] },
  { sku: "SF-HRD-M", name: "Site Hoarding Corrugated 2.4m with Posts (per m)", nameAr: "ساتر موقع صاج 2.4 م (م طولي)", unit: "m", cat: "site-facilities", base: 95 },
  { sku: "SF-BRR-WTR", name: "Water-Filled Plastic Barrier 1.5m", nameAr: "حاجز بلاستيك مائي 1.5 م", unit: "piece", cat: "site-facilities", base: 145 },
  { sku: "SF-TNK-5000", name: "Water Storage Tank 5000L PE", nameAr: "خزان مياه 5000 لتر بولي إيثيلين", unit: "piece", cat: "site-facilities", base: 1900 },
  { sku: "SF-TNK-DSL", name: "Diesel Storage Tank 5000L Double Wall with Pump", nameAr: "خزان ديزل 5000 لتر جدار مزدوج مع مضخة", unit: "piece", cat: "site-facilities", base: 14500 },
  { sku: "SF-SKIP-6", name: "Waste Skip Container 6 m³", nameAr: "حاوية نفايات 6 م³", unit: "piece", cat: "site-facilities", base: 4800 },
  { sku: "SF-CNT-20", name: "20ft Storage Container", nameAr: "حاوية تخزين 20 قدم", unit: "piece", cat: "site-facilities", base: 9500, tags: ["container", "كونتينر"] },
  { sku: "SF-SGN-SET", name: "Site Safety Signage Set (20 signs AR/EN)", nameAr: "طقم لوحات سلامة (20 لوحة)", unit: "piece", cat: "site-facilities", base: 480 },
  { sku: "SF-TRP-6x8", name: "Tarpaulin Heavy Duty 6x8m", nameAr: "شادر تربولين 6×8 م", unit: "piece", cat: "site-facilities", base: 160 },
  { sku: "SF-NET-GRN", name: "Scaffold Debris Netting Green 3x50m Roll", nameAr: "شبك أخضر للسقالات 3×50 م", unit: "roll", cat: "site-facilities", base: 220 },
  { sku: "SF-CLR-WTR", name: "Water Cooler 5 Tap Stainless", nameAr: "برادة مياه 5 حنفيات", unit: "piece", cat: "site-facilities", base: 2400 },
  { sku: "SF-FLD-200", name: "LED Floodlight 200W IP65", nameAr: "كشاف LED 200 واط", unit: "piece", cat: "site-facilities", base: 190 },
  // Fire protection
  { featured: true, sku: "FS-EXT-6", name: "Dry Powder Fire Extinguisher 6kg", nameAr: "طفاية حريق بودرة 6 كجم", unit: "piece", cat: "fire-safety", base: 120, tags: ["extinguisher", "طفاية"] },
  { sku: "FS-EXT-CO2", name: "CO2 Fire Extinguisher 5kg", nameAr: "طفاية حريق ثاني أكسيد الكربون 5 كجم", unit: "piece", cat: "fire-safety", base: 260 },
  { sku: "FS-HRL-30", name: "Fire Hose Reel 30m with Cabinet", nameAr: "بكرة خرطوم حريق 30 م مع كابينة", unit: "piece", cat: "fire-safety", base: 950 },
  { sku: "FS-SPR-68", name: "Sprinkler Head Pendent 68°C (box of 50)", nameAr: "رشاش حريق 68 درجة (50)", unit: "piece", cat: "fire-safety", base: 620 },
  { sku: "FS-SMK-DET", name: "Addressable Smoke Detector", nameAr: "كاشف دخان معنون", unit: "piece", cat: "fire-safety", brand: "Honeywell", base: 185 },
  { sku: "FS-FACP-4", name: "Fire Alarm Control Panel 4 Zone", nameAr: "لوحة إنذار حريق 4 مناطق", unit: "piece", cat: "fire-safety", base: 2200 },
  { sku: "FS-DR-90", name: "Fire Rated Steel Door 90 min Single Leaf", nameAr: "باب حريق حديد 90 دقيقة", unit: "piece", cat: "fire-safety", base: 2400 },
  { sku: "FS-PIPE-4", name: "Fire Fighting Pipe Sch40 4 inch Red (6m)", nameAr: "ماسورة حريق 4 بوصة (6 م)", unit: "piece", cat: "fire-safety", base: 640 },
  { sku: "FS-PMP-SET", name: "Fire Pump Set Electric + Diesel + Jockey 750 GPM", nameAr: "مجموعة مضخات حريق 750 جالون", unit: "piece", cat: "fire-safety", base: 185000 },
  { sku: "FS-BLNK", name: "Fire Blanket 1.8x1.8m", nameAr: "بطانية حريق 1.8×1.8 م", unit: "piece", cat: "fire-safety", base: 65 },
  // Elevators, gates & automation
  { featured: true, sku: "EL-PSG-8", name: "Passenger Elevator 8 Persons 6 Stops (supply & install)", nameAr: "مصعد ركاب 8 أشخاص 6 وقفات (توريد وتركيب)", unit: "piece", cat: "elevators-gates", base: 145000, tags: ["elevator", "lift", "مصعد"] },
  { sku: "EL-HOME-4", name: "Home Lift 4 Persons 3 Stops", nameAr: "مصعد منزلي 4 أشخاص 3 وقفات", unit: "piece", cat: "elevators-gates", base: 85000 },
  { sku: "EL-GDS-2T", name: "Goods Elevator 2 ton 3 Stops", nameAr: "مصعد بضائع 2 طن 3 وقفات", unit: "piece", cat: "elevators-gates", base: 175000 },
  { sku: "EL-GATE-SLD", name: "Automatic Sliding Gate Motor 1500kg", nameAr: "موتور بوابة سحب 1500 كجم", unit: "piece", cat: "elevators-gates", brand: "BFT", base: 3200 },
  { sku: "EL-BARR-4", name: "Parking Barrier Gate 4m Boom", nameAr: "حاجز مواقف أوتوماتيكي 4 م", unit: "piece", cat: "elevators-gates", base: 5800 },
  { sku: "EL-RLR-DR", name: "Industrial Rolling Shutter Door 4x4m Motorised", nameAr: "باب رول صناعي 4×4 م", unit: "piece", cat: "elevators-gates", base: 9800 },
  // Solar & energy
  { featured: true, sku: "SO-PNL-550", name: "Solar Panel Mono 550W", nameAr: "لوح شمسي أحادي 550 واط", unit: "piece", cat: "solar-energy", brand: "Jinko", base: 480, tags: ["solar", "شمسي"] },
  { sku: "SO-INV-10", name: "Hybrid Solar Inverter 10kW", nameAr: "إنفرتر شمسي هجين 10 كيلوواط", unit: "piece", cat: "solar-energy", brand: "Huawei", base: 8900 },
  { sku: "SO-BAT-5", name: "Lithium Battery 5 kWh 48V", nameAr: "بطارية ليثيوم 5 كيلوواط ساعة", unit: "piece", cat: "solar-energy", base: 7800 },
  { sku: "SO-STR-KW", name: "Roof Mounting Structure Kit (per kW)", nameAr: "هيكل تركيب ألواح على السطح (كيلوواط)", unit: "piece", cat: "solar-energy", base: 350 },
  { sku: "SO-WH-200", name: "Solar Water Heater 200L", nameAr: "سخان مياه شمسي 200 لتر", unit: "piece", cat: "solar-energy", base: 3400 },
  { sku: "SO-LT-ST", name: "Solar Street Light 100W All-in-One", nameAr: "عمود إنارة شمسي 100 واط", unit: "piece", cat: "solar-energy", base: 1250 },
  // More tools & equipment
  { sku: "TL-DRL-CDL", name: "Cordless Drill Driver 18V (2 batteries)", nameAr: "دريل شحن 18 فولت مع بطاريتين", unit: "piece", cat: "tools-equipment", brand: "Makita", base: 620 },
  { sku: "TL-HAM-DEM", name: "Demolition Hammer 1500W", nameAr: "هيلتي تكسير 1500 واط", unit: "piece", cat: "tools-equipment", brand: "Bosch", base: 2400, tags: ["breaker", "تكسير"] },
  { sku: "TL-SAW-CIR", name: "Circular Saw 185mm 1400W", nameAr: "منشار دائري 185 مم", unit: "piece", cat: "tools-equipment", brand: "DeWalt", base: 480 },
  { sku: "TL-SAW-CHP", name: "Metal Chop Saw 355mm", nameAr: "منشار قطع حديد 355 مم", unit: "piece", cat: "tools-equipment", brand: "Makita", base: 720 },
  { sku: "TL-JIG", name: "Jigsaw 650W", nameAr: "منشار أركت 650 واط", unit: "piece", cat: "tools-equipment", base: 320 },
  { sku: "TL-IMP-WR", name: "Cordless Impact Wrench 1/2 inch 18V", nameAr: "مفك صواميل شحن 1/2 بوصة", unit: "piece", cat: "tools-equipment", brand: "Milwaukee", base: 1150 },
  { sku: "TL-GRD-230", name: "Angle Grinder 230mm 2200W", nameAr: "صاروخ جلخ 230 مم", unit: "piece", cat: "tools-equipment", brand: "Bosch", base: 520 },
  { sku: "TL-SAW-TIL", name: "Wet Tile Saw 250mm", nameAr: "منشار بلاط مائي 250 مم", unit: "piece", cat: "tools-equipment", base: 1400 },
  { sku: "TL-HT-SET", name: "Hand Tool Set 120 pcs", nameAr: "طقم عدد يدوية 120 قطعة", unit: "piece", cat: "tools-equipment", brand: "Stanley", base: 480 },
  { sku: "TL-MTR-MIX", name: "Mortar Mixer Paddle Drill 1600W", nameAr: "خلاط مونة كهربائي 1600 واط", unit: "piece", cat: "tools-equipment", base: 450 },
  { sku: "TL-PRS-WSH", name: "Pressure Washer 150 bar", nameAr: "غسالة ضغط 150 بار", unit: "piece", cat: "tools-equipment", brand: "Karcher", base: 1350 },
  { sku: "TL-VAC-IND", name: "Industrial Wet/Dry Vacuum 60L", nameAr: "مكنسة صناعية 60 لتر", unit: "piece", cat: "tools-equipment", base: 980 },
  { sku: "TL-SHVL", name: "Square Mouth Shovel Steel", nameAr: "كريك حديد", unit: "piece", cat: "tools-equipment", base: 38 },
  { sku: "TL-PCK", name: "Pickaxe 2.5kg with Handle", nameAr: "فأس 2.5 كجم", unit: "piece", cat: "tools-equipment", base: 45 },
  { sku: "TL-SLDG", name: "Sledge Hammer 5kg", nameAr: "مطرقة ثقيلة 5 كجم", unit: "piece", cat: "tools-equipment", base: 85 },
  { sku: "TL-TRWL-SET", name: "Plastering Trowel Set", nameAr: "طقم مساطر لياسة", unit: "piece", cat: "tools-equipment", base: 110 },
  { sku: "TL-SPRT-LVL", name: "Spirit Level 120cm Aluminium", nameAr: "ميزان ماء 120 سم", unit: "piece", cat: "tools-equipment", brand: "Stabila", base: 140 },
  // More safety & PPE
  { sku: "PPE-GGL", name: "Safety Goggles Anti-Fog (box of 12)", nameAr: "نظارات سلامة (12)", unit: "piece", cat: "safety-ppe", brand: "3M", base: 180 },
  { sku: "PPE-EAR", name: "Ear Muffs 30dB", nameAr: "سماعات حماية أذن", unit: "piece", cat: "safety-ppe", base: 65 },
  { sku: "PPE-RSP", name: "Half-Face Respirator with P100 Filters", nameAr: "كمامة نصف وجه مع فلاتر", unit: "piece", cat: "safety-ppe", brand: "3M", base: 210 },
  { sku: "PPE-MSK-N95", name: "N95 Dust Masks (box of 20)", nameAr: "كمامات N95 (20)", unit: "piece", cat: "safety-ppe", base: 95 },
  { sku: "PPE-FAK", name: "First Aid Kit 50 Person", nameAr: "حقيبة إسعافات أولية 50 شخص", unit: "piece", cat: "safety-ppe", base: 320 },
  { sku: "PPE-SFN", name: "Safety Net 5x10m Knotless", nameAr: "شبكة أمان 5×10 م", unit: "piece", cat: "safety-ppe", base: 480 },
  { sku: "PPE-TAPE", name: "Barrier Tape Red/White 500m", nameAr: "شريط تحذير 500 م", unit: "roll", cat: "safety-ppe", base: 45 },
  { sku: "PPE-EYE-WSH", name: "Emergency Eye Wash Station", nameAr: "محطة غسيل عيون طوارئ", unit: "piece", cat: "safety-ppe", base: 1850 },
  { sku: "PPE-CVRL", name: "Flame Retardant Coverall", nameAr: "أفرول مقاوم للحريق", unit: "piece", cat: "safety-ppe", base: 145 },
  { sku: "PPE-LFLN", name: "Retractable Fall Arrester 10m", nameAr: "بكرة حماية من السقوط 10 م", unit: "piece", cat: "safety-ppe", base: 1250 },
  // More scaffolding & access
  { sku: "SC-TWR-MOB", name: "Mobile Aluminium Scaffold Tower 6m", nameAr: "برج سقالة ألمنيوم متحرك 6 م", unit: "piece", cat: "scaffolding-access", base: 7800 },
  { sku: "SC-PROP-3", name: "Adjustable Steel Prop 1.8–3.2m", nameAr: "جاك دعم حديد 1.8–3.2 م", unit: "piece", cat: "scaffolding-access", base: 62, tags: ["prop", "جاك"] },
  { sku: "SC-CUP-3", name: "Cuplock Vertical Standard 3m", nameAr: "قائم كب لوك 3 م", unit: "piece", cat: "scaffolding-access", base: 85 },
  { sku: "SC-JCK-BASE", name: "Base Jack 600mm", nameAr: "جاك قاعدة 600 مم", unit: "piece", cat: "scaffolding-access", base: 28 },
  { sku: "SC-LDR-STP", name: "Fibreglass Step Ladder 8ft", nameAr: "سلم فيبرجلاس 8 قدم", unit: "piece", cat: "scaffolding-access", base: 420 },
  { sku: "SC-SCS-LFT", name: "Electric Scissor Lift 8m", nameAr: "رافعة مقصية كهربائية 8 م", unit: "piece", cat: "scaffolding-access", brand: "Genie", base: 68000, tags: ["scissor lift", "مقصية"] },
  { sku: "SC-BOOM-16", name: "Articulating Boom Lift 16m", nameAr: "رافعة ذراع مفصلية 16 م", unit: "piece", cat: "scaffolding-access", brand: "JLG", base: 245000 },
  { sku: "SC-GNDL", name: "Suspended Platform (Gondola) 6m 630kg", nameAr: "جندول سقالة معلقة 6 م", unit: "piece", cat: "scaffolding-access", base: 32000, tags: ["gondola", "جندول"] },
];

const suppliers = [
  { name: "Al Rajhi Building Materials", nameAr: "الراجحي لمواد البناء", city: "Riyadh", region: "Central", verified: true, rating: 4.7, ratingCount: 212, factor: 1.0, cats: ["cement-concrete", "steel-rebar", "blocks-bricks", "aggregates-sand", "timber-formwork"] },
  { name: "Binladin Trading & Supply", nameAr: "بن لادن للتجارة والتوريد", city: "Jeddah", region: "Western", verified: true, rating: 4.5, ratingCount: 148, factor: 1.03, cats: ["cement-concrete", "steel-rebar", "blocks-bricks", "insulation-waterproofing", "gypsum-ceilings"] },
  { name: "Eastern Province Steel Co.", nameAr: "شركة الشرقية للحديد", city: "Dammam", region: "Eastern", verified: true, rating: 4.6, ratingCount: 96, factor: 0.98, cats: ["steel-rebar", "timber-formwork"] },
  { name: "Najd Cement & Blocks", nameAr: "نجد للأسمنت والبلوك", city: "Riyadh", region: "Central", verified: true, rating: 4.3, ratingCount: 77, factor: 0.97, cats: ["cement-concrete", "blocks-bricks", "aggregates-sand"] },
  { name: "Saudi Ceramics Depot", nameAr: "مستودع الخزف السعودي", city: "Riyadh", region: "Central", verified: true, rating: 4.4, ratingCount: 134, factor: 1.0, cats: ["tiles-flooring", "paints-coatings", "gypsum-ceilings"] },
  { name: "Gulf Electrical Supplies", nameAr: "الخليج للتوريدات الكهربائية", city: "Khobar", region: "Eastern", verified: true, rating: 4.5, ratingCount: 61, factor: 1.01, cats: ["electrical", "plumbing"] },
  { name: "Hejaz Plumbing & Pipes", nameAr: "الحجاز للسباكة والأنابيب", city: "Jeddah", region: "Western", verified: false, rating: 4.1, ratingCount: 23, factor: 0.99, cats: ["plumbing", "insulation-waterproofing"] },
  { name: "Madinah Paints Center", nameAr: "مركز المدينة للدهانات", city: "Madinah", region: "Western", verified: true, rating: 4.2, ratingCount: 40, factor: 1.02, cats: ["paints-coatings", "insulation-waterproofing", "gypsum-ceilings"] },
  { name: "Tabuk Aggregates & Quarries", nameAr: "تبوك للمحاجر والركام", city: "Tabuk", region: "Northern", verified: false, rating: 3.9, ratingCount: 12, factor: 0.94, cats: ["aggregates-sand", "blocks-bricks"] },
  { name: "Asir Doors & Glass Works", nameAr: "عسير للأبواب والزجاج", city: "Abha", region: "Southern", verified: true, rating: 4.0, ratingCount: 31, factor: 1.05, cats: ["doors-windows", "timber-formwork"] },
  { name: "Jubail Industrial Supplies", nameAr: "الجبيل للتوريدات الصناعية", city: "Jubail", region: "Eastern", verified: true, rating: 4.6, ratingCount: 88, factor: 1.02, cats: ["steel-rebar", "electrical", "insulation-waterproofing", "doors-windows"] },
  { name: "Qassim Ready Mix", nameAr: "القصيم للخرسانة الجاهزة", city: "Buraidah", region: "Central", verified: true, rating: 4.4, ratingCount: 54, factor: 0.96, cats: ["cement-concrete", "aggregates-sand"] },
  { name: "Demo Supplier Co.", nameAr: "شركة المورد التجريبي", city: "Riyadh", region: "Central", verified: true, rating: 4.8, ratingCount: 19, factor: 0.995, cats: ["cement-concrete", "steel-rebar", "blocks-bricks", "aggregates-sand", "tiles-flooring", "paints-coatings", "plumbing", "electrical", "tools-equipment", "safety-ppe", "hardware-fasteners", "lighting", "concrete-compaction", "generators-compressors-pumps", "fire-safety", "site-facilities"] },
  { name: "Riyadh Tools & Hardware Mart", nameAr: "الرياض للعدد والخردوات", city: "Riyadh", region: "Central", verified: true, rating: 4.5, ratingCount: 302, factor: 1.0, cats: ["tools-equipment", "safety-ppe", "hardware-fasteners", "scaffolding-access", "chemicals-adhesives", "welding-fabrication", "surveying-instruments", "fire-safety", "concrete-compaction"] },
  { name: "Jeddah HVAC & Sanitary House", nameAr: "جدة للتكييف والأدوات الصحية", city: "Jeddah", region: "Western", verified: true, rating: 4.4, ratingCount: 121, factor: 1.01, cats: ["hvac", "sanitary-ware", "lighting", "plumbing"] },
  { name: "Dammam Roofing & Cladding Systems", nameAr: "الدمام لأنظمة الأسقف والتكسيات", city: "Dammam", region: "Eastern", verified: true, rating: 4.3, ratingCount: 58, factor: 0.99, cats: ["roofing-cladding", "insulation-waterproofing", "scaffolding-access"] },
  { name: "Al Khobar Precast & Landscape", nameAr: "الخبر للخرسانة مسبقة الصب", city: "Khobar", region: "Eastern", verified: false, rating: 4.0, ratingCount: 14, factor: 0.97, cats: ["landscaping-precast", "blocks-bricks", "chemicals-adhesives"] },
  { name: "Makkah Electrical & Lighting", nameAr: "مكة للكهرباء والإنارة", city: "Makkah", region: "Western", verified: true, rating: 4.2, ratingCount: 47, factor: 1.02, cats: ["electrical", "lighting", "hvac", "safety-ppe"] },
  { name: "Arabian Machinery & Equipment Co.", nameAr: "الشركة العربية للآليات والمعدات", city: "Riyadh", region: "Central", verified: true, rating: 4.6, ratingCount: 87, factor: 1.0, cats: ["heavy-equipment", "concrete-compaction", "generators-compressors-pumps", "lifting-rigging", "scaffolding-access"] },
  { name: "Gulf Site Solutions", nameAr: "الخليج لحلول المواقع", city: "Dammam", region: "Eastern", verified: true, rating: 4.4, ratingCount: 52, factor: 0.99, cats: ["site-facilities", "scaffolding-access", "safety-ppe", "fire-safety", "surveying-instruments", "generators-compressors-pumps"] },
  { name: "Jeddah Welding & Industrial Tools", nameAr: "جدة للحام والعدد الصناعية", city: "Jeddah", region: "Western", verified: true, rating: 4.3, ratingCount: 68, factor: 1.01, cats: ["welding-fabrication", "tools-equipment", "generators-compressors-pumps", "hardware-fasteners", "lifting-rigging", "concrete-compaction"] },
  { name: "Saudi Solar & Elevator Technologies", nameAr: "السعودية لتقنيات الطاقة الشمسية والمصاعد", city: "Riyadh", region: "Central", verified: false, rating: 4.1, ratingCount: 21, factor: 1.02, cats: ["solar-energy", "elevators-gates", "electrical", "fire-safety", "lighting"] },
  { name: "Eastern Heavy Equipment Traders", nameAr: "الشرقية لتجارة المعدات الثقيلة", city: "Khobar", region: "Eastern", verified: true, rating: 4.5, ratingCount: 39, factor: 0.98, cats: ["heavy-equipment", "concrete-compaction", "lifting-rigging", "surveying-instruments", "site-facilities"] },
];

// Deterministic pseudo-random so the seed is reproducible.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}
const rand = rng(42);
const jitter = (spread: number) => 1 + (rand() * 2 - 1) * spread;
const round2 = (n: number) => Math.round(n * 100) / 100;

async function main() {
  console.log("Seeding MySupplier…");
  await prisma.notification.deleteMany();
  await prisma.review.deleteMany();
  await prisma.orderMessage.deleteMany();
  await prisma.orderEvent.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.payout.deleteMany();
  await prisma.companyInvite.deleteMany();
  await prisma.companyDocument.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.platformSetting.deleteMany();
  await prisma.shipmentEvent.deleteMany();
  await prisma.shipment.deleteMany();
  await prisma.shippingRate.deleteMany();
  await prisma.eInvoiceRecord.deleteMany();
  await prisma.otpCode.deleteMany();
  await prisma.priceImportRow.deleteMany();
  await prisma.priceImport.deleteMany();
  await prisma.priceUpdateRequest.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.feed.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.bidItem.deleteMany();
  await prisma.bid.deleteMany();
  await prisma.rfqItem.deleteMany();
  await prisma.rfq.deleteMany();
  await prisma.priceHistory.deleteMany();
  await prisma.priceListing.deleteMany();
  await prisma.material.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();
  await prisma.company.deleteMany();
  await prisma.counter.deleteMany();

  const catBySlug = new Map<string, string>();
  for (const c of categories) {
    const created = await prisma.category.create({ data: c });
    catBySlug.set(c.slug, created.id);
  }

  const materialRows: Array<M & { id: string }> = [];
  for (const m of materials) {
    const created = await prisma.material.create({
      data: {
        sku: m.sku, name: m.name, nameAr: m.nameAr, unit: m.unit, brand: m.brand,
        categoryId: catBySlug.get(m.cat)!, specs: m.specs ?? Prisma.JsonNull,
        description: `${m.name} — market reference price around SAR ${m.base} per ${m.unit}.`,
        featured: m.featured ?? false, tags: m.tags ?? [], popularity: Math.floor(rand() * 500),
      },
    });
    materialRows.push({ ...m, id: created.id });
  }

  const companyIds: { id: string; name: string; city: string; factor: number; cats: string[] }[] = [];
  for (const s of suppliers) {
    const { cats, factor, ...data } = s;
    const slug = s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const created = await prisma.company.create({
      data: {
        ...data, type: "SUPPLIER", slug, crNumber: `10${Math.floor(rand() * 1e8).toString().padStart(8, "0")}`, vatNumber: `3${Math.floor(rand() * 1e13).toString().padStart(13, "0")}00003`,
        phone: "+9665" + Math.floor(rand() * 1e8).toString().padStart(8, "0"), email: `sales@${slug}.sa`,
        verificationStatus: s.verified ? "VERIFIED" : "PENDING", citiesServed: [s.city],
        description: `${s.name} supplies ${cats.map((c) => c.replace(/-/g, " ")).join(", ")} across ${s.region} Saudi Arabia. Same-week delivery, VAT invoices, volume discounts for contractors.`,
        deliveryDays: 2 + Math.floor(rand() * 4), minOrderValue: 500, deliveryFee: 150, workingHours: "Sat–Thu 7:00–18:00",
        branches: { create: { name: `${s.city} main branch`, city: s.city, address: `${s.city} Industrial Area`, phone: "+9665" + Math.floor(rand() * 1e8).toString().padStart(8, "0"), isDefault: true } },
      },
    });
    companyIds.push({ id: created.id, name: s.name, city: s.city, factor, cats });
  }
  const demoSupplier = companyIds.find((c) => c.name === "Demo Supplier Co.")!;

  const contractor = await prisma.company.create({
    data: { name: "Riyadh Horizon Contracting", nameAr: "أفق الرياض للمقاولات", type: "CONTRACTOR", city: "Riyadh", region: "Central", verified: true, crNumber: "1010555123" },
  });

  const password = (p: string) => bcrypt.hashSync(p, 10);
  const admin = await prisma.user.create({ data: { email: "admin@mysupplier.sa", passwordHash: password("Admin123!"), name: "Platform Admin", role: "ADMIN" } });
  const buyer = await prisma.user.create({ data: { email: "buyer@mysupplier.sa", passwordHash: password("Buyer123!"), name: "Fahad Al-Otaibi", phone: "+966501234567", role: "BUYER", companyId: contractor.id } });
  await prisma.user.create({ data: { email: "supplier@mysupplier.sa", passwordHash: password("Supplier123!"), name: "Sara Al-Ghamdi", phone: "+966557654321", role: "SUPPLIER", companyId: demoSupplier.id, companyRole: "OWNER" } });
  await prisma.user.create({ data: { email: "warehouse@mysupplier.sa", passwordHash: password("Supplier123!"), name: "Khalid Warehouse", role: "SUPPLIER", companyId: demoSupplier.id, companyRole: "WAREHOUSE" } });
  // One staff user per other supplier so notifications have recipients.
  for (const c of companyIds) {
    if (c.id === demoSupplier.id) continue;
    const slug = c.name.toLowerCase().replace(/[^a-z]+/g, "-").replace(/(^-|-$)/g, "");
    await prisma.user.create({ data: { email: `sales@${slug}.sa`, passwordHash: password("Supplier123!"), name: `${c.name} Sales`, role: "SUPPLIER", companyId: c.id, companyRole: "OWNER" } });
  }

  // Price listings: each supplier lists most materials in its categories, in its own city
  // (and sometimes a neighbouring major city).
  const listings: Prisma.PriceListingCreateManyInput[] = [];
  const neighbours: Record<string, string[]> = { Makkah: ["Makkah", "Jeddah"], Riyadh: ["Riyadh"], Jeddah: ["Jeddah", "Makkah"], Dammam: ["Dammam", "Khobar"], Khobar: ["Khobar", "Dammam"], Madinah: ["Madinah", "Yanbu"], Tabuk: ["Tabuk"], Abha: ["Abha", "Khamis Mushait"], Jubail: ["Jubail", "Dammam"], Buraidah: ["Buraidah", "Riyadh"] };
  const now = Date.now();
  for (const c of companyIds) {
    for (const m of materialRows) {
      if (!c.cats.includes(m.cat)) continue;
      if (rand() < 0.15) continue; // not every supplier stocks everything
      for (const city of neighbours[c.city] ?? [c.city]) {
        listings.push({
          materialId: m.id, companyId: c.id, city,
          price: round2(m.base * c.factor * jitter(0.06) * (city === c.city ? 1 : 1.03)),
          minQty: m.unit === "ton" || m.unit === "m3" ? 5 : m.unit === "piece" ? (m.base >= 50 ? 1 : m.base >= 20 ? 10 : 100) : m.base >= 100 ? 1 : 10,
          leadTimeDays: 1 + Math.floor(rand() * 6),
          stock: rand() < 0.2 ? null : m.base >= 20000 ? 1 + Math.floor(rand() * 5) : m.base >= 1000 ? 5 + Math.floor(rand() * 40) : Math.floor(rand() * 5000) + 20,
          source: "SUPPLIER",
          updatedAt: new Date(now - Math.floor(rand() * 20) * 86400000),
          validUntil: new Date(now + (30 + Math.floor(rand() * 60)) * 86400000),
        });
      }
    }
  }
  // Market reference prices imported from external sources (published indices / catalogues).
  for (const m of materialRows) {
    for (const [sourceName, city, f] of [["GASTAT Building Materials Index", "Riyadh", 1.0], ["Souq Al-Bina Catalogue", "Jeddah", 1.02], ["Eastern Traders Bulletin", "Dammam", 0.99]] as const) {
      listings.push({ materialId: m.id, companyId: null, city, price: round2(m.base * f * jitter(0.03)), minQty: 1, leadTimeDays: 3, source: "MARKET", sourceName, updatedAt: new Date(now - Math.floor(rand() * 7) * 86400000) });
    }
  }
  await prisma.priceListing.createMany({ data: listings });

  // 120 days of price history per material with a gentle trend + noise.
  const history: Prisma.PriceHistoryCreateManyInput[] = [];
  for (const m of materialRows) {
    const trend = (rand() - 0.45) * 0.12; // -5.4% .. +6.6% over the window
    for (let d = 120; d >= 0; d -= 1) {
      const t = 1 - d / 120;
      const avg = m.base * (1 - trend * (1 - t)) * jitter(0.012);
      const date = new Date(now - d * 86400000);
      history.push({ materialId: m.id, date: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())), avg: round2(avg), min: round2(avg * 0.93), max: round2(avg * 1.08) });
    }
  }
  await prisma.priceHistory.createMany({ data: history, skipDuplicates: true });

  // Demo RFQs, bids and one awarded order.
  const byPk = (sku: string) => materialRows.find((m) => m.sku === sku)!;
  const counters: Record<string, number> = { RFQ: 0, ORD: 0 };
  const ref = (p: "RFQ" | "ORD") => `${p}-${new Date().getFullYear()}-${String(++counters[p]).padStart(6, "0")}`;

  const rfq1 = await prisma.rfq.create({
    data: {
      reference: ref("RFQ"), buyerId: buyer.id, title: "Villa project foundations – Al Narjis, Riyadh", deliveryCity: "Riyadh",
      deliveryAddress: "Al Narjis District, Plot 233", deliveryDate: new Date(now + 21 * 86400000), closesAt: new Date(now + 7 * 86400000),
      notes: "Delivery in two lots. Mill certificates required for rebar.",
      items: { create: [
        { materialId: byPk("CEM-OPC-50").id, description: "OPC cement 50kg bags", quantity: 1200, unit: "bag" },
        { materialId: byPk("RBR-16").id, description: "Rebar 16mm Grade 60", quantity: 25, unit: "ton" },
        { materialId: byPk("RBR-12").id, description: "Rebar 12mm Grade 60", quantity: 15, unit: "ton" },
        { materialId: byPk("BLK-HOL-20").id, description: "Hollow block 20cm", quantity: 8000, unit: "piece" },
      ] },
    },
    include: { items: true },
  });
  const rfq2 = await prisma.rfq.create({
    data: {
      reference: ref("RFQ"), buyerId: buyer.id, title: "Finishing package – 12 apartments, Jeddah", deliveryCity: "Jeddah",
      closesAt: new Date(now + 10 * 86400000), notes: "Samples required before award.",
      items: { create: [
        { materialId: byPk("TIL-POR-60").id, description: "Porcelain 60x60 matt", quantity: 1800, unit: "m2" },
        { materialId: byPk("PNT-EMU-INT").id, description: "Interior emulsion 18L", quantity: 60, unit: "drum" },
        { materialId: byPk("GYP-BRD-12").id, description: "Gypsum board 12.5mm", quantity: 400, unit: "sheet" },
      ] },
    },
    include: { items: true },
  });
  const rfq3 = await prisma.rfq.create({
    data: {
      reference: ref("RFQ"), buyerId: buyer.id, title: "Warehouse slab – ready mix C30", deliveryCity: "Riyadh",
      closesAt: new Date(now - 2 * 86400000), status: "AWARDED",
      items: { create: [{ materialId: byPk("RMC-C30").id, description: "Ready mix C30, pump on site", quantity: 640, unit: "m3" }] },
    },
    include: { items: true },
  });

  const bidFor = async (rfq: typeof rfq1, companyId: string, factor: number, deliveryDays: number, status: "SUBMITTED" | "ACCEPTED" | "REJECTED" = "SUBMITTED") => {
    const items = rfq.items.map((it) => {
      const base = materialRows.find((m) => m.id === it.materialId)?.base ?? 100;
      return { rfqItemId: it.id, unitPrice: round2(base * factor), quantity: it.quantity, leadTimeDays: deliveryDays };
    });
    const totalPrice = round2(items.reduce((s, i) => s + i.unitPrice * i.quantity, 0));
    return prisma.bid.create({ data: { rfqId: rfq.id, companyId, totalPrice, validUntil: new Date(now + 20 * 86400000), deliveryDays, status, notes: "Prices include VAT and delivery to site.", items: { create: items } } });
  };
  const riyadhSuppliers = companyIds.filter((c) => c.city === "Riyadh" && c.cats.includes("cement-concrete"));
  await bidFor(rfq1, riyadhSuppliers[0].id, 1.02, 5);
  await bidFor(rfq1, riyadhSuppliers[1].id, 0.99, 7);
  await bidFor(rfq1, demoSupplier.id, 1.0, 4);
  const jeddah = companyIds.filter((c) => c.city === "Jeddah");
  await bidFor(rfq2, jeddah[0].id, 1.04, 10);
  const qassim = companyIds.find((c) => c.name === "Qassim Ready Mix")!;
  const winning = await bidFor(rfq3, qassim.id, 0.97, 3, "ACCEPTED");
  await bidFor(rfq3, riyadhSuppliers[0].id, 1.01, 5, "REJECTED");
  await prisma.rfq.update({ where: { id: rfq3.id }, data: { awardedBidId: winning.id } });
  await prisma.order.create({ data: { reference: ref("ORD"), type: "RFQ", rfqId: rfq3.id, bidId: winning.id, buyerId: buyer.id, companyId: qassim.id, subtotal: winning.totalPrice, total: winning.totalPrice, status: "CONFIRMED", paymentMethod: "BANK_TRANSFER", deliveryCity: "Riyadh", items: { create: [{ materialId: byPk("RMC-C30").id, name: byPk("RMC-C30").name, unit: "m3", unitPrice: round2(byPk("RMC-C30").base * 0.97), quantity: 640, lineTotal: winning.totalPrice }] } } });
  await prisma.feed.create({ data: { name: "Example JSON feed (edit URL)", url: "https://example.com/construction-prices.json", format: "json", enabled: false, lastStatus: "never run" } });
  // (counters are written at the end, after every seeded reference)
  await prisma.platformSetting.createMany({ data: [{ key: "commissionPct", value: 3 }, { key: "payoutDayOfWeek", value: 1 }, { key: "lowStockThresholdDefault", value: 10 }] });
  await prisma.shippingRate.createMany({ data: DEFAULT_RATES });
  // Logistics data for quoting (kg / m³ per unit) on the heaviest categories.
  const weights: Record<string, [number, number]> = { "CEM-OPC-50": [50, 0.035], "CEM-SRC-50": [50, 0.035], "CEM-WHT-50": [50, 0.035], "BLK-HOL-20": [18, 0.016], "BLK-HOL-15": [14, 0.012], "BLK-SOL-10": [12, 0.008], "BRK-RED": [3, 0.0015], "TIL-POR-60": [22, 0.012], "GYP-BRD-12": [28, 0.036], "PLY-18": [32, 0.054], "PPE-HLM": [0.4, 0.006], "HV-SPL-24": [60, 0.3], "SN-WH-50": [22, 0.12], "WTR-TNK-2000": [60, 2.2] };
  for (const [sku, [kg, m3]] of Object.entries(weights)) await prisma.material.updateMany({ where: { sku }, data: { weightKg: kg, volumeM3: m3 } });
  // A delivered, paid direct order from the demo supplier with a review, messages and a timeline.
  const helmet = byPk("PPE-HLM");
  const helmetListing = await prisma.priceListing.findFirst({ where: { materialId: helmet.id, companyId: demoSupplier.id } });
  const delivered = await prisma.order.create({
    data: {
      reference: ref("ORD"), type: "DIRECT", buyerId: buyer.id, companyId: demoSupplier.id, subtotal: 2800, vat: 420, deliveryFee: 150, total: 3370, status: "DELIVERED", paymentStatus: "PAID", paymentMethod: "BANK_TRANSFER",
      deliveryCity: "Riyadh", deliveryAddress: "Al Narjis, Plot 233", contactPhone: "+966501234567", createdAt: new Date(now - 9 * 86400000),
      items: { create: [{ materialId: helmet.id, listingId: helmetListing?.id, name: helmet.name, unit: "piece", unitPrice: 28, quantity: 100, lineTotal: 2800 }] },
      events: { create: [
        { type: "CREATED", status: "PENDING", message: "Order placed · bank transfer", userId: buyer.id, createdAt: new Date(now - 9 * 86400000) },
        { type: "PAYMENT", message: "Payment paid", createdAt: new Date(now - 8 * 86400000) },
        { type: "STATUS", status: "CONFIRMED", createdAt: new Date(now - 8 * 86400000) },
        { type: "STATUS", status: "IN_TRANSIT", createdAt: new Date(now - 6 * 86400000) },
        { type: "STATUS", status: "DELIVERED", createdAt: new Date(now - 5 * 86400000) },
      ] },
    },
  });
  const supplierUser = await prisma.user.findUniqueOrThrow({ where: { email: "supplier@mysupplier.sa" } });
  await prisma.orderMessage.createMany({ data: [
    { orderId: delivered.id, senderId: buyer.id, body: "Can you deliver before 9am? Site gate closes at 10.", createdAt: new Date(now - 7 * 86400000), readAt: new Date(now - 7 * 86400000) },
    { orderId: delivered.id, senderId: supplierUser.id, body: "Yes, truck leaves at 7:00. Driver will call 30 minutes before.", createdAt: new Date(now - 7 * 86400000 + 3600000), readAt: new Date(now - 6 * 86400000) },
  ] });
  await prisma.review.create({ data: { orderId: delivered.id, companyId: demoSupplier.id, buyerId: buyer.id, rating: 5, comment: "On time, helmets exactly as specified, invoice correct.", reply: "Thank you! Looking forward to your next order.", repliedAt: new Date(now - 4 * 86400000) } });
  await prisma.company.update({ where: { id: demoSupplier.id }, data: { rating: 5, ratingCount: 1 } });
  if (helmetListing) await prisma.stockMovement.createMany({ data: [
    { listingId: helmetListing.id, companyId: demoSupplier.id, type: "IN", quantity: 500, balanceAfter: 500, reason: "Opening stock", createdAt: new Date(now - 10 * 86400000) },
    { listingId: helmetListing.id, companyId: demoSupplier.id, type: "OUT", quantity: 100, balanceAfter: 400, reason: `Order ${delivered.reference}`, orderId: delivered.id, createdAt: new Date(now - 9 * 86400000) },
  ] });

  await prisma.notification.createMany({ data: [
    { userId: buyer.id, type: "NEW_BID", title: `New bid on ${rfq1.reference}`, body: "3 suppliers have quoted your villa foundations RFQ.", link: `/dashboard/rfqs/${rfq1.id}` },
    { userId: admin.id, type: "SYSTEM", title: "Welcome to MySupplier", body: "Seed data loaded. Verify new suppliers under Admin → Companies." },
  ] });

  await prisma.counter.createMany({ data: [{ key: `RFQ-${new Date().getFullYear()}`, value: counters.RFQ }, { key: `ORD-${new Date().getFullYear()}`, value: counters.ORD }] });

  console.log(`Seeded ${categories.length} categories, ${materials.length} materials, ${suppliers.length} suppliers, ${listings.length} price listings, ${history.length} history points.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
