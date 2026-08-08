import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile, hasPermission } from "@/lib/auth/session";
import { getAdminDashboard } from "@/lib/db/dashboard";
import { getStuckCases } from "@/lib/db/pipelines";
import { PageHead } from "@/components/PageHead";
import { StatCard } from "@/components/ui/StatCard";
import { Tag } from "@/components/ui/Tag";
import { formatPaise, formatPaiseCompact } from "@/lib/money";
import { Users, FileText, Banknote, AlertTriangle, Kanban } from "@/components/icons";

export const metadata: Metadata = { title: "Dashboard · Kalari" };

/**
 * The dashboard. Single-admin mode (0032) — one person runs this CRM, so
 * there is one dashboard, not an admin/employee split. What used to be
 * "cases per employee" is gone: a bar list comparing one person to nobody
 * told the owner nothing they didn't already know.
 */
export default async function DashboardPage() {
  const profile = await requireProfile();
  const admin = hasPermission(profile, "accounts");
  const [d, stuck] = await Promise.all([getAdminDashboard(), getStuckCases(6)]);

  return (
    <div className="flex flex-col gap-6">
      <PageHead
        eyebrow="Overview"
        title={`Good day, ${profile.name.split(" ")[0]}.`}
        subtitle="Every enquiry, case and invoice, in one place."
      />

      {/*
        Revenue tiles follow the same 'accounts' permission as the Accounts
        page — not hidden behind a click, not zeroed out, just not rendered
        for whoever isn't granted it. Only "New leads today" isn't money.
      */}
      <div
        className={
          admin
            ? "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
            : "grid grid-cols-1 gap-3 sm:max-w-xs"
        }
      >
        <StatCard
          label="New leads today"
          value={d.newLeadsToday}
          sub={`${d.newLeadsThisWeek} this week`}
          icon={Users}
        />
        {admin && (
          <>
            <StatCard
              label="Collected this month"
              value={formatPaiseCompact(d.collectedThisMonthFils)}
              sub="Payments recorded"
              icon={Banknote}
              accent="ok"
            />
            <StatCard
              label="Total outstanding"
              value={formatPaiseCompact(d.outstandingFils)}
              sub="Invoiced minus paid"
              icon={FileText}
              accent={d.outstandingFils > 0 ? "warn" : "default"}
            />
            <StatCard
              label="Overdue"
              value={d.overdueCount}
              sub={formatPaise(d.overdueFils)}
              icon={AlertTriangle}
              accent={d.overdueCount > 0 ? "alert" : "default"}
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Active cases" icon={Kanban}>
          {d.activeByPipeline.length === 0 ? (
            <Empty>No open cases.</Empty>
          ) : (
            <ul className="flex flex-col">
              {d.activeByPipeline.map((p) => (
                <li
                  key={p.name}
                  className="flex items-center justify-between border-b border-line py-2.5 last:border-0"
                >
                  <span className="text-[13px] font-medium text-ink-soft">
                    {p.name}
                  </span>
                  <span className="font-mono text-[13px] font-semibold text-ink">
                    {p.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title={`Stuck cases${d.stuckCount ? ` (${d.stuckCount})` : ""}`}
          icon={AlertTriangle}
        >
          {stuck.length === 0 ? (
            <Empty>Nothing stuck. Every case moved in the last 7 days.</Empty>
          ) : (
            <ul className="flex flex-col">
              {stuck.map((c) => (
                <li key={c.id} className="border-b border-line last:border-0">
                  <Link
                    href={`/cases/${c.id}`}
                    className="row-hover-paper flex items-center justify-between gap-3 py-2.5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-ink">
                        {c.customer_name}
                      </span>
                      <span className="block truncate text-[11.5px] text-ink-mid">
                        {c.stage_name}
                      </span>
                    </span>
                    <Tag tone="alert">{c.days_in_stage}d</Tag>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-6">
      <h2 className="mb-3 flex items-center gap-2 text-base font-bold tracking-[-0.2px] text-ink">
        <Icon size={16} className="text-ink-faint" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-6 text-center text-[12.5px] font-medium text-ink-faint">
      {children}
    </p>
  );
}
