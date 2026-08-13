import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHead } from "@/components/PageHead";
import { EdList } from "@/components/ui/EdList";
import { Tag } from "@/components/ui/Tag";
import { getSupplierDetail } from "@/lib/db/suppliers";
import { getProfile, requirePermission } from "@/lib/auth/session";
import { formatDate, formatDateTime } from "@/lib/dates";
import { ChevronRight, Mail, Send } from "@/components/icons";
import { SupplierFormModal } from "../SupplierFormModal";
import { ArchiveEntityButton } from "../../ArchiveEntityButton";

export const metadata: Metadata = { title: "Supplier · Kalari" };

export default async function SupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("suppliers");
  const { id } = await params;
  const [profile, detail] = await Promise.all([getProfile(), getSupplierDetail(id)]);
  if (!detail) notFound();
  const { supplier: s, cases, emails } = detail;

  return (
    <div className="flex flex-col gap-6">
      <PageHead
        eyebrow="Supplier"
        backHref="/suppliers"
        backLabel="All suppliers"
        title={s.name}
        subtitle={s.supplies ?? undefined}
        actions={
          profile?.role === "admin" ? (
            <div className="flex items-center gap-2">
              <SupplierFormModal supplier={s} />
              <ArchiveEntityButton
                kind="supplier"
                id={s.id}
                name={s.name}
                redirectTo="/suppliers"
              />
            </div>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-line bg-surface p-6">
          <h2 className="mb-3 text-base font-bold tracking-[-0.2px] text-ink">Contact</h2>
          <EdList
            rows={[
              { label: "Contact person", value: s.contact_person ?? "—" },
              { label: "Phone", value: s.phone ?? "—", mono: true },
              { label: "WhatsApp", value: s.whatsapp ?? "—", mono: true },
              { label: "Email", value: s.email ?? "—" },
              { label: "City", value: s.city ?? "—" },
              { label: "Address", value: s.address ?? "—" },
            ]}
          />
          {s.notes && (
            <p className="mt-4 whitespace-pre-wrap text-[12.5px] font-medium text-ink-mid">
              {s.notes}
            </p>
          )}
        </section>

        <section className="rounded-xl border border-line bg-surface p-6">
          <h2 className="mb-3 text-base font-bold tracking-[-0.2px] text-ink">
            Cases using this supplier
          </h2>
          {cases.length === 0 ? (
            <p className="py-6 text-center text-[12.5px] font-medium text-ink-faint">
              No cases yet.
            </p>
          ) : (
            <ul className="flex flex-col">
              {cases.map((c) => (
                <li key={c.id} className="border-b border-line py-2.5 last:border-0">
                  <Link
                    href={`/cases/${c.id}`}
                    className="flex items-center justify-between gap-3 text-[13px] hover:text-accent"
                  >
                    <span className="min-w-0 flex-1 truncate font-semibold text-ink">
                      {c.customer?.name ?? "—"}
                      <span className="ml-1.5 font-normal text-ink-faint">
                        {c.service?.name}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] font-medium text-ink-ghost">
                      {formatDate(c.opened_at)}
                    </span>
                    <ChevronRight size={13} className="shrink-0 text-ink-ghost" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-line bg-surface p-6">
        <h2 className="mb-3 flex items-center gap-2 text-base font-bold tracking-[-0.2px] text-ink">
          <Send size={15} className="text-ink-faint" />
          Email history
        </h2>
        {emails.length === 0 ? (
          <p className="py-6 text-center text-[12.5px] font-medium text-ink-faint">
            No emails sent to this supplier yet.
          </p>
        ) : (
          <ul className="flex flex-col">
            {emails.map((e) => (
              <li key={e.id} className="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
                <Mail size={13} className="shrink-0 text-ink-faint" />
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink">
                  {e.subject}
                </span>
                <Tag tone={e.status === "sent" ? "ok" : e.status === "failed" ? "alert" : "warn"}>
                  {e.status}
                </Tag>
                <span className="shrink-0 text-[11px] font-medium text-ink-ghost">
                  {formatDateTime(e.occurred_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
