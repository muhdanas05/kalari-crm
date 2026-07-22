"use client";

import { useMemo, useState, useTransition, useId } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
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
import { createAndIssueInvoice } from "./actions";
import { cn } from "@/lib/utils";

type Customer = { id: string; name: string; phone: string };

export function InvoiceBuilder({
  services,
  rules,
  customers,
  preselectedCustomerId,
  preselectedCaseId,
}: {
  services: Service[];
  rules: Rule[];
  customers: Customer[];
  preselectedCustomerId: string | null;
  preselectedCaseId: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const idemBase = useId();

  const [customerId, setCustomerId] = useState(preselectedCustomerId ?? "");
  const [serviceId, setServiceId] = useState("");
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const service = services.find((s) => s.id === serviceId) ?? null;
  // Show the traveller inputs whenever the service prices anything per person —
  // driven by the catalogue's qty rules, not a hardcoded family list.
  const hasPerPerson = service
    ? rulesForService(rules, service.id).some((r) => r.qty_rule === "per_person")
    : false;

  // Rebuild lines from the catalogue. Any manual edits are intentionally lost —
  // that's what "reset" means.
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
    // Re-deriving quantities would silently discard a rate the user typed. Only
    // recompute qty; keep edited rates.
    setLines((prev) =>
      prev.map((l) => ({
        ...l,
        qty:
          l.qty_rule === "per_person" ? Math.max(1, a + c) : 1,
      })),
    );
  };

  const totals = useMemo(() => computeTotals(lines), [lines]);

  const setLine = (i: number, patch: Partial<DraftLine>) => {
    setTouched(true);
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  };

  const submit = () => {
    if (!customerId) return setError("Choose a customer.");
    if (!serviceId) return setError("Choose a service.");
    if (lines.length === 0) return setError("An invoice needs at least one line.");
    setError(null);

    startTransition(async () => {
      const res = await createAndIssueInvoice({
        customerId,
        caseId: preselectedCaseId,
        serviceId,
        paxAdults: adults,
        paxChildren: children,
        lines: toDraftPayload(lines),
        amountNote: note || null,
        expectedTotalFils: totals.total_paise,
        idempotencyKey: `${idemBase}:${customerId}:${serviceId}`,
      });

      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast(`Invoice ${res.number} issued.`, "ok");
      router.push(`/invoices/${res.invoiceId}`);
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
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="h-10 w-full rounded-lg border border-line bg-paper px-3 text-[13px] font-medium text-ink outline-none focus:border-accent focus:bg-surface"
              >
                <option value="">Choose…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.phone}
                  </option>
                ))}
              </select>
            </Field>

            {/*
              §3.4: pricing resolves from the 4 dimensions. The select is over
              real services rather than a hardcoded list, so an eleventh service
              is a row in the catalogue, not a code change.
            */}
            <Field label="Service">
              <select
                value={serviceId}
                onChange={(e) => onService(e.target.value)}
                className="h-10 w-full rounded-lg border border-line bg-paper px-3 text-[13px] font-medium text-ink outline-none focus:border-accent focus:bg-surface"
              >
                <option value="">Choose…</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>

            {/* Per-person services scale automatically by number of travellers. */}
            {hasPerPerson && (
              <div className="flex gap-3">
                <Field label="Adults">
                  <input
                    type="number"
                    min={1}
                    value={adults}
                    onChange={(e) =>
                      onPax(Math.max(1, Number(e.target.value) || 1), children)
                    }
                    className="h-10 w-full rounded-lg border border-line bg-paper px-3 font-mono text-[13px] text-ink outline-none focus:border-accent focus:bg-surface"
                  />
                </Field>
                <Field label="Children">
                  <input
                    type="number"
                    min={0}
                    value={children}
                    onChange={(e) =>
                      onPax(adults, Math.max(0, Number(e.target.value) || 0))
                    }
                    className="h-10 w-full rounded-lg border border-line bg-paper px-3 font-mono text-[13px] text-ink outline-none focus:border-accent focus:bg-surface"
                  />
                </Field>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-line bg-surface p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-bold tracking-[-0.2px] text-ink">
              Lines
            </h2>
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
                <div
                  key={i}
                  className="flex flex-wrap items-end gap-2 rounded-lg border border-line bg-paper p-2.5"
                >
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
                      onChange={(e) =>
                        setLine(i, { qty: Math.max(1, Number(e.target.value) || 1) })
                      }
                      className="h-8 w-full rounded border border-line bg-surface px-2 font-mono text-[12.5px] text-ink outline-none focus:border-accent"
                    />
                  </label>

                  <label className="w-[104px]">
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-[1px] text-ink-faint">
                      Rate
                    </span>
                    <input
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
                        setLine(i, {
                          gst_bp: Math.max(
                            0,
                            Math.round((Number(e.target.value) || 0) * 100),
                          ),
                        })
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
                      Catalogue rate is {formatPaise(l.catalogue_rate_paise)} — the
                      difference will be shown on the invoice.
                    </p>
                  )}
                </div>
              ))}

              <button
                onClick={() => {
                  setTouched(true);
                  setLines((p) => [
                    ...p,
                    {
                      label: "",
                      qty: 1,
                      rate_paise: 0,
                      catalogue_rate_paise: 0,
                      gst_bp: 0,
                      qty_rule: "once",
                    },
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
              placeholder="Appears on the invoice"
              className="rounded-lg border border-line bg-paper px-3 py-2 text-[12.5px] text-ink outline-none placeholder:text-ink-ghost focus:border-accent focus:bg-surface"
            />
          </label>

          {error && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg bg-alert-pale px-3 py-2.5 text-[12px] font-medium text-alert"
            >
              <AlertTriangle size={13} className="mt-px shrink-0" />
              {error}
            </p>
          )}

          <Button variant="primary" onClick={submit} disabled={pending}>
            {pending ? "Issuing…" : "Issue invoice"}
          </Button>

          {/* §3.7 — say it before they click, not after. */}
          <p className="text-[11px] font-medium text-ink-faint">
            Issuing is final. An issued invoice can't be edited — a correction is a
            void and reissue, or a credit note.
          </p>
        </div>
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-1 flex-col gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-[1px] text-ink-mid">
        {label}
      </span>
      {children}
    </label>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[12px] font-medium text-ink-mid">{label}</dt>
      <dd
        className={
          strong
            ? "font-mono text-[15px] font-extrabold text-ink"
            : "font-mono text-[12.5px] font-semibold text-ink-soft"
        }
      >
        {value}
      </dd>
    </div>
  );
}
