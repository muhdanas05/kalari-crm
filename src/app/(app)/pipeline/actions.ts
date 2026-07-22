"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";

export type MoveResult = { ok: true } | { ok: false; error: string };

/**
 * Move a case to a stage.
 *
 * Note what this function does NOT do:
 *   • It does not check the stage is on the service's path. The
 *     cases_stage_guard trigger does, raising 23514. Enforcing it here too
 *     would be a second source of truth that can drift from the first — and the
 *     trigger is the one that also catches a curl request that skips this UI
 *     entirely (§3.21).
 *   • It does not set stage_entered_at. It *cannot*: `authenticated` holds no
 *     UPDATE grant on that column, so §3.15 ("not client-writable") is enforced
 *     by the grant, and the trigger sets the value.
 *
 * So this is a plain update, and the database is the rulebook.
 */
export async function moveCaseStage(
  caseId: string,
  stageId: string,
): Promise<MoveResult> {
  await requireProfile();
  const supabase = await createClient();

  const { error } = await supabase
    .from("cases")
    .update({ stage_id: stageId })
    .eq("id", caseId);

  if (error) {
    // 23514 is the stage guard refusing a move outside the service's path.
    // Its message already names the stage and the service, so surface it.
    if (error.code === "23514") return { ok: false, error: error.message };
    if (error.code === "42501")
      return { ok: false, error: "You can't move this case." };
    return { ok: false, error: error.message };
  }

  revalidatePath("/pipeline");
  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}
