import { createClient } from "@/lib/supabase/server";
import { todayKolkata, addDays } from "@/lib/dates";

export type AdminDashboard = {
  newLeadsToday: number;
  newLeadsThisWeek: number;
  activeByPipeline: { name: string; count: number }[];
  collectedThisMonthFils: number;
  outstandingFils: number;
  stuckCount: number;
  overdueCount: number;
  overdueFils: number;
};

/**
 * The one dashboard. SOW §02.B.
 *
 * Outstanding is summed from invoices_v.outstanding_paise, which is derived from
 * (total − payments − credits) in SQL. That is why success criterion §8.4
 * — "dashboard outstanding always reconciles to invoices minus payments" —
 * holds by definition: there is no second number to disagree with.
 *
 * Single-admin mode (0032): no per-employee breakdown — there is one person,
 * so a "cases per employee" bar list compares them to nobody.
 */
export async function getAdminDashboard(): Promise<AdminDashboard> {
  const supabase = await createClient();
  const today = todayKolkata();
  const weekAgo = addDays(today, -7);
  const monthStart = today.slice(0, 8) + "01";

  const [leadsToday, leadsWeek, cases, payments, invoices] = await Promise.all([
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .gte("created_at", today),
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .gte("created_at", weekAgo),
    supabase.from("cases_board_v").select("pipeline_name, is_stuck, status"),
    supabase
      .from("payments")
      .select("amount_paise, paid_on")
      .is("voided_at", null)
      .gte("paid_on", monthStart),
    supabase
      .from("invoices_v")
      .select("outstanding_paise, display_status")
      .eq("lifecycle", "issued"),
  ]);

  const caseRows = cases.data ?? [];
  const openCases = caseRows.filter((c) => c.status === "open");

  const byPipeline = new Map<string, number>();
  for (const c of openCases) {
    const k = c.pipeline_name ?? "—";
    byPipeline.set(k, (byPipeline.get(k) ?? 0) + 1);
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
    stuckCount: caseRows.filter((c) => c.is_stuck).length,
    overdueCount: overdue.length,
    overdueFils: overdue.reduce((s, i) => s + (i.outstanding_paise ?? 0), 0),
  };
}
