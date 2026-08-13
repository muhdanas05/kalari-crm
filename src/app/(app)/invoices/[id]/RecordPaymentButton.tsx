"use client";

import { useRef, useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { formatPaise, formatPaiseBare, parseInrToPaise } from "@/lib/money";
import { todayKolkata } from "@/lib/dates";
import { Banknote } from "@/components/icons";
import { recordPayment } from "./actions";
import type { Database } from "@/lib/supabase/database.types";

type PaymentMethod = Database["public"]["Enums"]["payment_method"];

/** randomUUID needs a secure context; plain-http LAN access falls back. */
function freshKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// §5.5: cash / transfer / cheque. No card — online payments are out of scope.
const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "transfer", label: "Transfer" },
  { value: "cheque", label: "Cheque" },
];

export function RecordPaymentButton({
  invoiceId,
  outstandingFils,
}: {
  invoiceId: string;
  outstandingFils: number;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState(formatPaiseBare(outstandingFils));
  const [method, setMethod] = useState<PaymentMethod>("transfer");
  const [paidOn, setPaidOn] = useState(todayKolkata());
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);

  // One key per OPEN of the dialog: a retry after a failure reuses it (so
  // record_payment returns the existing payment instead of booking twice),
  // while a genuine second payment on the same invoice gets a new one.
  // Was useId() + attempt — useId() is tree-position-derived and identical on
  // every render and every page load, so it was never a key at all.
  const idemRef = useRef<string>("");

  const openDialog = () => {
    idemRef.current = freshKey();
    // The outstanding prop changes after a partial payment, but this component
    // never remounts, so the amount field kept its first value and pre-filled
    // the FULL total on the second payment — straight into an overpayment.
    setAmount(formatPaiseBare(outstandingFils));
    setReference("");
    setError(null);
    setOpen(true);
  };

  const submit = () => {
    const paise = parseInrToPaise(amount);
    if (paise == null || paise <= 0) {
      setError("Enter a valid amount, to no more than 2 decimal places.");
      return;
    }
    setError(null);

    startTransition(async () => {
      const res = await recordPayment(invoiceId, {
        amountFils: paise,
        method,
        paidOn,
        reference,
        idempotencyKey: idemRef.current,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast(
        res.outstandingFils > 0
          ? `Payment recorded. ${formatPaise(res.outstandingFils)} still outstanding.`
          : "Payment recorded. Invoice settled.",
        "ok",
      );
      setOpen(false);
    });
  };

  return (
    <>
      <Button
        variant="primary"
        size="sm"
        icon={Banknote}
        onClick={openDialog}
      >
        Record payment
      </Button>

      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title="Record a payment"
        description={`${formatPaise(outstandingFils)} outstanding`}
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={submit} disabled={pending}>
              {pending ? "Recording…" : "Record"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Amount (INR)">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              autoFocus
              className="h-10 w-full rounded-lg border border-line bg-paper px-3 font-mono text-[14px] font-semibold text-ink outline-none focus:border-accent focus:bg-surface"
            />
          </Field>

          <Field label="Method">
            <div className="flex gap-1.5">
              {METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMethod(m.value)}
                  aria-pressed={method === m.value}
                  className={`h-9 flex-1 rounded-lg border text-[12.5px] font-semibold transition-colors ${
                    method === m.value
                      ? "border-accent bg-accent text-white"
                      : "border-line bg-surface text-ink-mid hover:border-line-strong"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Date">
            <input
              type="date"
              value={paidOn}
              onChange={(e) => setPaidOn(e.target.value)}
              className="h-10 w-full rounded-lg border border-line bg-paper px-3 font-mono text-[13px] text-ink outline-none focus:border-accent focus:bg-surface"
            />
          </Field>

          <Field label="Reference (optional)">
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Cheque no, transfer ref…"
              className="h-10 w-full rounded-lg border border-line bg-paper px-3 text-[13px] text-ink outline-none placeholder:text-ink-ghost focus:border-accent focus:bg-surface"
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-[1px] text-ink-mid">
        {label}
      </span>
      {children}
    </label>
  );
}
