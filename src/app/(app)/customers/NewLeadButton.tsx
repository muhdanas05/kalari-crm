"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Plus, AlertTriangle } from "@/components/icons";
import { createLead } from "./new-lead-actions";

export function NewLeadButton() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!name.trim() || !phone.trim()) {
      setError("Name and phone are required.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await createLead({ name, phone, email });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Dedup is silent success, not an error: an existing customer just got a
      // new case (§3.27). Tell the user which happened.
      toast(
        res.isNew ? "Lead created and assigned." : "Existing customer — new case added.",
        "ok",
      );
      setOpen(false);
      setName("");
      setPhone("");
      setEmail("");
      router.push(`/customers/${res.customerId}`);
    });
  };

  return (
    <>
      <Button variant="primary" size="sm" icon={Plus} onClick={() => setOpen(true)}>
        New lead
      </Button>

      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title="New lead"
        description="Adds a customer and a Sales case, and assigns it automatically."
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={submit} disabled={pending}>
              {pending ? "Adding…" : "Add lead"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="h-10 w-full rounded-lg border border-line bg-paper px-3 text-[13px] font-medium text-ink outline-none focus:border-accent focus:bg-surface"
            />
          </Field>
          <Field label="Phone">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              placeholder="+971 50 000 0000"
              className="h-10 w-full rounded-lg border border-line bg-paper px-3 font-mono text-[13px] text-ink outline-none placeholder:text-ink-ghost focus:border-accent focus:bg-surface"
            />
          </Field>
          <Field label="Email (optional)">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="name@example.ae"
              className="h-10 w-full rounded-lg border border-line bg-paper px-3 text-[13px] text-ink outline-none placeholder:text-ink-ghost focus:border-accent focus:bg-surface"
            />
          </Field>
          <p className="text-[11px] font-medium text-ink-faint">
            No email? That's fine — they'll simply be chased by phone instead.
          </p>

          {error && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg bg-alert-pale px-3 py-2 text-[12px] font-medium text-alert"
            >
              <AlertTriangle size={13} className="mt-px shrink-0" />
              {error}
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-[1px] text-ink-mid">
        {label}
      </span>
      {children}
    </label>
  );
}
