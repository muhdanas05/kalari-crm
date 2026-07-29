"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Mail, Check } from "@/components/icons";
import { setCaseSupplier, emailSupplier } from "./supplier-actions";
import type { Supplier } from "@/lib/db/suppliers";

type SupplierBrief = Pick<Supplier, "id" | "name" | "email"> | null;

export function SupplierControls({
  caseId,
  current,
  suppliers,
  serviceName,
  pax,
}: {
  caseId: string;
  current: SupplierBrief;
  suppliers: Pick<Supplier, "id" | "name">[];
  serviceName: string | null;
  pax: number;
}) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState(current?.id ?? "");

  const onPick = (id: string) => {
    setSelected(id);
    start(async () => {
      const res = await setCaseSupplier(caseId, id || null);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      toast(id ? "Supplier set." : "Supplier cleared.", "ok");
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <select
        value={selected}
        onChange={(e) => onPick(e.target.value)}
        disabled={pending}
        className="h-10 w-full rounded-lg border border-line bg-paper px-3 text-[13px] font-medium text-ink outline-none focus:border-accent focus:bg-surface"
      >
        <option value="">No supplier</option>
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      {current && (
        <ComposeButton
          caseId={caseId}
          supplierName={current.name}
          hasEmail={!!current.email}
          serviceName={serviceName}
          pax={pax}
        />
      )}
    </div>
  );
}

function ComposeButton({
  caseId,
  supplierName,
  hasEmail,
  serviceName,
  pax,
}: {
  caseId: string;
  supplierName: string;
  hasEmail: boolean;
  serviceName: string | null;
  pax: number;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [subject, setSubject] = useState(`${serviceName ?? "Booking"} — request`);
  const [body, setBody] = useState(
    `Hi ${supplierName},\n\nRegarding case ${caseId.slice(0, 8)}` +
      (serviceName ? ` (${serviceName})` : "") +
      (pax > 0 ? `, ${pax} traveller${pax === 1 ? "" : "s"}` : "") +
      `:\n\n`,
  );
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!subject.trim() || !body.trim()) {
      setError("Subject and message are required.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await emailSupplier(caseId, subject, body);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      setDone(true);
      toast(
        res.sandboxed
          ? "Queued — email is off, so it's in the log, not sent."
          : `Queued for ${supplierName}.`,
        res.sandboxed ? "info" : "ok",
      );
      setOpen(false);
    });
  };

  if (!hasEmail) {
    return <p className="text-[11.5px] font-medium text-ink-faint">{supplierName} has no email on file.</p>;
  }

  return (
    <>
      <Button variant="secondary" size="sm" icon={done ? Check : Mail} onClick={() => setOpen(true)}>
        {done ? "Queued" : "Email supplier"}
      </Button>

      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title={`Email ${supplierName}`}
        size="md"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={submit} disabled={pending}>
              {pending ? "Queuing…" : "Send"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[1px] text-ink-mid">Subject</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="h-10 w-full rounded-lg border border-line bg-paper px-3 text-[13px] text-ink outline-none focus:border-accent focus:bg-surface"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[1px] text-ink-mid">Message</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-[13px] text-ink outline-none focus:border-accent focus:bg-surface"
            />
          </label>
          {error && (
            <p role="alert" className="rounded-lg bg-alert-pale px-3 py-2 text-[12px] font-medium text-alert">
              {error}
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}
