import { describe, expect, it } from "vitest";
import { funnelRates, sanitiseProps, sessionIdOf } from "../src/services/analytics";

describe("funnelRates", () => {
  it("computes step-to-step and from-top conversion", () => {
    const r = funnelRates([{ step: "a", label: "A", sessions: 200 }, { step: "b", label: "B", sessions: 50 }, { step: "c", label: "C", sessions: 5 }]);
    expect(r[0].fromPrevPct).toBeNull();
    expect(r[1].fromPrevPct).toBe(25);
    expect(r[2].fromPrevPct).toBe(10);
    expect(r[2].fromTopPct).toBe(2.5);
  });
  it("handles empty steps without dividing by zero", () => {
    const r = funnelRates([{ step: "a", label: "A", sessions: 0 }, { step: "b", label: "B", sessions: 0 }]);
    expect(r[1].fromPrevPct).toBeNull();
    expect(r[1].fromTopPct).toBeNull();
  });
});

describe("sanitiseProps", () => {
  it("drops personal data, odd keys and long values", () => {
    const out = sanitiseProps({ q: "cement", email: "a@b.sa", phone: "0501234567", "bad key!": 1, long: "x".repeat(500), n: 3, ok: true, nested: { a: 1 } as unknown as string });
    expect(out).toEqual({ q: "cement", long: "x".repeat(120), n: 3, ok: true });
  });
  it("returns null for nothing", () => {
    expect(sanitiseProps(null)).toBeNull();
  });
});

describe("sessionIdOf", () => {
  it("accepts only well-formed ids", () => {
    expect(sessionIdOf({ headers: { "x-session-id": "s_1234567890abcdef" } })).toBe("s_1234567890abcdef");
    expect(sessionIdOf({ headers: { "x-session-id": "bad id" } })).toBeNull();
    expect(sessionIdOf({ headers: {} })).toBeNull();
  });
});
