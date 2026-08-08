"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";

export type RequestResult = { ok: true } | { ok: false; error: string };

/**
 * §5.11: the Request button "actually writes a record and notifies 7Gence".
 *
 * So it writes a row. A button that only shows a toast is a lie — the customer
 * believes they've asked for something and nobody has heard them.
 */
export async function requestIntegration(
  integration: "google_ads" | "meta_ads" | "instagram",
  note?: string,
): Promise<RequestResult> {
  const profile = await requirePermission("admin_integrations");
  const supabase = await createClient();

  const { error } = await supabase.from("integration_requests").insert({
    integration,
    requested_by: profile.id,
    note: note || null,
  });

  if (error) return { ok: false, error: error.message };

  // NOTE: notifying 7Gence is the email layer's job — this row emits nothing
  // yet. Until the dispatcher ships, the request is recorded and visible to the
  // admin, but nobody is paged. Deliberately not faking it.
  revalidatePath("/admin/integrations");
  return { ok: true };
}
