import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * The stage editor's reads. Admin-only surface — RLS on `stages` and
 * `stage_applicability` grants select to every active user (they're reference
 * data the whole app reads), but only the pages behind requireAdmin() render
 * this module's output.
 */

export type PipelineService = { id: string; name: string; family: string };

/** Only pipeline-tracked services have a stage path worth editing. */
export async function listPipelineServices(): Promise<PipelineService[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("services")
    .select("id, name, family")
    .eq("tracks_pipeline", true)
    .is("archived_at", null)
    .order("name");
  return data ?? [];
}

export type StagePathRow = {
  stage_id: string;
  name: string;
  key: string;
  sort_order: number;
  is_terminal: boolean;
  enabled: boolean;
  requires_input: boolean;
  custom_subject: string | null;
  custom_body: string | null;
};

/**
 * One service's stage path, in order, with each stage's email/input config.
 *
 * Two queries, not one embedded select: stage_applicability.stage_id and
 * stage_email_config.stage_id both reference stages.id, but there is no
 * direct foreign key BETWEEN stage_applicability and stage_email_config —
 * PostgREST can only auto-embed across an actual FK, so asking it to join
 * them in one .select() fails with PGRST200 ("no relationship found"). That
 * error was being silently swallowed here (destructured `data` with no
 * `error` check), so this returned an empty array — always, for every
 * service — and the UI read that as "no stages yet" even when the path was
 * fully built. Fetching stage_email_config separately, keyed by stage_id,
 * and merging in JS sidesteps the missing relationship entirely.
 */
export async function getServiceStagePath(serviceId: string): Promise<StagePathRow[]> {
  const supabase = await createClient();
  const { data: path, error } = await supabase
    .from("stage_applicability")
    .select("stage_id, sort_order, stages!inner(name, key, is_terminal)")
    .eq("service_id", serviceId)
    .order("sort_order");

  if (error) throw new Error(`Failed to load the stage path: ${error.message}`);
  if (!path || path.length === 0) return [];

  const stageIds = path.map((r) => r.stage_id);
  const { data: configs } = await supabase
    .from("stage_email_config")
    .select("stage_id, enabled, requires_input, custom_subject, custom_body")
    .in("stage_id", stageIds);

  const byStage = new Map((configs ?? []).map((c) => [c.stage_id, c]));

  return path.map((r) => {
    const stage = r.stages as unknown as { name: string; key: string; is_terminal: boolean };
    const cfg = byStage.get(r.stage_id);
    return {
      stage_id: r.stage_id,
      name: stage.name,
      key: stage.key,
      sort_order: r.sort_order,
      is_terminal: stage.is_terminal,
      enabled: cfg?.enabled ?? false,
      requires_input: cfg?.requires_input ?? false,
      custom_subject: cfg?.custom_subject ?? null,
      custom_body: cfg?.custom_body ?? null,
    };
  });
}

/** Every stage on the Processing pipeline this service's path does NOT already use. */
export async function listAvailableStages(
  serviceId: string,
): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();

  const [{ data: pipeline }, { data: inPath }] = await Promise.all([
    supabase.from("pipelines").select("id").eq("key", "processing").maybeSingle(),
    supabase.from("stage_applicability").select("stage_id").eq("service_id", serviceId),
  ]);
  if (!pipeline) return [];

  const usedIds = new Set((inPath ?? []).map((r) => r.stage_id));

  const { data: allStages } = await supabase
    .from("stages")
    .select("id, name")
    .eq("pipeline_id", pipeline.id)
    .order("name");

  return (allStages ?? []).filter((s) => !usedIds.has(s.id));
}
