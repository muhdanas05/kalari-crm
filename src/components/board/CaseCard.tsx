"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { Tag } from "@/components/ui/Tag";
import { formatPaise } from "@/lib/money";
import { AlertTriangle, Users } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { CaseCard as CaseRow } from "@/lib/pipelines/stage-path";

/**
 * A draggable case card.
 *
 * The click-after-drop problem: a native drag fires a synthetic click on
 * release, which would navigate away the instant you drop a card. Track whether
 * a drag happened and swallow that one click.
 */
export function CaseCard({ row }: { row: CaseRow }) {
  const router = useRouter();
  const dragging = useRef(false);

  const pax = (row.pax_adults ?? 0) + (row.pax_children ?? 0);

  return (
    <article
      draggable
      onDragStart={(e) => {
        dragging.current = true;
        e.dataTransfer.setData("text/plain", row.id!);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={() => {
        // Clear on the next tick so the click handler below still sees it.
        setTimeout(() => (dragging.current = false), 0);
      }}
      onClick={() => {
        if (dragging.current) return;
        router.push(`/cases/${row.id}`);
      }}
      className={cn(
        "cursor-pointer rounded-lg border border-line bg-surface p-3 transition-shadow",
        "hover:border-accent/40 hover:shadow-floating active:cursor-grabbing",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="min-w-0 flex-1 truncate text-[13px] font-bold text-ink">
          {row.customer_name}
        </h4>
        {row.is_stuck && (
          <span
            title={`No movement in ${row.days_in_stage} days`}
            className="shrink-0"
          >
            <AlertTriangle size={13} className="text-alert" />
          </span>
        )}
      </div>

      <p className="mt-0.5 truncate text-[11.5px] font-medium text-ink-mid">
        {row.service_name ?? "No service yet"}
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {(row.outstanding_paise ?? 0) > 0 && (
          <Tag tone="warn">{formatPaise(row.outstanding_paise!)}</Tag>
        )}
        {pax > 1 && (
          <Tag tone="neutral" icon={Users}>
            {pax}
          </Tag>
        )}
      </div>

      <footer className="mt-2.5 flex items-center justify-end border-t border-line pt-2">
        <span className="shrink-0 font-mono text-[10.5px] text-ink-ghost">
          {row.days_in_stage}d
        </span>
      </footer>
    </article>
  );
}
