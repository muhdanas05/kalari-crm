"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Archive } from "@/components/icons";
import { archiveEntity, type ArchiveKind } from "./archive-actions";

const COPY: Record<ArchiveKind, { title: string; body: string; done: string }> = {
  customer: {
    title: "Archive this customer?",
    body: "They disappear from lists, search and the call queue. Their invoices and history stay exactly where they are.",
    done: "Customer archived.",
  },
  case: {
    title: "Archive this case?",
    body: "It comes off the pipeline board. Any invoices raised against it are untouched.",
    done: "Case archived.",
  },
  supplier: {
    title: "Archive this supplier?",
    body: "They stop appearing when you assign a supplier to a case. Past cases and email history are kept.",
    done: "Supplier archived.",
  },
};

/**
 * Archive — the only kind of delete this system has. Every read filters on
 * `archived_at is null`, so this hides the row everywhere without destroying
 * the thing the audit trail refers to.
 *
 * The server refuses the dangerous cases (a customer who still owes money, a
 * case with issued invoices when you're not an admin, a supplier on live
 * work), so the error text below is the RPC's own words, not a guess.
 */
export function ArchiveEntityButton({
  kind,
  id,
  name,
  redirectTo,
}: {
  kind: ArchiveKind;
  id: string;
  name: string;
  /** Where to go afterwards — the page you were on no longer has a subject. */
  redirectTo: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const copy = COPY[kind];

  const submit = () => {
    setError(null);
    start(async () => {
      const res = await archiveEntity(kind, id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast(copy.done, "ok");
      setOpen(false);
      router.push(redirectTo);
    });
  };

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        icon={Archive}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Archive
      </Button>

      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title={copy.title}
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={submit} disabled={pending}>
              {pending ? "Archiving…" : "Archive"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-[13px] font-medium text-ink">
            <strong className="font-bold">{name}</strong> — {copy.body}
          </p>
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
