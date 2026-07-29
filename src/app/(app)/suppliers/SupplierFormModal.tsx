"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Plus, Pencil } from "@/components/icons";
import { saveSupplier, type SupplierInput } from "./actions";
import type { Supplier } from "@/lib/db/suppliers";

/** Same modal, two modes: no `supplier` prop = "New supplier"; with it = "Edit". */
export function SupplierFormModal({ supplier }: { supplier?: Supplier }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [form, setForm] = useState<SupplierInput>(() => ({
    id: supplier?.id,
    name: supplier?.name ?? "",
    supplies: supplier?.supplies ?? "",
    contactPerson: supplier?.contact_person ?? "",
    email: supplier?.email ?? "",
    phone: supplier?.phone ?? "",
    whatsapp: supplier?.whatsapp ?? "",
    city: supplier?.city ?? "",
    address: supplier?.address ?? "",
    notes: supplier?.notes ?? "",
  }));
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await saveSupplier(form);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast(supplier ? "Supplier updated." : "Supplier added.", "ok");
      setOpen(false);
    });
  };

  return (
    <>
      <Button
        variant={supplier ? "secondary" : "primary"}
        size="sm"
        icon={supplier ? Pencil : Plus}
        onClick={() => setOpen(true)}
      >
        {supplier ? "Edit" : "New supplier"}
      </Button>

      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title={supplier ? "Edit supplier" : "New supplier"}
        size="md"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={submit} disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name" full>
            <Input value={form.name} onChange={(v) => setForm({ ...form, name: v })} autoFocus />
          </Field>
          <Field label="What they supply" full>
            <Input
              value={form.supplies ?? ""}
              onChange={(v) => setForm({ ...form, supplies: v })}
              placeholder="Ticket consolidator, hotel DMC, visa agent…"
            />
          </Field>
          <Field label="Contact person">
            <Input
              value={form.contactPerson ?? ""}
              onChange={(v) => setForm({ ...form, contactPerson: v })}
            />
          </Field>
          <Field label="Phone">
            <Input value={form.phone ?? ""} onChange={(v) => setForm({ ...form, phone: v })} mono />
          </Field>
          <Field label="Email">
            <Input value={form.email ?? ""} onChange={(v) => setForm({ ...form, email: v })} />
          </Field>
          <Field label="WhatsApp">
            <Input
              value={form.whatsapp ?? ""}
              onChange={(v) => setForm({ ...form, whatsapp: v })}
              mono
            />
          </Field>
          <Field label="City">
            <Input value={form.city ?? ""} onChange={(v) => setForm({ ...form, city: v })} />
          </Field>
          <Field label="Address">
            <Input value={form.address ?? ""} onChange={(v) => setForm({ ...form, address: v })} />
          </Field>
          <Field label="Notes" full>
            <textarea
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-[13px] text-ink outline-none focus:border-accent focus:bg-surface"
            />
          </Field>

          {error && (
            <p role="alert" className="col-span-full rounded-lg bg-alert-pale px-3 py-2 text-[12px] font-medium text-alert">
              {error}
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`flex flex-col gap-1.5 ${full ? "sm:col-span-2" : ""}`}>
      <span className="text-[11px] font-bold uppercase tracking-[1px] text-ink-mid">{label}</span>
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  mono,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className={`h-10 w-full rounded-lg border border-line bg-paper px-3 text-[13px] text-ink outline-none placeholder:text-ink-ghost focus:border-accent focus:bg-surface ${mono ? "font-mono" : ""}`}
    />
  );
}
