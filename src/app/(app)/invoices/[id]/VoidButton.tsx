"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Ban } from "@/components/icons";
import { formatPaise } from "@/lib/money";
import { voidInvoice, voidPayment, cancelInvoiceWithRefund } from "./void-actions";

/**
 * Void an invoice or a payment. Admin-only in the UI, and admin-only again in
 * the RPC — the second one is the guarantee; this is the courtesy.
 *
 * An invoice with payments against it can't just be voided — the money is
 * real. Pass `paidPaise` and this switches to "cancel & refund" mode: same
 * dialog, but it's explicit that voiding every payment IS the refund, and
 * calls cancel_invoice_with_refund() instead of the plain void.
 *
 * A reason is mandatory because a void is the one thing in the ledger that
 * rewrites what a document means, and "why" is the only part that cannot be
 * reconstructed later from the rows.
 */
export function VoidButton(
  props:
    | { kind: "invoice"; invoiceId: string; label: string; paidPaise?: number }
    | { kind: "payment"; paymentId: string; invoiceId: string; label: string },
) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isInvoice = props.kind === "invoice";
  const withRefund = isInvoice && (props.paidPaise ?? 0) > 0;

  const openDialog = () => {
    setReason("");
    setError(null);
    setOpen(true);
  };

  const submit = () => {
    if (reason.trim().length < 3) {
      setError("Say why — this is permanent and it will be read later.");
      return;
    }
    setError(null);
    start(async () => {
      const res = withRefund
        ? await cancelInvoiceWithRefund(props.invoiceId, reason)
        : isInvoice
          ? await voidInvoice(props.invoiceId, reason)
          : await voidPayment(props.paymentId, props.invoiceId, reason);

      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast(
        withRefund ? "Invoice cancelled and payments refunded." : isInvoice ? "Invoice voided." : "Payment voided.",
        "ok",
      );
      setOpen(false);
    });
  };

  return (
    <>
      {isInvoice ? (
        <Button variant="danger" size="sm" icon={Ban} onClick={openDialog}>
          {withRefund ? "Cancel & refund" : "Void"}
        </Button>
      ) : (
        <button
          type="button"
          onClick={openDialog}
          className="text-[11px] font-semibold text-ink-faint transition-colors hover:text-alert"
        >
          Void
        </button>
      )}

      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title={withRefund ? "Cancel this invoice and refund the payment?" : isInvoice ? "Void this invoice?" : "Void this payment?"}
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={submit} disabled={pending}>
              {pending ? "Working…" : withRefund ? "Cancel & refund" : "Void it"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-[13px] font-medium text-ink">
            <strong className="font-bold">{props.label}</strong> will be marked
            void. It keeps its number and stays in the records — voiding is not
            deleting.
          </p>

          {withRefund && isInvoice && (
            <p className="rounded-lg bg-alert-pale px-3 py-2 text-[12px] font-medium text-alert">
              {formatPaise(props.paidPaise ?? 0)} was paid against this
              invoice. Cancelling it will also void that payment — the same
              as returning the money — and neither will count toward
              collected revenue anywhere in the app from this point on. Make
              sure the refund has actually been paid back before confirming.
            </p>
          )}

          {isInvoice && !withRefund && (
            <p className="rounded-lg bg-paper-deep px-3 py-2 text-[12px] font-medium text-ink-mid">
              This invoice has no payments against it, so a plain void is
              enough — nothing to refund.
            </p>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[1px] text-ink-mid">
              Reason (required)
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              autoFocus
              placeholder="e.g. Issued to the wrong customer"
              className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-[13px] text-ink outline-none placeholder:text-ink-ghost focus:border-accent focus:bg-surface"
            />
          </label>

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
