import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHead } from "@/components/PageHead";
import { EdList } from "@/components/ui/EdList";
import { Tag } from "@/components/ui/Tag";
import { StageTracker } from "@/components/case/StageTracker";
import { getCase, stagePathOf } from "@/lib/db/pipelines";
import { getCaseSupplier, listSuppliers } from "@/lib/db/suppliers";
import { formatPaise } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { AlertTriangle, PhoneCall, UserSquare2, Truck } from "@/components/icons";
import { SupplierControls } from "./SupplierControls";

export const metadata: Metadata = { title: "Case · Kalari" };

export default async function CasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [c, supplier, suppliers] = await Promise.all([
    getCase(id),
    getCaseSupplier(id),
    listSuppliers(),
  ]);
  if (!c) notFound();

  const path = stagePathOf(c);
  const pax = (c.pax_adults ?? 0) + (c.pax_children ?? 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHead
        eyebrow={c.pipeline_name ?? "Case"}
        title={c.customer_name ?? "Case"}
        subtitle={c.service_name ?? "No service set"}
        actions={
          c.customer_phone ? (
            <a
              href={`tel:${c.customer_phone.replace(/\s/g, "")}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-3.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-accent-deep"
            >
              <PhoneCall size={14} />
              Call
            </a>
          ) : undefined
        }
      />

      {c.is_stuck && (
        <div className="flex items-center gap-3 rounded-xl border border-alert/30 bg-alert-pale/40 px-5 py-3.5">
          <AlertTriangle size={16} className="shrink-0 text-alert" />
          <p className="text-[13px] font-semibold text-ink">
            Stuck — no movement in {c.days_in_stage} days.
          </p>
        </div>
      )}

      <section className="rounded-xl border border-line bg-surface p-6">
        <h2 className="mb-4 text-base font-bold tracking-[-0.2px] text-ink">
          Progress
        </h2>
        <StageTracker caseId={c.id!} path={path} currentStageId={c.stage_id!} />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-line bg-surface p-6">
          <h2 className="mb-3 text-base font-bold tracking-[-0.2px] text-ink">
            Case
          </h2>
          <EdList
            rows={[
              { label: "Stage", value: <Tag tone="accent">{c.stage_name}</Tag> },
              { label: "Days in stage", value: String(c.days_in_stage ?? 0), mono: true },
              { label: "Owner", value: c.assignee_name ?? "Unassigned" },
              { label: "Opened", value: formatDate(c.opened_at) },
              {
                label: "People",
                value:
                  pax > 0
                    ? `${c.pax_adults} adult${c.pax_adults === 1 ? "" : "s"}` +
                      (c.pax_children ? `, ${c.pax_children} children` : "")
                    : "—",
              },
              {
                // §3.16: captured at Stamping. Without it the renewal engine —
                // the highest-value feature — never fires for this customer.
                label: "Visa issued",
                value: c.visa_issue_date ? (
                  formatDate(c.visa_issue_date)
                ) : (
                  <span className="text-ink-faint">Not yet — set at Stamping</span>
                ),
              },
              {
                label: "Outstanding",
                value:
                  (c.outstanding_paise ?? 0) > 0 ? (
                    <span className="font-semibold text-warn">
                      {formatPaise(c.outstanding_paise!)}
                    </span>
                  ) : (
                    "Nothing owed"
                  ),
              },
            ]}
          />
        </section>

        <section className="rounded-xl border border-line bg-surface p-6">
          <h2 className="mb-3 text-base font-bold tracking-[-0.2px] text-ink">
            Customer
          </h2>
          <EdList
            rows={[
              { label: "Name", value: c.customer_name ?? "—" },
              { label: "Phone", value: c.customer_phone ?? "—", mono: true },
            ]}
          />
          <Link
            href={`/customers/${c.customer_id}`}
            className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-[12.5px] font-semibold text-ink-soft transition-colors hover:border-line-strong"
          >
            <UserSquare2 size={14} />
            Full profile
          </Link>
        </section>

        <section className="rounded-xl border border-line bg-surface p-6">
          <h2 className="mb-3 flex items-center gap-2 text-base font-bold tracking-[-0.2px] text-ink">
            <Truck size={15} className="text-ink-faint" />
            Supplier
          </h2>
          <SupplierControls
            caseId={c.id!}
            current={supplier}
            suppliers={suppliers}
            serviceName={c.service_name}
            pax={pax}
          />
        </section>
      </div>
    </div>
  );
}
