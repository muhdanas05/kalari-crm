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
import type { Role } from "@/lib/auth/session";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /**
   * Show the error dot here when the automation layer has failures.
   * The brief: "a small red icon so i can see those errors".
   */
  errorBadge?: boolean;
  /** Admin-only nav item. Omitted = every active user sees it. */
  adminOnly?: boolean;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

/**
 * The nav. A manager (role=employee) sees everything operational — the
 * explicit ask was "shouldn't see Accounts, rest everything" — but backend
 * configuration (Admin section, Automations) and money (Accounts) stay
 * admin-only, matching what their pages already enforce server-side
 * (requireAdmin()); this list only ever decides what SHOWS, RLS still
 * decides what's possible (ARCHITECTURE.md §3.18, §3.21).
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: "",
    items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    title: "Pipeline",
    items: [
      { label: "Pipeline", href: "/pipeline", icon: Kanban },
      { label: "Customers", href: "/customers", icon: UserSquare2 },
      { label: "Suppliers", href: "/suppliers", icon: Building2 },
      { label: "Call queue", href: "/calls", icon: PhoneCall },
    ],
  },
  {
    title: "Money",
    items: [
      { label: "Quotations", href: "/quotations", icon: FileCheck },
      { label: "Invoices", href: "/invoices", icon: FileText },
      { label: "Payments", href: "/payments", icon: CreditCard },
      { label: "Accounts", href: "/accounts", icon: BookOpen, adminOnly: true },
    ],
  },
  {
    title: "Activity",
    items: [
      { label: "Automations", href: "/automations", icon: Zap, errorBadge: true, adminOnly: true },
      { label: "History", href: "/history", icon: History, errorBadge: true },
    ],
  },
  {
    title: "Admin",
    items: [
      { label: "Call Activity", href: "/admin/calls", icon: PhoneCall, adminOnly: true },
      { label: "Service Catalogue", href: "/admin/catalogue", icon: Tags, adminOnly: true },
      { label: "Pipeline Stages", href: "/admin/stages", icon: GitBranch, adminOnly: true },
      { label: "Integrations", href: "/admin/integrations", icon: Plug, adminOnly: true },
      { label: "Logs", href: "/admin/logs", icon: ScrollText, adminOnly: true },
    ],
  },
  {
    title: "Settings",
    items: [{ label: "Settings", href: "/settings", icon: Settings }],
  },
];

/** Sections filtered to what this role can see; empty sections drop out. */
export function visibleSections(role: Role): NavSection[] {
  if (role === "admin") return NAV_SECTIONS;
  return NAV_SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((i) => !i.adminOnly),
  })).filter((s) => s.items.length > 0);
}

export function allHrefs(role: Role): string[] {
  return visibleSections(role).flatMap((s) => s.items.map((i) => i.href));
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
