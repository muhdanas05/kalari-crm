"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Check } from "@/components/icons";
import { cn } from "@/lib/utils";

export type SelectOption = {
  value: string;
  label: string;
  /** Second line, for context the label alone can't carry. */
  hint?: string;
  disabled?: boolean;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Announced to screen readers when there is no visible <label>. */
  ariaLabel?: string;
};

/**
 * A styled dropdown.
 *
 * The native <select> popup is drawn by the operating system — no stylesheet
 * on any website can touch it, which is why every dropdown in this app looked
 * unstyled the moment it opened. This is the standard answer: a button plus a
 * listbox we own and can therefore theme.
 *
 * What it keeps from the native control, because losing these would be a
 * downgrade dressed up as a design win:
 *   • full keyboard control — arrows, Home/End, Enter, Escape, Tab
 *   • type-ahead: press "h" and it jumps to Haj, exactly like a real select
 *   • correct ARIA (combobox + listbox + aria-activedescendant)
 *   • click-outside and Escape both close it
 */
export function Select({
  value,
  onChange,
  options,
  placeholder = "Choose…",
  disabled,
  className,
  ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef({ buffer: "", at: 0 });
  const id = useId();

  const selectedIdx = options.findIndex((o) => o.value === value);
  const selected = selectedIdx >= 0 ? options[selectedIdx] : null;

  // Open where the selection already is, not at the top of the list.
  const openList = () => {
    if (disabled) return;
    setActive(selectedIdx >= 0 ? selectedIdx : 0);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  // Keep the highlighted row in view when arrowing through a long list.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`[data-idx="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const commit = (idx: number) => {
    const opt = options[idx];
    if (!opt || opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
  };

  const step = (delta: number) => {
    if (options.length === 0) return;
    let next = active;
    // Skip disabled rows rather than landing on something unselectable.
    for (let i = 0; i < options.length; i++) {
      next = (next + delta + options.length) % options.length;
      if (!options[next].disabled) break;
    }
    setActive(next);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }

    switch (e.key) {
      case "Escape":
        e.preventDefault();
        setOpen(false);
        return;
      case "Tab":
        setOpen(false);
        return;
      case "ArrowDown":
        e.preventDefault();
        step(1);
        return;
      case "ArrowUp":
        e.preventDefault();
        step(-1);
        return;
      case "Home":
        e.preventDefault();
        setActive(0);
        return;
      case "End":
        e.preventDefault();
        setActive(options.length - 1);
        return;
      case "Enter":
      case " ":
        e.preventDefault();
        commit(active);
        return;
    }

    // Type-ahead. A run of letters typed quickly searches as one string, so
    // "ho" finds Hotel rather than stopping at Haj.
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const now = Date.now();
      const t = typeahead.current;
      t.buffer = now - t.at > 700 ? e.key : t.buffer + e.key;
      t.at = now;
      const q = t.buffer.toLowerCase();
      const hit = options.findIndex(
        (o) => !o.disabled && o.label.toLowerCase().startsWith(q),
      );
      if (hit >= 0) setActive(hit);
    }
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={`${id}-list`}
        aria-label={ariaLabel}
        aria-activedescendant={open ? `${id}-opt-${active}` : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-lg border bg-paper px-3 text-left text-[13px] font-medium outline-none transition-colors",
          "focus-visible:border-accent focus-visible:bg-surface focus-visible:ring-2 focus-visible:ring-accent-mist",
          open ? "border-accent bg-surface" : "border-line hover:border-line-strong",
          disabled && "cursor-not-allowed opacity-60",
          selected ? "text-ink" : "text-ink-faint",
        )}
      >
        <span className="min-w-0 truncate">{selected?.label ?? placeholder}</span>
        <ChevronDown
          size={15}
          className={cn(
            "shrink-0 text-ink-faint transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={`${id}-list`}
          role="listbox"
          tabIndex={-1}
          className="animate-modal-in absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-[260px] overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-floating"
        >
          {options.length === 0 ? (
            <li className="px-3 py-2.5 text-[12.5px] font-medium text-ink-faint">
              Nothing to choose from yet.
            </li>
          ) : (
            options.map((opt, i) => {
              const isSelected = opt.value === value;
              return (
                <li key={opt.value || `blank-${i}`}>
                  <button
                    type="button"
                    role="option"
                    id={`${id}-opt-${i}`}
                    data-idx={i}
                    aria-selected={isSelected}
                    disabled={opt.disabled}
                    onMouseEnter={() => !opt.disabled && setActive(i)}
                    onClick={() => commit(i)}
                    className={cn(
                      "flex w-full items-start gap-2 px-3 py-2 text-left transition-colors",
                      opt.disabled
                        ? "cursor-not-allowed text-ink-ghost"
                        : i === active
                          ? "bg-accent-mist text-ink"
                          : "text-ink-soft",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-[13px]",
                          isSelected ? "font-bold text-ink" : "font-medium",
                        )}
                      >
                        {opt.label}
                      </span>
                      {opt.hint && (
                        <span className="mt-0.5 block truncate text-[11.5px] font-medium text-ink-faint">
                          {opt.hint}
                        </span>
                      )}
                    </span>
                    {isSelected && (
                      <Check size={14} className="mt-0.5 shrink-0 text-accent" />
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
