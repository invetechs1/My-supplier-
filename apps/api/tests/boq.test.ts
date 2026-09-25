import { describe, expect, it } from "vitest";
import { matchLine, normaliseUnit, optimise, parseBoqText, tokenize, type CatalogueMaterial } from "../src/services/boq";

const catalogue: CatalogueMaterial[] = [
  { id: "r16", sku: "RBR-16", name: "Deformed Rebar 16mm Grade 60 (per ton)", nameAr: "حديد تسليح 16 مم (طن)", unit: "ton", specs: { diameter_mm: 16 } },
  { id: "r12", sku: "RBR-12", name: "Deformed Rebar 12mm Grade 60 (per ton)", nameAr: "حديد تسليح 12 مم (طن)", unit: "ton", specs: { diameter_mm: 12 } },
  { id: "cem", sku: "CEM-OPC-50", name: "Ordinary Portland Cement Type I (50kg bag)", nameAr: "أسمنت بورتلاندي عادي (50 كجم)", unit: "bag", brand: "Yamama Cement" },
  { id: "src", sku: "CEM-SRC-50", name: "Sulphate Resistant Cement Type V (50kg bag)", nameAr: "أسمنت مقاوم للكبريتات (50 كجم)", unit: "bag" },
  { id: "blk20", sku: "BLK-HOL-20", name: "Hollow Concrete Block 20cm (40x20x20)", nameAr: "بلوك أسمنتي مفرغ 20 سم", unit: "piece" },
  { id: "blk15", sku: "BLK-HOL-15", name: "Hollow Concrete Block 15cm (40x20x15)", nameAr: "بلوك أسمنتي مفرغ 15 سم", unit: "piece" },
  { id: "c30", sku: "RMC-C30", name: "Ready Mix Concrete C30 (per m³)", nameAr: "خرسانة جاهزة C30 (م³)", unit: "m3", specs: { strength_mpa: 30 } },
  { id: "tile", sku: "TIL-POR-60", name: "Porcelain Tile 60x60 Matt (per m²)", nameAr: "بورسلان 60×60 مطفي (م²)", unit: "m2" },
];

describe("parseBoqText", () => {
  it("parses csv, natural language and Arabic lines", () => {
    const lines = parseBoqText(`Description,Qty,Unit
Rebar 16mm, 25, ton
1200 bags OPC cement 50kg
Hollow block 20cm 8000 pcs
Porcelain tile 60x60 x 1800
حديد تسليح 12 مم 15 طن`);
    expect(lines).toEqual([
      { description: "Rebar 16mm", quantity: 25, unit: "ton" },
      { description: "OPC cement 50kg", quantity: 1200, unit: "bag" },
      { description: "Hollow block 20cm", quantity: 8000, unit: "piece" },
      { description: "Porcelain tile 60x60", quantity: 1800, unit: undefined },
      { description: "حديد تسليح 12 مم", quantity: 15, unit: "ton" },
    ]);
  });
  it("normalises units", () => {
    expect(normaliseUnit("Tons")).toBe("ton");
    expect(normaliseUnit("m³")).toBe("m3");
    expect(normaliseUnit("nos")).toBe("piece");
    expect(normaliseUnit("م³")).toBe("m3");
    expect(normaliseUnit("لفة")).toBe("roll");
    expect(normaliseUnit("bananas")).toBeUndefined();
  });
});

describe("matchLine", () => {
  it("matches rebar by diameter", () => {
    expect(matchLine("Steel reinforcement bars 16 mm", catalogue)[0].material.id).toBe("r16");
    expect(matchLine("حديد تسليح 12 مم", catalogue)[0].material.id).toBe("r12");
  });
  it("does not let a brand match beat the wrong diameter", () => {
    const withBrand: CatalogueMaterial[] = [
      { ...catalogue[0], id: "r16b", brand: "Rajhi Steel" },
      { id: "r8", sku: "RBR-8", name: "Deformed Rebar 8mm Grade 60 (per ton)", nameAr: "حديد تسليح 8 مم", unit: "ton", brand: "SABIC Hadeed", specs: { diameter_mm: 8 } },
      { ...catalogue[1], brand: "Rajhi Steel" },
    ];
    expect(matchLine("Hadeed Rebar 12mm G60 (Hadeed) حديد تسليح 12 مم درجة 60", withBrand)[0].material.id).toBe("r12");
  });
  it("prefers the block size mentioned", () => {
    expect(matchLine("بلوك مفرغ 15 سم", catalogue)[0].material.id).toBe("blk15");
    expect(matchLine("Hollow block 20cm", catalogue)[0].material.id).toBe("blk20");
  });
  it("matches cement and concrete grades", () => {
    expect(matchLine("OPC cement 50 kg bags", catalogue)[0].material.id).toBe("cem");
    const specced = catalogue.map((m) => (m.id === "cem" ? { ...m, nameAr: "أسمنت بورتلاندي عادي نوع 1 (50 كجم)", specs: { standard: "SASO 2847", weight_kg: 50 } } : m));
    expect(matchLine("Saudi Cement OPC Cement 50kg أسمنت بورتلاندي عادي كيس 50 كجم", specced)[0].material.id).toBe("cem");
    expect(matchLine("Sulphate resistant cement", catalogue)[0].material.id).toBe("src");
    expect(matchLine("Ready mix concrete C30 pumped", catalogue)[0].material.id).toBe("c30");
    const c30 = matchLine("Ready-mix concrete C30, slump 100, pumped", catalogue)[0];
    expect(c30.material.id).toBe("c30");
    expect(c30.score).toBeGreaterThanOrEqual(0.6);
  });
  it("matches by SKU and returns nothing for gibberish", () => {
    expect(matchLine("TIL-POR-60 for lobby", catalogue)[0]).toMatchObject({ material: { id: "tile" }, score: 1 });
    expect(matchLine("zzz qqq", catalogue)).toEqual([]);
  });
  it("tokenizes numbers with units and tells sizes from designations", () => {
    expect(tokenize("Rebar 16mm C30 3/4\"")).toMatchObject({ numbers: ["16", "30", "3/4"], sized: ["16", "30", "3/4"] });
    expect(tokenize("Cement Type 1 نوع 1 حديد 12 مم")).toMatchObject({ numbers: ["1", "12"], sized: ["12"] });
  });
});

describe("equipment vocabulary", () => {
  it("maps Arabic and English equipment words to one token", () => {
    expect(tokenize("حفار صغير 3.5 طن").words).toContain("excavator");
    expect(tokenize("Mini excavator 3.5 ton").words).toContain("excavator");
    expect(tokenize("مولدة ديزل 30 كي في إيه").words).toContain("generator");
    expect(tokenize("طفاية حريق بودرة 6 كجم").words).toContain("extinguisher");
  });
  it("matches Arabic words spelled with ta marbuta through the synonym table", () => {
    expect(tokenize("خرسانة جاهزة").words).toEqual(expect.arrayContaining(["concrete", "readymix"]));
  });
});

describe("MRO / facility vocabulary", () => {
  it("maps Arabic maintenance and facility words to the English catalogue token", () => {
    expect(tokenize("فلتر هواء للمكيف").words).toContain("filter");
    expect(tokenize("صمام بوابة 2 بوصة نحاس").words).toContain("valve");
    expect(tokenize("كاميرا مراقبة 4 ميجا").words).toContain("camera");
    expect(tokenize("تأجير حفار 20 طن").words).toEqual(expect.arrayContaining(["rental", "excavator"]));
    expect(tokenize("زيارة صيانة تكييف").words).toEqual(expect.arrayContaining(["visit", "maintenance", "ac"]));
  });
  it("maps English plurals and brand-neutral spellings to the same token", () => {
    expect(tokenize("Ball valves 1 inch brass").words).toContain("valve");
    expect(tokenize("CCTV dome camera 4MP").words).toEqual(expect.arrayContaining(["camera"]));
    expect(tokenize("Hydraulic oil ISO 46 drum").words).toContain("oil");
    expect(tokenize("معايرة عداد ضغط").words).toEqual(expect.arrayContaining(["calibration", "meter"]));
  });
});

describe("optimise", () => {
  const offer = (supplierId: string, price: number, lead = 3) => ({ listingId: `${supplierId}-${price}`, supplierId, supplierName: supplierId.toUpperCase(), verified: true, city: "Riyadh", price, minQty: 1, leadTimeDays: lead, source: "SUPPLIER" });
  it("builds cheapest basket and best single supplier", () => {
    const r = optimise([
      { index: 0, quantity: 10, offers: [offer("a", 100), offer("b", 110)] },
      { index: 1, quantity: 5, offers: [offer("b", 20), offer("a", 30)] },
      { index: 2, quantity: 1, offers: [] },
    ]);
    expect(r.cheapestTotal).toBe(1100);
    expect(r.averageTotal).toBe(1175);
    expect(r.savingsVsAverage).toBe(75);
    expect(r.distinctSuppliersInCheapest).toBe(2);
    expect(r.matchedLines).toBe(2);
    expect(r.unmatchedLines).toBe(1);
    expect(r.bestSingleSupplier?.supplierId).toBe("a"); // both cover 2 lines; a is cheaper (1150 vs 1200)
    expect(r.suppliers.find((s) => s.supplierId === "b")).toMatchObject({ total: 1200, coveragePct: 100 });
  });
});
