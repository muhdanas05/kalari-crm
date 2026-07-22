import type { Database } from "@/lib/supabase/database.types";

/**
 * Client-safe display helpers for invoices.
 *
 * Separate from lib/db/invoices.ts, which is server-only. Same reason as
 * lib/calls/display.ts: a label map must not drag next/headers across the
 * client boundary.
 */

export type InvoiceRow = Database["public"]["Views"]["invoices_v"]["Row"];

/**
 * The five values invoices_v.display_status actually emits — read off the view
 * definition in 20260717120800_invoices_view.sql, not invented. There is no
 * status column; this is derived from (total, payments, today).
 */
export const DISPLAY_STATUSES = [
  "unpaid",
  "partially_paid",
  "paid",
  "overdue",
  "void",
] as const;
export type DisplayStatus = (typeof DISPLAY_STATUSES)[number];

/** Maps a derived status to a tone. Mapping only — the view decides the status. */
export function statusTone(
  status: string | null,
): "ok" | "warn" | "alert" | "neutral" {
  switch (status) {
    case "paid":
      return "ok";
    case "partially_paid":
    case "unpaid":
      return "warn";
    case "overdue":
      return "alert";
    case "void":
    default:
      return "neutral";
  }
}

export function statusLabel(status: string | null): string {
  switch (status) {
    case "paid":
      return "Paid";
    case "partially_paid":
      return "Part paid";
    case "unpaid":
      return "Unpaid";
    case "overdue":
      return "Overdue";
    case "void":
      return "Void";
    default:
      return status ?? "—";
  }
}
