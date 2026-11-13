import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { CATEGORY_RETURN_GROUP, FAULT_CLAIM_HOURS, RETURN_POLICIES, evaluateReturnLine, restockingFeeFor, returnPolicyFor, returnPolicyTable } from "@mysupplier/shared";
import { computeRefund } from "../src/services/commerce";

const D = (n: number) => new Prisma.Decimal(n);
const delivered = new Date("2026-11-10T08:00:00Z");
const hours = (h: number) => new Date(delivered.getTime() + h * 3600000);

describe("returnPolicyFor", () => {
  it("maps building-material categories to their policy group", () => {
    expect(returnPolicyFor("cement-concrete").group).toBe("PERISHABLE");
    expect(returnPolicyFor("chemicals-adhesives").returnable).toBe(false);
    expect(returnPolicyFor("aggregates-sand").group).toBe("BULK");
    expect(returnPolicyFor("steel-rebar")).toMatchObject({ group: "STEEL", windowDays: 7, restockingPct: 15, returnable: true });
    expect(returnPolicyFor("blocks-bricks").group).toBe("MASONRY");
    expect(returnPolicyFor("timber-formwork").group).toBe("TIMBER");
    expect(returnPolicyFor("gypsum-ceilings").group).toBe("BOARDS");
    expect(returnPolicyFor("insulation-waterproofing").group).toBe("BOARDS");
    expect(returnPolicyFor("tiles-flooring").group).toBe("TILES_SANITARY");
    expect(returnPolicyFor("sanitary-ware").group).toBe("TILES_SANITARY");
    expect(returnPolicyFor("paints-coatings").group).toBe("PAINT");
    expect(returnPolicyFor("plumbing").group).toBe("MEP");
    expect(returnPolicyFor("electrical").group).toBe("MEP");
    expect(returnPolicyFor("hardware-fasteners").group).toBe("TOOLS");
    expect(returnPolicyFor("safety-ppe").group).toBe("TOOLS");
    expect(returnPolicyFor("equipment-rental")).toMatchObject({ group: "RENTAL", returnable: false });
  });

  it("falls back to the parent category, then to the 7-day / 15% default", () => {
    expect(returnPolicyFor("portland-cement-50kg", "cement-concrete").group).toBe("PERISHABLE");
    expect(returnPolicyFor("unknown-slug")).toMatchObject({ group: "DEFAULT", returnable: true, windowDays: 7, restockingPct: 15 });
    expect(returnPolicyFor(null)).toBe(RETURN_POLICIES.DEFAULT);
  });

  it("every mapped group exists, carries bilingual text and appears in the policy table", () => {
    const groups = new Set(Object.values(CATEGORY_RETURN_GROUP));
    for (const g of groups) {
      const p = RETURN_POLICIES[g];
      expect(p.group).toBe(g);
      expect(p.conditions.en.length).toBeGreaterThan(10);
      expect(p.conditions.ar.length).toBeGreaterThan(10);
      if (!p.returnable) expect(p.nonReturnableReason?.ar).toBeTruthy();
    }
    const table = returnPolicyTable();
    expect(table.find((r) => r.group === "PERISHABLE")?.categories).toContain("cement-concrete");
    expect(table[table.length - 1].group).toBe("DEFAULT");
  });
});

describe("evaluateReturnLine", () => {
  const cement = returnPolicyFor("cement-concrete");
  const steel = returnPolicyFor("steel-rebar");

  it("rejects change-of-mind returns of non-returnable goods", () => {
    expect(evaluateReturnLine(cement, "EXCESS", delivered, hours(1))).toMatchObject({ ok: false, code: "RETURN_NON_RETURNABLE", restockingPct: 0 });
    expect(evaluateReturnLine(cement, "OTHER", null, hours(1)).ok).toBe(false);
  });

  it("accepts supplier-fault claims on non-returnable goods only within 48 hours of delivery", () => {
    expect(evaluateReturnLine(cement, "DAMAGED", delivered, hours(FAULT_CLAIM_HOURS - 1))).toMatchObject({ ok: true, restockingPct: 0 });
    expect(evaluateReturnLine(cement, "WRONG_ITEM", delivered, hours(FAULT_CLAIM_HOURS)).ok).toBe(true);
    expect(evaluateReturnLine(cement, "DEFECTIVE", delivered, hours(FAULT_CLAIM_HOURS + 1))).toMatchObject({ ok: false, code: "RETURN_CLAIM_WINDOW_CLOSED" });
    // Refusal at the door: no delivery time yet, claim always allowed.
    expect(evaluateReturnLine(cement, "DAMAGED", null, hours(500)).ok).toBe(true);
  });

  it("enforces the category window and restocking fee for change of mind", () => {
    const inside = evaluateReturnLine(steel, "EXCESS", delivered, hours(6 * 24));
    expect(inside).toMatchObject({ ok: true, code: "OK", restockingPct: 15 });
    expect(inside.deadline?.toISOString()).toBe(hours(7 * 24).toISOString());
    expect(evaluateReturnLine(steel, "EXCESS", delivered, hours(7 * 24 + 1))).toMatchObject({ ok: false, code: "RETURN_WINDOW_CLOSED" });
  });

  it("gives fault claims on returnable goods the longer of 48 h and the category window, fee-free", () => {
    expect(evaluateReturnLine(steel, "DEFECTIVE", delivered, hours(5 * 24))).toMatchObject({ ok: true, restockingPct: 0 });
    expect(evaluateReturnLine(steel, "DEFECTIVE", delivered, hours(8 * 24)).ok).toBe(false);
  });
});

describe("restocking fee and refund", () => {
  const order = { subtotal: D(1000), discount: D(0), items: [{ id: "a", unitPrice: D(100), quantity: 10 }, { id: "b", unitPrice: D(50), quantity: 4 }] };

  it("restockingFeeFor sums goods value × pct per line", () => {
    expect(restockingFeeFor([{ quantity: 4, unitPrice: 100, restockingPct: 15 }, { quantity: 2, unitPrice: 50, restockingPct: 0 }, { quantity: 1, unitPrice: 10 }])).toBe(60);
  });

  it("computeRefund deducts the stored restocking fee before VAT and keeps fault lines whole", () => {
    // 4 × 100 = 400 goods, 15% restocking → 340, +15% VAT = 391
    expect(computeRefund(order, [{ orderItemId: "a", quantity: 4, restockingPct: 15 }])).toBe(391);
    // Fault line (0%) unchanged: 2 × 50 = 100 → 115
    expect(computeRefund(order, [{ orderItemId: "b", quantity: 2, restockingPct: 0 }])).toBe(115);
    // Legacy lines without a pct behave as before.
    expect(computeRefund(order, [{ orderItemId: "a", quantity: 4 }])).toBe(460);
  });

  it("applies the pro-rata coupon discount after the restocking fee", () => {
    const discounted = { ...order, discount: D(100) }; // 10% off
    expect(computeRefund(discounted, [{ orderItemId: "a", quantity: 10, restockingPct: 15 }])).toBe(round(1000 * 0.85 * 0.9 * 1.15));
  });
});

const round = (n: number) => Math.round(n * 100) / 100;
