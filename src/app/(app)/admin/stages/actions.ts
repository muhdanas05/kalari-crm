"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/session";

export type Result = { ok: true; stageId?: string } | { ok: false; error: string };

const PROCESSING_KEY = "processing";

function slugify(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "stage"
  );
}

/**
 * A brand-new stage, named whatever the office wants, on the Processing
 * pipeline — not wired into any service's path yet, and with a blank
 * stage_email_config row so the stage-change trigger has something to read
 * instead of nothing (a stage with no config row simply never emails, which
 * is the safe default, but the editor should show real toggles, not a gap).
 */
export async function createStage(name: string): Promise<Result> {
  await requireAdmin();
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name the stage." };

  const supabase = await createClient();

  const { data: pipeline } = await supabase
    .from("pipelines")
    .select("id")
    .eq("key", PROCESSING_KEY)
    .maybeSingle();
  if (!pipeline) return { ok: false, error: "Processing pipeline not found." };

  const { data: existing } = await supabase
    .from("stages")
    .select("key, sort_order")
    .eq("pipeline_id", pipeline.id);

  const usedKeys = new Set((existing ?? []).map((s) => s.key));
  let key = slugify(trimmed);
  let n = 2;
  while (usedKeys.has(key)) key = `${slugify(trimmed)}_${n++}`;

  const nextOrder = (existing ?? []).reduce((m, s) => Math.max(m, s.sort_order), 0) + 1;

  const { data: stage, error } = await supabase
    .from("stages")
    .insert({ pipeline_id: pipeline.id, key, name: trimmed, sort_order: nextOrder })
    .select("id")
    .single();

  if (error || !stage) return { ok: false, error: error?.message ?? "Could not create the stage." };

  const { error: cfgError } = await supabase
    .from("stage_email_config")
    .insert({ stage_id: stage.id, enabled: false, requires_input: false });

  if (cfgError) {
    // Non-fatal: the trigger treats a missing config row as "never emails",
    // which is the correct safe default. Log it; don't fail stage creation
    // over a row the app can recreate the next time settings are saved.
    console.error("[stages] config row failed:", cfgError.message);
  }

  revalidatePath("/admin/stages");
  return { ok: true, stageId: stage.id };
}

/** Add an existing stage to a service's path, at the end. */
export async function addStageToPath(serviceId: string, stageId: string): Promise<Result> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: current } = await supabase
    .from("stage_applicability")
    .select("sort_order")
    .eq("service_id", serviceId);

  const nextOrder = (current ?? []).reduce((m, r) => Math.max(m, r.sort_order), 0) + 1;

  const { error } = await supabase
    .from("stage_applicability")
    .insert({ service_id: serviceId, stage_id: stageId, sort_order: nextOrder });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/stages");
  return { ok: true };
}

/**
 * Remove a stage from a service's path. Deletes the stage_applicability row
 * only — the stage itself survives, because another service may still use it,
 * and a case already sitting in it must not lose its own history.
 */
export async function removeStageFromPath(serviceId: string, stageId: string): Promise<Result> {
  await requireAdmin();
  const supabase = await createClient();

  const { count } = await supabase
    .from("cases")
    .select("id", { count: "exact", head: true })
    .eq("service_id", serviceId)
    .eq("stage_id", stageId)
    .is("archived_at", null);

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `${count} open case(s) are sitting in this stage — move them first.`,
    };
  }

  const { error } = await supabase
    .from("stage_applicability")
    .delete()
    .eq("service_id", serviceId)
    .eq("stage_id", stageId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/stages");
  return { ok: true };
}

/**
 * Swap this stage with its neighbour. Two updates, not one transaction — this
 * is a low-stakes reorder by a single admin, not a money operation, and the
 * worst case of a race (two saves landing out of order) is a path that needs
 * one more click to fix, not a wrong balance.
 */
export async function moveStage(
  serviceId: string,
  stageId: string,
  direction: "up" | "down",
): Promise<Result> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("stage_applicability")
    .select("stage_id, sort_order")
    .eq("service_id", serviceId)
    .order("sort_order");

  const ordered = rows ?? [];
  const i = ordered.findIndex((r) => r.stage_id === stageId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ordered.length) return { ok: true }; // already at the end

  const a = ordered[i];
  const b = ordered[j];

  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    supabase
      .from("stage_applicability")
      .update({ sort_order: b.sort_order })
      .eq("service_id", serviceId)
      .eq("stage_id", a.stage_id),
    supabase
      .from("stage_applicability")
      .update({ sort_order: a.sort_order })
      .eq("service_id", serviceId)
      .eq("stage_id", b.stage_id),
  ]);

  if (e1 || e2) return { ok: false, error: (e1 ?? e2)?.message ?? "Could not reorder." };
  revalidatePath("/admin/stages");
  return { ok: true };
}

/**
 * The per-stage email + input settings — the "fully custom" tab. Upsert: a
 * stage created before the editor's INSERT grant existed (or one whose config
 * insert failed non-fatally above) may have no row yet.
 */
export async function saveStageConfig(
  stageId: string,
  input: {
    requiresInput: boolean;
    customSubject: string;
    customBody: string;
  },
): Promise<Result> {
  await requireAdmin();

  if (input.requiresInput && (!input.customSubject.trim() || !input.customBody.trim())) {
    return { ok: false, error: "Write the subject and the message before turning this on." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("stage_email_config").upsert(
    {
      stage_id: stageId,
      requires_input: input.requiresInput,
      custom_subject: input.customSubject.trim() || null,
      custom_body: input.customBody.trim() || null,
    },
    { onConflict: "stage_id" },
  );

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/stages");
  return { ok: true };
}
