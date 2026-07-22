"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import type { Database } from "@/lib/supabase/database.types";

type CallOutcome = Database["public"]["Enums"]["call_outcome"];

export type LogCallResult =
  | { ok: true; status: string; nextDueOn: string | null; attempts: number }
  | { ok: false; error: string };

/**
 * Log a call outcome.
 *
 * Every rule — requeue +1 day, escalate after 3 attempts, a promise creating a
 * dated auto-closing task, a wrong number flagging the customer — lives inside
 * log_call(), in one transaction. Deliberately not here: an employee logs a call
 * standing outside a government office on bad mobile data, and if the attempt
 * counter lived in the browser a dropped connection would corrupt it.
 */
export async function logCall(input: {
  taskId: string;
  outcome: CallOutcome;
  notes?: string;
  promisedOn?: string;
  callbackOn?: string;
  durationSeconds?: number;
}): Promise<LogCallResult> {
  await requireProfile();

  if (input.outcome === "promised_payment" && !input.promisedOn) {
    return { ok: false, error: "A promised payment needs a date." };
  }
  if (input.outcome === "needs_callback" && !input.callbackOn) {
    return { ok: false, error: "A callback needs a date." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("log_call", {
    p_task_id: input.taskId,
    p_outcome: input.outcome,
    p_notes: input.notes || undefined,
    p_promised_on: input.promisedOn || undefined,
    p_callback_on: input.callbackOn || undefined,
    p_duration_seconds: input.durationSeconds ?? undefined,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/calls");
  revalidatePath("/admin/calls");
  revalidatePath("/dashboard");

  // out_* names: the RPC's OUT columns are deliberately not called `status` /
  // `attempts`, because those collide with call_tasks' own columns inside the
  // function body (42702).
  const row = Array.isArray(data) ? data[0] : data;
  return {
    ok: true,
    status: row?.out_status ?? "done",
    nextDueOn: row?.out_due_on ?? null,
    attempts: row?.out_attempts ?? 0,
  };
}
