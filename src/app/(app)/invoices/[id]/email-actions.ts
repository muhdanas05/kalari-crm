"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";

export type EmailResult = { ok: true; sandboxed: boolean } | { ok: false; error: string };

/**
 * Email the invoice from the invoice screen (§5.4 — "one click").
 *
 * It does NOT send directly. It emits an `invoice.issued` event, and the same
 * dispatcher + sender that handle every other email pick it up on the next
 * tick. One path, one set of guarantees — suppression, sandbox, the log,
 * everything. A second "just send it now" path would be a second thing to keep
 * correct.
 *
 * Because the send is async, the honest answer to the click is "queued", and
 * the button says so.
 */
export async function emailInvoice(invoiceId: string): Promise<EmailResult> {
  await requireProfile();
  const supabase = await createClient();

  // RLS-scoped: if the caller can't see this invoice, they get nothing to email.
  const { data: inv } = await supabase
    .from("invoices_v")
    .select("id, customer_id, case_id, number")
    .eq("id", invoiceId)
    .maybeSingle();

  // invoices_v is a view, so every column is nullable in the generated types.
  // Narrow the ones the event insert needs to be non-null.
  if (!inv || !inv.id || !inv.customer_id) {
    return { ok: false, error: "Invoice not found." };
  }

  const { error } = await supabase.from("events").insert({
    type: "invoice.issued",
    entity: "invoice",
    entity_id: inv.id,
    customer_id: inv.customer_id,
    case_id: inv.case_id,
    payload: { number: inv.number, resend: true },
    // Re-keyed so a manual resend is allowed even though the automatic one at
    // issue already fired. The customer asked for it again; honour that.
    dedupe_key: `invoice.issued:manual:${inv.id}:${Date.now()}`,
  });

  if (error) return { ok: false, error: error.message };

  // Is email actually on, or will this land in the sandbox log? Tell the truth.
  const { data: settings } = await supabase
    .from("automation_settings")
    .select("key, enabled")
    .in("key", ["email.enabled", "email.sandbox"]);
  const map = Object.fromEntries((settings ?? []).map((s) => [s.key, s.enabled]));
  const sandboxed = !map["email.enabled"] || map["email.sandbox"];

  revalidatePath(`/invoices/${invoiceId}`);
  return { ok: true, sandboxed };
}
