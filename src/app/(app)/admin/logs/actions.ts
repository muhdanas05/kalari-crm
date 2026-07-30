"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/session";

/**
 * Push a failed queue row back to the front of the line.
 *
 * `authenticated` holds SELECT on email_queue and nothing else (email_layer.sql
 * revokes all, then grants select only) — the queue is written by the dispatcher,
 * not by users. So this needs the service-role client, and requireAdmin() above
 * it is the actual gate rather than defence in depth. Keep them in that order.
 */
export async function retryQueuedEmail(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("email_queue")
    .update({
      status: "queued",
      attempts: 0,
      next_attempt_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/logs");
  return { ok: true };
}

/**
 * Form-action shape of the same thing, so the retry button can be a plain
 * <form> in a Server Component rather than a client island with a toast.
 */
export async function retryQueuedEmailForm(formData: FormData): Promise<void> {
  await retryQueuedEmail(String(formData.get("id") ?? ""));
}
