import { createClient } from "@/lib/supabase/server";
import "server-only";
import type { Database } from "@/lib/supabase/database.types";

// Display helpers + types live in lib/calls/display.ts so Client Components
// can import them without dragging next/headers across the boundary.
export type { CallTask, CallOutcome, CallReason } from "@/lib/calls/display";

/**
 * My Call List (§5.7): today's calls, priority then due date.
 *
 * RLS scopes call_tasks by assigned_user_id, so an employee sees only their own
 * queue without us filtering. The view pre-renders context_line, so this is one
 * query and no joins — it's opened on a phone, on mobile data, all day.
 */
export async function getMyCallList(limit = 50) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("call_list_v")
    .select("*")
    .order("priority_rank")
    .order("due_on")
    .limit(limit);

  if (error) throw new Error(`Failed to load the call list: ${error.message}`);
  return data ?? [];
}

/** Everything open, admin-wide. */
export async function getAllCallTasks(limit = 200) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("call_list_v")
    .select("*")
    .order("priority_rank")
    .order("due_on")
    .limit(limit);
  return data ?? [];
}

export async function getCustomerCalls(customerId: string, limit = 20) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("call_logs")
    .select("*, profiles(name)")
    .eq("customer_id", customerId)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

/**
 * Admin call dashboard (§5.7): calls per employee per day, outcome
 * distribution, ageing tasks.
 *
 * "If someone marks everything 'no answer' in four seconds, this surfaces it."
 * That is the actual purpose — it is an accountability instrument, so the
 * outcome mix per person matters more than the raw count.
 */
export async function getCallActivity(days = 7) {
  const supabase = await createClient();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const [{ data: logs }, { data: tasks }, { data: people }] = await Promise.all([
    supabase
      .from("call_logs")
      .select("user_id, outcome, occurred_at, duration_seconds")
      .gte("occurred_at", since),
    supabase.from("call_list_v").select("assignee_name, days_late, priority"),
    supabase
      .from("profiles")
      .select("id, name")
      .eq("active", true)
      .is("archived_at", null),
  ]);

  const nameOf = new Map((people ?? []).map((p) => [p.id, p.name]));

  const byUser = new Map<
    string,
    { name: string; total: number; reached: number; noAnswer: number }
  >();
  for (const p of people ?? []) {
    byUser.set(p.id, { name: p.name, total: 0, reached: 0, noAnswer: 0 });
  }
  for (const l of logs ?? []) {
    const row = byUser.get(l.user_id) ?? {
      name: nameOf.get(l.user_id) ?? "—",
      total: 0,
      reached: 0,
      noAnswer: 0,
    };
    row.total += 1;
    if (l.outcome === "reached_resolved" || l.outcome === "promised_payment") {
      row.reached += 1;
    }
    if (["no_answer", "busy", "switched_off"].includes(l.outcome)) {
      row.noAnswer += 1;
    }
    byUser.set(l.user_id, row);
  }

  const outcomes = new Map<string, number>();
  for (const l of logs ?? []) {
    outcomes.set(l.outcome, (outcomes.get(l.outcome) ?? 0) + 1);
  }

  return {
    totalCalls: (logs ?? []).length,
    perEmployee: [...byUser.values()].sort((a, b) => b.total - a.total),
    outcomes: [...outcomes.entries()]
      .map(([outcome, count]) => ({ outcome, count }))
      .sort((a, b) => b.count - a.count),
    openTasks: (tasks ?? []).length,
    ageingTasks: (tasks ?? []).filter((t) => (t.days_late ?? 0) > 3).length,
  };
}
