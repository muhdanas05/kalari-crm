import type { Metadata } from "next";
import { PageHead } from "@/components/PageHead";
import { getCatalogue } from "@/lib/db/catalogue";
import { listCustomers } from "@/lib/db/customers";
import { QuotationBuilder } from "./QuotationBuilder";
import { requirePermission } from "@/lib/auth/session";

export const metadata: Metadata = { title: "New quotation · Kalari" };

export default async function NewQuotationPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>;
}) {
  await requirePermission("quotations");
  const sp = await searchParams;
  const [{ services, rules }, customers] = await Promise.all([
    getCatalogue(),
    listCustomers({ limit: 300 }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHead
        eyebrow="Money"
        backHref="/quotations"
        backLabel="All quotations"
        title="New quotation"
        subtitle="Send a price. Nothing here touches the ledger until it's accepted and converted."
      />
      <QuotationBuilder
        services={services}
        rules={rules}
        customers={customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone }))}
        preselectedCustomerId={sp.customer ?? null}
      />
    </div>
  );
}
