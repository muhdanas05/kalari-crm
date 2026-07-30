import type { Metadata } from "next";
import { PageHead } from "@/components/PageHead";
import { getCatalogue } from "@/lib/db/catalogue";
import { listCustomers } from "@/lib/db/customers";
import { InvoiceBuilder } from "./InvoiceBuilder";

export const metadata: Metadata = { title: "New invoice · Kalari" };

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string; case?: string }>;
}) {
  const sp = await searchParams;
  const [{ services, rules }, customers] = await Promise.all([
    getCatalogue(),
    listCustomers({ limit: 300 }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHead
        eyebrow="Money"
        backHref={sp.case ? `/cases/${sp.case}` : "/invoices"}
        backLabel={sp.case ? "Back to case" : "All invoices"}
        title="New invoice"
        subtitle="Pick the service — the lines fill themselves in from your rate card."
      />
      <InvoiceBuilder
        services={services}
        rules={rules}
        customers={customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone }))}
        preselectedCustomerId={sp.customer ?? null}
        preselectedCaseId={sp.case ?? null}
      />
    </div>
  );
}
