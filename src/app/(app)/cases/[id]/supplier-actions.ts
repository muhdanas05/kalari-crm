"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth/session";

export type SetSupplierResult = { ok: true } | { ok: false; error: string };

/** Set/clear the case's supplier. RLS's supplier_id update grant enforces access. */
export async function setCaseSupplier(
  caseId: string,
  supplierId: string | null,
): Promise<SetSupplierResult> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.from("cases").update({ supplier_id: supplierId }).eq("id", caseId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/cases/${caseId}`);
  return { ok: true };
}

export type EmailSupplierResult = { ok: true; sandboxed: boolean } | { ok: false; error: string };

/**
 * Email the case's supplier. Unlike customer email, this is a one-off human
 * message, not an automation — it skips the events/dispatcher seam and inserts
 * straight into the queue the sender already drains (§4: automations never
 * send, but a human clicking "email" here isn't an automation).
 *
 * No customer PII in what THIS function prefills — the caller composes the
 * body; we only supply the case reference.
 */
export async function emailSupplier(
  caseId: string,
  subject: string,
  body: string,
): Promise<EmailSupplierResult> {
  await requireProfile();
  if (!subject.trim() || !body.trim()) {
    return { ok: false, error: "Subject and message are required." };
  }

  const supabase = await createClient();
  // RLS-scoped: if the caller can't see this case, they get nothing to email.
  const { data: c } = await supabase
    .from("cases")
    .select("id, supplier:suppliers(id, name, email)")
    .eq("id", caseId)
    .maybeSingle();

  const supplier = c?.supplier;
  if (!c || !supplier) return { ok: false, error: "No supplier set on this case." };
  if (!supplier.email) return { ok: false, error: `${supplier.name} has no email on file.` };

  const admin = createAdminClient();
  const { error } = await admin.from("email_queue").insert({
    to_email: supplier.email,
    subject: subject.trim(),
    body: body.trim(),
    case_id: caseId,
    supplier_id: supplier.id,
    customer_id: null,
    template_key: null,
    dedupe_key: `supplier.email:${caseId}:${Date.now()}`,
  });
  if (error) return { ok: false, error: error.message };

  const { data: settings } = await supabase
    .from("automation_settings")
    .select("key, enabled")
    .in("key", ["email.enabled", "email.sandbox"]);
  const map = Object.fromEntries((settings ?? []).map((s) => [s.key, s.enabled]));
  const sandboxed = !map["email.enabled"] || map["email.sandbox"];

  revalidatePath(`/cases/${caseId}`);
  return { ok: true, sandboxed };
}
