"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Trash2, Plus, AlertTriangle } from "@/components/icons";
import { computeTotals, toDraftPayload, type DraftLine } from "@/lib/pricing/engine";
import { formatPaise, formatPaiseBare, parseInrToPaise } from "@/lib/money";
import { editIssuedInvoice } from "./actions";

/**
 * Edit an issued invoice. Deliberately a plain line editor rather than the
 * catalogue-driven builder: this invoice already exists and its lines are
 * whatever they are, so re-resolving them against the price list would fight
 * the person trying to correct one number.
 */
export function InvoiceEditor({
  invoiceId,
  number,
  issueDate,
  initial,
}: {
  invoiceId: string;
  number: string;
  issueDate: string;
  initial: {
    paxAdults: number;
    paxChildren: number;
    dueDate: string;
    amountNote: string;
    lines: DraftLine[];
    paidPaise: number;
  };
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();

  const [adults, setAdults] = useState(initial.paxAdults);
  const [children, setChildren] = useState(initial.paxChildren);
  const [dueDate, setDueDate] = useState(initial.dueDate);
  const [note, setNote] = useState(initial.amountNote);
  const [lines, setLines] = useState<DraftLine[]>(initial.lines);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(() => computeTotals(lines), [lines]);
  const belowPaid = totals.total_paise < initial.paidPaise;

  const setLine = (i: number, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const submit = () => {
    if (lines.length === 0) return setError("An invoice needs at least one line.");
    if (lines.some((l) => !l.label.trim())) {
      return setError("Every line needs a description.");
    }
    setError(null);
    start(async () => {
      const res = await editIssuedInvoice(invoiceId, {
        paxAdults: adults,
        paxChildren: children,
        dueDate,
        amountNote: note || null,
        lines: toDraftPayload(lines),
        expectedTotalPaise: totals.total_paise,
        reason: reason || null,
      });
      if (!res.ok) return setError(res.error);
      toast(`${res.number} updated.`, "ok");
      router.push(`/invoices/${invoiceId}`);
    });
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-6 lg:col-span-2">
        <section className="rounded-xl border border-line bg-surface p-6">
          <h2 className="mb-4 text-base font-bold tracking-[-0.2px] text-ink">Details</h2>
          <div className="flex flex-wrap gap-3">
            <Field label="Adults">
              <input
                type="number"
                min={0}
                value={adults}
                onChange={(e) => setAdults(Math.max(0, Number(e.target.value) || 0))}
                className={numClass}
              />
            </Field>
            <Field label="Children">
              <input
                type="number"
                min={0}
                value={children}
                onChange={(e) => setChildren(Math.max(0, Number(e.target.value) || 0))}
                className={numClass}
              />
            </Field>
            <Field label="Due date">
              <input
                type="date"
                value={dueDate}
                min={issueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={numClass}
              />
            </Field>
          </div>
        </section>

        <section className="rounded-xl border border-line bg-surface p-6">
          <h2 className="mb-4 text-base font-bold tracking-[-0.2px] text-ink">Lines</h2>
          <div className="flex flex-col gap-2">
            {lines.map((l, i) => (
              <div
                key={i}
                className="flex flex-wrap items-end gap-2 rounded-lg border border-line bg-paper p-2.5"
              >
                <label className="min-w-[160px] flex-1">
                  <span className={miniLabel}>Description</span>
                  <input
                    value={l.label}
                    onChange={(e) => setLine(i, { label: e.target.value })}
                    className={cellClass}
                  />
                </label>

                <label className="w-[64px]">
                  <span className={miniLabel}>Qty</span>
                  <input
                    type="number"
                    min={1}
                    value={l.qty}
                    onChange={(e) => setLine(i, { qty: Math.max(1, Number(e.target.value) || 1) })}
                    className={`${cellClass} font-mono`}
                  />
                </label>

                <label className="w-[104px]">
                  <span className={miniLabel}>Rate</span>
                  <input
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
                    className={`${cellClass} font-mono`}
                  />
                </label>

                <label className="w-[72px]">
                  <span className={miniLabel}>GST %</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={(l.gst_bp ?? 0) / 100}
                    onChange={(e) =>
                      setLine(i, {
                        gst_bp: Math.max(0, Math.round((Number(e.target.value) || 0) * 100)),
                      })
                    }
                    className={`${cellClass} font-mono`}
                  />
                </label>

                <span className="w-[92px] pb-1.5 text-right font-mono text-[12.5px] font-semibold text-ink">
                  {formatPaiseBare(l.qty * l.rate_paise)}
                </span>

                <button
                  onClick={() => setLines((p) => p.filter((_, j) => j !== i))}
                  aria-label={`Remove ${l.label}`}
                  className="mb-1 flex h-8 w-8 items-center justify-center rounded text-ink-faint transition-colors hover:bg-alert-pale hover:text-alert"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}

            <button
              onClick={() =>
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
                ])
              }
              className="mt-1 inline-flex h-9 items-center gap-1.5 self-start rounded-lg border border-dashed border-line px-3 text-[12.5px] font-semibold text-ink-mid transition-colors hover:border-accent hover:text-accent"
            >
              <Plus size={14} />
              Add a line
            </button>
          </div>
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

          {initial.paidPaise > 0 && (
            <p
              className={`rounded-lg px-3 py-2 text-[12px] font-medium ${
                belowPaid ? "bg-alert-pale text-alert" : "bg-paper-deep text-ink-mid"
              }`}
            >
              {formatPaise(initial.paidPaise)} already paid.
              {belowPaid
                ? " The new total is below that — void the payment first, or raise the total."
                : " The outstanding balance updates when you save."}
            </p>
          )}

          <label className="flex flex-col gap-1.5">
            <span className={miniLabel}>Note (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="rounded-lg border border-line bg-paper px-3 py-2 text-[12.5px] text-ink outline-none focus:border-accent focus:bg-surface"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={miniLabel}>Why (optional)</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. wrong rate"
              className="h-9 rounded-lg border border-line bg-paper px-3 text-[12.5px] text-ink outline-none placeholder:text-ink-ghost focus:border-accent focus:bg-surface"
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
            {pending ? "Saving…" : "Save changes"}
          </Button>

          <p className="text-[11px] font-medium text-ink-faint">
            {number} keeps its number. The PDF is regenerated from the new
            lines next time it&apos;s opened.
          </p>
        </div>
      </aside>
    </div>
  );
}

const numClass =
  "h-10 w-[120px] rounded-lg border border-line bg-paper px-3 font-mono text-[13px] text-ink outline-none focus:border-accent focus:bg-surface";
const cellClass =
  "h-8 w-full rounded border border-line bg-surface px-2 text-[12.5px] font-medium text-ink outline-none focus:border-accent";
const miniLabel =
  "mb-1 block text-[10px] font-bold uppercase tracking-[1px] text-ink-faint";

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

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
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
