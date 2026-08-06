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
  GitBranch,
  FileCheck,
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
export const TAB_CUSTOMERS: MobileNavLink = {
  label: "Customers",
  href: "/customers",
  icon: Users,
};
export const TAB_MORE_ICON = LayoutGrid;

export function tabs(): MobileNavLink[] {
  return [TAB_HOME, TAB_PIPELINE, TAB_CUSTOMERS];
}

/**
 * "More" grid. Items already on the tab bar are not repeated. A manager
 * (role=employee) sees everything here except Accounts and the Admin
 * section — same split as the desktop sidebar (nav-config.ts).
 */
export function moreSections(role: Role): MobileNavSection[] {
  const admin = role === "admin";
  const sections: MobileNavSection[] = [
    {
      title: "Pipeline",
      items: [
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
        ...(admin ? [{ label: "Accounts", href: "/accounts", icon: BookOpen }] : []),
      ],
    },
  ];
  if (admin) {
    sections.push({
      title: "Admin",
      items: [
        { label: "Call Activity", href: "/admin/calls", icon: PhoneCall },
        { label: "Catalogue", href: "/admin/catalogue", icon: Tags },
        { label: "Pipeline Stages", href: "/admin/stages", icon: GitBranch },
        { label: "Integrations", href: "/admin/integrations", icon: Plug },
        { label: "Logs", href: "/admin/logs", icon: ScrollText },
      ],
    });
  }
  sections.push({
    title: "Settings",
    items: [{ label: "Settings", href: "/settings", icon: Settings }],
  });
  return sections;
}
