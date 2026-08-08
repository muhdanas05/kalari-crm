import type { Metadata } from "next";
import { PageHead } from "@/components/PageHead";
import { StatCard } from "@/components/ui/StatCard";
import { Tag } from "@/components/ui/Tag";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getCallActivity } from "@/lib/db/calls";
import { OUTCOME_LABEL, type CallOutcome } from "@/lib/calls/display";
import { PhoneCall, AlertTriangle, Clock } from "@/components/icons";

export const metadata: Metadata = { title: "Call activity · Kalari" };

/**
 * The follow-up report.
 *
 * "i need a report also on which guy has done how many follow ups and all"
 *
 * It reports the outcome MIX, not a leaderboard of raw volume — because §5.7's
 * whole point is: "if someone marks everything 'no answer' in four seconds, this
 * surfaces it." A table sorted by call count would rank that person top.
 */
export default async function CallActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requirePermission("admin_calls");
  const sp = await searchParams;
  const days = Number(sp.days) || 7;

  const supabase = await createClient();
  const [{ data: report }, activity] = await Promise.all([
    supabase.rpc("call_report", { p_days: days }),
    getCallActivity(days),
  ]);

  const rows = report ?? [];
  const totalCalls = rows.reduce((s, r) => s + Number(r.calls), 0);
  const totalOpen = rows.reduce((s, r) => s + Number(r.open_tasks), 0);
  const totalOverdue = rows.reduce((s, r) => s + Number(r.overdue_tasks), 0);

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        eyebrow="Admin"
        title="Call activity"
        subtitle={`Who is following up, and who isn't. Last ${days} days.`}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Calls logged"
          value={totalCalls}
          sub={`Last ${days} days`}
          icon={PhoneCall}
        />
        <StatCard label="Open tasks" value={totalOpen} icon={Clock} />
        <StatCard
          label="Overdue tasks"
          value={totalOverdue}
          sub="Past their due date"
          icon={AlertTriangle}
          accent={totalOverdue > 0 ? "alert" : "default"}
        />
      </div>

      <section className="overflow-hidden rounded-xl border border-line bg-surface">
        <header className="flex items-baseline justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="text-base font-bold tracking-[-0.2px] text-ink">
            Follow-ups per person
          </h2>
          <p className="text-[11.5px] font-medium text-ink-faint">
            Reach rate matters more than volume
          </p>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="border-b border-line bg-paper">
                {[
                  "Person",
                  "Calls",
                  "Reached",
                  "Promised",
                  "No answer",
                  "Reach rate",
                  "Open",
                  "Overdue",
                ].map((h, i) => (
                  <th
                    key={h}
                    className={`px-4 py-2 text-[10.5px] font-bold uppercase tracking-[1px] text-ink-faint ${
                      i === 0 ? "text-left" : "text-right"
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const calls = Number(r.calls);
                const rate = Number(r.reach_pct);
                // The pattern §5.7 exists to catch: plenty of calls, nobody reached.
                const suspicious = calls >= 5 && rate === 0;
                return (
                  <tr key={r.user_id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5">
                      <span className="text-[13px] font-semibold text-ink">
                        {r.user_name}
                      </span>
                      {suspicious && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-alert-pale px-1.5 py-0.5 text-[10px] font-bold text-alert">
                          <AlertTriangle size={9} />
                          nobody reached
                        </span>
                      )}
                      {calls === 0 && (
                        <span className="ml-2 text-[10.5px] font-medium text-ink-ghost">
                          no calls logged
                        </span>
                      )}
                    </td>
                    <Num>{calls}</Num>
                    <Num>{Number(r.reached)}</Num>
                    <Num>{Number(r.promised)}</Num>
                    <Num>{Number(r.no_answer)}</Num>
                    <td className="px-4 py-2.5 text-right">
                      <span
                        className={`font-mono text-[12.5px] font-bold ${
                          calls === 0
                            ? "text-ink-ghost"
                            : rate >= 50
                              ? "text-ok"
                              : rate > 0
                                ? "text-warn"
                                : "text-alert"
                        }`}
                      >
                        {calls === 0 ? "—" : `${rate}%`}
                      </span>
                    </td>
                    <Num>{Number(r.open_tasks)}</Num>
                    <td className="px-4 py-2.5 text-right">
                      <span
                        className={`font-mono text-[12.5px] ${
                          Number(r.overdue_tasks) > 0
                            ? "font-bold text-alert"
                            : "text-ink-soft"
                        }`}
                      >
                        {Number(r.overdue_tasks)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-surface p-6">
        <h2 className="mb-4 text-base font-bold tracking-[-0.2px] text-ink">
          Outcomes
        </h2>
        {activity.outcomes.length === 0 ? (
          <p className="py-6 text-center text-[12.5px] font-medium text-ink-faint">
            Nothing logged yet.
          </p>
        ) : (
          <ul className="flex flex-col">
            {activity.outcomes.map((o) => (
              <li
                key={o.outcome}
                className="flex items-center justify-between border-b border-line py-2.5 last:border-0"
              >
                <span className="text-[12.5px] font-medium text-ink-soft">
                  {OUTCOME_LABEL[o.outcome as CallOutcome] ?? o.outcome}
                </span>
                <Tag tone="neutral">{o.count}</Tag>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Num({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-4 py-2.5 text-right font-mono text-[12.5px] text-ink-soft">
      {children}
    </td>
  );
}
