"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Mail, Check } from "@/components/icons";
import { emailInvoice } from "./email-actions";

/**
 * Always rendered, even when the customer has no address on file — the action
 * is what explains why it can't send. Hiding the button instead just left the
 * user wondering where it went.
 */
export function EmailInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);

  const send = () => {
    start(async () => {
      const res = await emailInvoice(invoiceId);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      setDone(true);
      // Says what actually happened. The action runs the dispatcher and sender
      // inline now, so "Sent" means the provider accepted it — not that it is
      // sitting in a queue waiting for the next cron tick.
      toast(
        res.sandboxed
          ? "Email is switched off, so this went to the log rather than to the customer."
          : `Sent to ${res.to}.`,
        res.sandboxed ? "info" : "ok",
      );
    });
  };

  return (
    <Button
      variant="secondary"
      size="sm"
      icon={done ? Check : Mail}
      onClick={send}
      disabled={pending}
    >
      {pending ? "Sending…" : done ? "Sent" : "Email"}
    </Button>
  );
}
