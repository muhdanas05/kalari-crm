"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";

export type NewLeadResult =
  | { ok: true; customerId: string; isNew: boolean }
  | { ok: false; error: string };

/**
 * Manual in-app lead entry.
 *
 * §5.1: "Manual in-app entry uses the SAME code path." So this calls
 * create_lead() — the exact function the website posts to — rather than
 * inserting a customer directly. That is what guarantees a walk-in gets the same
 * dedup, the same auto-assignment, and the same welcome email as a web enquiry.
 * Two intake paths that drift is how a CRM ends up with duplicate customers.
 */
export async function createLead(input: {
  name: string;
  phone: string;
  email?: string;
  source?: string;
  /** Free-text segment (Regular / Corporate / Agent / …). Set after the RPC. */
  category?: string;
  /** Service the lead asked about. create_lead takes a uuid (p_service_id). */
  serviceId?: string;
  message?: string;
}): Promise<NewLeadResult> {
  await requireProfile();

  if (!input.name.trim() || !input.phone.trim()) {
    return { ok: false, error: "Name and phone are required." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_lead", {
    p_name: input.name.trim(),
    p_phone: input.phone.trim(),
    p_email: input.email?.trim() || undefined,
    p_source: input.source?.trim() || "walk-in",
    p_service_id: input.serviceId || undefined,
    p_message: input.message?.trim() || undefined,
  });

  if (error) return { ok: false, error: error.message };

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.customer_id) return { ok: false, error: "Could not create the lead." };

  // create_lead has no category param, and category is a plain column with an
  // update grant — so it's a follow-up write. A dedup hit (existing customer)
  // gets its category refreshed too, which is the intended behaviour: the
  // latest intake wins.
  const category = input.category?.trim();
  if (category) {
    const { error: catError } = await supabase
      .from("customers")
      .update({ category })
      .eq("id", row.customer_id);
    // The lead exists either way — a failed tag is not a failed lead.
    if (catError) console.error("createLead: category update failed", catError);
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${row.customer_id}`);
  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  return { ok: true, customerId: row.customer_id, isNew: row.is_new_customer };
}
