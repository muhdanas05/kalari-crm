"use client";

import { useOptimistic, useTransition } from "react";
import { useToast } from "@/components/ui/Toast";
import { moveCaseStage } from "@/app/(app)/pipeline/actions";
import { Check, Loader2 } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { StagePathNode } from "@/lib/pipelines/stage-path";

type Props = {
  caseId: string;
  path: StagePathNode[];
  currentStageId: string;
};

/**
 * The stage tracker.
 *
 * It renders `path` — the service's OWN stages, from stage_applicability — not
 * the pipeline's full 9-stage superset. §3.14: stages are hidden per service,
 * not skipped. A Family visa genuinely has no Offer Letter step; showing a
 * greyed-out one would be a lie about the process.
 *
 * The old TRE tracker let an admin jump to any stage, deliberately bypassing the
 * gates. That is NOT carried over: here the database refuses an off-path move
 * for everyone, so the UI offers only what the guard would accept.
 */
export function StageTracker({ caseId, path, currentStageId }: Props) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  /**
   * Move the marker the instant it's clicked, then let the server confirm.
   *
   * Safe to be optimistic here precisely because the database is the one
   * enforcing the path (tg_case_stage_guard raises 23514 on an off-path move):
   * if the server disagrees, React discards this value when the transition
   * ends and the real stage snaps back — with the guard's own message in a
   * toast. Nothing is lost, and the common case stops waiting on a round trip.
   *
   * Deliberately NOT applied to money (issuing, payments): those must never
   * appear to have happened before the ledger says so.
   */
  const [optimisticStageId, setOptimisticStageId] = useOptimistic(currentStageId);

  const currentIdx = path.findIndex((s) => s.id === optimisticStageId);
  const pct =
    path.length > 1 ? (Math.max(currentIdx, 0) / (path.length - 1)) * 100 : 0;

  const go = (stageId: string) => {
    if (stageId === optimisticStageId || pending) return;
    startTransition(async () => {
      setOptimisticStageId(stageId);
      const res = await moveCaseStage(caseId, stageId);
      if (!res.ok) toast(res.error, "error");
      else toast("Stage updated.", "ok");
    });
  };

  if (path.length === 0) {
    return (
      <p className="text-[12.5px] font-medium text-ink-faint">
        No service set yet, so this case has no declared stage path.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper-deep">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="shrink-0 font-mono text-[11px] font-semibold text-ink-mid">
          {Math.max(currentIdx, 0) + 1}/{path.length}
        </span>
        {pending && <Loader2 size={13} className="animate-spin text-accent" />}
      </div>

      <ol className="flex snap-x gap-2 overflow-x-auto pb-1">
        {path.map((stage, i) => {
          const done = currentIdx > i;
          const active = stage.id === optimisticStageId;
          return (
            <li key={stage.id} className="snap-start">
              <button
                type="button"
                onClick={() => go(stage.id)}
                disabled={pending || active}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex h-full min-w-[104px] flex-col items-start gap-1.5 rounded-lg border px-3 py-2.5 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-mist",
                  active
                    ? "border-accent bg-accent text-white"
                    : done
                      ? "border-line bg-accent-mist text-ink hover:border-accent"
                      : "border-line bg-surface text-ink-mid hover:border-accent hover:text-ink",
                  !active && !pending && "cursor-pointer",
                )}
              >
                <span
                  className={cn(
                    "flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold",
                    active
                      ? "bg-white/25 text-white"
                      : done
                        ? "bg-accent text-white"
                        : "bg-paper-deep text-ink-faint",
                  )}
                >
                  {done ? <Check size={9} strokeWidth={3.5} /> : i + 1}
                </span>
                <span className="text-[11.5px] font-semibold leading-tight">
                  {stage.name}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
