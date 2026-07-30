import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/PageHead";
import { Tag } from "@/components/ui/Tag";
import { StatCard } from "@/components/ui/StatCard";
import { listInvoices, statusLabel, statusTone } from "@/lib/db/invoices";
import { formatPaise, formatPaiseCompact } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { getProfile } from "@/lib/auth/session";
import { ChevronRight, Plus, FileText, Banknote, AlertTriangle } from "@/components/icons";
import { InvoiceFilter } from "./InvoiceFilter";

export const metadata: Metadata = { title: "Invoices · Kalari" };

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const [profile, invoices] = await Promise.all([
    getProfile(),
    listInvoices({ status }),
  ]);

  // Totals across the fetched set. Every figure comes from invoices_v, which
  // derives outstanding in SQL — so these reconcile by definition (§8.4).
  const issued = invoices.filter((i) => i.lifecycle === "issued");
  const totalFils = issued.reduce((s, i) => s + (i.total_paise ?? 0), 0);
  const outstandingFils = issued.reduce(
    (s, i) => s + (i.outstanding_paise ?? 0),
    0,
  );
  const overdue = issued.filter((i) => i.display_status === "overdue");

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        eyebrow="Money"
        title="Invoices"
        subtitle={
          profile?.role === "admin"
            ? "Every issued document, and what's still owed."
            : "Invoices for your customers."
        }
        actions={
          <Link
            href="/invoices/new"
            className="cta-accent-gradient inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[12.5px] font-semibold text-white"
          >
            <Plus size={14} strokeWidth={2.6} />
            New invoice
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Invoiced"
          value={formatPaiseCompact(totalFils)}
          sub={`${issued.length} issued`}
          icon={FileText}
        />
        <StatCard
          label="Outstanding"
          value={formatPaiseCompact(outstandingFils)}
          icon={Banknote}
          accent={outstandingFils > 0 ? "warn" : "ok"}
        />
        <StatCard
          label="Overdue"
          value={overdue.length}
          sub={formatPaise(
            overdue.reduce((s, i) => s + (i.outstanding_paise ?? 0), 0),
          )}
          icon={AlertTriangle}
          accent={overdue.length > 0 ? "alert" : "default"}
        />
      </div>

      <InvoiceFilter active={status ?? "all"} />

      {invoices.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line py-12 text-center text-[13px] font-medium text-ink-faint">
          No invoices{status && status !== "all" ? ` marked ${statusLabel(status).toLowerCase()}` : ""}.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-line bg-surface">
          {invoices.map((i) => (
            <li
              key={i.id}
              className="relative flex items-center border-b border-line last:border-0"
            >
              <Link
                href={`/invoices/${i.id}`}
                className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 transition-colors hover:bg-paper"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-[13px] font-semibold text-ink">
                    {i.number}
                  </span>
                  <span className="block truncate text-[11.5px] font-medium text-ink-mid">
                    {i.service_name}
                  </span>
                  <span className="block font-mono text-[10.5px] text-ink-faint">
                    {formatDate(i.issue_date)}
                    {i.doc_type === "credit_note" && " · credit note"}
                  </span>
                </span>

                <span className="shrink-0 text-right">
                  <span className="block font-mono text-[13px] font-semibold text-ink">
                    {formatPaise(i.total_paise ?? 0)}
                  </span>
                  {(i.outstanding_paise ?? 0) > 0 && (
                    <span className="block font-mono text-[10.5px] font-medium text-warn">
                      {formatPaise(i.outstanding_paise!)} due
                    </span>
                  )}
                </span>

                <span className="shrink-0">
                  <Tag tone={statusTone(i.display_status)}>
                    {statusLabel(i.display_status)}
                    {i.display_status === "overdue" && i.days_overdue
                      ? ` ${i.days_overdue}d`
                      : ""}
                  </Tag>
                </span>

                <ChevronRight size={15} className="shrink-0 text-ink-ghost" />
              </Link>

              {/* Sibling of the row link, not nested — anchors can't nest. */}
              {i.lifecycle !== "void" && (
                <a
                  href={`/invoices/${i.id}/pdf`}
                  target="_blank"
                  rel="noopener"
                  aria-label={`Open PDF for invoice ${i.number ?? ""}`}
                  className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-ink-faint transition-colors hover:border-line-strong hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-mist"
                >
                  <FileText size={14} />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
