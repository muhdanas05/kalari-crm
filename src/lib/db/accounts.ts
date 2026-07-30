import "server-only";
import { createClient } from "@/lib/supabase/server";
import { todayKolkata } from "@/lib/dates";
import type { Database } from "@/lib/supabase/database.types";

export type Expense = Database["public"]["Tables"]["expenses"]["Row"];
export type PaymentMethod = Database["public"]["Enums"]["payment_method"];

/** One line of the account book. Money in from payments, money out from expenses. */
export type LedgerEntry = {
  kind: "in" | "out";
  id: string;
  /** YYYY-MM-DD, the business date (paid_on / spent_on), not created_at. */
  date: string;
  label: string;
  sublabel: string | null;
  amount_paise: number;
  method: PaymentMethod;
  /** Receipt number for money in, supplier name for money out. */
  ref: string | null;
  /** Money-in rows link back to their invoice. */
  invoice_id: string | null;
};

/** First day of the month containing `date` (a YYYY-MM-DD calendar date). */
function monthStart(date: string): string {
  return date.slice(0, 8) + "01";
}

/** The month-to-date range in Asia/Kolkata — the default the ledger opens on. */
export function defaultRange(): { from: string; to: string } {
  const today = todayKolkata();
  return { from: monthStart(today), to: today };
}

// ponytail: 500 rows per side is the ceiling. A busy year would exceed it;
// paginate or aggregate in SQL if that ever happens rather than raising it.
const LIMIT = 500;

/**
 * The account book for a date range: payments and expenses merged, newest first.
 *
 * Voided payments and archived expenses are excluded — a voided receipt is not
 * money the business has. Expenses are admin-only by RLS, so an employee who
 * reached this would simply see the money-in side.
 */
export async function listLedger({
  from,
  to,
}: {
  from: string;
  to: string;
}): Promise<LedgerEntry[]> {
  const supabase = await createClient();

  const [payments, expenses] = await Promise.all([
    supabase
      .from("payments")
      .select("id, paid_on, amount_paise, method, number, reference, invoice_id, invoices(number, customers(name))")
      .is("voided_at", null)
      .gte("paid_on", from)
      .lte("paid_on", to)
      .order("paid_on", { ascending: false })
      .limit(LIMIT),
    supabase
      .from("expenses")
      .select("id, spent_on, amount_paise, method, category, description, suppliers(name)")
      .is("archived_at", null)
      .gte("spent_on", from)
      .lte("spent_on", to)
      .order("spent_on", { ascending: false })
      .limit(LIMIT),
  ]);

  const inRows: LedgerEntry[] = (payments.data ?? []).map((p) => {
    // The embedded relation is typed loosely by the generated types.
    const inv = p.invoices as unknown as {
      number: string;
      customers: { name: string } | null;
    } | null;
    return {
      kind: "in" as const,
      id: p.id,
      date: p.paid_on,
      label: inv?.customers?.name ?? "Payment received",
      sublabel: [inv?.number, p.reference].filter(Boolean).join(" · ") || null,
      amount_paise: p.amount_paise,
      method: p.method,
      ref: p.number,
      invoice_id: p.invoice_id,
    };
  });

  const outRows: LedgerEntry[] = (expenses.data ?? []).map((e) => {
    const supplier = e.suppliers as unknown as { name: string } | null;
    return {
      kind: "out" as const,
      id: e.id,
      date: e.spent_on,
      label: e.category,
      sublabel: e.description,
      amount_paise: e.amount_paise,
      method: e.method,
      ref: supplier?.name ?? null,
      invoice_id: null,
    };
  });

  return [...inRows, ...outRows].sort((a, b) => b.date.localeCompare(a.date));
}

/** In / out / net for a set of ledger entries. Integer paise throughout. */
export function ledgerTotals(entries: LedgerEntry[]) {
  let in_paise = 0;
  let out_paise = 0;
  for (const e of entries) {
    if (e.kind === "in") in_paise += e.amount_paise;
    else out_paise += e.amount_paise;
  }
  return { in_paise, out_paise, net_paise: in_paise - out_paise };
}
