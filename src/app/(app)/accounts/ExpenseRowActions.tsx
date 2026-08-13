"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Trash2 } from "@/components/icons";
import { formatPaise } from "@/lib/money";
import { archiveExpense } from "./actions";
import { ExpenseFormModal, type EditableExpense } from "./ExpenseFormModal";

/**
 * Edit + Archive on an expense row.
 *
 * Both server actions already existed and neither was reachable: the form
 * never passed an id, and archiveExpense had no caller anywhere in the app
 * (dead code). So a mistyped expense was permanent in the account book — the
 * one place in the product where a typo silently misstates the P&L.
 */
export function ExpenseRowActions({
  expense,
  today,
  suppliers,
}: {
  expense: EditableExpense;
  today: string;
  suppliers: { id: string; name: string }[];
}) {
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="flex shrink-0 items-center gap-1">
      <ExpenseFormModal today={today} suppliers={suppliers} expense={expense} />

      <Button
        variant="ghost"
        size="sm"
        icon={Trash2}
        onClick={() => setConfirm(true)}
        disabled={pending}
        aria-label={`Remove ${expense.category}`}
      >
        Remove
      </Button>

      <Modal
        open={confirm}
        onClose={() => !pending && setConfirm(false)}
        title="Remove this expense?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setConfirm(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await archiveExpense(expense.id);
                  if (!res.ok) return toast(res.error, "error");
                  toast("Expense removed.", "ok");
                  setConfirm(false);
                })
              }
            >
              {pending ? "Removing…" : "Remove"}
            </Button>
          </>
        }
      >
        <p className="text-[13px] font-medium text-ink">
          {formatPaise(expense.amount_paise)} — {expense.category}. It comes out
          of the account book and the totals. The row is archived, not deleted,
          so the audit trail keeps it.
        </p>
      </Modal>
    </div>
  );
}
