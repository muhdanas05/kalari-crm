import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/PageHead";
import { Tag } from "@/components/ui/Tag";
import { requireProfile } from "@/lib/auth/session";
import { getHistory, getAutomationHealth } from "@/lib/db/automations";
import { formatDateTime } from "@/lib/dates";
import { AlertTriangle, Zap, Mail, PhoneCall, FileText } from "@/components/icons";
import { HistoryFilter } from "./HistoryFilter";

export const metadata: Metadata = { title: "History · Kalari" };

/**
 * The History tab.
 *
 * "history tabs for overall logs and in logs i want detailed info errors and
 *  those type of things and in history tab i want alerts also on errors occured"
 *
 * One feed, everything in it, failures flagged. Reading it should not require
 * cross-referencing three screens — that is why history_v unions the four
 * sources rather than giving each its own tab.
 *
 * It is security_invoker, so an employee sees only their own customers here too.
 * An audit log that leaks is worse than no audit log.
 */
export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; errors?: string }>;
}) {
  await requireProfile();
  const sp = await searchParams;
  const errorsOnly = sp.errors === "1";

  const [rows, health] = await Promise.all([
    getHistory({ source: sp.source, errorsOnly, limit: 200 }),
    getAutomationHealth(),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        eyebrow="History"
        title="History"
        subtitle="Everything that happened, newest first."
      />

      {health.total > 0 && !errorsOnly && (
        <Link
          href="/history?errors=1"
          className="flex items-center gap-3 rounded-xl border border-alert/30 bg-alert-pale/40 px-5 py-3.5 transition-colors hover:border-alert/50"
        >
          <AlertTriangle size={16} className="shrink-0 text-alert" />
          <span className="flex-1">
            <span className="block text-[13px] font-semibold text-ink">
              {health.total} error{health.total === 1 ? "" : "s"} recorded
            </span>
            <span className="block text-[12px] font-medium text-ink-mid">
              {health.eventErrors > 0 && `${health.eventErrors} automation`}
              {health.eventErrors > 0 && health.emailErrors > 0 && " · "}
              {health.emailErrors > 0 && `${health.emailErrors} email`}
              {" — show only these"}
            </span>
          </span>
        </Link>
      )}

      <HistoryFilter source={sp.source ?? "all"} errorsOnly={errorsOnly} />

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line py-12 text-center text-[13px] font-medium text-ink-faint">
          {errorsOnly ? "No errors. Everything is running." : "Nothing recorded yet."}
        </p>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-line bg-surface">
          {rows.map((r) => (
            <li
              key={`${r.source}-${r.id}`}
              className="flex items-start gap-3 border-b border-line px-4 py-2.5 last:border-0"
            >
              <span className="mt-0.5 shrink-0">
                <SourceIcon source={r.source} isError={r.is_error} />
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[12.5px] font-semibold text-ink">
                    {describe(r.source, r.action)}
                  </span>
                  <Tag tone={r.is_error ? "alert" : "neutral"}>{r.source}</Tag>
                </span>

                {r.detail && (
                  <span className="block truncate text-[11.5px] font-medium text-ink-mid">
                    {r.detail}
                  </span>
                )}

                {/* The detail the brief asked for: the actual error text, not a
                    generic "something went wrong". */}
                {r.error_text && (
                  <span className="mt-1 block rounded bg-alert-pale px-2 py-1 font-mono text-[10.5px] text-alert">
                    {r.error_text}
                  </span>
                )}

                <span className="block font-mono text-[10.5px] text-ink-faint">
                  {formatDateTime(r.occurred_at)}
                  {r.actor_kind && r.actor_kind !== "user" && ` · ${r.actor_kind}`}
                </span>
              </span>

              {r.customer_id && (
                <Link
                  href={`/customers/${r.customer_id}`}
                  className="shrink-0 text-[11.5px] font-semibold text-accent hover:underline"
                >
                  Customer
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11.5px] font-medium text-ink-faint">
        Data changes are written by the database itself and cannot be edited or
        deleted — including by us. That is what makes this a record rather than a
        report.
      </p>
    </div>
  );
}

function SourceIcon({ source, isError }: { source: string | null; isError: boolean | null }) {
  if (isError) return <AlertTriangle size={14} className="text-alert" />;
  switch (source) {
    case "automation":
      return <Zap size={14} className="text-ink-ghost" />;
    case "email":
      return <Mail size={14} className="text-ink-ghost" />;
    case "call":
      return <PhoneCall size={14} className="text-ink-ghost" />;
    default:
      return <FileText size={14} className="text-ink-ghost" />;
  }
}

function describe(source: string | null, action: string | null): string {
  const a = action ?? "";
  if (source === "activity") {
    if (a === "insert") return "Record created";
    if (a === "update") return "Record updated";
    if (a === "delete") return "Record removed";
  }
  if (source === "call") {
    return a.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  }
  return a.replace(/[._]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
