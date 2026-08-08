/**
 * The canonical list of permissionable pages — one source of truth shared by
 * the nav (what shows), the page guards (what's reachable), and the Settings
 * → Users checkbox grid (what an admin can grant). A page key here is a
 * literal, never derived from a href pattern, so adding a page is one line
 * here, not a naming convention to keep straight across three files.
 *
 * Dashboard and Settings are deliberately absent — every active user gets
 * those regardless, the same way "no self-signup, but a working login" is
 * baseline rather than a grantable permission.
 */
export const PAGES = [
  { key: "pipeline", label: "Pipeline", group: "Pipeline" },
  { key: "customers", label: "Customers", group: "Pipeline" },
  { key: "suppliers", label: "Suppliers", group: "Pipeline" },
  { key: "calls", label: "Call queue", group: "Pipeline" },

  { key: "quotations", label: "Quotations", group: "Money" },
  { key: "invoices", label: "Invoices", group: "Money" },
  { key: "payments", label: "Payments", group: "Money" },
  { key: "accounts", label: "Accounts", group: "Money" },

  { key: "automations", label: "Automations", group: "Activity" },
  { key: "history", label: "History", group: "Activity" },

  { key: "admin_calls", label: "Call Activity", group: "Admin" },
  { key: "admin_catalogue", label: "Service Catalogue", group: "Admin" },
  { key: "admin_stages", label: "Pipeline Stages", group: "Admin" },
  { key: "admin_integrations", label: "Integrations", group: "Admin" },
  { key: "admin_logs", label: "Logs", group: "Admin" },
] as const;

export type PageKey = (typeof PAGES)[number]["key"];

export const PAGE_GROUPS = ["Pipeline", "Money", "Activity", "Admin"] as const;

/** Everything a brand-new manager gets by default — matches what "everything except Accounts" meant before this was granular. */
export const DEFAULT_MANAGER_PERMISSIONS: PageKey[] = [
  "pipeline", "customers", "suppliers", "calls",
  "quotations", "invoices", "payments",
  "history",
];

/**
 * Pure, no I/O — lives here rather than lib/auth/session.ts (server-only) so
 * Client Components (the nav) can call it directly instead of dragging
 * next/headers into the browser bundle. Takes the minimal shape rather than
 * the full Profile type to avoid importing session.ts at all.
 */
export function hasPermission(
  profile: { role: string; permissions: string[] | null } | null,
  page: PageKey,
): boolean {
  if (!profile) return false;
  if (profile.role === "admin") return true;
  return (profile.permissions ?? []).includes(page);
}
