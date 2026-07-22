"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import type { Database } from "@/lib/supabase/database.types";

type Priority = Database["public"]["Enums"]["call_priority"];

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Reassign a call task.
 *
 * The RPC refuses unless the caller is an admin and the target is active — this
 * only passes the message through. Enforcing it here as well would be a second
 * source of truth that can drift from the first.
 */
export async function assignCall(
  taskId: string,
  userId: string,
): Promise<ActionResult> {
  await requireProfile();
  const supabase = await createClient();

  const { error } = await supabase.rpc("assign_call_task", {
    p_task_id: taskId,
    p_user_id: userId,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/calls");
  revalidatePath("/admin/calls");
  return { ok: true };
}

/**
 * Add a call task by hand.
 *
 * The queue is machine-generated, but people always need "call this person,
 * here's why" — and without it they keep a second list on paper, at which point
 * the follow-up report stops describing reality.
 */
export async function createCall(input: {
  customerId: string;
  context: string;
  priority: Priority;
  dueOn?: string;
  assignTo?: string;
  caseId?: string;
}): Promise<ActionResult> {
  await requireProfile();

  if (!input.context.trim()) {
    return { ok: false, error: "Say why they need calling." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_call_task", {
    p_customer_id: input.customerId,
    p_context: input.context.trim(),
    p_priority: input.priority,
    p_due_on: input.dueOn || undefined,
    p_assign_to: input.assignTo || undefined,
    p_case_id: input.caseId || undefined,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/calls");
  revalidatePath("/admin/calls");
  return { ok: true };
}
