import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHead } from "@/components/PageHead";
import { getCatalogue } from "@/lib/db/catalogue";
import { listCustomers } from "@/lib/db/customers";
import { getQuotationDetail } from "@/lib/db/quotations";
import { QuotationBuilder, type ExistingQuotation } from "../../new/QuotationBuilder";
import type { DraftLine } from "@/lib/pricing/engine";
import { requirePermission } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Edit quotation · Kalari" };

export default async function EditQuotationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("quotations");
  const { id } = await params;
  const [detail, { services, rules }, customers] = await Promise.all([
    getQuotationDetail(id),
    getCatalogue(),
    listCustomers({ limit: 300 }),
  ]);
  if (!detail) notFound();

  const { quotation } = detail;
  if (!["draft", "sent"].includes(quotation.status)) {
    redirect(`/quotations/${id}`);
  }

  const existing: ExistingQuotation = {
    id: quotation.id,
    number: quotation.number ?? "",
    customer_id: quotation.customer_id,
    service_id: quotation.service_id,
    custom_service_name: quotation.custom_service_name,
    pax_adults: quotation.pax_adults,
    pax_children: quotation.pax_children,
    // Stored lines don't carry qty_rule (toDraftPayload() strips it) — default
    // to "once" so pax-count changes don't silently misjudge which lines
    // scale per traveller; the admin can still edit quantities by hand.
    lines: ((quotation.lines as unknown as Omit<DraftLine, "qty_rule">[]) ?? []).map((l) => ({
      ...l,
      qty_rule: "once" as const,
    })),
    amount_note: quotation.amount_note,
    valid_until: quotation.valid_until,
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHead
        eyebrow="Money"
        backHref={`/quotations/${id}`}
        backLabel="Back to quotation"
        title={`Edit ${quotation.number}`}
        subtitle="Change anything — nothing here is final until it's converted."
      />
      <QuotationBuilder
        services={services}
        rules={rules}
        customers={customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone }))}
        preselectedCustomerId={null}
        existing={existing}
      />
    </div>
  );
}
