"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { Trash2, Plus, AlertTriangle, Undo2 } from "@/components/icons";
import {
  buildLines,
  computeTotals,
  toDraftPayload,
  type Service,
  type Rule,
  type DraftLine,
} from "@/lib/pricing/engine";
import { rulesForService } from "@/lib/pricing/rules";
import { formatPaise, formatPaiseBare, parseInrToPaise, isRateEdited } from "@/lib/money";
import { createQuotation, updateQuotation } from "../actions";
import { cn } from "@/lib/utils";

type Customer = { id: string; name: string; phone: string };

function defaultValidUntil(): string {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}

export type ExistingQuotation = {
  id: string;
  number: string;
  customer_id: string;
  service_id: string | null;
  custom_service_name: string | null;
  pax_adults: number;
  pax_children: number;
  lines: DraftLine[];
  amount_note: string | null;
  valid_until: string | null;
};

export function QuotationBuilder({
  services,
  rules,
  customers,
  preselectedCustomerId,
  existing,
}: {
  services: Service[];
  rules: Rule[];
  customers: Customer[];
  preselectedCustomerId: string | null;
  /** Present → edit an existing draft/sent quotation instead of creating one. */
  existing?: ExistingQuotation;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [customerId, setCustomerId] = useState(existing?.customer_id ?? preselectedCustomerId ?? "");
  const [serviceId, setServiceId] = useState(existing?.service_id ?? "");
  const [adults, setAdults] = useState(existing?.pax_adults ?? 1);
  const [children, setChildren] = useState(existing?.pax_children ?? 0);
  const [lines, setLines] = useState<DraftLine[]>(existing?.lines ?? []);
  const [note, setNote] = useState(existing?.amount_note ?? "");
  const [validUntil, setValidUntil] = useState(existing?.valid_until ?? defaultValidUntil());
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(!!existing);
  const [custom, setCustom] = useState(!!existing && !existing.service_id);
  const [customName, setCustomName] = useState(existing?.custom_service_name ?? "");

  const service = services.find((s) => s.id === serviceId) ?? null;
  const hasPerPerson = service
    ? rulesForService(rules, service.id).some((r) => r.qty_rule === "per_person")
    : false;

  const rebuild = (svcId: string, a: number, c: number) => {
    if (!svcId) return setLines([]);
    setLines(buildLines(rulesForService(rules, svcId), { adults: a, children: c }));
    setTouched(false);
  };

  const onService = (id: string) => {
    setServiceId(id);
    rebuild(id, adults, children);
  };

  const onPax = (a: number, c: number) => {
    setAdults(a);
    setChildren(c);
    setLines((prev) =>
      prev.map((l) =>
        // Only per-person lines scale. The old `: 1` CLOBBERED every other
        // line's quantity — and because the edit page has to default every
        // stored line to qty_rule "once" (the saved payload drops the rule),
        // nudging the pax count on an existing quotation reset ALL quantities
        // to 1 and collapsed the total to a fraction of itself.
        l.qty_rule === "per_person" ? { ...l, qty: Math.max(1, a + c) } : l,
      ),
    );
  };

  const totals = useMemo(() => computeTotals(lines), [lines]);

  const setLine = (i: number, patch: Partial<DraftLine>) => {
    setTouched(true);
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  };

  const submit = () => {
    if (!customerId) return setError("Choose a customer.");
    if (custom) {
      if (!customName.trim()) return setError("Describe what this quotation is for.");
    } else if (!serviceId) {
      return setError("Choose a service.");
    }
    if (lines.length === 0) return setError("A quotation needs at least one line.");
    if (lines.some((l) => !l.label.trim())) {
      return setError("Every line needs a description.");
    }
    setError(null);

    const payload = {
      serviceId: custom ? null : serviceId,
      customServiceName: custom ? customName.trim() : null,
      paxAdults: adults,
      paxChildren: children,
      lines: toDraftPayload(lines),
      amountNote: note || null,
      validUntil: validUntil || null,
      subtotalPaise: totals.subtotal_paise,
      gstPaise: totals.gst_paise,
      totalPaise: totals.total_paise,
    };

    startTransition(async () => {
      if (existing) {
        const res = await updateQuotation(existing.id, payload);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        toast(`Quotation ${existing.number} updated.`, "ok");
        router.push(`/quotations/${existing.id}`);
        return;
      }

      const res = await createQuotation({ customerId, ...payload });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast(`Quotation ${res.number} created.`, "ok");
      router.push(`/quotations/${res.quotationId}`);
    });
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-6 lg:col-span-2">
        <section className="rounded-xl border border-line bg-surface p-6">
          <h2 className="mb-4 text-base font-bold tracking-[-0.2px] text-ink">
            Customer & service
          </h2>

          <div className="flex flex-col gap-4">
            <Field label="Customer">
              <Select
                value={customerId}
                onChange={setCustomerId}
                ariaLabel="Customer"
                disabled={!!existing}
                options={customers.map((c) => ({
                  value: c.id,
                  label: c.name,
                  hint: c.phone,
                }))}
              />
            </Field>

            {custom ? (
              <Field label="What is this quotation for?">
                <input
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g. Document translation, courier charges…"
                  className="h-10 w-full rounded-lg border border-line bg-paper px-3 text-[13px] font-medium text-ink outline-none placeholder:text-ink-ghost focus:border-accent focus:bg-surface"
                />
              </Field>
            ) : (
              <Field label="Service">
                <Select
                  value={serviceId}
                  onChange={onService}
                  ariaLabel="Service"
                  options={services.map((svc) => ({
                    value: svc.id,
                    label: svc.name,
                    hint: svc.tracks_pipeline ? "Opens a case once converted" : undefined,
                  }))}
                />
              </Field>
            )}

            <button
              type="button"
              onClick={() => {
                const next = !custom;
                setCustom(next);
                setError(null);
                if (next) {
                  setServiceId("");
                  setLines([
                    { label: "", qty: 1, rate_paise: 0, catalogue_rate_paise: 0, gst_bp: 0, qty_rule: "once" },
                  ]);
                } else {
                  setCustomName("");
                  setLines([]);
                }
                setTouched(false);
              }}
              className="self-start text-[12px] font-semibold text-accent hover:underline"
            >
              {custom ? "← Use a catalogue service" : "Custom quotation instead →"}
            </button>

            {hasPerPerson && (
              <div className="flex gap-3">
                <Field label="Adults">
                  <input
                    type="number"
                    min={1}
                    value={adults}
                    onChange={(e) => onPax(Math.max(1, Number(e.target.value) || 1), children)}
                    className="h-10 w-full rounded-lg border border-line bg-paper px-3 font-mono text-[13px] text-ink outline-none focus:border-accent focus:bg-surface"
                  />
                </Field>
                <Field label="Children">
                  <input
                    type="number"
                    min={0}
                    value={children}
                    onChange={(e) => onPax(adults, Math.max(0, Number(e.target.value) || 0))}
                    className="h-10 w-full rounded-lg border border-line bg-paper px-3 font-mono text-[13px] text-ink outline-none focus:border-accent focus:bg-surface"
                  />
                </Field>
              </div>
            )}

            <Field label="Valid until">
              <input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="h-10 w-full rounded-lg border border-line bg-paper px-3 font-mono text-[13px] text-ink outline-none focus:border-accent focus:bg-surface"
              />
            </Field>
          </div>
        </section>

        <section className="rounded-xl border border-line bg-surface p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-bold tracking-[-0.2px] text-ink">Lines</h2>
            {touched && (
              <button
                onClick={() => rebuild(serviceId, adults, children)}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-accent hover:underline"
              >
                <Undo2 size={13} />
                Reset to catalogue
              </button>
            )}
          </div>

          {lines.length === 0 ? (
            <p className="py-10 text-center text-[12.5px] font-medium text-ink-faint">
              Choose a service and its lines appear here.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {lines.map((l, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg border border-line bg-paper p-2.5">
                  <label className="min-w-[160px] flex-1">
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-[1px] text-ink-faint">
                      Description
                    </span>
                    <input
                      value={l.label}
                      onChange={(e) => setLine(i, { label: e.target.value })}
                      className="h-8 w-full rounded border border-line bg-surface px-2 text-[12.5px] font-medium text-ink outline-none focus:border-accent"
                    />
                  </label>

                  <label className="w-[64px]">
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-[1px] text-ink-faint">
                      Qty
                    </span>
                    <input
                      type="number"
                      min={1}
                      value={l.qty}
                      onChange={(e) => setLine(i, { qty: Math.max(1, Number(e.target.value) || 1) })}
                      className="h-8 w-full rounded border border-line bg-surface px-2 font-mono text-[12.5px] text-ink outline-none focus:border-accent"
                    />
                  </label>

                  <label className="w-[104px]">
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-[1px] text-ink-faint">
                      Rate
                    </span>
                    <input
                      /* Remount on rate change — see InvoiceBuilder for why:
                         the imperative .value write sets the DOM dirty flag,
                         after which defaultValue stops updating the display. */
                      key={`rate-${l.rate_paise}`}
                      defaultValue={formatPaiseBare(l.rate_paise)}
                      onBlur={(e) => {
                        const paise = parseInrToPaise(e.target.value);
                        if (paise == null || paise < 0) {
                          e.target.value = formatPaiseBare(l.rate_paise);
                          return;
                        }
                        setLine(i, { rate_paise: paise });
                        e.target.value = formatPaiseBare(paise);
                      }}
                      inputMode="decimal"
                      className={cn(
                        "h-8 w-full rounded border bg-surface px-2 font-mono text-[12.5px] text-ink outline-none focus:border-accent",
                        isRateEdited(l) ? "border-warn" : "border-line",
                      )}
                    />
                  </label>

                  <label className="w-[72px]">
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-[1px] text-ink-faint">
                      GST %
                    </span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={(l.gst_bp ?? 0) / 100}
                      onChange={(e) =>
                        setLine(i, { gst_bp: Math.max(0, Math.round((Number(e.target.value) || 0) * 100)) })
                      }
                      className="h-8 w-full rounded border border-line bg-surface px-2 font-mono text-[12.5px] text-ink outline-none focus:border-accent"
                    />
                  </label>

                  <span className="w-[92px] pb-1.5 text-right font-mono text-[12.5px] font-semibold text-ink">
                    {formatPaiseBare(l.qty * l.rate_paise)}
                  </span>

                  <button
                    onClick={() => {
                      setTouched(true);
                      setLines((p) => p.filter((_, j) => j !== i));
                    }}
                    aria-label={`Remove ${l.label}`}
                    className="mb-1 flex h-8 w-8 items-center justify-center rounded text-ink-faint transition-colors hover:bg-alert-pale hover:text-alert"
                  >
                    <Trash2 size={14} />
                  </button>

                  {isRateEdited(l) && (
                    <p className="w-full text-[10.5px] font-medium text-warn">
                      Catalogue rate is {formatPaise(l.catalogue_rate_paise)} — the difference will be shown.
                    </p>
                  )}
                </div>
              ))}

              <button
                onClick={() => {
                  setTouched(true);
                  setLines((p) => [
                    ...p,
                    { label: "", qty: 1, rate_paise: 0, catalogue_rate_paise: 0, gst_bp: 0, qty_rule: "once" },
                  ]);
                }}
                className="mt-1 inline-flex h-9 items-center gap-1.5 self-start rounded-lg border border-dashed border-line px-3 text-[12.5px] font-semibold text-ink-mid transition-colors hover:border-accent hover:text-accent"
              >
                <Plus size={14} />
                Add a line
              </button>
            </div>
          )}
        </section>
      </div>

      <aside className="lg:col-span-1">
        <div className="sticky top-24 flex flex-col gap-4 rounded-xl border border-line bg-surface p-6">
          <h2 className="text-base font-bold tracking-[-0.2px] text-ink">Total</h2>

          <dl className="flex flex-col gap-1.5">
            <Row label="Subtotal" value={formatPaise(totals.subtotal_paise)} />
            <Row label="GST" value={formatPaise(totals.gst_paise)} />
            <div className="mt-1 border-t border-line pt-2">
              <Row label="Grand total" value={formatPaise(totals.total_paise)} strong />
            </div>
          </dl>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[1px] text-ink-mid">
              Note (optional)
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Appears on the quotation"
              className="rounded-lg border border-line bg-paper px-3 py-2 text-[12.5px] text-ink outline-none placeholder:text-ink-ghost focus:border-accent focus:bg-surface"
            />
          </label>

          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-lg bg-alert-pale px-3 py-2.5 text-[12px] font-medium text-alert">
              <AlertTriangle size={13} className="mt-px shrink-0" />
              {error}
            </p>
          )}

          <Button variant="primary" onClick={submit} disabled={pending}>
            {pending ? "Saving…" : existing ? "Save changes" : "Create quotation"}
          </Button>

          <p className="text-[11px] font-medium text-ink-faint">
            Nothing is final — edit it freely until it's converted to an
            invoice.
          </p>
        </div>
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-1 flex-col gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-[1px] text-ink-mid">{label}</span>
      {children}
    </label>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[12px] font-medium text-ink-mid">{label}</dt>
      <dd className={strong ? "font-mono text-[15px] font-extrabold text-ink" : "font-mono text-[12.5px] font-semibold text-ink-soft"}>
        {value}
      </dd>
    </div>
  );
}
