"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/ui/Toast";
import { assignCall } from "./assign-actions";

/**
 * Reassign a call. Admin-only — the RPC refuses anyone else, and this only
 * renders for admins so nobody is offered a control that will reject them.
 *
 * A plain select rather than a menu: it is one decision from a short list, and
 * an admin triaging twenty tasks wants it to take one click.
 */
export function AssignCall({
  taskId,
  current,
  people,
}: {
  taskId: string;
  current: string | null;
  people: { id: string; name: string }[];
}) {
  const toast = useToast();
  const [value, setValue] = useState(current ?? "");
  const [pending, start] = useTransition();

  const change = (next: string) => {
    if (!next || next === value) return;
    const previous = value;
    setValue(next); // optimistic
    start(async () => {
      const res = await assignCall(taskId, next);
      if (!res.ok) {
        setValue(previous);
        toast(res.error, "error");
      } else {
        toast(
          `Reassigned to ${people.find((p) => p.id === next)?.name ?? "them"}.`,
          "ok",
        );
      }
    });
  };

  return (
    <select
      value={value}
      disabled={pending}
      onChange={(e) => change(e.target.value)}
      aria-label="Assign this call to"
      className="h-7 shrink-0 rounded-md border border-line bg-surface px-2 text-[11px] font-medium text-ink-mid outline-none transition-colors hover:border-line-strong focus:border-accent disabled:opacity-60"
    >
      <option value="">Unassigned</option>
      {people.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
