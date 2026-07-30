import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

export type Supplier = Database["public"]["Tables"]["suppliers"]["Row"];

/** Everyone active reads suppliers (RLS: suppliers_select) — used for lists and pickers. */
export async function listSuppliers(opts: { q?: string } = {}) {
  // The unsearched list is the same rows for every user (RLS grants read to all
  // active users) and it loads on every case page. Cache that one; a search is
  // per-keystroke and per-user, so it stays a live query.
  if (!opts.q || opts.q.trim().length < 2) return listSuppliersCached();

  const supabase = await createClient();
  const q = opts.q.trim().replace(/[%_,()]/g, "");
  const { data, error } = await supabase
    .from("suppliers")
    .select("*")
    .is("archived_at", null)
    .or(`name.ilike.%${q}%,supplies.ilike.%${q}%,city.ilike.%${q}%`)
    .order("name");

  if (error) throw new Error(`Failed to load suppliers: ${error.message}`);
  return data ?? [];
}

/**
 * Admin client because unstable_cache runs outside the request scope, so there
 * is no session to read. Safe here for the same reason the catalogue cache is:
 * every active user may read every supplier by policy — this is a vendor list,
 * not customer data. Never copy the pattern to a customer-scoped read.
 *
 * Invalidated by revalidateTag("suppliers") in the supplier actions.
 */
const listSuppliersCached = cache(
  unstable_cache(
    async () => {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .is("archived_at", null)
        .order("name");
      if (error) throw new Error(`Failed to load suppliers: ${error.message}`);
      return data ?? [];
    },
    ["suppliers-list"],
    { revalidate: 3600, tags: ["suppliers"] },
  ),
);

/** One supplier + the cases routed through them + their email history. */
export async function getSupplierDetail(id: string) {
  const supabase = await createClient();

  const [{ data: supplier }, { data: cases }, { data: emails }] = await Promise.all([
    supabase.from("suppliers").select("*").eq("id", id).maybeSingle(),
    // cases_board_v has no supplier_id column, so this queries the base table
    // directly (same RLS as the view: admin sees all, employees only their own).
    supabase
      .from("cases")
      .select("id, opened_at, status, customer:customers(name), service:services(name)")
      .eq("supplier_id", id)
      .is("archived_at", null)
      .order("opened_at", { ascending: false }),
    supabase
      .from("email_log")
      .select("*")
      .eq("supplier_id", id)
      .order("occurred_at", { ascending: false })
      .limit(20),
  ]);

  if (!supplier) return null;
  return { supplier, cases: cases ?? [], emails: emails ?? [] };
}

/** The supplier attached to a case, if any — for the case-detail picker. */
export async function getCaseSupplier(caseId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cases")
    .select("supplier_id, supplier:suppliers(id, name, email)")
    .eq("id", caseId)
    .maybeSingle();
  return data?.supplier ?? null;
}
