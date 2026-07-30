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

/** "More" grid. Items already on the tab bar are not repeated. */
export function moreSections(): MobileNavSection[] {
  return [
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
        { label: "Invoices", href: "/invoices", icon: FileText },
        { label: "Payments", href: "/payments", icon: CreditCard },
        { label: "Accounts", href: "/accounts", icon: BookOpen },
      ],
    },
    {
      title: "Admin",
      items: [
        { label: "Call Activity", href: "/admin/calls", icon: PhoneCall },
        { label: "Catalogue", href: "/admin/catalogue", icon: Tags },
        { label: "Integrations", href: "/admin/integrations", icon: Plug },
        { label: "Logs", href: "/admin/logs", icon: ScrollText },
      ],
    },
    {
      title: "Settings",
      items: [{ label: "Settings", href: "/settings", icon: Settings }],
    },
  ];
}
