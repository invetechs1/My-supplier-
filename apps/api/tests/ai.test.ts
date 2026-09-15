import { describe, expect, it } from "vitest";
import { extractHeuristically, stripHtml, spreadsheetToText } from "../src/services/ai";

describe("extractHeuristically", () => {
  it("reads simple price lists in several layouts", () => {
    const r = extractHeuristically(`Item,Unit,Price
Portland cement 50kg bag, bag, 15.75
Rebar 16mm Grade 60 – ton – SAR 2,650
Hollow block 20cm   pcs   2.85
Total: 2,669.35`, { city: "Riyadh" });
    expect(r.rows.map((x) => [x.name, x.unit, x.price])).toEqual([
      ["Portland cement 50kg bag", "bag", 15.75],
      ["Rebar 16mm Grade 60", "ton", 2650],
      ["Hollow block 20cm", "pcs", 2.85],
    ]);
    expect(r.rows[0].city).toBe("Riyadh");
  });
  it("handles quotation layouts with quantity columns and codes containing commas", () => {
    const r = extractHeuristically(`Description,Qty,Unit,Unit Price
Ready mix concrete C30,120,m3,228
1,Deformed rebar 12mm,8,ton,2,610.50`);
    expect(r.rows.map((x) => [x.name, x.quantity, x.unit, x.price])).toEqual([
      ["Ready mix concrete C30", 120, "m3", 228],
      ["Deformed rebar 12mm", 8, "ton", 2610.5],
    ]);
  });
  it("skips lines without a price", () => {
    expect(extractHeuristically("Delivery within Riyadh\nPrices exclude VAT").rows).toEqual([]);
  });
});

describe("stripHtml", () => {
  it("turns table cells into comma separated lines", () => {
    const t = stripHtml(`<html><script>x()</script><table><tr><td>Rebar 12mm</td><td>ton</td><td>2,700</td></tr><tr><td>Sand</td><td>m3</td><td>45</td></tr></table></html>`);
    expect(t).toContain("Rebar 12mm , ton , 2,700");
    expect(t).not.toContain("x()");
    expect(extractHeuristically(t).rows.map((r) => r.price)).toEqual([2700, 45]);
  });
});

describe("spreadsheetToText", () => {
  it("passes csv through", () => {
    expect(spreadsheetToText(Buffer.from("a,b\n1,2"), "text/csv")).toBe("a,b\n1,2");
  });
});
