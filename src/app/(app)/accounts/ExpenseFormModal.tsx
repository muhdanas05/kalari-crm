"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Plus, Pencil } from "@/components/icons";
import { parseInrToPaise } from "@/lib/money";
import { saveExpense, type ExpenseInput } from "./actions";
import type { PaymentMethod } from "@/lib/db/accounts";

/** Suggestions only — category is free text, the owner's book is his own. */
const CATEGORIES = [
  "Supplier payment",
  "Office rent",
  "Salaries",
  "Utilities",
  "Travel",
  "Marketing",
  "Misc",
];

const METHODS: PaymentMethod[] = ["cash", "transfer", "cheque"];

type Form = Omit<ExpenseInput, "amountPaise"> & { amount: string };

function blankForm(today: string): Form {
  return {
    spentOn: today,
    category: "",
    amount: "",
    method: "cash",
    supplierId: "",
    description: "",
    notes: "",
  };
}

/** The subset of an expense row this form can edit. */
export type EditableExpense = {
  id: string;
  spent_on: string;
  category: string;
  amount_paise: number;
  method: PaymentMethod;
  supplier_id: string | null;
  description: string | null;
  notes: string | null;
};

function formFor(e: EditableExpense): Form {
  return {
    id: e.id,
    spentOn: e.spent_on,
    category: e.category,
    // Plain rupees, no thousands separators — parseInrToPaise round-trips it.
    amount: (e.amount_paise / 100).toFixed(2),
    method: e.method,
    supplierId: e.supplier_id ?? "",
    description: e.description ?? "",
    notes: e.notes ?? "",
  };
}

/**
 * Add OR edit. saveExpense() has always branched on `input.id`, but nothing
 * ever passed one — an expense was record-only, so a ₹50,000 typo for ₹5,000
 * was permanent in the P&L. `expense` supplies that id.
 */
export function ExpenseFormModal({
  today,
  suppliers,
  expense,
}: {
  today: string;
  suppliers: { id: string; name: string }[];
  expense?: EditableExpense;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [form, setForm] = useState<Form>(() =>
    expense ? formFor(expense) : blankForm(today),
  );
  const [error, setError] = useState<string | null>(null);
  const editing = !!expense;

  // Reset on every open — otherwise a cancelled half-typed expense is sitting
  // there next time, and the wrong amount silently becomes the default.
  const openForm = () => {
    setForm(expense ? formFor(expense) : blankForm(today));
    setError(null);
    setOpen(true);
  };

  const submit = () => {
    if (!form.category.trim()) {
      setError("Category is required.");
      return;
    }
    const amountPaise = parseInrToPaise(form.amount);
    if (amountPaise === null || amountPaise <= 0) {
      setError("Enter an amount like 1250 or 1250.50.");
      return;
    }
    setError(null);
    start(async () => {
      try {
        const { amount: _amount, ...rest } = form;
        const res = await saveExpense({ ...rest, amountPaise });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        toast(editing ? "Expense updated." : "Expense recorded.", "ok");
        setOpen(false);
      } catch {
        // A thrown Server Action call — e.g. a build changed under an open tab —
        // otherwise leaves the button stuck on "Saving…" forever with no way out.
        setError("Couldn't reach the server. Refresh the page and try again.");
      }
    });
  };

  return (
    <>
      {editing ? (
        <Button variant="ghost" size="sm" icon={Pencil} onClick={openForm}>
          Edit
        </Button>
      ) : (
        <Button variant="primary" size="sm" icon={Plus} onClick={openForm}>
          Add expense
        </Button>
      )}

      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title={editing ? "Edit expense" : "Add expense"}
        description="Money out. Shows in the account book against the day it was spent."
        size="md"
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Date">
            <input
              type="date"
              value={form.spentOn}
              onChange={(e) => setForm({ ...form, spentOn: e.target.value })}
              className={inputClass + " font-mono"}
            />
          </Field>

          <Field label="Amount (₹)">
            <input
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              inputMode="decimal"
              placeholder="1250.00"
              autoFocus
              className={inputClass + " font-mono"}
            />
          </Field>

          <Field label="Category" full>
            <input
              list="expense-categories"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="Supplier payment, Office rent…"
              className={inputClass}
            />
            <datalist id="expense-categories">
              {CATEGORIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>

          <Field label="Method">
            <Select
              value={form.method}
              onChange={(v) => setForm({ ...form, method: v as PaymentMethod })}
              ariaLabel="Payment method"
              options={METHODS.map((m) => ({
                value: m,
                label: m[0].toUpperCase() + m.slice(1),
              }))}
            />
          </Field>

          <Field label="Supplier (optional)">
            <Select
              value={form.supplierId ?? ""}
              onChange={(v) => setForm({ ...form, supplierId: v })}
              ariaLabel="Supplier"
              options={[
                { value: "", label: "No supplier" },
                ...suppliers.map((sup) => ({ value: sup.id, label: sup.name })),
              ]}
            />
          </Field>

          <Field label="Description" full>
            <input
              value={form.description ?? ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What this was for"
              className={inputClass}
            />
          </Field>

          <Field label="Notes" full>
            <textarea
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-[13px] text-ink outline-none focus:border-accent focus:bg-surface"
            />
          </Field>

          {error && (
            <p
              role="alert"
              className="col-span-full rounded-lg bg-alert-pale px-3 py-2 text-[12px] font-medium text-alert"
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
  "h-10 w-full rounded-lg border border-line bg-paper px-3 text-[13px] text-ink outline-none placeholder:text-ink-ghost focus:border-accent focus:bg-surface";

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${full ? "sm:col-span-2" : ""}`}>
      <span className="text-[11px] font-bold uppercase tracking-[1px] text-ink-mid">{label}</span>
      {children}
    </label>
  );
}
