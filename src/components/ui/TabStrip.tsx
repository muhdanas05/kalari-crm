"use client";

import { cn } from "@/lib/utils";

export type Tab = {
  id: string;
  label: string;
  count?: number;
};

type Props = {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
};

export function TabStrip({ tabs, active, onChange }: Props) {
  return (
    <div className="border-b border-line overflow-x-auto">
      <div className="flex items-center gap-1 min-w-max">
        {tabs.map((t) => {
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className={cn(
                "relative h-11 px-4 text-[13px] font-semibold transition-colors flex items-center gap-1.5",
                isActive ? "text-accent" : "text-ink-mid hover:text-ink"
              )}
            >
              {t.label}
              {typeof t.count === "number" && (
                <span
                  className={cn(
                    "font-mono text-[10.5px] font-semibold px-1.5 py-0.5 rounded",
                    isActive
                      ? "bg-accent-mist text-accent"
                      : "bg-paper-deep text-ink-mid"
                  )}
                >
                  {t.count}
                </span>
              )}
              {isActive && (
                <span className="absolute bottom-0 left-2 right-2 h-[3px] bg-accent rounded-t" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
