"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { tabs as navTabs, TAB_MORE_ICON, type MobileNavLink } from "./mobile-nav-config";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onToggle: () => void;
};

/**
 * Floating bottom nav: one rounded-full white pill hovering above the home
 * indicator, four equal slots, no FAB. Kept deliberately — a hamburger drawer is
 * not adopted. Mobile only (<sm).
 */
export function MobileTabBar({ open, onToggle }: Props) {
  const pathname = usePathname();
  const tabs = navTabs();

  const isActive = (href: string) =>
    !open && (pathname === href || pathname.startsWith(href + "/"));

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pt-2 sm:hidden"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      <div className="flex w-full max-w-md items-stretch gap-1 rounded-full border border-transparent bg-surface p-1.5 shadow-floating">
        {tabs.map((item) => (
          <TabSlot key={item.href} item={item} active={isActive(item.href)} />
        ))}
        <MoreSlot open={open} onToggle={onToggle} />
      </div>
    </nav>
  );
}

const slotBase =
  "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full py-2 text-[11px] font-semibold transition-[color,background-color,transform] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-mist";

function TabSlot({ item, active }: { item: MobileNavLink; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        slotBase,
        active ? "bg-accent text-white" : "text-ink-mid hover:text-ink",
      )}
    >
      <Icon size={22} strokeWidth={active ? 2.3 : 2} />
      <span>{item.label}</span>
    </Link>
  );
}

function MoreSlot({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label="More"
      className={cn(
        slotBase,
        open ? "bg-accent text-white" : "text-ink-mid hover:text-ink",
      )}
    >
      <TAB_MORE_ICON
        size={22}
        strokeWidth={open ? 2.3 : 2}
        className={cn(
          "transition-transform duration-500 ease-out",
          open && "rotate-[360deg] scale-110",
        )}
      />
      <span>More</span>
    </button>
  );
}
