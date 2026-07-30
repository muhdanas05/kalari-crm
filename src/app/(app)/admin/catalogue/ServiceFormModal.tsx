"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Plus, Pencil } from "@/components/icons";
import { saveService, type ServiceInput } from "./actions";
import type { Service } from "@/lib/pricing/engine";

/**
 * Which of the four pricing dimensions each family actually uses. Mirrors
 * services_dims_ck in the database EXACTLY — if these disagree, the form
 * offers combinations Postgres will reject, and the admin gets a constraint
 * error for a choice the UI invited them to make.
 */
const DIMENSIONS: Record<
  string,
  { category?: string[]; location?: boolean; type?: boolean }
> = {
  ticketing: { location: true },
  holiday: { location: true },
  haj_umrah: { category: ["haj", "umrah"] },
  visa: { type: true },
  passport: { type: true },
  hotel: {},
  attestation: {},
  other: {},
};

const FAMILY_LABELS: Record<string, string> = {
  ticketing: "Air ticketing",
  holiday: "Holiday package",
  haj_umrah: "Haj & Umrah",
  visa: "Visa service",
  passport: "Passport service",
  hotel: "Hotel reservation",
  attestation: "Attestation",
  other: "Other / one-off",
};

function blankForm(service?: Service): ServiceInput {
  return {
    id: service?.id,
    name: service?.name ?? "",
    family: service?.family ?? "other",
    category: service?.category ?? null,
    location: service?.location ?? null,
    type: service?.type ?? null,
    tracksPipeline: service?.tracks_pipeline ?? false,
  };
}

export function ServiceFormModal({ service }: { service?: Service }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [form, setForm] = useState<ServiceInput>(() => blankForm(service));
  const [error, setError] = useState<string | null>(null);

  const openForm = () => {
    setForm(blankForm(service));
    setError(null);
    setOpen(true);
  };

  const dims = DIMENSIONS[form.family] ?? {};

  // Changing family must clear dimensions the new family does not use, or the
  // CHECK constraint refuses a row the form looks happy with.
  const onFamily = (family: ServiceInput["family"]) => {
    const next = DIMENSIONS[family] ?? {};
    setForm((f) => ({
      ...f,
      family,
      category: next.category ? f.category : null,
      location: next.location ? f.location : null,
      type: next.type ? f.type : null,
    }));
  };

  const submit = () => {
    if (!form.name.trim()) {
      setError("The service needs a name.");
      return;
    }
    if (dims.category && !form.category) {
      setError("Choose a programme.");
      return;
    }
    if (dims.location && !form.location) {
      setError("Choose domestic or international.");
      return;
    }
    if (dims.type && !form.type) {
      setError("Choose new or renewal.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await saveService(form);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast(service ? "Service updated." : "Service added.", "ok");
      setOpen(false);
    });
  };

  return (
    <>
      <Button
        variant={service ? "ghost" : "primary"}
        size="sm"
        icon={service ? Pencil : Plus}
        onClick={openForm}
      >
        {service ? "Edit" : "New service"}
      </Button>

      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title={service ? "Edit service" : "New service"}
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
        <div className="flex flex-col gap-4">
          <Field label="Name">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
              placeholder="e.g. Umrah Package · Premium"
              className={inputClass}
            />
          </Field>

          <Field label="Type of service">
            <select
              value={form.family}
              onChange={(e) => onFamily(e.target.value as ServiceInput["family"])}
              className={inputClass}
            >
              {Object.entries(FAMILY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>

          {dims.category && (
            <Field label="Programme">
              <select
                value={form.category ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    category: (e.target.value || null) as ServiceInput["category"],
                  })
                }
                className={inputClass}
              >
                <option value="">Choose…</option>
                {dims.category.map((c) => (
                  <option key={c} value={c}>
                    {c === "haj" ? "Haj" : "Umrah"}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {dims.location && (
            <Field label="Where">
              <select
                value={form.location ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    location: (e.target.value || null) as ServiceInput["location"],
                  })
                }
                className={inputClass}
              >
                <option value="">Choose…</option>
                <option value="domestic">Domestic</option>
                <option value="international">International</option>
              </select>
            </Field>
          )}

          {dims.type && (
            <Field label="New or renewal">
              <select
                value={form.type ?? ""}
                onChange={(e) =>
                  setForm({ ...form, type: (e.target.value || null) as ServiceInput["type"] })
                }
                className={inputClass}
              >
                <option value="">Choose…</option>
                <option value="new">New</option>
                <option value="renew">Renewal</option>
              </select>
            </Field>
          )}

          {/*
            The flexibility the office asked for: which services are worth
            tracking is their call, not a hardcoded list in the source.
          */}
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-paper p-3.5">
            <input
              type="checkbox"
              checked={form.tracksPipeline}
              onChange={(e) => setForm({ ...form, tracksPipeline: e.target.checked })}
              className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
            />
            <span>
              <span className="block text-[13px] font-semibold text-ink">
                Track this in the pipeline
              </span>
              <span className="mt-0.5 block text-[11.5px] font-medium leading-[1.5] text-ink-mid">
                On — invoicing this opens a case you can follow through its
                stages. For work that runs for days or weeks: visas, passports,
                Haj &amp; Umrah, holidays.
                <br />
                Off — the sale is finished at payment. For tickets, hotel
                bookings and attestation.
              </span>
            </span>
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

const inputClass =
  "h-10 w-full rounded-lg border border-line bg-paper px-3 text-[13px] font-medium text-ink outline-none placeholder:text-ink-ghost focus:border-accent focus:bg-surface";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-[1px] text-ink-mid">{label}</span>
      {children}
    </label>
  );
}
