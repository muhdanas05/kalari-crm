import {
  LayoutDashboard,
  Kanban,
  UserSquare2,
  Settings,
  FileText,
  CreditCard,
  PhoneCall,
  Tags,
  Users,
  Plug,
  Zap,
  History,
  Building2,
  type LucideIcon,
} from "@/components/icons";
import type { Role } from "@/lib/auth/session";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Omit to show for everyone. */
  roles?: Role[];
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
 * The nav. Gated by profiles.role — NOT by feature flags.
 *
 * This gates what RENDERS. It is not access control: RLS refuses an employee's
 * request for company revenue whether or not the link is on screen
 * (ARCHITECTURE.md §3.18, §3.21).
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: "",
    items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    title: "Personal",
    items: [
      // §5.7: "My Call List is the employee's home screen".
      { label: "My Call List", href: "/calls", icon: PhoneCall, roles: ["employee"] },
    ],
  },
  {
    title: "Pipeline",
    items: [
      { label: "Pipeline", href: "/pipeline", icon: Kanban },
      { label: "Customers", href: "/customers", icon: UserSquare2 },
      { label: "Suppliers", href: "/suppliers", icon: Building2 },
    ],
  },
  {
    title: "Money",
    items: [
      { label: "Invoices", href: "/invoices", icon: FileText },
      { label: "Payments", href: "/payments", icon: CreditCard },
    ],
  },
  {
    title: "Activity",
    items: [
      {
        label: "Automations",
        href: "/automations",
        icon: Zap,
        roles: ["admin"],
        errorBadge: true,
      },
      { label: "History", href: "/history", icon: History, errorBadge: true },
    ],
  },
  {
    title: "Admin",
    items: [
      { label: "Call Activity", href: "/admin/calls", icon: PhoneCall, roles: ["admin"] },
      { label: "Service Catalogue", href: "/admin/catalogue", icon: Tags, roles: ["admin"] },
      { label: "Users", href: "/admin/users", icon: Users, roles: ["admin"] },
      { label: "Integrations", href: "/admin/integrations", icon: Plug, roles: ["admin"] },
    ],
  },
  {
    title: "Settings",
    items: [{ label: "Settings", href: "/settings", icon: Settings }],
  },
];

export function visibleSections(role: Role): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((i) => !i.roles || i.roles.includes(role)),
  })).filter((section) => section.items.length > 0);
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
