"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Archive } from "@/components/icons";
import { archiveService, archiveRule } from "./actions";

/**
 * Archive, never delete — an issued invoice snapshots its own rates, so a
 * removed service must stay explainable for as long as its invoices exist.
 * The confirm step is deliberate: this is the one destructive-looking control
 * on the page and a stray click should not empty the rate card.
 */
export function ArchiveButton({
  kind,
  id,
  name,
}: {
  kind: "service" | "rule";
  id: string;
  name: string;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const confirm = () => {
    setError(null);
    start(async () => {
      const res = kind === "service" ? await archiveService(id) : await archiveRule(id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast(kind === "service" ? "Service archived." : "Line archived.", "ok");
      setOpen(false);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        aria-label={`Archive ${name}`}
        title={`Archive ${name}`}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-alert-pale hover:text-alert focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alert-pale"
      >
        <Archive size={14} />
      </button>

      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title={kind === "service" ? "Archive this service?" : "Archive this line?"}
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={confirm} disabled={pending}>
              {pending ? "Archiving…" : "Archive"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-[13px] font-medium text-ink">
            <strong className="font-bold">{name}</strong> will stop appearing when
            you build a new invoice.
          </p>
          <p className="text-[12px] font-medium text-ink-mid">
            Invoices that already use it are untouched — they keep their own copy
            of the rate. Nothing is deleted, so this can be undone in the
            database if it was a mistake.
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
