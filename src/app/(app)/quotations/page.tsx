import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/PageHead";
import { Tag } from "@/components/ui/Tag";
import { listQuotations } from "@/lib/db/quotations";
import { formatPaise } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { ChevronRight, Plus } from "@/components/icons";
import { statusLabel, statusTone } from "@/lib/quotations/display";
import { QuotationFilter } from "./QuotationFilter";

export const metadata: Metadata = { title: "Quotations · Kalari" };

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const quotations = await listQuotations({ status });

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        eyebrow="Money"
        title="Quotations"
        subtitle="Send a price before there's an invoice to send."
        actions={
          <Link
            href="/quotations/new"
            className="cta-accent-gradient inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[12.5px] font-semibold text-white"
          >
            <Plus size={14} strokeWidth={2.6} />
            New quotation
          </Link>
        }
      />

      <QuotationFilter active={status ?? "all"} />

      {quotations.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line py-12 text-center text-[13px] font-medium text-ink-faint">
          No quotations{status && status !== "all" ? ` marked ${statusLabel(status).toLowerCase()}` : ""}.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-line bg-surface">
          {quotations.map((q) => {
            const customer = q.customers as unknown as { name: string; phone: string } | null;
            return (
              <li key={q.id} className="border-b border-line last:border-0">
                <Link
                  href={`/quotations/${q.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-paper"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-[13px] font-semibold text-ink">
                      {q.number}
                    </span>
                    <span className="block truncate text-[11.5px] font-medium text-ink-mid">
                      {customer?.name ?? "—"}
                    </span>
                    <span className="block font-mono text-[10.5px] text-ink-faint">
                      {formatDate(q.created_at)}
                    </span>
                  </span>

                  <span className="shrink-0 text-right font-mono text-[13px] font-semibold text-ink">
                    {formatPaise(q.total_paise)}
                  </span>

                  <span className="shrink-0">
                    <Tag tone={statusTone(q.status)}>{statusLabel(q.status)}</Tag>
                  </span>

                  <ChevronRight size={15} className="shrink-0 text-ink-ghost" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
