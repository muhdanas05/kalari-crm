import type { Database } from "@/lib/supabase/database.types";

/**
 * Client-safe stage-path helpers.
 *
 * Kept out of lib/db/pipelines.ts (server-only) so the board, the case card and
 * the stage tracker can use them in the browser.
 */
export type CaseCard = Database["public"]["Views"]["cases_board_v"]["Row"];

/** One node of a case's declared stage path, as the view emits it. */
export type StagePathNode = { id: string; name: string; sort: number };

/**
 * The stages a case may actually enter, in order.
 *
 * `stage_path` on the view is the per-service path from stage_applicability —
 * §3.14: stages are HIDDEN per service, not skipped. Ten services, six paths.
 * A Family visa never shows Offer Letter; a Temp Work Permit ends at Labour Card.
 *
 * Read it, never derive it. The database refuses a move outside this path via
 * the cases_stage_guard trigger, so the UI and the guard agree by construction.
 * A case with no service yet (a Sales enquiry) has no declared path.
 */
export function stagePathOf(card: Pick<CaseCard, "stage_path">): StagePathNode[] {
  const path = card.stage_path;
  if (!Array.isArray(path)) return [];
  return (path as unknown as StagePathNode[])
    .filter((n) => n && typeof n.id === "string")
    .sort((a, b) => a.sort - b.sort);
}
