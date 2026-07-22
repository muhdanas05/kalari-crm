import Link from "next/link";
import { Tag } from "@/components/ui/Tag";
import { formatPaise } from "@/lib/money";
import { AlertTriangle, ChevronRight } from "@/components/icons";
import type { CaseCard as CaseRow } from "@/lib/db/pipelines";

/**
 * The list view. §5.3 calls this the primary view for most of the team, because
 * employees work from phones — so it is a Server Component with no drag, no
 * client JS, and every fact readable at a glance.
 */
export function CaseList({ cases }: { cases: CaseRow[] }) {
  if (cases.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line py-12 text-center text-[13px] font-medium text-ink-faint">
        No cases in this pipeline.
      </p>
    );
  }

  return (
    <ul className="overflow-hidden rounded-xl border border-line bg-surface">
      {cases.map((c) => {
        const pax = (c.pax_adults ?? 0) + (c.pax_children ?? 0);
        return (
          <li key={c.id} className="border-b border-line last:border-0">
            <Link
              href={`/cases/${c.id}`}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-paper"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[13.5px] font-bold text-ink">
                    {c.customer_name}
                  </span>
                  {c.is_stuck && (
                    <AlertTriangle
                      size={13}
                      className="shrink-0 text-alert"
                      aria-label={`Stuck ${c.days_in_stage} days`}
                    />
                  )}
                </div>
                <p className="truncate text-[11.5px] font-medium text-ink-mid">
                  {c.service_name ?? "No service yet"}
                  {pax > 1 && ` · ${pax} people`}
                </p>
                <p className="mt-1 font-mono text-[11px] text-ink-faint">
                  {c.customer_phone}
                </p>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1">
                <Tag tone={c.is_stuck ? "alert" : "accent"}>{c.stage_name}</Tag>
                {(c.outstanding_paise ?? 0) > 0 && (
                  <span className="font-mono text-[11px] font-semibold text-warn">
                    {formatPaise(c.outstanding_paise!)}
                  </span>
                )}
                <span className="text-[10.5px] font-medium text-ink-ghost">
                  {c.assignee_name ?? "Unassigned"}
                </span>
              </div>

              <ChevronRight size={15} className="shrink-0 text-ink-ghost" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
