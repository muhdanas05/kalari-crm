"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import { moveCaseStage } from "@/app/(app)/pipeline/actions";
import { CaseCard } from "./CaseCard";
import { cn } from "@/lib/utils";
import type { CaseCard as CaseRow } from "@/lib/pipelines/stage-path";

export type BoardStage = { id: string; name: string; is_terminal: boolean };

type Props = {
  stages: BoardStage[];
  cases: CaseRow[];
};

/**
 * The Kanban board. Extracted from the old inline page implementation; the
 * hand-rolled HTML5 drag/drop is kept deliberately — no dnd-kit. The board is
 * desktop-only (the list is the primary view on mobile, §5.3), so touch DnD
 * isn't needed and a library would be weight for nothing.
 *
 * Cards move optimistically, then reconcile. If the database refuses the move —
 * because the stage isn't on that service's path (§3.14) — the optimistic state
 * is dropped by the revalidate and the card snaps back with the reason.
 */
export function Board({ stages, cases }: Props) {
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const [optimistic, applyOptimistic] = useOptimistic(
    cases,
    (state: CaseRow[], move: { id: string; stageId: string }) =>
      state.map((c) =>
        c.id === move.id ? { ...c, stage_id: move.stageId } : c,
      ),
  );

  const onDrop = (stageId: string, caseId: string) => {
    setDropTarget(null);
    const card = optimistic.find((c) => c.id === caseId);
    if (!card || card.stage_id === stageId) return;

    startTransition(async () => {
      applyOptimistic({ id: caseId, stageId });
      const res = await moveCaseStage(caseId, stageId);
      if (!res.ok) toast(res.error, "error");
    });
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {stages.map((stage) => {
        const items = optimistic.filter((c) => c.stage_id === stage.id);
        return (
          <Column
            key={stage.id}
            stage={stage}
            count={items.length}
            isDropTarget={dropTarget === stage.id}
            onDragOver={(e) => {
              e.preventDefault();
              setDropTarget(stage.id);
            }}
            onDragLeave={() => setDropTarget((t) => (t === stage.id ? null : t))}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain");
              if (id) onDrop(stage.id, id);
            }}
          >
            {items.map((c) => (
              <CaseCard key={c.id} row={c} />
            ))}
            {items.length === 0 && (
              <p className="px-2 py-6 text-center text-[11.5px] font-medium text-ink-ghost">
                Empty
              </p>
            )}
          </Column>
        );
      })}
    </div>
  );
}

function Column({
  stage,
  count,
  isDropTarget,
  children,
  ...handlers
}: {
  stage: BoardStage;
  count: number;
  isDropTarget: boolean;
  children: React.ReactNode;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  return (
    <section
      {...handlers}
      className={cn(
        "flex w-[264px] shrink-0 flex-col rounded-xl border bg-paper-deep/40 transition-colors",
        isDropTarget
          ? "border-accent bg-accent-mist"
          : "border-line",
      )}
      aria-label={stage.name}
    >
      <header className="flex items-center justify-between gap-2 px-3 py-2.5">
        <h3 className="truncate text-[12.5px] font-bold tracking-[-0.1px] text-ink">
          {stage.name}
        </h3>
        <span className="shrink-0 rounded-full bg-surface px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-ink-mid">
          {count}
        </span>
      </header>
      <div className="flex min-h-[120px] flex-1 flex-col gap-2 px-2 pb-2">
        {children}
      </div>
    </section>
  );
}
