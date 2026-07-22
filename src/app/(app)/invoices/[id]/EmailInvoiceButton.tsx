"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Mail, Check } from "@/components/icons";
import { emailInvoice } from "./email-actions";

export function EmailInvoiceButton({
  invoiceId,
  email,
}: {
  invoiceId: string;
  email: string;
}) {
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
      // The honest message: it's queued, and if email is off it went to the log,
      // not to the customer. Better than a cheerful "Sent!" that didn't happen.
      toast(
        res.sandboxed
          ? "Queued — email is off, so it's in the log, not sent."
          : `Queued for ${email}.`,
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
      {pending ? "Queuing…" : done ? "Queued" : "Email"}
    </Button>
  );
}
