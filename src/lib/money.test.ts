import { describe, it, expect } from "vitest";
import {
  computeTotals,
  lineAmountPaise,
  lineGstPaise,
  formatPaise,
  formatPaiseBare,
  formatPaiseCompact,
  parseInrToPaise,
  isRateEdited,
} from "./money";

describe("integer money (§3.1)", () => {
  it("holds exact values that float would ruin", () => {
    // 0.1 + 0.2 !== 0.3 in float. In paise it's just 10 + 20 === 30.
    expect(computeTotals([{ label: "a", qty: 1, rate_paise: 10 }, { label: "b", qty: 1, rate_paise: 20 }]).total_paise).toBe(30);
  });

  it("reproduces the Holiday · International total exactly", () => {
    // Placeholder rates: planning ₹5,000 once + ₹2,000 per traveller (qty 1).
    const rates = [500000, 200000];
    const lines = rates.map((r, i) => ({ label: `L${i}`, qty: 1, rate_paise: r }));
    expect(computeTotals(lines).total_paise).toBe(700000); // ₹7,000.00
  });

  it("stays exact across 9 people", () => {
    const line = { label: "Umrah Processing Fee", qty: 9, rate_paise: 300000 };
    expect(lineAmountPaise(line)).toBe(2700000);
  });
});

describe("GST in basis points (§3.3)", () => {
  it("defaults to zero — there is no GST engine", () => {
    expect(lineGstPaise({ label: "x", qty: 2, rate_paise: 10000 })).toBe(0);
    expect(computeTotals([{ label: "x", qty: 2, rate_paise: 10000 }]).gst_paise).toBe(0);
  });

  it("500bp = 5%", () => {
    expect(lineGstPaise({ label: "x", qty: 1, rate_paise: 10000, gst_bp: 500 })).toBe(500);
  });

  it("rounds the way Postgres round() does — mirroring issue_invoice", () => {
    // 12345 * 500 / 10000 = 617.25 → 617
    expect(lineGstPaise({ label: "x", qty: 1, rate_paise: 12345, gst_bp: 500 })).toBe(617);
    // 1 * 5000bp on 15 paise = 7.5 → 8 (half away from zero)
    expect(lineGstPaise({ label: "x", qty: 1, rate_paise: 15, gst_bp: 5000 })).toBe(8);
  });

  it("total is exactly subtotal + gst, summed per line (§3.3)", () => {
    const lines = [
      { label: "a", qty: 2, rate_paise: 12345, gst_bp: 500 },
      { label: "b", qty: 1, rate_paise: 999, gst_bp: 0 },
    ];
    const t = computeTotals(lines);
    expect(t.subtotal_paise).toBe(2 * 12345 + 999);
    expect(t.gst_paise).toBe(lineGstPaise(lines[0]) + lineGstPaise(lines[1]));
    expect(t.total_paise).toBe(t.subtotal_paise + t.gst_paise);
  });
});

describe("parseInrToPaise — refuses rather than guesses", () => {
  it.each([
    ["1284.77", 128477],
    ["1,284.77", 128477],
    ["₹1284.77", 128477],
    ["1,28,477.00", 12847700],
    ["280", 28000],
    ["280.0", 28000],
    ["0.05", 5],
    ["278.77", 27877],
  ])("%s → %i", (input, expected) => {
    expect(parseInrToPaise(input)).toBe(expected);
  });

  it("refuses more than 2dp rather than silently truncating a rate", () => {
    expect(parseInrToPaise("100.999")).toBeNull();
  });

  it.each(["", "abc", ".", "-", "1.2.3"])("refuses %o", (input) => {
    expect(parseInrToPaise(input)).toBeNull();
  });
});

describe("formatting", () => {
  it("pads paise and groups in the Indian style (lakh grouping)", () => {
    expect(formatPaiseBare(128477)).toBe("1,284.77");
    expect(formatPaiseBare(5)).toBe("0.05");
    expect(formatPaiseBare(28000)).toBe("280.00");
    expect(formatPaiseBare(12847700)).toBe("1,28,477.00");
    expect(formatPaise(700000)).toBe("₹7,000.00");
  });

  it("compact form uses lakh and crore tiers", () => {
    expect(formatPaiseCompact(50000000)).toBe("₹5.0L");     // ₹5,00,000
    expect(formatPaiseCompact(2500000000)).toBe("₹2.5Cr");  // ₹2,50,00,000
    expect(formatPaiseCompact(500000)).toBe("₹5.0k");
  });

  it("round-trips through parse", () => {
    for (const paise of [1, 5, 999, 28000, 128477, 534400, 12847700]) {
      expect(parseInrToPaise(formatPaiseBare(paise))).toBe(paise);
    }
  });
});

describe("isRateEdited (§3.5)", () => {
  it("false when the charged rate matches the catalogue", () => {
    expect(
      isRateEdited({ label: "x", qty: 1, rate_paise: 28000, catalogue_rate_paise: 28000 }),
    ).toBe(false);
  });
  it("true when it differs — the invoice must show it", () => {
    expect(
      isRateEdited({ label: "x", qty: 1, rate_paise: 29000, catalogue_rate_paise: 28000 }),
    ).toBe(true);
  });
  it("false for a free-text line with no catalogue rate", () => {
    expect(isRateEdited({ label: "x", qty: 1, rate_paise: 29000 })).toBe(false);
  });
});
