/**
 * Dates. ARCHITECTURE.md §3.29: everything is Asia/Kolkata, no naive timestamps.
 *
 * Never read process.env.TZ for this. A host can override it and a serverless
 * function may not inherit it, so it is not a fact you can rely on. The database
 * has today_kolkata() for SQL; this module is its TypeScript counterpart, and it
 * states the zone explicitly on every call.
 */

export const TZ = "Asia/Kolkata";

const isoFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today in Kolkata (IST) as YYYY-MM-DD. The TS mirror of public.today_kolkata(). */
export function todayKolkata(now: Date = new Date()): string {
  return isoFormatter.format(now);
}

const dayFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  day: "numeric",
  month: "short",
  year: "numeric",
});

const dayTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "5 Jun 2026" */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? parseDateOnly(value) : value;
  if (!d || Number.isNaN(d.getTime())) return "—";
  return dayFormatter.format(d);
}

/** "5 Jun 14:30" */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return dayTimeFormatter.format(d);
}

/**
 * A date-only string ("2026-06-05") is a calendar date, not an instant. Parsing
 * it with new Date() treats it as UTC midnight, which renders as the *previous*
 * day in some zones. Build it as local noon so no zone shift can move the day.
 */
function parseDateOnly(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return new Date(value);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
}

/** Whole days between two YYYY-MM-DD calendar dates. Positive when b is later. */
export function daysBetween(a: string, b: string): number {
  const da = parseDateOnly(a);
  const db = parseDateOnly(b);
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

/** "3 days ago" / "in 2 days" / "today", relative to today in Kolkata. */
export function relativeDays(date: string, now: Date = new Date()): string {
  const diff = daysBetween(todayKolkata(now), date);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  return diff > 0 ? `in ${diff} days` : `${Math.abs(diff)} days ago`;
}

/** Add days to a YYYY-MM-DD, returning YYYY-MM-DD. */
export function addDays(date: string, days: number): string {
  const d = parseDateOnly(date);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Add months — used by the renewal engine (visa_issue_date + 22 months, §5.10). */
export function addMonths(date: string, months: number): string {
  const d = parseDateOnly(date);
  const targetDay = d.getDate();
  d.setMonth(d.getMonth() + months);
  // Clamp: 31 Jan + 1 month must be 28/29 Feb, not 2/3 March.
  if (d.getDate() !== targetDay) d.setDate(0);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
