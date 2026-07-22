"use client";

import { cn } from "@/lib/utils";

export type Segment = {
  id: string;
  label: string;
};

type Props = {
  segments: Segment[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
  "aria-label"?: string;
};

/**
 * Equal-weight 2–3-way toggle (grid/list view, asc/desc, day/week/month) where
 * no option is the "primary". Container is a paper-deep well with a hairline
 * border; the active segment lifts to a white surface with a soft shadow.
 *
 * Controlled (value/onChange). For router-driven nav use the page's own links —
 * this is for local view state.
 */
export function SegmentedControl({
  segments,
  activeId,
  onChange,
  className,
  "aria-label": ariaLabel,
}: Props) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-line bg-paper-deep p-0.5",
        className
      )}
    >
      {segments.map((s) => {
        const active = s.id === activeId;
        return (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(s.id)}
            className={cn(
              "inline-flex items-center justify-center rounded-[7px] px-3 py-1.5 text-[13px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-mist",
              active
                ? "bg-surface text-ink shadow-sm"
                : "text-ink-mid hover:text-ink"
            )}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
