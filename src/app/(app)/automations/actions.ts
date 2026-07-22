"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/session";

export type ToggleResult = { ok: true } | { ok: false; error: string };

/** §5.10: "Every automation individually toggleable." */
export async function setSetting(
  key: string,
  enabled: boolean,
): Promise<ToggleResult> {
  const profile = await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("automation_settings")
    .update({ enabled, updated_by: profile.id, updated_at: new Date().toISOString() })
    .eq("key", key);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/automations");
  revalidatePath("/settings");
  return { ok: true };
}

/**
 * Which stages email the customer.
 *
 * Data, not code: the brief asks for email "on some selected stages", and which
 * ones is a business judgement that will change. An admin flips it here, and no
 * deploy is involved.
 */
export async function setStageEmail(
  stageId: string,
  enabled: boolean,
): Promise<ToggleResult> {
  const profile = await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("stage_email_config")
    .update({
      enabled,
      template_key: enabled ? "stage.changed" : null,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("stage_id", stageId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/automations");
  return { ok: true };
}
