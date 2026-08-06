import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type QuotationRow = Database["public"]["Tables"]["quotations"]["Row"];

export async function listQuotations(opts: { status?: string; limit?: number } = {}) {
  const supabase = await createClient();
  let query = supabase
    .from("quotations")
    .select("*, customers(name, phone)")
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 100);

  if (opts.status && opts.status !== "all") {
    query = query.eq("status", opts.status);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load quotations: ${error.message}`);
  return data ?? [];
}

export async function getQuotationDetail(id: string) {
  const supabase = await createClient();
  const { data: quotation } = await supabase
    .from("quotations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!quotation) return null;

  const [{ data: customer }, { data: service }] = await Promise.all([
    quotation.customer_id
      ? supabase
          .from("customers")
          .select("id, name, phone, email, sponsor_company")
          .eq("id", quotation.customer_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    quotation.service_id
      ? supabase.from("services").select("name").eq("id", quotation.service_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return { quotation, customer, serviceName: service?.name ?? null };
}
