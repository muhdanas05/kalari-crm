"use client";

import { useState, useTransition } from "react";
import { useToast } from "./Toast";
import { cn } from "@/lib/utils";

/**
 * An optimistic toggle backed by a server action.
 *
 * Flips immediately, reverts on failure and says why. A switch that waits for a
 * Singapore round trip before moving feels broken; one that flips and silently
 * doesn't save is worse.
 */
export function Switch({
  checked,
  label,
  size = "md",
  onToggle,
}: {
  checked: boolean;
  label: string;
  size?: "sm" | "md";
  onToggle: (next: boolean) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const toast = useToast();
  const [on, setOn] = useState(checked);
  const [pending, start] = useTransition();

  const flip = () => {
    const next = !on;
    setOn(next);
    start(async () => {
      const res = await onToggle(next);
      if (!res.ok) {
        setOn(!next);
        toast(res.error, "error");
      }
    });
  };

  const sm = size === "sm";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={pending}
      onClick={flip}
      className={cn(
        "relative shrink-0 rounded-full transition-colors disabled:opacity-60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-mist focus-visible:ring-offset-2",
        sm ? "h-5 w-9" : "h-6 w-11",
        on ? "bg-accent" : "bg-line-strong",
      )}
    >
      <span
        className={cn(
          "absolute left-0.5 top-0.5 rounded-full bg-white shadow-sm transition-transform",
          sm ? "h-4 w-4" : "h-5 w-5",
          on && (sm ? "translate-x-4" : "translate-x-5"),
        )}
      />
    </button>
  );
}
