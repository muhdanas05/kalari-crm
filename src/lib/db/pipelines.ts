import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

export type CaseCard = Database["public"]["Views"]["cases_board_v"]["Row"];
export type Pipeline = Database["public"]["Tables"]["pipelines"]["Row"];
export type Stage = Database["public"]["Tables"]["stages"]["Row"];

export type PipelineKey = "sales" | "processing" | "renewal";

export const PIPELINE_KEYS: PipelineKey[] = ["sales", "processing", "renewal"];

/**
 * Pipelines with their stages, ordered.
 *
 * Reference data: 3 pipelines and 20 stages that change when a migration
 * changes them and at no other time. Cached across requests for an hour — the
 * database is ~600ms away, and paying that on every pipeline render for rows
 * that are effectively constants is the difference between a snappy board and a
 * sluggish one.
 *
 * Admin client because unstable_cache runs outside the request scope (no
 * cookies). Safe here and only here: these tables carry no customer data — every
 * authenticated user is allowed to read the full stage list, which is what the
 * RLS policy already says. Do NOT copy this pattern to anything customer-scoped.
 */
const getPipelinesCached = unstable_cache(
  async () => {
    const supabase = createAdminClient();
    const [{ data: pipelines }, { data: stages }] = await Promise.all([
      supabase.from("pipelines").select("*").order("sort_order"),
      supabase.from("stages").select("*").order("sort_order"),
    ]);

    return (pipelines ?? []).map((p) => ({
      ...p,
      stages: (stages ?? []).filter((s) => s.pipeline_id === p.id),
    }));
  },
  ["pipelines-with-stages"],
  { revalidate: 3600, tags: ["reference"] },
);

export const getPipelines = cache(getPipelinesCached);

export const getPipelineByKey = cache(async (key: PipelineKey) => {
  const pipelines = await getPipelines();
  return pipelines.find((p) => p.key === key) ?? null;
});

/**
 * Board rows for one pipeline.
 *
 * Reads cases_board_v, which already derives days_in_stage, is_stuck,
 * stage_path and outstanding_paise in SQL. Do NOT recompute any of those here:
 * they're the implementation of §3.10 and §3.15, and a second copy in TypeScript
 * is a second source of truth that will drift.
 *
 * RLS scopes the rows — an employee gets only their own cases, with no filter
 * from us and no way to opt out (§3.18).
 */
export async function getBoardCases(pipelineKey: PipelineKey) {
  const supabase = await createClient();
  const pipeline = await getPipelineByKey(pipelineKey);
  if (!pipeline) return [];

  const { data, error } = await supabase
    .from("cases_board_v")
    .select("*")
    .eq("pipeline_id", pipeline.id)
    .order("stage_sort")
    .order("opened_at", { ascending: false });

  if (error) throw new Error(`Failed to load board: ${error.message}`);
  return data ?? [];
}

/** Stuck cases across every pipeline — is_stuck is computed by the view. */
export async function getStuckCases(limit = 10) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cases_board_v")
    .select("*")
    .eq("is_stuck", true)
    .order("days_in_stage", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function getCase(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cases_board_v")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data;
}

// Pure helpers live in lib/pipelines/stage-path.ts for Client Components.
export { stagePathOf, type StagePathNode } from "@/lib/pipelines/stage-path";
