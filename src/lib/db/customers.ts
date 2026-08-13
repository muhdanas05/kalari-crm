import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type Customer = Database["public"]["Tables"]["customers"]["Row"];

/**
 * Customers list.
 *
 * `archived: true` shows the archived ones INSTEAD of the live ones — the only
 * way to find something you archived by mistake, and therefore the only way
 * the restore action is reachable.
 */
export async function listCustomers(
  opts: { q?: string; category?: string; limit?: number; archived?: boolean } = {},
) {
  const supabase = await createClient();
  let query = supabase
    .from("customers")
    .select("id, name, phone, email, category, nationality, source, created_at, archived_at")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 100);

  query = opts.archived
    ? query.not("archived_at", "is", null)
    : query.is("archived_at", null);

  if (opts.category) query = query.eq("category", opts.category);

  if (opts.q && opts.q.trim().length >= 2) {
    const q = opts.q.trim().replace(/[%_,()]/g, "");
    const digits = q.replace(/\D/g, "");
    const parts = [`name.ilike.%${q}%`];
    if (digits.length >= 3) parts.push(`phone_e164.ilike.%${digits}%`);
    if (q.includes("@")) parts.push(`email.ilike.%${q}%`);
    query = query.or(parts.join(","));
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load customers: ${error.message}`);
  return data ?? [];
}

/**
 * The categories actually in use, for the filter pills. Free-text column, so
 * there is no lookup table to read — dedupe the values instead.
 *
 * ponytail: scans the newest 1000 rows and dedupes in JS. A category used only
 * on older rows would drop off the pill list (the ?category= URL still works).
 * If that bites, add a `distinct` RPC or a categories table.
 */
export async function listCustomerCategories(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("customers")
    .select("category")
    .is("archived_at", null)
    .not("category", "is", null)
    .order("created_at", { ascending: false })
    .limit(1000);

  return [...new Set((data ?? []).map((r) => r.category!.trim()).filter(Boolean))].sort();
}

/** One customer with everything the profile page shows. */
export async function getCustomerDetail(id: string) {
  const supabase = await createClient();

  const [{ data: customer }, { data: cases }, { data: invoices }] =
    await Promise.all([
      supabase.from("customers").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("cases_board_v")
        .select("*")
        .eq("customer_id", id)
        .order("opened_at", { ascending: false }),
      supabase
        .from("invoices_v")
        .select("*")
        .eq("customer_id", id)
        .order("issue_date", { ascending: false }),
    ]);

  if (!customer) return null;
  return { customer, cases: cases ?? [], invoices: invoices ?? [] };
}

/**
 * The customer's timeline: every stage change, every write, who did it.
 *
 * activity_log is append-only and written only by a trigger, so this is the
 * honest record rather than a best-effort one (§3.24). "When an employee leaves,
 * none of this leaves with them" (SOW §02.C).
 */
export async function getCustomerActivity(customerId: string, limit = 50) {
  const supabase = await createClient();

  // Cases belonging to this customer, so their activity joins the timeline.
  const { data: caseRows } = await supabase
    .from("cases")
    .select("id")
    .eq("customer_id", customerId);
  const caseIds = (caseRows ?? []).map((c) => c.id);

  const ids = [customerId, ...caseIds];
  const { data } = await supabase
    .from("activity_log")
    .select("*")
    .in("entity_id", ids)
    .order("occurred_at", { ascending: false })
    .limit(limit);

  return data ?? [];
}
