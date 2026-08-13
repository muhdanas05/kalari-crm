import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHead } from "@/components/PageHead";
import { EdList } from "@/components/ui/EdList";
import { Tag } from "@/components/ui/Tag";
import { getCustomerDetail, getCustomerActivity } from "@/lib/db/customers";
import { statusLabel, statusTone } from "@/lib/db/invoices";
import { formatPaise } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { ChevronRight, PhoneCall, Mail, AlertTriangle } from "@/components/icons";
import { PortalLink } from "./PortalLink";
import { getProfile, requirePermission } from "@/lib/auth/session";
import { ArchiveEntityButton } from "../../ArchiveEntityButton";

export const metadata: Metadata = { title: "Customer · Kalari" };

export default async function CustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("customers");
  const { id } = await params;
  const detail = await getCustomerDetail(id);
  // Not found, or RLS says it isn't yours — same answer either way. Don't
  // confirm the existence of a customer an employee can't see.
  if (!detail) notFound();

  const { customer, cases, invoices } = detail;
  const [activity, profile] = await Promise.all([
    getCustomerActivity(id),
    getProfile(),
  ]);

  const outstanding = invoices
    .filter((i) => i.lifecycle === "issued")
    .reduce((s, i) => s + (i.outstanding_paise ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHead
        eyebrow="Customer"
        backHref="/customers"
        backLabel="All customers"
        title={customer.name}
        subtitle={customer.sponsor_company ?? undefined}
        actions={
          <div className="flex items-center gap-2">
            <a
              href={`tel:${customer.phone.replace(/\s/g, "")}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-3.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-accent-deep"
            >
              <PhoneCall size={14} />
              Call
            </a>
            {customer.email && (
              <a
                href={`mailto:${customer.email}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-[12.5px] font-semibold text-ink-soft transition-colors hover:border-line-strong"
              >
                <Mail size={14} />
                Email
              </a>
            )}
            {/* Admin-only, and the RPC refuses while they still owe money. */}
            {profile?.role === "admin" && (
              <ArchiveEntityButton
                kind="customer"
                id={customer.id}
                name={customer.name}
                redirectTo="/customers"
              />
            )}
          </div>
        }
      />

      {/* Money block first — it's what a chase call opens with. */}
      {outstanding > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-warn/30 bg-warn-pale/40 px-5 py-3.5">
          <AlertTriangle size={16} className="shrink-0 text-warn" />
          <p className="text-[13px] font-semibold text-ink">
            {formatPaise(outstanding)} outstanding
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-xl border border-line bg-surface p-6 lg:col-span-1">
          <h2 className="mb-3 text-base font-bold tracking-[-0.2px] text-ink">
            Details
          </h2>
          <EdList
            rows={[
              { label: "Phone", value: customer.phone, mono: true },
              ...(customer.phone_alt
                ? [{ label: "Alt phone", value: customer.phone_alt, mono: true }]
                : []),
              {
                label: "Email",
                value: customer.email ?? "— none on file —",
                mono: !!customer.email,
              },
              { label: "Nationality", value: customer.nationality ?? "—" },
              { label: "Source", value: customer.source ?? "—" },
              { label: "Added", value: formatDate(customer.created_at) },
            ]}
          />
          {!customer.email && (
            <p className="mt-3 rounded-lg bg-warn-pale/50 px-3 py-2 text-[11.5px] font-medium text-ink-soft">
              No email on file — this customer can only be reached by phone, so
              chasing them always becomes a call task.
            </p>
          )}

          <div className="mt-4 border-t border-line pt-4">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[1px] text-ink-mid">
              Status portal
            </p>
            <p className="mb-2.5 text-[11.5px] font-medium text-ink-faint">
              A private link showing their progress — so they stop ringing to ask.
            </p>
            <PortalLink
              customerId={customer.id}
              issuedAt={customer.portal_issued_at}
              revokedAt={customer.portal_revoked_at}
            />
          </div>
        </section>

        <section className="rounded-xl border border-line bg-surface p-6 lg:col-span-2">
          <h2 className="mb-3 text-base font-bold tracking-[-0.2px] text-ink">
            Cases
          </h2>
          {cases.length === 0 ? (
            <Empty>No cases yet.</Empty>
          ) : (
            <ul className="flex flex-col">
              {cases.map((c) => (
                <li key={c.id} className="border-b border-line last:border-0">
                  <Link
                    href={`/cases/${c.id}`}
                    className="flex items-center gap-3 py-3 transition-colors hover:bg-paper"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-ink">
                        {c.service_name ?? "No service yet"}
                      </span>
                      <span className="block text-[11.5px] text-ink-mid">
                        {c.pipeline_name} · opened {formatDate(c.opened_at)}
                      </span>
                    </span>
                    <Tag tone={c.is_stuck ? "alert" : "accent"}>
                      {c.stage_name}
                    </Tag>
                    <ChevronRight size={15} className="shrink-0 text-ink-ghost" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-line bg-surface p-6">
          <h2 className="mb-3 text-base font-bold tracking-[-0.2px] text-ink">
            Invoices
          </h2>
          {invoices.length === 0 ? (
            <Empty>No invoices yet.</Empty>
          ) : (
            <ul className="flex flex-col">
              {invoices.map((i) => (
                <li key={i.id} className="border-b border-line last:border-0">
                  <Link
                    href={`/invoices/${i.id}`}
                    className="flex items-center gap-3 py-2.5 transition-colors hover:bg-paper"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-[12.5px] font-semibold text-ink">
                        {i.number}
                      </span>
                      <span className="block text-[11px] text-ink-mid">
                        {formatDate(i.issue_date)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-mono text-[12.5px] font-semibold text-ink">
                        {formatPaise(i.total_paise ?? 0)}
                      </span>
                      {(i.outstanding_paise ?? 0) > 0 && (
                        <span className="block font-mono text-[10.5px] text-warn">
                          {formatPaise(i.outstanding_paise!)} due
                        </span>
                      )}
                    </span>
                    <Tag tone={statusTone(i.display_status)}>
                      {statusLabel(i.display_status)}
                    </Tag>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/*
          SOW §02.C: "Full timeline: every stage change, every email sent, every
          call made." activity_log is append-only and trigger-written, so this is
          the record — not a best-effort log the app might forget to write.
        */}
        <section className="rounded-xl border border-line bg-surface p-6">
          <h2 className="mb-3 text-base font-bold tracking-[-0.2px] text-ink">
            Timeline
          </h2>
          {activity.length === 0 ? (
            <Empty>Nothing recorded yet.</Empty>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {activity.slice(0, 12).map((a) => (
                <li key={a.id} className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-medium text-ink-soft">
                      {describeActivity(a.entity, a.action, a.changed_keys)}
                    </span>
                    <span className="block font-mono text-[10.5px] text-ink-faint">
                      {formatDateTime(a.occurred_at)}
                      {a.actor_kind !== "user" && ` · ${a.actor_kind}`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function describeActivity(
  entity: string,
  action: string,
  changedKeys: string[] | null,
): string {
  const noun = entity.replace(/_/g, " ");
  if (action === "insert") return `${cap(noun)} created`;
  if (action === "delete") return `${cap(noun)} removed`;
  const keys = changedKeys ?? [];
  if (keys.includes("stage_id")) return "Stage changed";
  if (keys.includes("assigned_user_id")) return "Reassigned";
  if (keys.length === 0) return `${cap(noun)} updated`;
  return `${cap(noun)} updated — ${keys.slice(0, 3).join(", ").replace(/_/g, " ")}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-6 text-center text-[12.5px] font-medium text-ink-faint">
      {children}
    </p>
  );
}
