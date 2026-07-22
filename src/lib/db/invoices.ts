import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type InvoiceRow = Database["public"]["Views"]["invoices_v"]["Row"];
export type InvoiceLine = Database["public"]["Tables"]["invoice_lines"]["Row"];
export type Payment = Database["public"]["Tables"]["payments"]["Row"];

/**
 * Invoices.
 *
 * Always read invoices_v, never `invoices`. There is no status column by
 * design (§3.10): payment_status, outstanding_paise, is_overdue, display_status
 * and days_overdue are derived in SQL from (total, payments, today). That's why
 * the dashboard reconciles by definition rather than by a nightly job — so never
 * recompute them here.
 */
export async function listInvoices(opts: { status?: string; limit?: number } = {}) {
  const supabase = await createClient();
  let query = supabase
    .from("invoices_v")
    .select("*")
    .order("issue_date", { ascending: false })
    .order("seq", { ascending: false })
    .limit(opts.limit ?? 100);

  if (opts.status && opts.status !== "all") {
    query = query.eq("display_status", opts.status);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load invoices: ${error.message}`);
  return data ?? [];
}

export async function getInvoiceDetail(id: string) {
  const supabase = await createClient();

  const [{ data: invoice }, { data: lines }, { data: payments }] =
    await Promise.all([
      supabase.from("invoices_v").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("invoice_lines")
        .select("*")
        .eq("invoice_id", id)
        .order("line_no"),
      supabase
        .from("payments")
        .select("*")
        .eq("invoice_id", id)
        .order("paid_on", { ascending: false }),
    ]);

  if (!invoice) return null;

  const customer = invoice.customer_id
    ? (
        await supabase
          .from("customers")
          .select("id, name, phone, email, sponsor_company")
          .eq("id", invoice.customer_id)
          .maybeSingle()
      ).data
    : null;

  return { invoice, lines: lines ?? [], payments: payments ?? [], customer };
}

export async function listPayments(limit = 100) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payments")
    .select("*, invoices(number, customer_id, customers(name))")
    .is("voided_at", null)
    .order("paid_on", { ascending: false })
    .limit(limit);
  return data ?? [];
}

// Display helpers live in lib/invoices/display.ts so Client Components can
// import them without pulling in the server client.
export {
  DISPLAY_STATUSES,
  statusTone,
  statusLabel,
  type DisplayStatus,
} from "@/lib/invoices/display";
