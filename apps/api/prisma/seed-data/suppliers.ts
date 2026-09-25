import type { SeedSupplier } from "./types";

/** Specialist MRO / facility suppliers added to the 23 construction suppliers in seed.ts. */
export const extraSuppliers: SeedSupplier[] = [
  { name: "Arabian MRO Distribution", nameAr: "العربية لتوزيع مستلزمات الصيانة والتشغيل", city: "Riyadh", region: "Central", verified: true, rating: 4.6, ratingCount: 143, factor: 1.0, cats: ["pumps-motors-drives", "valves-fittings-flanges", "lubricants-chemicals", "hoses-seals-gaskets", "compressed-air-pneumatics", "industrial-electrical-automation", "abrasives-consumables", "generator-ups-spares", "hardware-fasteners"] },
  { name: "Cool Tech HVAC Parts", nameAr: "كول تك لقطع غيار التكييف", city: "Jeddah", region: "Western", verified: true, rating: 4.5, ratingCount: 98, factor: 0.99, cats: ["hvac-spare-parts", "hvac", "smart-building-bms", "pumps-motors-drives", "lubricants-chemicals"] },
  { name: "Secure Vision Systems", nameAr: "سيكيور فيجن للأنظمة الأمنية", city: "Riyadh", region: "Central", verified: true, rating: 4.7, ratingCount: 76, factor: 1.02, cats: ["security-cctv", "low-current-networking", "smart-building-bms", "fire-life-safety-spares", "elevators-gates"] },
  { name: "Clean Gulf Janitorial Supplies", nameAr: "كلين جلف لمستلزمات النظافة", city: "Dammam", region: "Eastern", verified: true, rating: 4.4, ratingCount: 210, factor: 0.97, cats: ["cleaning-janitorial", "facility-consumables", "pest-control-hygiene", "waste-management", "workwear-uniforms", "office-supplies"] },
  { name: "Green Oasis Irrigation", nameAr: "الواحة الخضراء لأنظمة الري", city: "Riyadh", region: "Central", verified: true, rating: 4.3, ratingCount: 64, factor: 1.0, cats: ["irrigation-landscaping", "swimming-pool", "water-treatment-tanks", "landscaping-precast", "pumps-motors-drives"] },
  { name: "Saudi Rental Fleet Co.", nameAr: "الشركة السعودية لأسطول التأجير", city: "Khobar", region: "Eastern", verified: true, rating: 4.5, ratingCount: 122, factor: 1.0, cats: ["equipment-rental", "heavy-equipment", "site-facilities", "scaffolding-access", "generators-compressors-pumps"] },
  { name: "Facility Pro Services", nameAr: "فاسيليتي برو للخدمات", city: "Riyadh", region: "Central", verified: true, rating: 4.6, ratingCount: 187, factor: 1.04, cats: ["services", "pest-control-hygiene", "hvac-spare-parts", "fire-life-safety-spares", "cleaning-janitorial", "waste-management"] },
  { name: "Madinah Facility Supplies", nameAr: "المدينة لتوريدات المرافق", city: "Madinah", region: "Western", verified: false, rating: 4.1, ratingCount: 33, factor: 0.98, cats: ["facility-consumables", "cleaning-janitorial", "office-supplies", "site-office-furniture", "packaging-material-handling", "workwear-uniforms"] },
  { name: "Makkah Safety & Signage", nameAr: "مكة للسلامة واللافتات", city: "Makkah", region: "Western", verified: true, rating: 4.2, ratingCount: 58, factor: 1.01, cats: ["signage-road-safety", "safety-ppe", "workwear-uniforms", "fire-life-safety-spares", "fire-safety"] },
  { name: "Dammam Industrial Automation", nameAr: "الدمام للأتمتة الصناعية", city: "Dammam", region: "Eastern", verified: true, rating: 4.6, ratingCount: 91, factor: 1.01, cats: ["industrial-electrical-automation", "pumps-motors-drives", "valves-fittings-flanges", "smart-building-bms", "generator-ups-spares", "low-current-networking", "elevator-escalator-spares", "compressed-air-pneumatics", "hoses-seals-gaskets"] },
  { name: "Jeddah Glass & Aluminium Factory", nameAr: "مصنع جدة للزجاج والألمنيوم", city: "Jeddah", region: "Western", verified: true, rating: 4.3, ratingCount: 47, factor: 1.0, cats: ["glass-aluminium-systems", "doors-windows", "site-office-furniture", "signage-road-safety"] },
  { name: "Vertical Transport Spares", nameAr: "فيرتيكال لقطع غيار المصاعد", city: "Riyadh", region: "Central", verified: true, rating: 4.4, ratingCount: 29, factor: 1.03, cats: ["elevator-escalator-spares", "elevators-gates", "generator-ups-spares", "services"] },
  { name: "Gulf Kitchen & Laundry Equipment", nameAr: "الخليج لمعدات المطابخ والمغاسل", city: "Khobar", region: "Eastern", verified: true, rating: 4.5, ratingCount: 52, factor: 1.0, cats: ["kitchen-laundry-equipment", "sanitary-ware", "water-treatment-tanks", "facility-consumables"] },
  { name: "Riyadh Water & Pool Technologies", nameAr: "الرياض لتقنيات المياه والمسابح", city: "Riyadh", region: "Central", verified: true, rating: 4.4, ratingCount: 71, factor: 0.99, cats: ["water-treatment-tanks", "swimming-pool", "irrigation-landscaping", "pumps-motors-drives", "valves-fittings-flanges", "hoses-seals-gaskets"] },
  { name: "Khobar Packaging & Logistics Supplies", nameAr: "الخبر لمستلزمات التغليف والخدمات اللوجستية", city: "Khobar", region: "Eastern", verified: false, rating: 4.0, ratingCount: 26, factor: 0.98, cats: ["packaging-material-handling", "waste-management", "office-supplies", "site-office-furniture", "abrasives-consumables"] },
  { name: "Jeddah Network & Security Integrators", nameAr: "جدة لتكامل أنظمة الشبكات والأمن", city: "Jeddah", region: "Western", verified: true, rating: 4.5, ratingCount: 44, factor: 1.03, cats: ["low-current-networking", "security-cctv", "smart-building-bms", "fire-life-safety-spares", "services", "office-supplies"] },
];

/** Extra categories for existing suppliers so every new product has several supplier offers. */
export const supplierCategoryExtensions: Record<string, string[]> = {
  "Demo Supplier Co.": ["facility-consumables", "pest-control-hygiene", "kitchen-laundry-equipment", "office-supplies", "cleaning-janitorial", "abrasives-consumables", "hvac-spare-parts", "workwear-uniforms"],
  "Riyadh Tools & Hardware Mart": ["lubricants-chemicals", "signage-road-safety", "packaging-material-handling", "abrasives-consumables", "compressed-air-pneumatics", "hoses-seals-gaskets", "workwear-uniforms"],
  "Jeddah HVAC & Sanitary House": ["hvac-spare-parts", "swimming-pool", "kitchen-laundry-equipment", "water-treatment-tanks", "valves-fittings-flanges"],
  "Makkah Electrical & Lighting": ["hvac-spare-parts", "security-cctv", "facility-consumables", "industrial-electrical-automation", "fire-life-safety-spares"],
  "Gulf Electrical Supplies": ["security-cctv", "low-current-networking", "industrial-electrical-automation", "generator-ups-spares", "smart-building-bms"],
  "Hejaz Plumbing & Pipes": ["valves-fittings-flanges", "hoses-seals-gaskets", "water-treatment-tanks", "irrigation-landscaping"],
  "Jeddah Welding & Industrial Tools": ["lubricants-chemicals", "abrasives-consumables", "compressed-air-pneumatics", "pumps-motors-drives"],
  "Jubail Industrial Supplies": ["lubricants-chemicals", "glass-aluminium-systems", "valves-fittings-flanges", "hoses-seals-gaskets", "industrial-electrical-automation"],
  "Saudi Solar & Elevator Technologies": ["security-cctv", "elevator-escalator-spares", "generator-ups-spares", "services", "smart-building-bms"],
  "Al Khobar Precast & Landscape": ["irrigation-landscaping", "signage-road-safety", "swimming-pool"],
  "Gulf Site Solutions": ["signage-road-safety", "services", "waste-management", "equipment-rental", "site-office-furniture"],
  "Arabian Machinery & Equipment Co.": ["equipment-rental", "compressed-air-pneumatics", "generator-ups-spares"],
  "Eastern Heavy Equipment Traders": ["equipment-rental", "packaging-material-handling"],
  "Asir Doors & Glass Works": ["glass-aluminium-systems", "site-office-furniture"],
  "Dammam Roofing & Cladding Systems": ["glass-aluminium-systems"],
};
