"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "@/components/icons";
import { cn } from "@/lib/utils";

type Props = {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  onChange: (startDate: string, endDate: string) => void;
  className?: string;
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

export function DateRangePicker({
  startDate,
  endDate,
  onChange,
  className,
  locale = "en-GB",
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Parse current values
  const start = useMemo(() => fromIso(startDate), [startDate]);
  const end = useMemo(() => fromIso(endDate), [endDate]);

  // Calendar navigation state (focuses on start date or today)
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState<Date>(start ?? today);

  // Temporary selection state during popover interaction
  const [tmpStart, setTmpStart] = useState<Date | null>(start);
  const [tmpEnd, setTmpEnd] = useState<Date | null>(end);
  const [activePreset, setActivePreset] = useState<string>("Last 6 Months");

  // Sync temp state when values change externally or when popover opens
  useEffect(() => {
    setTmpStart(start);
    setTmpEnd(end);
    if (start) {
      setCursor(start);
    }
  }, [start, end, open]);

  // Formatter for trigger label and month header
  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric" }),
    [locale]
  );
  const monthFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }),
    [locale]
  );

  // Preset definitions
  const presets = useMemo(
    () => [
      {
        label: "Last 30 Days",
        getRange: () => {
          const e = new Date("2026-06-05"); // Stable demo anchor
          const s = new Date(e);
          s.setDate(e.getDate() - 30);
          return { start: s, end: e };
        },
      },
      {
        label: "Last 3 Months",
        getRange: () => {
          const e = new Date("2026-06-05");
          const s = new Date(e);
          s.setMonth(e.getMonth() - 3);
          return { start: s, end: e };
        },
      },
      {
        label: "Last 6 Months",
        getRange: () => {
          const e = new Date("2026-06-05");
          const s = new Date(e);
          s.setMonth(e.getMonth() - 6);
          return { start: s, end: e };
        },
      },
      {
        label: "Year to Date",
        getRange: () => {
          const e = new Date("2026-06-05");
          const s = new Date(e.getFullYear(), 0, 1);
          return { start: s, end: e };
        },
      },
      {
        label: "Custom Range",
        getRange: () => null,
      },
    ],
    []
  );

  // Check which preset matches current dates
  useEffect(() => {
    if (!start || !end) {
      setActivePreset("Custom Range");
      return;
    }
    const matching = presets.find((p) => {
      const range = p.getRange();
      if (!range) return false;
      return sameYmd(start, range.start) && sameYmd(end, range.end);
    });
    setActivePreset(matching ? matching.label : "Custom Range");
  }, [start, end, presets]);

  // Close on click outside & escape key
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
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

  // Build a 6-row calendar grid for the cursor month
  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const dayOfWeek = (first.getDay() + 6) % 7; // Monday = 0
    const startGrid = new Date(first);
    startGrid.setDate(first.getDate() - dayOfWeek);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(startGrid);
      d.setDate(startGrid.getDate() + i);
      return d;
    });
  }, [cursor]);

  const stepMonth = (delta: number) => {
    const next = new Date(cursor);
    next.setDate(1);
    next.setMonth(next.getMonth() + delta);
    setCursor(next);
  };

  const handlePresetClick = (label: string, getRange: () => { start: Date; end: Date } | null) => {
    const range = getRange();
    if (range) {
      setTmpStart(range.start);
      setTmpEnd(range.end);
      setCursor(range.start);
      // Automatically apply presets for convenience
      onChange(toIso(range.start), toIso(range.end));
      setOpen(false);
    } else {
      setActivePreset("Custom Range");
    }
  };

  const handleCellClick = (d: Date) => {
    setActivePreset("Custom Range");
    if (!tmpStart || (tmpStart && tmpEnd)) {
      // First click: set start date, reset end date
      setTmpStart(d);
      setTmpEnd(null);
    } else {
      // Second click: set end date
      if (d < tmpStart) {
        // If clicked date is before start date, make it the new start date
        setTmpStart(d);
      } else {
        setTmpEnd(d);
      }
    }
  };

  const handleApply = () => {
    if (tmpStart && tmpEnd) {
      onChange(toIso(tmpStart), toIso(tmpEnd));
      setOpen(false);
    }
  };

  const handleClear = () => {
    setTmpStart(null);
    setTmpEnd(null);
    onChange("", "");
    setOpen(false);
  };

  // Trigger label formatting
  const triggerLabel = useMemo(() => {
    if (start && end) {
      return `${dateFmt.format(start)} – ${dateFmt.format(end)}`;
    }
    if (start) return `From ${dateFmt.format(start)}`;
    if (end) return `Until ${dateFmt.format(end)}`;
    return "Select date range";
  }, [start, end, dateFmt]);

  return (
    <div ref={wrapperRef} className={cn("relative z-20", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-full border bg-surface px-4 text-left text-[12.5px] font-semibold text-ink transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-mist",
          open
            ? "border-accent-soft ring-2 ring-accent-mist shadow-sm"
            : "border-line hover:border-line-strong hover:bg-paper-deep/40"
        )}
      >
        <Calendar size={13} className="text-ink-mid" />
        <span>{triggerLabel}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose date range"
          className="absolute right-0 mt-2 flex w-[480px] overflow-hidden rounded-xl border border-line bg-surface shadow-floating sm:w-[500px]"
        >
          {/* Presets Sidebar */}
          <div className="w-[150px] border-r border-line bg-paper-deep/30 p-2.5 flex flex-col gap-1 shrink-0">
            <p className="px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-micro text-ink-faint">
              Presets
            </p>
            {presets.map((p) => {
              const active = activePreset === p.label;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => handlePresetClick(p.label, p.getRange)}
                  className={cn(
                    "w-full rounded-lg px-2.5 py-1.5 text-left text-[12px] font-semibold transition-colors",
                    active
                      ? "bg-accent-mist text-accent-deep"
                      : "text-ink-soft hover:bg-paper-deep hover:text-ink"
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Calendar Body */}
          <div className="flex-1 p-3.5 flex flex-col">
            {/* Header */}
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => stepMonth(-1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-mid transition-colors hover:bg-paper-deep hover:text-ink"
              >
                <ChevronLeft size={15} />
              </button>
              <p className="text-[13px] font-bold text-ink">
                {monthFmt.format(cursor)}
              </p>
              <button
                type="button"
                onClick={() => stepMonth(1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-mid transition-colors hover:bg-paper-deep hover:text-ink"
              >
                <ChevronRight size={15} />
              </button>
            </div>

            {/* Weekdays */}
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

            {/* Calendar Cells */}
            <div className="grid grid-cols-7 gap-1">
              {cells.map((d) => {
                const isOtherMonth = d.getMonth() !== cursor.getMonth();
                const isToday = sameYmd(d, today);
                
                const isStart = tmpStart ? sameYmd(d, tmpStart) : false;
                const isEnd = tmpEnd ? sameYmd(d, tmpEnd) : false;
                const inRange =
                  tmpStart && tmpEnd && d > tmpStart && d < tmpEnd;

                return (
                  <button
                    key={d.toISOString()}
                    type="button"
                    onClick={() => handleCellClick(d)}
                    className={cn(
                      "relative h-8 w-full text-center text-[12px] font-semibold transition-all focus-visible:outline-none",
                      isStart || isEnd
                        ? "rounded-lg bg-accent text-white shadow-sm"
                        : inRange
                        ? "bg-accent-mist/70 text-accent-deep hover:bg-accent-pale"
                        : isToday
                        ? "rounded-lg bg-accent-mist/35 text-accent-deep hover:bg-accent-pale"
                        : isOtherMonth
                        ? "text-ink-faint/60 hover:bg-paper-deep/50 hover:text-ink"
                        : "rounded-lg text-ink hover:bg-paper-deep"
                    )}
                  >
                    {d.getDate()}
                    {isToday && !isStart && !isEnd && !inRange && (
                      <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-accent" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Actions Footer */}
            <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
              <button
                type="button"
                onClick={handleClear}
                className="rounded-lg px-2.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-micro text-ink-mid transition-colors hover:bg-paper-deep hover:text-ink"
              >
                Clear
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-micro text-ink-soft transition-colors hover:bg-paper-deep"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={!tmpStart || !tmpEnd}
                  className="rounded-lg bg-accent px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-micro text-white shadow-sm transition-colors hover:bg-accent-deep disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
