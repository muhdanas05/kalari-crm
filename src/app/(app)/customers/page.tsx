import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/PageHead";
import { Tag } from "@/components/ui/Tag";
import { listCustomers, listCustomerCategories } from "@/lib/db/customers";
import { getCatalogue } from "@/lib/db/catalogue";
import { getProfile, requirePermission } from "@/lib/auth/session";
import { formatDate } from "@/lib/dates";
import { ChevronRight, Mail, PhoneOff } from "@/components/icons";
import { CustomerSearch } from "./CustomerSearch";
import { CustomerCategoryFilter } from "./CustomerCategoryFilter";
import { NewLeadButton } from "./NewLeadButton";
import { RestoreButton } from "./RestoreButton";

export const metadata: Metadata = { title: "Customers · Kalari" };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; archived?: string }>;
}) {
  await requirePermission("customers");
  const { q, category, archived } = await searchParams;
  const showArchived = archived === "1";
  const [profile, customers, categories, catalogue] = await Promise.all([
    getProfile(),
    listCustomers({ q, category, archived: showArchived }),
    listCustomerCategories(),
    getCatalogue(),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        eyebrow="Intake"
        title="Customers"
        subtitle={
          profile?.role === "admin"
            ? "Every customer, every service history."
            : "The customers assigned to you."
        }
        actions={<NewLeadButton services={catalogue.services} />}
      />

      <CustomerSearch initial={q ?? ""} category={category} />
      <CustomerCategoryFilter
        categories={categories}
        active={category ?? "all"}
        q={q}
      />

      {/* Archived rows are hidden from every list, so without this door there
          is no way to reach anything you archived — nor to undo it. */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href={showArchived ? "/customers" : "/customers?archived=1"}
          className="text-[12px] font-semibold text-accent hover:underline"
        >
          {showArchived ? "← Back to active customers" : "View archived"}
        </Link>
        {showArchived && (
          <span className="text-[11.5px] font-medium text-ink-faint">
            Showing archived only
          </span>
        )}
      </div>

      {customers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line py-12 text-center text-[13px] font-medium text-ink-faint">
          {showArchived
            ? "Nothing archived."
            : q
              ? `Nothing matches “${q}”.`
              : "No customers yet."}
        </p>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-line bg-surface">
          {customers.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-2 border-b border-line pr-3 last:border-0"
            >
              <Link
                href={`/customers/${c.id}`}
                className="flex flex-1 items-center gap-3 px-4 py-3 transition-colors hover:bg-paper"
              >
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-bold text-ink">
                    {c.name}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2">
                    <span className="font-mono text-[11.5px] text-ink-mid">
                      {c.phone}
                    </span>
                    {/*
                      §5.6: no email on file is not cosmetic — it means this
                      customer can only ever be reached by a phone call, and the
                      call queue is where they'll surface. Show it.
                    */}
                    {c.email ? (
                      <span className="flex min-w-0 items-center gap-1 text-[11.5px] text-ink-faint">
                        <Mail size={11} className="shrink-0" />
                        <span className="truncate">{c.email}</span>
                      </span>
                    ) : (
                      <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-warn">
                        <PhoneOff size={11} />
                        Call only
                      </span>
                    )}
                  </span>
                </div>

                {c.category && (
                  <Tag tone="accent" className="hidden shrink-0 sm:inline-flex">
                    {c.category}
                  </Tag>
                )}

                <span className="hidden shrink-0 text-[11px] font-medium text-ink-ghost sm:block">
                  {formatDate(c.created_at)}
                </span>
                <ChevronRight size={15} className="shrink-0 text-ink-ghost" />
              </Link>
              {showArchived && <RestoreButton kind="customer" id={c.id} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
