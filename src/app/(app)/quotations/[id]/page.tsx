import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHead } from "@/components/PageHead";
import { Tag } from "@/components/ui/Tag";
import { getQuotationDetail } from "@/lib/db/quotations";
import { statusLabel, statusTone } from "@/lib/quotations/display";
import { formatPaise, formatPaiseBare } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { FileText, Pencil, UserSquare2 } from "@/components/icons";
import { StatusActions } from "./StatusActions";
import type { DraftLine } from "@/lib/pricing/engine";

export const metadata: Metadata = { title: "Quotation · Kalari" };

export default async function QuotationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getQuotationDetail(id);
  if (!detail) notFound();

  const { quotation, customer, serviceName } = detail;
  const lines = (quotation.lines as unknown as DraftLine[]) ?? [];
  const editable = ["draft", "sent"].includes(quotation.status);

  return (
    <div className="flex flex-col gap-6">
      <PageHead
        eyebrow="Quotation"
        backHref="/quotations"
        backLabel="All quotations"
        title={quotation.number ?? "—"}
        subtitle={serviceName ?? quotation.custom_service_name ?? undefined}
        actions={
          <div className="flex items-center gap-2">
            <a
              href={`/quotations/${id}/pdf`}
              target="_blank"
              rel="noopener"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-[12.5px] font-semibold text-ink-soft transition-colors hover:border-line-strong"
            >
              <FileText size={14} />
              PDF
            </a>
            {editable && (
              <Link
                href={`/quotations/${id}/edit`}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-[12.5px] font-semibold text-ink-soft transition-colors hover:border-line-strong"
              >
                <Pencil size={14} />
                Edit
              </Link>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-5">
        <div className="flex items-center gap-3">
          <Tag tone={statusTone(quotation.status)}>{statusLabel(quotation.status)}</Tag>
          {quotation.valid_until && (
            <span className="text-[12px] font-medium text-ink-mid">
              Valid until {formatDate(quotation.valid_until)}
            </span>
          )}
          {quotation.converted_invoice_id && (
            <Link
              href={`/invoices/${quotation.converted_invoice_id}`}
              className="text-[12px] font-semibold text-accent hover:underline"
            >
              View converted invoice →
            </Link>
          )}
        </div>
        <StatusActions id={id} status={quotation.status} totalFils={quotation.total_paise} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <section className="rounded-xl border border-line bg-surface p-6">
            <h2 className="mb-3 text-base font-bold tracking-[-0.2px] text-ink">Lines</h2>
            <div className="overflow-hidden rounded-lg border border-line">
              <table className="w-full text-[12.5px]">
                <thead className="bg-paper-deep text-[11px] font-bold uppercase tracking-[0.06em] text-ink-mid">
                  <tr>
                    <th className="px-3 py-2 text-left">Description</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Rate</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className="px-3 py-2 font-medium text-ink">{l.label}</td>
                      <td className="px-3 py-2 text-right font-mono text-ink-soft">{l.qty}</td>
                      <td className="px-3 py-2 text-right font-mono text-ink-soft">
                        {formatPaiseBare(l.rate_paise)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-ink">
                        {formatPaiseBare(l.qty * l.rate_paise)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {quotation.amount_note && (
              <p className="mt-3 text-[12px] font-medium italic text-ink-mid">{quotation.amount_note}</p>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-6 lg:col-span-1">
          <section className="rounded-xl border border-line bg-surface p-6">
            <h2 className="mb-3 flex items-center gap-2 text-base font-bold tracking-[-0.2px] text-ink">
              <UserSquare2 size={16} className="text-ink-faint" />
              Customer
            </h2>
            {customer ? (
              <Link href={`/customers/${customer.id}`} className="block hover:underline">
                <p className="text-[13.5px] font-bold text-ink">{customer.name}</p>
                <p className="font-mono text-[12px] text-ink-mid">{customer.phone}</p>
              </Link>
            ) : (
              <p className="text-[12.5px] text-ink-faint">—</p>
            )}
          </section>

          <section className="rounded-xl border border-line bg-surface p-6">
            <h2 className="mb-3 text-base font-bold tracking-[-0.2px] text-ink">Total</h2>
            <dl className="flex flex-col gap-1.5">
              <Row label="Subtotal" value={formatPaise(quotation.subtotal_paise)} />
              <Row label="GST" value={formatPaise(quotation.gst_paise)} />
              <div className="mt-1 border-t border-line pt-2">
                <Row label="Grand total" value={formatPaise(quotation.total_paise)} strong />
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
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
