import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHead } from "@/components/PageHead";
import { Tag } from "@/components/ui/Tag";
import { getInvoiceDetail, statusLabel, statusTone } from "@/lib/db/invoices";
import { getProfile } from "@/lib/auth/session";
import { formatPaise, formatPaiseBare, isRateEdited } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { Lock, UserSquare2, FileText } from "@/components/icons";
import { RecordPaymentButton } from "./RecordPaymentButton";
import { EmailInvoiceButton } from "./EmailInvoiceButton";
import { VoidButton } from "./VoidButton";

export const metadata: Metadata = { title: "Invoice · Kalari" };

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [detail, profile] = await Promise.all([getInvoiceDetail(id), getProfile()]);
  if (!detail) notFound();

  const { invoice, lines, payments, customer } = detail;
  const voided = invoice.lifecycle === "void";
  const outstanding = invoice.outstanding_paise ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHead
        eyebrow={invoice.doc_type === "credit_note" ? "Credit note" : "Invoice"}
        backHref="/invoices"
        backLabel="All invoices"
        title={invoice.number ?? "—"}
        subtitle={invoice.service_name ?? undefined}
        actions={
          <div className="flex items-center gap-2">
            <a
              href={`/invoices/${invoice.id}/pdf`}
              target="_blank"
              rel="noopener"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-[12.5px] font-semibold text-ink-soft transition-colors hover:border-line-strong"
            >
              <FileText size={14} />
              PDF
            </a>
            {invoice.customer_id && customer?.email && (
              <EmailInvoiceButton invoiceId={invoice.id!} email={customer.email} />
            )}
            {!voided && outstanding > 0 && (
              <RecordPaymentButton
                invoiceId={invoice.id!}
                outstandingFils={outstanding}
              />
            )}
            {/* Void is admin-only, and the RPC refuses once money is against it. */}
            {!voided && profile?.role === "admin" && (
              <VoidButton
                kind="invoice"
                invoiceId={invoice.id!}
                label={invoice.number ?? "This invoice"}
              />
            )}
          </div>
        }
      />

      {/*
        §3.7: issued invoices are immutable. Corrections are void-and-reissue or
        a credit note. Say so in the product — an office that believes it can
        edit an invoice will try, and the refusal should not be a surprise.
      */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-paper px-5 py-3">
        <Lock size={14} className="shrink-0 text-ink-faint" />
        <p className="flex-1 text-[12.5px] font-medium text-ink-mid">
          Issued documents can't be edited. A correction is a void and reissue, or
          a credit note.
        </p>
        <Tag tone={statusTone(invoice.display_status)}>
          {statusLabel(invoice.display_status)}
        </Tag>
      </div>

      {voided && (
        <div className="rounded-xl border border-alert/30 bg-alert-pale/40 px-5 py-3.5">
          <p className="text-[13px] font-semibold text-ink">
            Voided {formatDate(invoice.voided_at)}
          </p>
          {invoice.void_reason && (
            <p className="mt-0.5 text-[12.5px] text-ink-mid">
              {invoice.void_reason}
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-xl border border-line bg-surface p-6 lg:col-span-2">
          <h2 className="mb-4 text-base font-bold tracking-[-0.2px] text-ink">
            Lines
          </h2>

          <div className="-mx-6 overflow-x-auto px-6">
            <table className="w-full min-w-[560px] border-collapse">
              <thead>
                <tr className="border-b border-line">
                  {["No", "Description", "Qty", "Rate", "Tax", "Net Amount"].map(
                    (h, i) => (
                      <th
                        key={h}
                        className={`pb-2 text-[10.5px] font-bold uppercase tracking-[1px] text-ink-faint ${
                          i > 1 ? "text-right" : "text-left"
                        }`}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-b border-line last:border-0">
                    <td className="py-2.5 font-mono text-[12px] text-ink-faint">
                      {l.line_no}
                    </td>
                    <td className="py-2.5 pr-3 text-[12.5px] font-medium text-ink">
                      {l.label}
                      {/*
                        §3.5: an edited rate is legal, but the difference from the
                        catalogue must be visible on the issued document. Both
                        rates are snapshotted on the line, so show the delta.
                      */}
                      {isRateEdited({
                        label: l.label,
                        qty: l.qty,
                        rate_paise: l.rate_paise,
                        catalogue_rate_paise: l.catalogue_rate_paise,
                      }) && (
                        <span className="ml-2 whitespace-nowrap rounded-full bg-warn-pale px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-warn">
                          catalogue {formatPaiseBare(l.catalogue_rate_paise!)}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-right font-mono text-[12px] text-ink-soft">
                      {l.qty}
                    </td>
                    <td className="py-2.5 text-right font-mono text-[12px] text-ink-soft">
                      {formatPaiseBare(l.rate_paise)}
                    </td>
                    <td className="py-2.5 text-right font-mono text-[12px] text-ink-soft">
                      {l.gst_paise ? formatPaiseBare(l.gst_paise) : "—"}
                    </td>
                    <td className="py-2.5 text-right font-mono text-[12.5px] font-semibold text-ink">
                      {formatPaiseBare(l.amount_paise)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} />
                  <td className="pt-3 text-right text-[11.5px] font-medium text-ink-mid">
                    Subtotal
                  </td>
                  <td className="pt-3 text-right font-mono text-[12.5px] text-ink-soft">
                    {formatPaiseBare(invoice.subtotal_paise ?? 0)}
                  </td>
                </tr>
                {(invoice.gst_paise ?? 0) > 0 && (
                  <tr>
                    <td colSpan={4} />
                    <td className="pt-1 text-right text-[11.5px] font-medium text-ink-mid">
                      GST
                    </td>
                    <td className="pt-1 text-right font-mono text-[12.5px] text-ink-soft">
                      {formatPaiseBare(invoice.gst_paise ?? 0)}
                    </td>
                  </tr>
                )}
                <tr>
                  <td colSpan={4} />
                  <td className="pt-2 text-right text-[12px] font-bold text-ink">
                    Grand Total
                  </td>
                  <td className="pt-2 text-right font-mono text-[14px] font-extrabold text-ink">
                    {formatPaiseBare(invoice.total_paise ?? 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {invoice.amount_note && (
            <p className="mt-4 border-t border-line pt-3 text-[12px] font-medium text-ink-mid">
              {invoice.amount_note}
            </p>
          )}
        </section>

        <div className="flex flex-col gap-6 lg:col-span-1">
          <section className="rounded-xl border border-line bg-surface p-6">
            <h2 className="mb-3 text-base font-bold tracking-[-0.2px] text-ink">
              Balance
            </h2>
            <dl className="flex flex-col gap-2">
              <Row label="Total" value={formatPaise(invoice.total_paise ?? 0)} />
              <Row label="Paid" value={formatPaise(invoice.paid_paise ?? 0)} />
              {(invoice.credited_paise ?? 0) > 0 && (
                <Row
                  label="Credited"
                  value={formatPaise(invoice.credited_paise ?? 0)}
                />
              )}
              <div className="mt-1 border-t border-line pt-2">
                <Row
                  label="Outstanding"
                  value={formatPaise(outstanding)}
                  strong
                  tone={outstanding > 0 ? "warn" : "ok"}
                />
              </div>
            </dl>
            <p className="mt-3 text-[11px] font-medium text-ink-faint">
              Due {formatDate(invoice.due_date)}
              {invoice.is_overdue && ` · ${invoice.days_overdue} days overdue`}
            </p>
          </section>

          {customer && (
            <section className="rounded-xl border border-line bg-surface p-6">
              <h2 className="mb-3 text-base font-bold tracking-[-0.2px] text-ink">
                Billed to
              </h2>
              <p className="text-[13px] font-bold text-ink">{customer.name}</p>
              <p className="font-mono text-[11.5px] text-ink-mid">
                {customer.phone}
              </p>
              {customer.email && (
                <p className="truncate font-mono text-[11.5px] text-ink-mid">
                  {customer.email}
                </p>
              )}
              <Link
                href={`/customers/${customer.id}`}
                className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-[12px] font-semibold text-ink-soft transition-colors hover:border-line-strong"
              >
                <UserSquare2 size={13} />
                Profile
              </Link>
            </section>
          )}

          <section className="rounded-xl border border-line bg-surface p-6">
            <h2 className="mb-3 text-base font-bold tracking-[-0.2px] text-ink">
              Payments
            </h2>
            {payments.length === 0 ? (
              <p className="py-3 text-[12.5px] font-medium text-ink-faint">
                Nothing received yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {payments.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-2 border-b border-line pb-2 last:border-0"
                  >
                    <span>
                      <span className="block font-mono text-[12.5px] font-semibold text-ink">
                        {formatPaise(p.amount_paise)}
                      </span>
                      <span className="block text-[10.5px] text-ink-faint">
                        {formatDate(p.paid_on)} · {p.method}
                        {p.reference && ` · ${p.reference}`}
                        {p.number && (
                          <>
                            {" · "}
                            <span className="font-mono">{p.number}</span>
                          </>
                        )}
                      </span>
                    </span>
                    {p.voided_at ? (
                      <Tag tone="neutral">Void</Tag>
                    ) : (
                      <span className="flex shrink-0 items-center gap-2.5">
                        {p.number && (
                          <Link
                            href={`/payments/${p.id}/receipt`}
                            target="_blank"
                            className="text-[11.5px] font-semibold text-accent hover:underline"
                          >
                            Receipt
                          </Link>
                        )}
                        {profile?.role === "admin" && (
                          <VoidButton
                            kind="payment"
                            paymentId={p.id}
                            invoiceId={invoice.id!}
                            label={`${p.number ?? "This payment"}`}
                          />
                        )}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "warn" | "ok";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[12px] font-medium text-ink-mid">{label}</dt>
      <dd
        className={`font-mono ${strong ? "text-[14px] font-extrabold" : "text-[12.5px] font-semibold"} ${
          tone === "warn" ? "text-warn" : tone === "ok" ? "text-ok" : "text-ink"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
