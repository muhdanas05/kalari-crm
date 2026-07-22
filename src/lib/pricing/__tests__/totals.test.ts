import { describe, it, expect } from "vitest";
import {
  resolveService,
  buildLines,
  computeTotals,
  qtyFor,
  toDraftPayload,
  RateNotFoundError,
  type ServiceKey,
} from "../engine";
import { SERVICES, rulesFor } from "./catalogue.fixture";

/**
 * THIS TEST IS SUCCESS CRITERION §8.2:
 *
 *   "One-click invoice for any of the 11 services, matching the catalogue
 *    TO THE PAISA."
 *
 * The totals below are transcribed from the values pinned in
 * supabase/migrations/20260717120900_seed_catalogue.sql.
 *
 * ⚠️ EVERY FIGURE IS AN UNCONFIRMED PLACEHOLDER — deliberately round numbers,
 * because Kalari has not yet confirmed a single real rate. The pins still
 * matter: they catch the engine or the catalogue drifting silently.
 *
 * If one of these fails, do NOT update the number to make it pass. A changed
 * total means either the catalogue moved (then re-confirm: placeholder rates
 * change ONLY when Kalari's written rate card arrives, and then the seed, the
 * fixture and these pins move together) or the engine broke (then fix the
 * engine). Issued invoices are immutable (§3.7), so a wrong rate becomes a
 * permanent credit-note trail.
 */

const INR = (n: number) => Math.round(n * 100); // display ₹ → paise

function totalFor(key: ServiceKey, adults = 1, children = 0): number {
  const service = resolveService(SERVICES, key);
  const lines = buildLines(rulesFor(service.id), { adults, children });
  return computeTotals(lines).total_paise;
}

describe("placeholder totals — one adult, no children", () => {
  const cases: [string, ServiceKey, number][] = [
    [
      "Air Ticketing · Domestic",
      { family: "ticketing", location: "domestic" },
      INR(500.0),
    ],
    [
      "Air Ticketing · International",
      { family: "ticketing", location: "international" },
      INR(1000.0),
    ],
    [
      "Holiday Package · Domestic",
      { family: "holiday", location: "domestic" },
      INR(3000.0),
    ],
    [
      "Holiday Package · International",
      { family: "holiday", location: "international" },
      INR(7000.0),
    ],
    ["Haj Package", { family: "haj_umrah", category: "haj" }, INR(5000.0)],
    ["Umrah Package", { family: "haj_umrah", category: "umrah" }, INR(3000.0)],
    ["Visa Service · New", { family: "visa", type: "new" }, INR(3000.0)],
    ["Visa Service · Renewal", { family: "visa", type: "renew" }, INR(2500.0)],
    ["Passport Service · New", { family: "passport", type: "new" }, INR(1500.0)],
    [
      "Passport Service · Renewal",
      { family: "passport", type: "renew" },
      INR(1000.0),
    ],
    ["Hotel Reservation", { family: "hotel" }, INR(500.0)],
  ];

  it.each(cases)("%s → %i paise", (_name, key, expected) => {
    expect(totalFor(key)).toBe(expected);
  });

  it("covers all eleven services", () => {
    expect(cases).toHaveLength(SERVICES.length);
  });
});

describe("per-person services scale by pax", () => {
  const holiday: ServiceKey = { family: "holiday", location: "international" };

  it("Package Planning Fee is once_per_file — charged once for the whole party", () => {
    const service = resolveService(SERVICES, holiday);
    const lines = buildLines(rulesFor(service.id), { adults: 2, children: 3 });
    const planning = lines.find((l) => l.label === "Package Planning Fee")!;
    expect(planning.qty).toBe(1);
  });

  it("per_person lines count adults + children", () => {
    const service = resolveService(SERVICES, holiday);
    const lines = buildLines(rulesFor(service.id), { adults: 2, children: 3 });
    const perHead = lines.find((l) => l.label === "Per-Traveller Service Charge")!;
    expect(perHead.qty).toBe(5);
  });

  /**
   * Two travellers = one planning fee (5,000.00) + 2 × the per-traveller charge.
   * 1 pax total is 7,000.00, of which 5,000.00 is the planning fee, so the
   * per-person part is 2,000.00 → 2 pax = 5,000 + 4,000 = ₹9,000.00.
   */
  it("Holiday · International, 2 adults → ₹9,000.00", () => {
    expect(totalFor(holiday, 2, 0)).toBe(INR(9000.0));
  });

  it("Umrah, 1 adult + 1 child → ₹6,000.00", () => {
    // Umrah Processing Fee is per_person: 2 × 3,000.00.
    expect(totalFor({ family: "haj_umrah", category: "umrah" }, 1, 1)).toBe(
      INR(6000.0),
    );
  });

  it("scales linearly and exactly — no float drift at 9 people", () => {
    const one = totalFor(holiday, 1, 0);
    const nine = totalFor(holiday, 5, 4);
    const planningFee = INR(5000);
    expect(nine).toBe(planningFee + (one - planningFee) * 9);
  });
});

describe("refusing rather than guessing (§3.2)", () => {
  it("throws when the catalogue has no such service", () => {
    expect(() =>
      resolveService(SERVICES, {
        family: "haj_umrah",
        category: "premium", // reserved tier — no service seeded for it
      }),
    ).toThrow(RateNotFoundError);
  });

  it("throws on a family that does not exist", () => {
    expect(() =>
      // @ts-expect-error — deliberately outside the enum
      resolveService(SERVICES, { family: "nonsense" }),
    ).toThrow(RateNotFoundError);
  });

  it("never returns a zero-line service", () => {
    for (const s of SERVICES) {
      expect(rulesFor(s.id).length).toBeGreaterThan(0);
    }
  });
});

describe("qtyFor", () => {
  it("once → 1 regardless of pax", () => {
    expect(qtyFor({ qty_rule: "once" }, { adults: 4, children: 2 })).toBe(1);
  });
  it("once_per_file → 1 regardless of pax", () => {
    expect(qtyFor({ qty_rule: "once_per_file" }, { adults: 4, children: 2 })).toBe(1);
  });
  it("per_person → adults + children", () => {
    expect(qtyFor({ qty_rule: "per_person" }, { adults: 2, children: 3 })).toBe(5);
  });
  it("per_person floors at 1 — a zero-pax case must not zero the invoice", () => {
    expect(qtyFor({ qty_rule: "per_person" }, { adults: 0, children: 0 })).toBe(1);
  });
});

describe("draft payload matches what issue_invoice reads", () => {
  it("carries the catalogue rate alongside the charged rate (§3.5)", () => {
    const service = resolveService(SERVICES, { family: "hotel" });
    const lines = buildLines(rulesFor(service.id), { adults: 1, children: 0 });
    const payload = toDraftPayload(lines);

    for (const line of payload) {
      expect(Object.keys(line).sort()).toEqual(
        ["catalogue_rate_paise", "label", "qty", "rate_paise", "gst_bp"].sort(),
      );
      expect(Number.isSafeInteger(line.rate_paise)).toBe(true);
      expect(line.gst_bp).toBe(0);
    }
  });

  it("an edited rate keeps the catalogue rate intact", () => {
    const service = resolveService(SERVICES, { family: "hotel" });
    const lines = buildLines(rulesFor(service.id), { adults: 1, children: 0 });
    const original = lines[0].rate_paise;
    lines[0].rate_paise = original + 5000; // the user overrides the fee

    const payload = toDraftPayload(lines);
    expect(payload[0].rate_paise).toBe(original + 5000);
    expect(payload[0].catalogue_rate_paise).toBe(original);
  });
});
