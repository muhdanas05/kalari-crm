"use client";

import { useEffect, useRef } from "react";
import { type LucideIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

export type Tab = {
  id: string;
  label: string;
  count?: number;
  icon?: LucideIcon;
};

type Props = {
  tabs: Tab[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
};

/**
 * Primary in-page navigation (customer detail, future job/settings sub-nav).
 * Active tab = ink text + a 2px TRE-blue underline; inactive = ink-mid that
 * darkens on hover. Horizontally scrollable on overflow with a soft right-edge
 * fade; the active tab scrolls itself into view. Modelled on the customer-detail
 * tabs (the cleanest existing example), with the count badge keyed to the
 * active state and tinted with the brand accent.
 */
export function TabBar({ tabs, activeId, onChange, className }: Props) {
  const activeRef = useRef<HTMLButtonElement>(null);

  // Keep the selected tab visible when the row scrolls.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId]);

  return (
    <div className={cn("relative", className)}>
      <div
        role="tablist"
        className="flex gap-6 overflow-x-auto border-b border-line scrollbar-none"
      >
        {tabs.map((t) => {
          const active = t.id === activeId;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              ref={active ? activeRef : undefined}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(t.id)}
              className={cn(
                "relative inline-flex items-center gap-1.5 whitespace-nowrap pb-3 pt-2 text-[14px] transition-colors",
                active
                  ? "font-semibold text-ink"
                  : "font-medium text-ink-mid hover:text-ink"
              )}
            >
              {Icon && <Icon size={15} strokeWidth={active ? 2.5 : 2} />}
              {t.label}
              {typeof t.count === "number" && (
                <span
                  className={cn(
                    "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 font-mono text-[11px] font-semibold",
                    active
                      ? "bg-accent text-white"
                      : "bg-paper-deep text-ink-mid"
                  )}
                >
                  {t.count}
                </span>
              )}
              {active && (
                <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent" />
              )}
            </button>
          );
        })}
      </div>
      {/* Soft right-edge fade hinting horizontal scroll on overflow. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-surface to-transparent"
      />
    </div>
  );
}
