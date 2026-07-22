"use client";

import { cn } from "@/lib/utils";

export type FilterPill = {
  id: string;
  label: string;
  count?: number;
  /** Optional colour class for a leading status dot (chip variant). */
  dot?: string;
};

type Variant = "default" | "time-range" | "chip";

type Props = {
  pills: FilterPill[];
  activeId: string;
  onChange: (id: string) => void;
  variant?: Variant;
  className?: string;
  /** Accessible label for the group. */
  "aria-label"?: string;
};

/**
 * List-refinement pills, unified across Inbox / Tasks / Invoices / Tickets /
 * Warranties / etc.
 *
 * - `default` — rounded-full pills. Active = ink fill + white text (the colour
 *   every existing instance already used); inactive = hairline-outlined, ink-mid,
 *   filling to a faint warm tint on hover.
 * - `chip` — `default` plus an optional leading status `dot`.
 * - `time-range` — compact segmented control inside one pill-shaped container
 *   (3M/6M/1Y/All); active segment gets a white surface + soft shadow.
 *
 * Inline counts render in mono; muted when inactive, translucent-white when active.
 */
export function FilterPills({
  pills,
  activeId,
  onChange,
  variant = "default",
  className,
  "aria-label": ariaLabel,
}: Props) {
  if (variant === "time-range") {
    return (
      <div
        role="tablist"
        aria-label={ariaLabel}
        className={cn(
          "inline-flex items-center gap-0.5 rounded-full border border-line bg-paper-deep/40 p-0.5",
          className
        )}
      >
        {pills.map((p) => {
          const active = p.id === activeId;
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(p.id)}
              className={cn(
                "inline-flex h-7 min-w-[40px] items-center justify-center rounded-full px-2.5 font-mono text-[11px] font-semibold uppercase tracking-micro transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-mist",
                active
                  ? "bg-surface text-ink shadow-sm"
                  : "text-ink-mid hover:text-ink"
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      {pills.map((p) => {
        const active = p.id === activeId;
        return (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(p.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-mist",
              active
                ? "bg-ink text-white"
                : "border border-line text-ink-mid hover:bg-paper-deep/60 hover:text-ink"
            )}
          >
            {variant === "chip" && p.dot && (
              <span className={cn("h-1.5 w-1.5 rounded-full", p.dot)} />
            )}
            {p.label}
            {typeof p.count === "number" && (
              <span
                className={cn(
                  "font-mono text-[11px] font-semibold",
                  active ? "text-white/70" : "text-ink-faint"
                )}
              >
                {p.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
