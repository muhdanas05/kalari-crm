import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type AutomationRow = Database["public"]["Views"]["automation_log_v"]["Row"];
export type HistoryRow = Database["public"]["Views"]["history_v"]["Row"];
export type Setting = Database["public"]["Tables"]["automation_settings"]["Row"];

/** What the automation layer actually did — the Automations tab. */
export async function getAutomationLog(limit = 100) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("automation_log_v")
    .select("*")
    .order("occurred_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

/**
 * The red dot. The brief asks for errors visible "with a small red icon so i can
 * see those errors" — so this is counted separately from the log itself, and
 * cheaply, because it renders in the nav on every page.
 */
export async function getAutomationHealth() {
  const supabase = await createClient();

  const [events, emails] = await Promise.all([
    supabase
      .from("automation_log_v")
      .select("id, has_error, is_failing")
      .or("has_error.eq.true,is_failing.eq.true")
      .limit(200),
    supabase
      .from("email_log")
      .select("id")
      .or("status.eq.failed,bounced_at.not.is.null")
      .limit(200),
  ]);

  const eventErrors = (events.data ?? []).length;
  const emailErrors = (emails.data ?? []).length;
  return { eventErrors, emailErrors, total: eventErrors + emailErrors };
}

export async function getSettings() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("automation_settings")
    .select("*")
    .order("key");
  return data ?? [];
}

/** The History feed — everything, failures flagged. */
export async function getHistory(opts: { source?: string; errorsOnly?: boolean; limit?: number } = {}) {
  const supabase = await createClient();
  let q = supabase
    .from("history_v")
    .select("*")
    .order("occurred_at", { ascending: false })
    .limit(opts.limit ?? 150);

  if (opts.source && opts.source !== "all") q = q.eq("source", opts.source);
  if (opts.errorsOnly) q = q.eq("is_error", true);

  const { data } = await q;
  return data ?? [];
}

export async function getEmailLog(limit = 100) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("email_log")
    .select("*, customers(name)")
    .order("occurred_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}
