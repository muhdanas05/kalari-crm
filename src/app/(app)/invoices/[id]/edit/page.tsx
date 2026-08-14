import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHead } from "@/components/PageHead";
import { getInvoiceDetail } from "@/lib/db/invoices";
import { requirePermission } from "@/lib/auth/session";
import { InvoiceEditor } from "./InvoiceEditor";
import type { DraftLine } from "@/lib/pricing/engine";

export const metadata: Metadata = { title: "Edit invoice · Kalari" };

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("invoices");
  const { id } = await params;
  const detail = await getInvoiceDetail(id);
  if (!detail) notFound();

  const { invoice, lines, payments } = detail;

  // A void invoice has nothing to correct — it has already been withdrawn.
  if (invoice.lifecycle !== "issued") redirect(`/invoices/${id}`);

  const paidPaise = payments
    .filter((p) => !p.voided_at)
    .reduce((s, p) => s + p.amount_paise, 0);

  const editorLines: DraftLine[] = lines.map((l) => ({
    label: l.label,
    qty: l.qty,
    rate_paise: l.rate_paise,
    catalogue_rate_paise: l.catalogue_rate_paise ?? l.rate_paise,
    gst_bp: l.gst_bp ?? 0,
    qty_rule: "once" as const,
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHead
        eyebrow="Money"
        backHref={`/invoices/${id}`}
        backLabel="Back to invoice"
        title={`Edit ${invoice.number}`}
        subtitle="The number stays the same. Everything else here can be corrected."
      />
      <InvoiceEditor
        invoiceId={id}
        number={invoice.number ?? ""}
        issueDate={invoice.issue_date ?? ""}
        initial={{
          paxAdults: invoice.pax_adults ?? 1,
          paxChildren: invoice.pax_children ?? 0,
          dueDate: invoice.due_date ?? "",
          amountNote: invoice.amount_note ?? "",
          lines: editorLines,
          paidPaise,
        }}
      />
    </div>
  );
}
