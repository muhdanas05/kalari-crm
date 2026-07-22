"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "@/components/icons";
import { cn } from "@/lib/utils";

type Props = {
  /** ISO date string `YYYY-MM-DD` or empty string for unset. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Locale used for the trigger label + day-of-week strip. */
  locale?: string;
};

const WEEKDAYS_SHORT = ["M", "T", "W", "T", "F", "S", "S"];

function toIso(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromIso(s: string): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function sameYmd(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Modern date picker. Trigger reads as a styled pill, popover opens
 * beneath it with a month grid that lines up with the rest of the
 * brand tokens. Native <input type="date"> is intentionally avoided —
 * the OS picker looked anachronistic against the brand palette.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = "Select date",
  className,
  locale = "en-GB",
}: Props) {
  const selected = fromIso(value);
  const today = new Date();
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState<Date>(selected ?? new Date(today));
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const labelFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
    [locale]
  );
  const monthFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }),
    [locale]
  );

  // Build a 6-row × 7-col grid starting on Monday for the current cursor.
  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const dayOfWeek = (first.getDay() + 6) % 7; // 0=Mon
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - dayOfWeek);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      return d;
    });
  }, [cursor]);

  // Close on outside click + Esc.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Sync cursor to the selected value whenever the popover opens.
  useEffect(() => {
    if (open && selected) setCursor(selected);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const stepMonth = (delta: number) => {
    const next = new Date(cursor);
    next.setDate(1);
    next.setMonth(next.getMonth() + delta);
    setCursor(next);
  };

  const pick = (d: Date) => {
    onChange(toIso(d));
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className={cn("relative w-full", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-lg border bg-surface px-3 text-left text-[13px] font-medium text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-mist",
          open
            ? "border-accent-soft ring-2 ring-accent-mist"
            : "border-line hover:border-line-strong"
        )}
      >
        <span className={cn(!selected && "text-ink-faint")}>
          {selected ? labelFmt.format(selected) : placeholder}
        </span>
        <Calendar size={14} className="shrink-0 text-ink-mid" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose a date"
          className="absolute z-30 mt-2 w-[296px] rounded-2xl border border-line bg-surface p-3 shadow-floating"
        >
          {/* Month/year header */}
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => stepMonth(-1)}
              aria-label="Previous month"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-mid transition-colors hover:bg-paper-deep hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-mist"
            >
              <ChevronLeft size={16} />
            </button>
            <p className="text-[13px] font-bold tracking-[-0.1px] text-ink">
              {monthFmt.format(cursor)}
            </p>
            <button
              type="button"
              onClick={() => stepMonth(1)}
              aria-label="Next month"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-mid transition-colors hover:bg-paper-deep hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-mist"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Day-of-week strip */}
          <div className="grid grid-cols-7 gap-1 pb-1">
            {WEEKDAYS_SHORT.map((d, i) => (
              <span
                key={`${d}-${i}`}
                className="text-center font-mono text-[10px] font-semibold uppercase tracking-micro text-ink-faint"
              >
                {d}
              </span>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d) => {
              const isOtherMonth = d.getMonth() !== cursor.getMonth();
              const isToday = sameYmd(d, today);
              const isSelected = selected ? sameYmd(d, selected) : false;
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  onClick={() => pick(d)}
                  aria-current={isToday ? "date" : undefined}
                  className={cn(
                    "h-9 rounded-lg text-center text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-mist",
                    isSelected
                      ? "bg-accent text-white shadow-sm hover:bg-accent-deep"
                      : isToday
                      ? "bg-accent-mist text-accent-deep hover:bg-accent-pale"
                      : isOtherMonth
                      ? "text-ink-faint/70 hover:bg-paper-deep/60 hover:text-ink"
                      : "text-ink hover:bg-paper-deep"
                  )}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="rounded-md px-2 py-1 font-mono text-[10.5px] font-semibold uppercase tracking-micro text-ink-mid transition-colors hover:bg-paper-deep hover:text-ink"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => pick(today)}
              className="rounded-md bg-accent-mist px-3 py-1 font-mono text-[10.5px] font-semibold uppercase tracking-micro text-accent-deep transition-colors hover:bg-accent-pale"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
