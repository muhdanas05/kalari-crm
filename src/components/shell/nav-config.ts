import {
  LayoutDashboard,
  Kanban,
  UserSquare2,
  Settings,
  FileText,
  CreditCard,
  PhoneCall,
  Tags,
  Plug,
  Zap,
  History,
  Building2,
  BookOpen,
  ScrollText,
  GitBranch,
  FileCheck,
  type LucideIcon,
} from "@/components/icons";
import type { Profile } from "@/lib/auth/session";
import { hasPermission, type PageKey } from "@/lib/auth/pages";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /**
   * Show the error dot here when the automation layer has failures.
   * The brief: "a small red icon so i can see those errors".
   */
  errorBadge?: boolean;
  /** Permission key gating this item. Omitted = every active user sees it. */
  page?: PageKey;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

/**
 * The nav. Per-tab, not per-role: each item names the permission it needs
 * (lib/auth/pages.ts is the single list those keys come from), and
 * visibleSections() checks profile.permissions directly rather than a flat
 * admin/manager split — "indepth options, which tabs he can see, which he
 * can't, not generic." Admin always sees everything regardless of what's in
 * their (unused) permissions array. This list only ever decides what SHOWS;
 * RLS + has_permission() in Postgres decide what's actually possible
 * (ARCHITECTURE.md §3.18, §3.21).
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: "",
    items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    title: "Pipeline",
    items: [
      { label: "Pipeline", href: "/pipeline", icon: Kanban, page: "pipeline" },
      { label: "Customers", href: "/customers", icon: UserSquare2, page: "customers" },
      { label: "Suppliers", href: "/suppliers", icon: Building2, page: "suppliers" },
      { label: "Call queue", href: "/calls", icon: PhoneCall, page: "calls" },
    ],
  },
  {
    title: "Money",
    items: [
      { label: "Quotations", href: "/quotations", icon: FileCheck, page: "quotations" },
      { label: "Invoices", href: "/invoices", icon: FileText, page: "invoices" },
      { label: "Payments", href: "/payments", icon: CreditCard, page: "payments" },
      { label: "Accounts", href: "/accounts", icon: BookOpen, page: "accounts" },
    ],
  },
  {
    title: "Activity",
    items: [
      { label: "Automations", href: "/automations", icon: Zap, errorBadge: true, page: "automations" },
      { label: "History", href: "/history", icon: History, errorBadge: true, page: "history" },
    ],
  },
  {
    title: "Admin",
    items: [
      { label: "Call Activity", href: "/admin/calls", icon: PhoneCall, page: "admin_calls" },
      { label: "Service Catalogue", href: "/admin/catalogue", icon: Tags, page: "admin_catalogue" },
      { label: "Pipeline Stages", href: "/admin/stages", icon: GitBranch, page: "admin_stages" },
      { label: "Integrations", href: "/admin/integrations", icon: Plug, page: "admin_integrations" },
      { label: "Logs", href: "/admin/logs", icon: ScrollText, page: "admin_logs" },
    ],
  },
  {
    title: "Settings",
    items: [{ label: "Settings", href: "/settings", icon: Settings }],
  },
];

/** Sections filtered to what this profile can see; empty sections drop out. */
export function visibleSections(profile: Profile): NavSection[] {
  return NAV_SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((i) => !i.page || hasPermission(profile, i.page)),
  })).filter((s) => s.items.length > 0);
}

export function allHrefs(profile: Profile): string[] {
  return visibleSections(profile).flatMap((s) => s.items.map((i) => i.href));
}

export function sectionForPath(pathname: string): string | null {
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (pathname === item.href || pathname.startsWith(item.href + "/")) {
        return item.label;
      }
    }
  }
  return null;
}
