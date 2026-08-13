import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/PageHead";
import { StatCard } from "@/components/ui/StatCard";
import { listPayments } from "@/lib/db/invoices";
import { formatPaise, formatPaiseCompact } from "@/lib/money";
import { formatDate, todayKolkata } from "@/lib/dates";
import { Banknote, ChevronRight } from "@/components/icons";
import { requirePermission } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Payments · Kalari" };

export default async function PaymentsPage() {
  await requirePermission("payments");
  const payments = await listPayments();
  const monthStart = todayKolkata().slice(0, 8) + "01";

  const thisMonth = payments
    .filter((p) => p.paid_on >= monthStart)
    .reduce((s, p) => s + p.amount_paise, 0);
  const total = payments.reduce((s, p) => s + p.amount_paise, 0);

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        eyebrow="Money"
        title="Payments"
        subtitle="Everything received, against which invoice."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard
          label="Collected this month"
          value={formatPaiseCompact(thisMonth)}
          icon={Banknote}
          accent="ok"
        />
        <StatCard
          label="Payments recorded"
          value={payments.length}
          sub={formatPaise(total)}
          icon={Banknote}
        />
      </div>

      {payments.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line py-12 text-center text-[13px] font-medium text-ink-faint">
          No payments recorded yet.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-line bg-surface">
          {payments.map((p) => {
            // The embedded relation is typed loosely by the generated types.
            const inv = p.invoices as unknown as {
              number: string;
              customers: { name: string } | null;
            } | null;
            return (
              <li key={p.id} className="flex items-center gap-2 border-b border-line last:border-0">
                <Link
                  href={`/invoices/${p.invoice_id}`}
                  className="flex flex-1 items-center gap-3 px-4 py-3 transition-colors hover:bg-paper"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold text-ink">
                      {inv?.customers?.name ?? "—"}
                    </span>
                    <span className="block font-mono text-[11px] text-ink-mid">
                      {inv?.number ?? "—"} · {p.method}
                      {p.reference && ` · ${p.reference}`}
                      {p.number && <> · {p.number}</>}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-mono text-[13px] font-semibold text-ok">
                      {formatPaise(p.amount_paise)}
                    </span>
                    <span className="block font-mono text-[10.5px] text-ink-faint">
                      {formatDate(p.paid_on)}
                    </span>
                  </span>
                  <ChevronRight size={15} className="shrink-0 text-ink-ghost" />
                </Link>
                {!p.voided_at && p.number && (
                  <Link
                    href={`/payments/${p.id}/receipt`}
                    target="_blank"
                    className="shrink-0 pr-4 text-[11.5px] font-semibold text-accent hover:underline"
                  >
                    Receipt
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
