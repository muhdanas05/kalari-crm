/**
 * Money. ARCHITECTURE.md §3.1: an integer count of the smallest unit, never a
 * float, never a decimal that rounds on assignment.
 *
 * The unit is the paisa. 1 INR = 100 paise. ₹1,284.77 is 128477.
 *
 * Every function here mirrors the arithmetic in public.issue_invoice() exactly.
 * If the two ever disagree the database refuses the issue (§3.6) — which is the
 * design working, but it surfaces as a user-facing error, so keep them in step.
 */

export const PAISE_PER_INR = 100;

/** Basis points. 500 bp = 5%. GST is a per-line field defaulting to zero (§3.3). */
export type BasisPoints = number;

export type Line = {
  label: string;
  qty: number;
  rate_paise: number;
  /** What the catalogue said, when it differs from what was charged (§3.5). */
  catalogue_rate_paise?: number | null;
  gst_bp?: BasisPoints;
};

export type Totals = {
  subtotal_paise: number;
  gst_paise: number;
  total_paise: number;
};

/** Net for one line, before GST. */
export function lineAmountPaise(line: Pick<Line, "qty" | "rate_paise">): number {
  return line.qty * line.rate_paise;
}

/**
 * GST for one line.
 *
 * Mirrors the SQL: round(amount * gst_bp / 10000). Postgres `round()` on numeric
 * is half-away-from-zero; JavaScript's Math.round is half-up, which differs for
 * negative values. Amounts here are never negative (issue_invoice rejects a
 * negative rate outright), but be explicit rather than rely on that.
 */
export function lineGstPaise(line: Line): number {
  const bp = line.gst_bp ?? 0;
  if (bp === 0) return 0;
  const raw = (lineAmountPaise(line) * bp) / 10000;
  return raw < 0 ? -Math.round(-raw) : Math.round(raw);
}

/**
 * Canonical totals. §3.3: every total is exactly the sum of its lines — there is
 * no GST engine and nothing is computed off a running percentage.
 */
export function computeTotals(lines: Line[]): Totals {
  let subtotal_paise = 0;
  let gst_paise = 0;
  for (const line of lines) {
    subtotal_paise += lineAmountPaise(line);
    gst_paise += lineGstPaise(line);
  }
  return { subtotal_paise, gst_paise, total_paise: subtotal_paise + gst_paise };
}

/** True when the charged rate differs from the catalogue's (§3.5 — show it). */
export function isRateEdited(line: Line): boolean {
  return (
    line.catalogue_rate_paise != null && line.catalogue_rate_paise !== line.rate_paise
  );
}

/** "1,28,477.00" — digits only, Indian lakh grouping, no currency symbol. */
export function formatPaiseBare(paise: number): string {
  const neg = paise < 0;
  const abs = Math.abs(paise);
  const major = Math.trunc(abs / PAISE_PER_INR);
  const minor = abs % PAISE_PER_INR;
  const grouped = major.toLocaleString("en-IN");
  return `${neg ? "-" : ""}${grouped}.${String(minor).padStart(2, "0")}`;
}

/** "₹1,28,477.00" — the display form used everywhere in the UI. */
export function formatPaise(paise: number): string {
  return `₹${formatPaiseBare(paise)}`;
}

/** "₹1.3L" / "₹2.5Cr" — for dense KPI tiles only. Never on an invoice. */
export function formatPaiseCompact(paise: number): string {
  const inr = paise / PAISE_PER_INR;
  const abs = Math.abs(inr);
  if (abs >= 10_000_000) return `₹${(inr / 10_000_000).toFixed(1)}Cr`;
  if (abs >= 100_000) return `₹${(inr / 100_000).toFixed(1)}L`;
  if (abs >= 1_000) return `₹${(inr / 1_000).toFixed(1)}k`;
  return formatPaise(paise);
}

/**
 * Parse user input ("1284.77", "1,284.77", "₹1284.7") into paise.
 * Returns null on anything unparseable — the caller must refuse rather than
 * guess, because a wrong rate is a wrong invoice is real cash (§3.2).
 */
export function parseInrToPaise(input: string): number | null {
  const cleaned = input.replace(/[^\d.-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  if (!/^-?\d*\.?\d*$/.test(cleaned)) return null;

  const neg = cleaned.startsWith("-");
  const [major = "0", minorRaw = ""] = cleaned.replace("-", "").split(".");
  // More than 2dp is not representable in paise — refuse rather than silently
  // truncate someone's rate.
  if (minorRaw.length > 2) return null;

  const minor = minorRaw.padEnd(2, "0");
  const paise = Number(major) * PAISE_PER_INR + Number(minor);
  if (!Number.isFinite(paise) || !Number.isSafeInteger(paise)) return null;
  return neg ? -paise : paise;
}
