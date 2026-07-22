import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/PageHead";
import { listCustomers } from "@/lib/db/customers";
import { getProfile } from "@/lib/auth/session";
import { formatDate } from "@/lib/dates";
import { ChevronRight, Mail, PhoneOff } from "@/components/icons";
import { CustomerSearch } from "./CustomerSearch";
import { NewLeadButton } from "./NewLeadButton";

export const metadata: Metadata = { title: "Customers · Kalari" };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const [profile, customers] = await Promise.all([getProfile(), listCustomers({ q })]);

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
        actions={<NewLeadButton />}
      />

      <CustomerSearch initial={q ?? ""} />

      {customers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line py-12 text-center text-[13px] font-medium text-ink-faint">
          {q ? `Nothing matches “${q}”.` : "No customers yet."}
        </p>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-line bg-surface">
          {customers.map((c) => (
            <li key={c.id} className="border-b border-line last:border-0">
              <Link
                href={`/customers/${c.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-paper"
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

                <span className="hidden shrink-0 text-[11px] font-medium text-ink-ghost sm:block">
                  {formatDate(c.created_at)}
                </span>
                <ChevronRight size={15} className="shrink-0 text-ink-ghost" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
