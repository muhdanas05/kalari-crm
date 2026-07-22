"use client";

import { usePathname } from "next/navigation";
import { Menu } from "@/components/icons";
import { GlobalSearch } from "./GlobalSearch";
import { NAV_SECTIONS } from "./nav-config";
import type { Profile } from "@/lib/auth/session";

type Props = {
  profile: Profile;
  onOpenMobileNav: () => void;
};

function usePageLabel(): string {
  const pathname = usePathname();
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (pathname === item.href || pathname.startsWith(item.href + "/")) {
        return item.label;
      }
    }
  }
  if (pathname.startsWith("/cases/")) return "Pipeline";
  if (pathname.startsWith("/customers/")) return "Customers";
  if (pathname.startsWith("/invoices/")) return "Invoices";
  return "Dashboard";
}

export function Topbar({ profile, onOpenMobileNav }: Props) {
  const pageLabel = usePageLabel();

  return (
    <div className="relative flex h-full w-full items-center px-5 lg:px-8">
      <div className="hidden min-w-0 items-center justify-start gap-3 sm:flex sm:flex-1">
        <button
          type="button"
          onClick={onOpenMobileNav}
          className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-mid transition-colors hover:bg-paper-deep hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-mist sm:flex lg:hidden"
          aria-label="Open navigation"
        >
          <Menu size={18} />
        </button>

        {/* The sidebar already carries the wordmark, so repeating "Kalari"
            here is noise. The crumb just says where you are. */}
        <nav
          className="hidden min-w-0 items-center text-[13.5px] lg:flex"
          aria-label="Breadcrumb"
        >
          <span className="truncate font-semibold text-ink">{pageLabel}</span>
        </nav>
      </div>

      <div className="mx-auto flex w-full flex-1 items-center justify-center sm:max-w-[340px] sm:flex-none md:max-w-[420px] lg:max-w-[480px]">
        <GlobalSearch />
      </div>

      <div className="ml-auto flex min-w-0 flex-none items-center justify-end gap-2 sm:ml-0 sm:flex-1">
        <span className="hidden shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-mid md:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          {profile.name}
        </span>
      </div>
    </div>
  );
}
