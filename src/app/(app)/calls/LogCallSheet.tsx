"use client";

import { useEffect, useState, useTransition } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { todayKolkata, addDays } from "@/lib/dates";
import { AlertTriangle } from "@/components/icons";
import { logCall } from "./actions";
import type { CallTask, CallOutcome } from "@/lib/calls/display";
import { cn } from "@/lib/utils";

/**
 * §6: "Log Call — bottom sheet; didn't-reach = one tap."
 *
 * Taken literally. The four didn't-reach outcomes submit immediately on tap:
 * they need no extra input, they are the overwhelming majority of calls, and an
 * employee doing thirty of these an hour should never touch a second control.
 * Only the outcomes that genuinely capture a date open a second step.
 */

const ONE_TAP: { outcome: CallOutcome; label: string }[] = [
  { outcome: "no_answer", label: "No answer" },
  { outcome: "busy", label: "Busy" },
  { outcome: "switched_off", label: "Switched off" },
  { outcome: "wrong_number", label: "Wrong number" },
];

const NEEDS_MORE: { outcome: CallOutcome; label: string; hint: string }[] = [
  { outcome: "reached_resolved", label: "Reached — resolved", hint: "" },
  {
    outcome: "promised_payment",
    label: "Promised payment",
    hint: "We'll remind you on that date, and close it automatically if the money lands first.",
  },
  { outcome: "needs_callback", label: "Needs callback", hint: "" },
  { outcome: "refused", label: "Refused", hint: "" },
];

export function LogCallSheet({
  task,
  onClose,
}: {
  task: CallTask | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<CallOutcome | null>(null);
  const [date, setDate] = useState(addDays(todayKolkata(), 3));
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (task) {
      setStep(null);
      setNotes("");
      setError(null);
      setDate(addDays(todayKolkata(), 3));
    }
  }, [task]);

  if (!task) return null;

  const submit = (outcome: CallOutcome, extra?: { date?: string }) => {
    startTransition(async () => {
      const res = await logCall({
        taskId: task.id!,
        outcome,
        notes,
        promisedOn: outcome === "promised_payment" ? extra?.date : undefined,
        callbackOn: outcome === "needs_callback" ? extra?.date : undefined,
      });

      if (!res.ok) {
        setError(res.error);
        return;
      }

      // Report what the DATABASE decided, not what we hoped. The requeue rules
      // live in log_call(), so this is the only honest source for the message.
      toast(
        res.status === "escalated"
          ? "Three attempts made — escalated to the admin, and this task will stop asking."
          : res.status === "open"
            ? `Requeued for ${res.nextDueOn}.`
            : "Logged.",
        "ok",
      );
      onClose();
    });
  };

  const needsDate = step === "promised_payment" || step === "needs_callback";

  return (
    <Sheet open={!!task} onClose={onClose} title={`Log call — ${task.customer_name}`}>
      <div className="flex flex-col gap-4 pb-2">
        <p className="text-[12.5px] font-medium text-ink-mid">
          {task.context_line}
        </p>

        {!step ? (
          <>
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[1px] text-ink-mid">
                Didn't reach them
              </p>
              <div className="grid grid-cols-2 gap-2">
                {ONE_TAP.map((o) => (
                  <button
                    key={o.outcome}
                    disabled={pending}
                    onClick={() => submit(o.outcome)}
                    className="h-12 rounded-xl border border-line bg-surface text-[13px] font-semibold text-ink-soft transition-colors hover:border-accent hover:text-ink active:scale-[0.98] disabled:opacity-50"
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[1px] text-ink-mid">
                Spoke to them
              </p>
              <div className="flex flex-col gap-2">
                {NEEDS_MORE.map((o) => (
                  <button
                    key={o.outcome}
                    disabled={pending}
                    onClick={() =>
                      o.outcome === "reached_resolved" || o.outcome === "refused"
                        ? submit(o.outcome)
                        : setStep(o.outcome)
                    }
                    className="h-12 rounded-xl border border-line bg-surface px-4 text-left text-[13px] font-semibold text-ink transition-colors hover:border-accent active:scale-[0.99] disabled:opacity-50"
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-[13px] font-bold text-ink">
              {NEEDS_MORE.find((o) => o.outcome === step)?.label}
            </p>

            {needsDate && (
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[1px] text-ink-mid">
                  {step === "promised_payment" ? "Promised for" : "Call back on"}
                </span>
                <input
                  type="date"
                  value={date}
                  min={todayKolkata()}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-11 rounded-xl border border-line bg-paper px-3 font-mono text-[14px] text-ink outline-none focus:border-accent focus:bg-surface"
                />
                <span className="text-[11px] text-ink-faint">
                  {NEEDS_MORE.find((o) => o.outcome === step)?.hint}
                </span>
              </label>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setStep(null)}
                disabled={pending}
                className="h-11 flex-1 rounded-xl border border-line text-[13px] font-semibold text-ink-mid"
              >
                Back
              </button>
              <button
                onClick={() => submit(step, { date })}
                disabled={pending}
                className="h-11 flex-[2] rounded-xl bg-accent text-[13px] font-semibold text-white disabled:opacity-60"
              >
                {pending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[1px] text-ink-mid">
            Notes (optional)
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="What was said"
            className="rounded-xl border border-line bg-paper px-3 py-2 text-[13px] text-ink outline-none placeholder:text-ink-ghost focus:border-accent focus:bg-surface"
          />
        </label>

        {error && (
          <p
            role="alert"
            className={cn(
              "flex items-start gap-2 rounded-lg bg-alert-pale px-3 py-2.5",
              "text-[12px] font-medium text-alert",
            )}
          >
            <AlertTriangle size={13} className="mt-px shrink-0" />
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
