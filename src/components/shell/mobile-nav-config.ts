import {
  LayoutDashboard,
  Columns3,
  Users,
  LayoutGrid,
  FileText,
  CreditCard,
  Settings,
  PhoneCall,
  Tags,
  Plug,
  Building2,
  BookOpen,
  ScrollText,
  type LucideIcon,
} from "@/components/icons";
import type { Role } from "@/lib/auth/session";

export type MobileNavLink = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export type MobileNavSection = {
  title: string;
  items: MobileNavLink[];
};

/**
 * Bottom tab bar — TRE's floating 4-slot pill, kept deliberately.
 *
 * Slot 3 differs by role rather than by feature flag: an employee lives on the
 * call list (§5.7 calls it their home screen); an admin lives on customers.
 * Slot 4 ("More") opens the grid popover and is not a route.
 */
export const TAB_HOME: MobileNavLink = {
  label: "Dashboard",
  href: "/dashboard",
  icon: LayoutDashboard,
};
export const TAB_PIPELINE: MobileNavLink = {
  label: "Pipeline",
  href: "/pipeline",
  icon: Columns3,
};
export const TAB_CALLS: MobileNavLink = {
  label: "My Calls",
  href: "/calls",
  icon: PhoneCall,
};
export const TAB_CUSTOMERS: MobileNavLink = {
  label: "Customers",
  href: "/customers",
  icon: Users,
};
export const TAB_MORE_ICON = LayoutGrid;

export function tabsFor(role: Role): MobileNavLink[] {
  return [
    TAB_HOME,
    TAB_PIPELINE,
    role === "employee" ? TAB_CALLS : TAB_CUSTOMERS,
  ];
}

/** "More" grid. Items already on the tab bar are not repeated. */
export function moreSectionsFor(role: Role): MobileNavSection[] {
  const sections: MobileNavSection[] = [
    {
      title: "Pipeline",
      items: [
        ...(role === "employee" ? [{ label: "Customers", href: "/customers", icon: Users }] : []),
        { label: "Suppliers", href: "/suppliers", icon: Building2 },
      ],
    },
    {
      title: "Money",
      items: [
        { label: "Invoices", href: "/invoices", icon: FileText },
        { label: "Payments", href: "/payments", icon: CreditCard },
        ...(role === "admin"
          ? [{ label: "Accounts", href: "/accounts", icon: BookOpen }]
          : []),
      ],
    },
    {
      title: "Admin",
      items:
        role === "admin"
          ? [
              { label: "Call Activity", href: "/admin/calls", icon: PhoneCall },
              { label: "Catalogue", href: "/admin/catalogue", icon: Tags },
              { label: "Users", href: "/admin/users", icon: Users },
              { label: "Integrations", href: "/admin/integrations", icon: Plug },
              { label: "Logs", href: "/admin/logs", icon: ScrollText },
            ]
          : [],
    },
    {
      title: "Settings",
      items: [{ label: "Settings", href: "/settings", icon: Settings }],
    },
  ];
  return sections.filter((s) => s.items.length > 0);
}
