import type { Database } from "@/lib/supabase/database.types";
import { computeTotals, type Line, type Totals } from "@/lib/money";

export type ServiceFamily = Database["public"]["Enums"]["service_family"];
export type ServiceCategory = Database["public"]["Enums"]["service_category"];
export type ServiceLocation = Database["public"]["Enums"]["service_location"];
export type ServiceType = Database["public"]["Enums"]["service_type"];
export type QtyRule = Database["public"]["Enums"]["qty_rule"];

/**
 * A service is a point in a 4-dimension space, not one of eleven templates
 * (ARCHITECTURE.md §3.4). Eleven services exist today; the dimensions are what
 * make a twelfth (e.g. a premium Umrah tier) a data change, not a code change.
 */
export type ServiceKey = {
  family: ServiceFamily;
  category?: ServiceCategory | null;
  location?: ServiceLocation | null;
  type?: ServiceType | null;
};

export type Service = {
  id: string;
  name: string;
  family: ServiceFamily;
  category: ServiceCategory | null;
  location: ServiceLocation | null;
  type: ServiceType | null;
  /**
   * Whether invoicing this service opens a tracked case (0028). Optional
   * because it is irrelevant to PRICING — the resolver never reads it, and the
   * golden-total fixtures predate it.
   */
  tracks_pipeline?: boolean;
};

export type Rule = {
  id: string;
  service_id: string;
  label: string;
  rate_paise: number;
  qty_rule: QtyRule;
  sort_order: number;
};

export type Pax = { adults: number; children: number };

export type DraftLine = Line & {
  /** Carried so the UI can show "you changed this" and issue_invoice can snapshot it. */
  catalogue_rate_paise: number;
  qty_rule: QtyRule;
};

/** Thrown rather than guessing. §3.2: a wrong rate is a wrong invoice is real cash. */
export class RateNotFoundError extends Error {
  constructor(key: ServiceKey) {
    super(
      `No service in the catalogue for ${JSON.stringify(key)}. Refusing to guess a rate.`,
    );
    this.name = "RateNotFoundError";
  }
}

const same = <T>(a: T | null | undefined, b: T | null | undefined) =>
  (a ?? null) === (b ?? null);

/**
 * Resolve the 4 parameters to exactly one service.
 *
 * Throws when nothing matches — §3.2: "If a rate isn't in the catalogue, the
 * system REFUSES rather than guessing." Throws when more than one matches too:
 * silently picking the first would be the same failure wearing a nicer face.
 */
export function resolveService(services: Service[], key: ServiceKey): Service {
  const matches = services.filter(
    (s) =>
      s.family === key.family &&
      same(s.category, key.category) &&
      same(s.location, key.location) &&
      same(s.type, key.type),
  );

  if (matches.length === 0) throw new RateNotFoundError(key);
  if (matches.length > 1) {
    throw new Error(
      `Ambiguous service key ${JSON.stringify(key)} — matched ${matches.length}. ` +
        `The catalogue is wrong; refusing to pick one.`,
    );
  }
  return matches[0];
}

/**
 * Quantity for a rule, given the party size.
 *
 *   once          → 1. A per-application fee.
 *   once_per_file → 1. Charged once for the whole family file, not per head
 *                   (e.g. Sponsor File Open).
 *   per_person    → adults + children.
 *
 * ⚠️ OPEN QUESTION (Kalari): does a child count as a full traveller for
 * Haj/Umrah and holiday per-person fees? The placeholder catalogue says yes —
 * every per_person line counts adults + children equally. Nobody has confirmed
 * this. This function implements the catalogue; if the answer is "children pay
 * a different rate", the fix is a new qty_rule value here and in the enum —
 * not a special case for one label.
 */
export function qtyFor(rule: Pick<Rule, "qty_rule">, pax: Pax): number {
  switch (rule.qty_rule) {
    case "once":
    case "once_per_file":
      return 1;
    case "per_person":
      return Math.max(1, pax.adults + pax.children);
  }
}

/**
 * Build the draft lines for a service. The result is what goes into
 * invoice_drafts.lines, and its computed total is what issue_invoice re-checks
 * against (§3.6).
 */
export function buildLines(rules: Rule[], pax: Pax): DraftLine[] {
  return [...rules]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => ({
      label: r.label,
      qty: qtyFor(r, pax),
      rate_paise: r.rate_paise,
      // At build time the charged rate IS the catalogue rate. It diverges only
      // if someone edits the line — which is legal (§3.5), and this is what
      // makes the divergence visible on the issued document.
      catalogue_rate_paise: r.rate_paise,
      gst_bp: 0, // §3.3: GST defaults to zero. There is no GST engine.
      qty_rule: r.qty_rule,
    }));
}

/** Re-exported so callers have one import for the whole pricing surface. */
export { computeTotals };
export type { Line, Totals };

/**
 * The exact payload issue_invoice expects in invoice_drafts.lines. Strips the
 * UI-only fields — the RPC reads label/qty/rate_paise/catalogue_rate_paise/gst_bp
 * and nothing else.
 */
export function toDraftPayload(lines: DraftLine[]) {
  return lines.map((l) => ({
    label: l.label,
    qty: l.qty,
    rate_paise: l.rate_paise,
    catalogue_rate_paise: l.catalogue_rate_paise,
    gst_bp: l.gst_bp ?? 0,
  }));
}
