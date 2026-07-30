"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Plus, AlertTriangle } from "@/components/icons";
import { todayKolkata } from "@/lib/dates";
import { createCall } from "./assign-actions";
import type { Database } from "@/lib/supabase/database.types";

type Priority = Database["public"]["Enums"]["call_priority"];

export function NewCallButton({
  customers,
  people,
  canAssign,
}: {
  customers: { id: string; name: string; phone: string }[];
  people: { id: string; name: string }[];
  canAssign: boolean;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [customerId, setCustomerId] = useState("");
  const [context, setContext] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [dueOn, setDueOn] = useState(todayKolkata());
  const [assignTo, setAssignTo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!customerId) return setError("Choose a customer.");
    if (!context.trim()) return setError("Say why they need calling.");
    setError(null);

    start(async () => {
      const res = await createCall({
        customerId,
        context,
        priority,
        dueOn,
        assignTo: assignTo || undefined,
      });
      if (!res.ok) return setError(res.error);
      toast("Added to the call list.", "ok");
      setOpen(false);
      setContext("");
      setCustomerId("");
    });
  };

  return (
    <>
      <Button variant="secondary" size="sm" icon={Plus} onClick={() => setOpen(true)}>
        Add a call
      </Button>

      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title="Add a call"
        description="For anything the system hasn't spotted on its own."
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={submit} disabled={pending}>
              {pending ? "Adding…" : "Add"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Customer">
            <Select
              value={customerId}
              onChange={setCustomerId}
              ariaLabel="Customer"
              options={customers.map((c) => ({
                value: c.id,
                label: c.name,
                hint: c.phone,
              }))}
            />
          </Field>

          {/* This becomes context_line — the one line someone reads before
              dialling. Prompt for the specifics, or you get "follow up". */}
          <Field label="Why are we calling?">
            <input
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="e.g. Needs to resend passport copy — the scan was cut off"
              className="h-10 w-full rounded-lg border border-line bg-paper px-3 text-[13px] text-ink outline-none placeholder:text-ink-ghost focus:border-accent focus:bg-surface"
            />
          </Field>

          <div className="flex gap-3">
            <Field label="Priority">
              <div className="flex gap-1.5">
                {(["high", "medium", "low"] as Priority[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    aria-pressed={priority === p}
                    className={`h-9 flex-1 rounded-lg border text-[12px] font-semibold capitalize transition-colors ${
                      priority === p
                        ? "border-accent bg-accent text-white"
                        : "border-line bg-surface text-ink-mid hover:border-line-strong"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Due">
              <input
                type="date"
                value={dueOn}
                onChange={(e) => setDueOn(e.target.value)}
                className="h-9 w-full rounded-lg border border-line bg-paper px-3 font-mono text-[12.5px] text-ink outline-none focus:border-accent focus:bg-surface"
              />
            </Field>
          </div>

          {canAssign && (
            <Field label="Assign to">
              <Select
                value={assignTo}
                onChange={setAssignTo}
                ariaLabel="Assign to"
                options={[
                  { value: "", label: "Me" },
                  ...people.map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
            </Field>
          )}

          {error && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg bg-alert-pale px-3 py-2 text-[12px] font-medium text-alert"
            >
              <AlertTriangle size={13} className="mt-px shrink-0" />
              {error}
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-1 flex-col gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-[1px] text-ink-mid">
        {label}
      </span>
      {children}
    </label>
  );
}
