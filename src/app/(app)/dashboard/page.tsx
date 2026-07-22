import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth/session";
import { getAdminDashboard, getEmployeeDashboard } from "@/lib/db/dashboard";
import { getStuckCases } from "@/lib/db/pipelines";
import { PageHead } from "@/components/PageHead";
import { StatCard } from "@/components/ui/StatCard";
import { Tag } from "@/components/ui/Tag";
import { formatPaise, formatPaiseCompact } from "@/lib/money";
import {
  Users,
  FileText,
  Banknote,
  AlertTriangle,
  Kanban,
  PhoneCall,
} from "@/components/icons";

export const metadata: Metadata = { title: "Dashboard · Kalari" };

export default async function DashboardPage() {
  const profile = await requireProfile();
  return profile.role === "admin" ? (
    <AdminDashboard />
  ) : (
    <EmployeeDashboard name={profile.name} />
  );
}

/* ───────────────────────── Admin ───────────────────────── */

async function AdminDashboard() {
  const [d, stuck] = await Promise.all([getAdminDashboard(), getStuckCases(6)]);

  return (
    <div className="flex flex-col gap-6">
      <PageHead
        eyebrow="Overview"
        title="Dashboard"
        subtitle="Every enquiry, case and invoice across the business."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="New leads today"
          value={d.newLeadsToday}
          sub={`${d.newLeadsThisWeek} this week`}
          icon={Users}
        />
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
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel title="Active cases" icon={Kanban} className="lg:col-span-1">
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

        {/* SOW §02.B: "see instantly if work is unbalanced". */}
        <Panel title="Cases per employee" icon={Users} className="lg:col-span-1">
          {d.casesPerEmployee.length === 0 ? (
            <Empty>No employees yet.</Empty>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {d.casesPerEmployee.map((e) => {
                const max = Math.max(...d.casesPerEmployee.map((x) => x.count), 1);
                return (
                  <li key={e.name} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="truncate text-[12.5px] font-medium text-ink-soft">
                        {e.name}
                      </span>
                      <span className="font-mono text-[12px] font-semibold text-ink">
                        {e.count}
                      </span>
                    </div>
                    <div
                      className="h-1.5 overflow-hidden rounded-full bg-paper-deep"
                      role="presentation"
                    >
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${(e.count / max) * 100}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel
          title={`Stuck cases${d.stuckCount ? ` (${d.stuckCount})` : ""}`}
          icon={AlertTriangle}
          className="lg:col-span-1"
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

/* ─────────────────────── Employee ─────────────────────── */

/**
 * §5.9: "Employee: my call list · my active cases · my stuck cases · my unpaid
 * invoices. No company revenue."
 *
 * There is deliberately no revenue tile here — not a hidden one, not a zeroed
 * one. RLS would refuse the underlying rows anyway; this is the UI agreeing.
 */
async function EmployeeDashboard({ name }: { name: string }) {
  const profile = await requireProfile();
  const d = await getEmployeeDashboard(profile);

  return (
    <div className="flex flex-col gap-6">
      <PageHead
        eyebrow="Overview"
        title={`Good day, ${name.split(" ")[0]}.`}
        subtitle="Your cases and the people who need chasing."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="My active cases" value={d.myActiveCases} icon={Kanban} />
        <StatCard
          label="My stuck cases"
          value={d.myStuckCases}
          sub="No movement in 7 days"
          icon={AlertTriangle}
          accent={d.myStuckCases > 0 ? "alert" : "default"}
        />
        <StatCard
          label="My unpaid invoices"
          value={d.myUnpaidInvoices}
          icon={FileText}
          accent={d.myUnpaidInvoices > 0 ? "warn" : "default"}
        />
      </div>

      <Link
        href="/calls"
        className="soft-elev-hover flex items-center gap-4 rounded-xl border border-line bg-surface p-5"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-mist">
          <PhoneCall size={20} className="text-accent" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold text-ink">My Call List</span>
          <span className="block text-[12.5px] font-medium text-ink-mid">
            Who to call, why, and what to say.
          </span>
        </span>
      </Link>
    </div>
  );
}

/* ──────────────────────── shared ──────────────────────── */

function Panel({
  title,
  icon: Icon,
  className,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-xl border border-line bg-surface p-6 ${className ?? ""}`}
    >
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
