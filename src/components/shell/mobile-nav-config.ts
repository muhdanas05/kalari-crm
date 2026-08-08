import { Columns3, Users, LayoutGrid, LayoutDashboard, type LucideIcon } from "@/components/icons";
import type { Profile } from "@/lib/auth/session";
import { visibleSections } from "./nav-config";

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

const TAB_HREFS = new Set([TAB_HOME.href, TAB_PIPELINE.href, TAB_CUSTOMERS.href]);

export function tabs(): MobileNavLink[] {
  return [TAB_HOME, TAB_PIPELINE, TAB_CUSTOMERS];
}

/**
 * "More" grid — the same permission-filtered sections as the desktop
 * sidebar (nav-config.ts is the single source of truth for who sees what),
 * minus whatever's already on the tab bar and the leading "Dashboard" slot.
 */
export function moreSections(profile: Profile): MobileNavSection[] {
  return visibleSections(profile)
    .filter((s) => s.title !== "")
    .map((s) => ({
      title: s.title,
      items: s.items
        .filter((i) => !TAB_HREFS.has(i.href))
        .map((i) => ({ label: i.label, href: i.href, icon: i.icon })),
    }))
    .filter((s) => s.items.length > 0);
}
