import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/PageHead";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/EmptyState";
import { requirePermission } from "@/lib/auth/session";
import { listLedger, ledgerTotals, defaultRange, type LedgerEntry } from "@/lib/db/accounts";
import { listSuppliers } from "@/lib/db/suppliers";
import { formatPaise, formatPaiseBare, formatPaiseCompact } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  Download,
  BookOpen,
  ChevronRight,
} from "@/components/icons";
import { ExpenseFormModal } from "./ExpenseFormModal";
import { ExpenseRowActions } from "./ExpenseRowActions";

export const metadata: Metadata = { title: "Accounts · Kalari" };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The account book. "Stop keeping it on paper" — money in on the left of the
 * ledger (payments, which already carry receipt numbers), money out on the
 * right (expenses), grouped by the day it happened.
 *
 * Gated on the 'accounts' permission — granular per-tab now, not a flat
 * admin/manager split. The expenses RLS policy checks the same permission
 * independently, so this isn't just a hidden nav item.
 */
export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requirePermission("accounts");
  const sp = await searchParams;
  const fallback = defaultRange();
  const from = sp.from && DATE_RE.test(sp.from) ? sp.from : fallback.from;
  const to = sp.to && DATE_RE.test(sp.to) ? sp.to : fallback.to;

  const [entries, suppliers] = await Promise.all([
    listLedger({ from, to }),
    listSuppliers(),
  ]);
  const totals = ledgerTotals(entries);
  const days = groupByDay(entries);

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        eyebrow="Money"
        title="Account book"
        subtitle="Everything in and everything out, by the day it happened."
        actions={
          <ExpenseFormModal
            today={fallback.to}
            suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
          />
        }
      />

      {/* Native GET form — the range lives in the URL, so it is shareable and
          the CSV export can be handed the same two values. */}
      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4"
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[1px] text-ink-mid">From</span>
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="h-10 rounded-lg border border-line bg-paper px-3 font-mono text-[13px] text-ink outline-none focus:border-accent focus:bg-surface"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[1px] text-ink-mid">To</span>
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="h-10 rounded-lg border border-line bg-paper px-3 font-mono text-[13px] text-ink outline-none focus:border-accent focus:bg-surface"
          />
        </label>
        <button
          type="submit"
          className="h-10 rounded-full bg-accent px-4 text-[13px] font-bold text-white transition-colors hover:bg-accent-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-mist"
        >
          Show
        </button>
        <Link
          href={`/accounts/export?from=${from}&to=${to}`}
          prefetch={false}
          className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-[13px] font-bold text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
        >
          <Download size={14} strokeWidth={2.4} />
          Export CSV
        </Link>
      </form>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Money in"
          value={formatPaiseCompact(totals.in_paise)}
          sub={formatPaise(totals.in_paise)}
          icon={ArrowDownLeft}
          accent="ok"
        />
        <StatCard
          label="Money out"
          value={formatPaiseCompact(totals.out_paise)}
          sub={formatPaise(totals.out_paise)}
          icon={ArrowUpRight}
          accent="alert"
        />
        <StatCard
          label="Net"
          value={formatPaiseCompact(totals.net_paise)}
          sub={formatPaise(totals.net_paise)}
          icon={Wallet}
          accent={totals.net_paise < 0 ? "alert" : "ok"}
        />
      </div>

      {entries.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Nothing in this range"
          description="No payments received and no expenses recorded between these two dates."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          {days.map(({ date, rows }) => {
            const t = ledgerTotals(rows);
            return (
              <div key={date}>
                <div className="flex items-center justify-between gap-3 border-b border-line bg-paper px-4 py-2">
                  <span className="text-[11.5px] font-bold uppercase tracking-[1px] text-ink-mid">
                    {formatDate(date)}
                  </span>
                  <span className="font-mono text-[11.5px] font-semibold text-ink-faint">
                    <span className="text-ok">+{formatPaiseBare(t.in_paise)}</span>
                    {"  "}
                    <span className="text-alert">−{formatPaiseBare(t.out_paise)}</span>
                  </span>
                </div>

                {rows.map((r) => (
                  <LedgerRow
                    key={`${r.kind}-${r.id}`}
                    entry={r}
                    today={to}
                    suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LedgerRow({
  entry,
  today,
  suppliers,
}: {
  entry: LedgerEntry;
  today: string;
  suppliers: { id: string; name: string }[];
}) {
  const isIn = entry.kind === "in";
  const body = (
    <>
      <span
        className={`mt-0.5 shrink-0 ${isIn ? "text-ok" : "text-alert"}`}
        aria-hidden="true"
      >
        {isIn ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-bold text-ink">{entry.label}</span>
        <span className="block truncate font-mono text-[11px] text-ink-mid">
          {[entry.ref, entry.sublabel, entry.method].filter(Boolean).join(" · ")}
        </span>
      </span>
      <span
        className={`shrink-0 font-mono text-[13px] font-semibold ${isIn ? "text-ok" : "text-alert"}`}
      >
        {isIn ? "+" : "−"}
        {formatPaiseBare(entry.amount_paise)}
      </span>
    </>
  );

  return (
    <div className="border-b border-line last:border-0">
      {isIn && entry.invoice_id ? (
        <Link
          href={`/invoices/${entry.invoice_id}`}
          className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-paper"
        >
          {body}
          <ChevronRight size={15} className="mt-0.5 shrink-0 text-ink-ghost" />
        </Link>
      ) : (
        <div className="flex items-start gap-3 px-4 py-2.5">
          {body}
          {/* Money out is correctable; money in is corrected by voiding the
              payment, which lives on the invoice. */}
          {entry.expense ? (
            <ExpenseRowActions
              today={today}
              suppliers={suppliers}
              expense={{
                id: entry.id,
                spent_on: entry.date,
                category: entry.label,
                amount_paise: entry.amount_paise,
                method: entry.method,
                supplier_id: entry.expense.supplier_id,
                description: entry.sublabel,
                notes: entry.expense.notes,
              }}
            />
          ) : (
            <span className="w-[35px] shrink-0" />
          )}
        </div>
      )}
    </div>
  );
}

/** Entries are already date-sorted, so one pass groups them. */
function groupByDay(entries: LedgerEntry[]): { date: string; rows: LedgerEntry[] }[] {
  const out: { date: string; rows: LedgerEntry[] }[] = [];
  for (const e of entries) {
    const last = out[out.length - 1];
    if (last && last.date === e.date) last.rows.push(e);
    else out.push({ date: e.date, rows: [e] });
  }
  return out;
}
