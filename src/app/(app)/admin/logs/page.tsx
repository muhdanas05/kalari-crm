import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/PageHead";
import { Tag } from "@/components/ui/Tag";
import { requirePermission } from "@/lib/auth/session";
import { listEmailLog, listEmailQueue, listEvents, listAuditLog } from "@/lib/db/logs";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { retryQueuedEmailForm } from "./actions";

export const metadata: Metadata = { title: "Logs · Kalari" };

const TABS = [
  { key: "emails", label: "Email log" },
  { key: "queue", label: "Send queue" },
  { key: "events", label: "Events" },
  { key: "audit", label: "Audit trail" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/**
 * The raw logs. /history is the readable feed; this is what you open when the
 * feed says "email failed" and you need the provider's actual words.
 *
 * Admin only. Nothing here is editable — the one action is re-queueing a send
 * that failed, which is the only recoverable state on the page.
 */
export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requirePermission("admin_logs");
  const sp = await searchParams;
  const tab: TabKey = (TABS.find((t) => t.key === sp.tab)?.key ?? "emails") as TabKey;

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        eyebrow="Admin"
        title="Logs"
        subtitle="Sends, the queue behind them, the events that triggered them, and every data change."
      />

      <div className="flex flex-wrap items-center gap-1.5">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/logs?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn(
              "h-8 rounded-full border px-3 text-[12px] font-semibold leading-[30px] transition-colors",
              tab === t.key
                ? "border-accent bg-accent text-white"
                : "border-line bg-surface text-ink-mid hover:border-line-strong hover:text-ink",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        {tab === "emails" && <EmailsTable />}
        {tab === "queue" && <QueueTable />}
        {tab === "events" && <EventsTable />}
        {tab === "audit" && <AuditTable />}
      </div>
    </div>
  );
}

// ── tables ──────────────────────────────────────────────────────────────────

async function EmailsTable() {
  const rows = await listEmailLog(150);
  if (rows.length === 0) return <Nothing>No email has been sent yet.</Nothing>;

  return (
    <table className="w-full min-w-[860px] text-left">
      <Head cols={["When", "Status", "To", "Subject", "Template", "Detail"]} />
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-line align-top last:border-0">
            <Cell mono>{formatDateTime(r.occurred_at)}</Cell>
            <Cell>
              <Tag tone={emailTone(r.status)}>{r.status}</Tag>
              {r.sandboxed && (
                <Tag tone="info" className="ml-1">
                  sandbox
                </Tag>
              )}
            </Cell>
            <Cell mono>{r.to_email}</Cell>
            <Cell>{r.subject}</Cell>
            <Cell mono>{r.template_key ?? "—"}</Cell>
            <Cell>
              <span className="flex flex-wrap items-center gap-1">
                {r.opened_at && (
                  <Tag tone="ok">opened{r.open_count > 1 ? ` ×${r.open_count}` : ""}</Tag>
                )}
                {r.bounced_at && <Tag tone="alert">bounced {r.bounce_type ?? ""}</Tag>}
                {r.complained_at && <Tag tone="alert">complaint</Tag>}
              </span>
              {r.error && <ErrorText>{r.error}</ErrorText>}
              {r.provider_msg_id && (
                <span className="mt-1 block font-mono text-[10px] text-ink-ghost">
                  {r.provider_msg_id}
                </span>
              )}
            </Cell>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

async function QueueTable() {
  const rows = await listEmailQueue(150);
  if (rows.length === 0) return <Nothing>The queue is empty.</Nothing>;

  return (
    <table className="w-full min-w-[900px] text-left">
      <Head cols={["Status", "To", "Subject", "Attempts", "Next attempt", "Last error", ""]} />
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-line align-top last:border-0">
            <Cell>
              <Tag tone={emailTone(r.status)}>{r.status}</Tag>
            </Cell>
            <Cell mono>{r.to_email}</Cell>
            <Cell>
              {r.subject}
              <span className="mt-0.5 block font-mono text-[10px] text-ink-ghost">
                {r.template_key ?? "—"} · queued {formatDateTime(r.created_at)}
              </span>
            </Cell>
            <Cell mono>{r.attempts}</Cell>
            <Cell mono>{r.sent_at ? "sent" : formatDateTime(r.next_attempt_at)}</Cell>
            <Cell>{r.last_error ? <ErrorText>{r.last_error}</ErrorText> : "—"}</Cell>
            <Cell>
              {r.status === "failed" && (
                <form action={retryQueuedEmailForm}>
                  <input type="hidden" name="id" value={r.id} />
                  <button
                    type="submit"
                    className="h-7 whitespace-nowrap rounded-full border border-line bg-surface px-3 text-[11.5px] font-bold text-ink-soft transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-mist"
                  >
                    Retry now
                  </button>
                </form>
              )}
            </Cell>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

async function EventsTable() {
  const rows = await listEvents(150);
  if (rows.length === 0) return <Nothing>No events recorded.</Nothing>;

  return (
    <table className="w-full min-w-[860px] text-left">
      <Head cols={["When", "Type", "Entity", "Attempts", "Processed", "Result"]} />
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-line align-top last:border-0">
            <Cell mono>{formatDateTime(r.occurred_at)}</Cell>
            <Cell>
              <Tag tone="accent">{r.type}</Tag>
            </Cell>
            <Cell mono>
              {r.entity}
              <span className="block text-[10px] text-ink-ghost">{r.entity_id}</span>
            </Cell>
            <Cell mono>{r.attempts}</Cell>
            <Cell>
              {r.processed_at ? (
                <span className="font-mono text-[11.5px] text-ok">
                  {formatDateTime(r.processed_at)}
                </span>
              ) : (
                <Tag tone={r.attempts > 0 ? "alert" : "warn"}>pending</Tag>
              )}
            </Cell>
            <Cell>
              <Json value={r.processed_result} label="result" />
            </Cell>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

async function AuditTable() {
  const rows = await listAuditLog(150);
  if (rows.length === 0) return <Nothing>Nothing recorded.</Nothing>;

  return (
    <table className="w-full min-w-[820px] text-left">
      <Head cols={["When", "Actor", "Action", "Entity", "Changed", "Before / after"]} />
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-line align-top last:border-0">
            <Cell mono>{formatDateTime(r.occurred_at)}</Cell>
            <Cell>
              <Tag tone={r.actor_kind === "user" ? "neutral" : "info"}>{r.actor_kind}</Tag>
              {r.user_id && (
                <span className="mt-0.5 block font-mono text-[10px] text-ink-ghost">
                  {r.user_id.slice(0, 8)}
                </span>
              )}
            </Cell>
            <Cell>
              <Tag tone={r.action === "delete" ? "alert" : r.action === "insert" ? "ok" : "warn"}>
                {r.action}
              </Tag>
            </Cell>
            <Cell mono>
              {r.entity}
              <span className="block text-[10px] text-ink-ghost">{r.entity_id ?? "—"}</span>
            </Cell>
            <Cell mono>{r.changed_keys?.join(", ") || "—"}</Cell>
            <Cell>
              <Json value={r.before} label="before" />
              <Json value={r.after} label="after" />
            </Cell>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── bits ────────────────────────────────────────────────────────────────────

function Head({ cols }: { cols: string[] }) {
  return (
    <thead>
      <tr className="border-b border-line bg-paper">
        {cols.map((c, i) => (
          <th
            key={i}
            className="px-3 py-2 text-[10.5px] font-bold uppercase tracking-[1px] text-ink-mid"
          >
            {c}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function Cell({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <td className={cn("px-3 py-2 text-[12px] text-ink", mono && "font-mono text-[11.5px]")}>
      {children}
    </td>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-1 block rounded bg-alert-pale px-2 py-1 font-mono text-[10.5px] text-alert">
      {children}
    </span>
  );
}

function Nothing({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-12 text-center text-[13px] font-medium text-ink-faint">{children}</p>
  );
}

function Json({ value, label }: { value: unknown; label: string }) {
  if (value == null) return null;
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-[11px] font-semibold text-accent">{label}</summary>
      <pre className="mt-1 max-h-64 max-w-[420px] overflow-auto rounded bg-paper-deep p-2 font-mono text-[11px] text-ink-mid">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

function emailTone(status: string): "ok" | "warn" | "alert" | "info" | "neutral" {
  switch (status) {
    case "sent":
      return "ok";
    case "failed":
      return "alert";
    case "queued":
    case "sending":
      return "warn";
    case "sandboxed":
      return "info";
    default:
      return "neutral";
  }
}
