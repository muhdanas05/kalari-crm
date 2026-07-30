"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Plus, Pencil } from "@/components/icons";
import { formatPaiseBare, parseInrToPaise } from "@/lib/money";
import { saveRule, type RuleInput } from "./actions";
import type { Rule } from "@/lib/pricing/engine";

type Form = {
  id?: string;
  label: string;
  rate: string;
  qtyRule: RuleInput["qtyRule"];
  sortOrder: number;
};

function blankForm(rule: Rule | undefined, nextOrder: number): Form {
  return {
    id: rule?.id,
    label: rule?.label ?? "",
    rate: rule ? formatPaiseBare(rule.rate_paise) : "",
    qtyRule: rule?.qty_rule ?? "once",
    sortOrder: rule?.sort_order ?? nextOrder,
  };
}

export function RuleFormModal({
  serviceId,
  rule,
  nextOrder,
}: {
  serviceId: string;
  rule?: Rule;
  nextOrder: number;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [form, setForm] = useState<Form>(() => blankForm(rule, nextOrder));
  const [error, setError] = useState<string | null>(null);

  const openForm = () => {
    setForm(blankForm(rule, nextOrder));
    setError(null);
    setOpen(true);
  };

  const submit = () => {
    if (!form.label.trim()) {
      setError("The line needs a description.");
      return;
    }
    // parseInrToPaise refuses rather than guesses (§3.2) — an unparseable rate
    // must never become a silent zero on an invoice.
    const paise = parseInrToPaise(form.rate);
    if (paise === null || paise < 0) {
      setError("Enter the rate as a plain amount, e.g. 1500 or 1500.50");
      return;
    }
    setError(null);
    start(async () => {
      const res = await saveRule({
        id: form.id,
        serviceId,
        label: form.label.trim(),
        ratePaise: paise,
        qtyRule: form.qtyRule,
        sortOrder: form.sortOrder,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast(rule ? "Line updated." : "Line added.", "ok");
      setOpen(false);
    });
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        icon={rule ? Pencil : Plus}
        onClick={openForm}
      >
        {rule ? "Edit" : "Add line"}
      </Button>

      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title={rule ? "Edit line" : "Add a line"}
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={submit} disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Description">
            <input
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              autoFocus
              placeholder="e.g. Visa Processing Fee"
              className={inputClass}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Rate (₹)">
              <input
                value={form.rate}
                onChange={(e) => setForm({ ...form, rate: e.target.value })}
                inputMode="decimal"
                placeholder="1500.00"
                className={`${inputClass} font-mono`}
              />
            </Field>
            <Field label="Order">
              <input
                type="number"
                min={1}
                value={form.sortOrder}
                onChange={(e) =>
                  setForm({ ...form, sortOrder: Math.max(1, Number(e.target.value) || 1) })
                }
                className={`${inputClass} font-mono`}
              />
            </Field>
          </div>

          <Field label="Charged">
            <Select
              value={form.qtyRule}
              onChange={(v) => setForm({ ...form, qtyRule: v as RuleInput["qtyRule"] })}
              ariaLabel="How this line is charged"
              options={[
                { value: "once", label: "Once", hint: "A flat fee per invoice" },
                {
                  value: "once_per_file",
                  label: "Once per booking",
                  hint: "One file, any party size",
                },
                {
                  value: "per_person",
                  label: "Per person",
                  hint: "Multiplied by travellers",
                },
              ]}
            />
          </Field>

          {error && (
            <p
              role="alert"
              className="rounded-lg bg-alert-pale px-3 py-2 text-[12px] font-medium text-alert"
            >
              {error}
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}

const inputClass =
  "h-10 w-full rounded-lg border border-line bg-paper px-3 text-[13px] font-medium text-ink outline-none placeholder:text-ink-ghost focus:border-accent focus:bg-surface";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-[1px] text-ink-mid">{label}</span>
      {children}
    </label>
  );
}
