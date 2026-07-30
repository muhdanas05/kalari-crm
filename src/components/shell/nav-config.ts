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
  type LucideIcon,
} from "@/components/icons";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /**
   * Show the error dot here when the automation layer has failures.
   * The brief: "a small red icon so i can see those errors".
   */
  errorBadge?: boolean;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

/**
 * The nav. Single-admin mode (0032): one person, everything renders — no role
 * gate here, and none needed. RLS is still the actual access boundary
 * (ARCHITECTURE.md §3.18, §3.21); this list only ever decided what shows.
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
      { label: "Invoices", href: "/invoices", icon: FileText },
      { label: "Payments", href: "/payments", icon: CreditCard },
      { label: "Accounts", href: "/accounts", icon: BookOpen },
    ],
  },
  {
    title: "Activity",
    items: [
      { label: "Automations", href: "/automations", icon: Zap, errorBadge: true },
      { label: "History", href: "/history", icon: History, errorBadge: true },
    ],
  },
  {
    title: "Admin",
    items: [
      { label: "Call Activity", href: "/admin/calls", icon: PhoneCall },
      { label: "Service Catalogue", href: "/admin/catalogue", icon: Tags },
      { label: "Pipeline Stages", href: "/admin/stages", icon: GitBranch },
      { label: "Integrations", href: "/admin/integrations", icon: Plug },
      { label: "Logs", href: "/admin/logs", icon: ScrollText },
    ],
  },
  {
    title: "Settings",
    items: [{ label: "Settings", href: "/settings", icon: Settings }],
  },
];

export function allHrefs(): string[] {
  return NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.href));
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
