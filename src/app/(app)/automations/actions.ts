"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";

export type ToggleResult = { ok: true } | { ok: false; error: string };

/** §5.10: "Every automation individually toggleable." */
export async function setSetting(
  key: string,
  enabled: boolean,
): Promise<ToggleResult> {
  const profile = await requirePermission("automations");
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
