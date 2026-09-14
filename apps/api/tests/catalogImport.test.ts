import { describe, expect, it } from "vitest";
import { parseCsvRows } from "../src/services/catalogImport";
import { productImageSvg } from "../src/services/shop";

describe("parseCsvRows", () => {
  it("maps headers (with aliases) and coerces numbers", () => {
    const rows = parseCsvRows(`SKU,Name,Category Slug,UOM,Brand,Price,City,Qty,Lead Time
PPE-HLM,"Safety Helmet, ratchet",safety-ppe,piece,3M,28.5,Riyadh,500,2
,LED Panel 60x60,lighting,piece,,85,Jeddah,,`);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ sku: "PPE-HLM", name: "Safety Helmet, ratchet", category: "safety-ppe", unit: "piece", brand: "3M", price: 28.5, city: "Riyadh", stock: 500, leadTimeDays: 2 });
    expect(rows[1]).toEqual({ name: "LED Panel 60x60", category: "lighting", unit: "piece", price: 85, city: "Jeddah" });
  });
  it("returns nothing without data rows", () => {
    expect(parseCsvRows("sku,name")).toEqual([]);
  });
});

describe("productImageSvg", () => {
  it("produces escaped, deterministic SVG", () => {
    const svg = productImageSvg("HW-NAIL-3", 'Nails 3" <box> & more', "🔩");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("&quot;");
    expect(svg).toContain("&lt;box&gt; &amp; more");
    expect(svg).toContain("HW-NAIL-3");
    expect(productImageSvg("A", "x", "y")).toBe(productImageSvg("A", "x", "y"));
  });
});
