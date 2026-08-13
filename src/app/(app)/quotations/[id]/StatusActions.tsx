"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { Send, Check, X, Ban, FileCheck, Undo2 } from "@/components/icons";
import { setQuotationStatus, convertQuotation, archiveQuotation } from "../actions";

export function StatusActions({
  id,
  status,
  totalFils,
}: {
  id: string;
  status: string;
  totalFils: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [confirmConvert, setConfirmConvert] = useState(false);
  const [confirmDecline, setConfirmDecline] = useState(false);

  const move = (to: "draft" | "sent" | "accepted" | "declined" | "expired") => {
    start(async () => {
      const res = await setQuotationStatus(id, status, to);
      if (!res.ok) return toast(res.error, "error");
      toast(`Marked ${to}.`, "ok");
      setConfirmDecline(false);
    });
  };

  const convert = () => {
    start(async () => {
      const res = await convertQuotation(id, totalFils);
      if (!res.ok) return toast(res.error, "error");
      toast(`Invoice ${res.number} issued.`, "ok");
      router.push(`/invoices/${res.invoiceId}`);
    });
  };

  const archive = () => {
    start(async () => {
      const res = await archiveQuotation(id);
      if (!res.ok) return toast(res.error, "error");
      toast("Quotation archived.", "ok");
      router.push("/quotations");
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "draft" && (
        <Button variant="secondary" size="sm" icon={Send} onClick={() => move("sent")} disabled={pending}>
          Mark sent
        </Button>
      )}
      {/* Only from "sent" — a draft can't be accepted, and offering it here
          rendered a button that always failed with "Can't move a draft
          quotation to accepted." */}
      {status === "sent" && (
        <Button variant="secondary" size="sm" icon={Check} onClick={() => move("accepted")} disabled={pending}>
          Mark accepted
        </Button>
      )}
      {(status === "draft" || status === "sent") && (
        <Button variant="ghost" size="sm" icon={X} onClick={() => setConfirmDecline(true)} disabled={pending}>
          Mark declined
        </Button>
      )}
      {status === "sent" && (
        <Button variant="ghost" size="sm" icon={Ban} onClick={() => move("expired")} disabled={pending}>
          Mark expired
        </Button>
      )}

      {/* The way back. These were dead ends, so one mis-tap ended the
          quotation permanently — Edit is hidden outside draft|sent. */}
      {["accepted", "declined", "expired"].includes(status) && (
        <Button variant="secondary" size="sm" icon={Undo2} onClick={() => move("sent")} disabled={pending}>
          Reopen
        </Button>
      )}
      {status === "sent" && (
        <Button variant="ghost" size="sm" icon={Undo2} onClick={() => move("draft")} disabled={pending}>
          Back to draft
        </Button>
      )}

      <Modal
        open={confirmDecline}
        onClose={() => !pending && setConfirmDecline(false)}
        title="Mark this quotation declined?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDecline(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={() => move("declined")} disabled={pending}>
              {pending ? "Saving…" : "Mark declined"}
            </Button>
          </>
        }
      >
        <p className="text-[13px] font-medium text-ink">
          The customer turned this down. You can reopen it later if they change
          their mind — nothing is lost.
        </p>
      </Modal>
      {status === "accepted" && (
        <>
          <Button variant="primary" size="sm" icon={FileCheck} onClick={() => setConfirmConvert(true)} disabled={pending}>
            Convert to invoice
          </Button>
          <Modal
            open={confirmConvert}
            onClose={() => !pending && setConfirmConvert(false)}
            title="Convert to a real invoice?"
            size="sm"
            footer={
              <>
                <Button variant="ghost" size="sm" onClick={() => setConfirmConvert(false)} disabled={pending}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" onClick={convert} disabled={pending}>
                  {pending ? "Issuing…" : "Issue invoice"}
                </Button>
              </>
            }
          >
            <p className="text-[13px] font-medium text-ink">
              This creates a real, numbered invoice from these exact lines.
              An invoice is immutable once issued — a correction after this
              point is a void, not an edit. The quotation itself stays
              exactly as it is, marked converted.
            </p>
          </Modal>
        </>
      )}
      {["draft", "declined", "expired"].includes(status) && (
        <Button variant="ghost" size="sm" onClick={archive} disabled={pending}>
          Archive
        </Button>
      )}
    </div>
  );
}
