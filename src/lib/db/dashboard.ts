import { createClient } from "@/lib/supabase/server";
import { todayKolkata, addDays } from "@/lib/dates";
import type { Profile } from "@/lib/auth/session";

export type AdminDashboard = {
  newLeadsToday: number;
  newLeadsThisWeek: number;
  activeByPipeline: { name: string; count: number }[];
  collectedThisMonthFils: number;
  outstandingFils: number;
  casesPerEmployee: { name: string; count: number }[];
  stuckCount: number;
  overdueCount: number;
  overdueFils: number;
};

export type EmployeeDashboard = {
  myActiveCases: number;
  myStuckCases: number;
  myUnpaidInvoices: number;
};

/**
 * Admin dashboard. SOW §02.B.
 *
 * Outstanding is summed from invoices_v.outstanding_paise, which is derived from
 * (total − payments − credits) in SQL. That is why success criterion §8.4
 * — "dashboard outstanding always reconciles to invoices minus payments" —
 * holds by definition: there is no second number to disagree with.
 */
export async function getAdminDashboard(): Promise<AdminDashboard> {
  const supabase = await createClient();
  const today = todayKolkata();
  const weekAgo = addDays(today, -7);
  const monthStart = today.slice(0, 8) + "01";

  const [
    leadsToday,
    leadsWeek,
    cases,
    payments,
    invoices,
    profiles,
  ] = await Promise.all([
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .gte("created_at", today),
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .gte("created_at", weekAgo),
    supabase
      .from("cases_board_v")
      .select("pipeline_name, assignee_name, is_stuck, status"),
    supabase
      .from("payments")
      .select("amount_paise, paid_on")
      .is("voided_at", null)
      .gte("paid_on", monthStart),
    supabase
      .from("invoices_v")
      .select("outstanding_paise, display_status")
      .eq("lifecycle", "issued"),
    supabase.from("profiles").select("id, name").eq("active", true),
  ]);

  const caseRows = cases.data ?? [];
  const openCases = caseRows.filter((c) => c.status === "open");

  const byPipeline = new Map<string, number>();
  for (const c of openCases) {
    const k = c.pipeline_name ?? "—";
    byPipeline.set(k, (byPipeline.get(k) ?? 0) + 1);
  }

  // Every active employee appears, including those carrying zero — a name
  // missing from this list reads as "no data", but zero cases is the signal
  // the owner is actually looking for (SOW §02.B "see instantly if work is
  // unbalanced").
  const byEmployee = new Map<string, number>();
  for (const p of profiles.data ?? []) byEmployee.set(p.name, 0);
  for (const c of openCases) {
    if (!c.assignee_name) continue;
    byEmployee.set(c.assignee_name, (byEmployee.get(c.assignee_name) ?? 0) + 1);
  }

  const invoiceRows = invoices.data ?? [];
  const overdue = invoiceRows.filter((i) => i.display_status === "overdue");

  return {
    newLeadsToday: leadsToday.count ?? 0,
    newLeadsThisWeek: leadsWeek.count ?? 0,
    activeByPipeline: [...byPipeline.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    collectedThisMonthFils: (payments.data ?? []).reduce(
      (sum, p) => sum + (p.amount_paise ?? 0),
      0,
    ),
    outstandingFils: invoiceRows.reduce(
      (sum, i) => sum + (i.outstanding_paise ?? 0),
      0,
    ),
    casesPerEmployee: [...byEmployee.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    stuckCount: caseRows.filter((c) => c.is_stuck).length,
    overdueCount: overdue.length,
    overdueFils: overdue.reduce((s, i) => s + (i.outstanding_paise ?? 0), 0),
  };
}

/**
 * Employee dashboard. §5.9: "No company revenue."
 *
 * Nothing here aggregates money across the business. RLS already scopes every
 * row to this employee, so these counts are inherently theirs — but the choice
 * of WHICH tiles exist is the point: an employee is never shown a revenue
 * figure, even their own customers' totals in aggregate.
 */
export async function getEmployeeDashboard(
  profile: Profile,
): Promise<EmployeeDashboard> {
  const supabase = await createClient();

  const [cases, invoices] = await Promise.all([
    supabase
      .from("cases_board_v")
      .select("is_stuck, status")
      .eq("assigned_user_id", profile.id),
    supabase
      .from("invoices_v")
      .select("display_status")
      .eq("lifecycle", "issued")
      .in("display_status", ["unpaid", "partially_paid", "overdue"]),
  ]);

  const rows = cases.data ?? [];
  return {
    myActiveCases: rows.filter((c) => c.status === "open").length,
    myStuckCases: rows.filter((c) => c.is_stuck).length,
    myUnpaidInvoices: (invoices.data ?? []).length,
  };
}
