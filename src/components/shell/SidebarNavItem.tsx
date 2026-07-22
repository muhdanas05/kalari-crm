"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type LucideIcon } from "@/components/icons";
import { allHrefs } from "./nav-config";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/auth/session";

type Props = {
  label: string;
  href: string;
  icon: LucideIcon;
  role: Role;
  onNavigate?: () => void;
  /** Optional count pill (e.g. calls due today). */
  badge?: number;
  /** Red dot: something under here has failed and wants a human. */
  errorDot?: boolean;
};

export function SidebarNavItem({
  label,
  href,
  icon: Icon,
  role,
  onNavigate,
  badge,
  errorDot,
}: Props) {
  const pathname = usePathname();

  // Longest-prefix match wins, so /admin/catalogue highlights itself rather than
  // a parent /admin item.
  const best = allHrefs(role)
    .filter((h) => pathname === h || pathname.startsWith(h + "/"))
    .reduce((a, b) => (b.length > a.length ? b : a), "");
  const active = best !== "" && href === best;

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-10 items-center gap-3 rounded-xl px-4 text-[13.5px] transition-colors",
        active
          ? "bg-accent font-semibold text-white shadow-sm"
          : "font-medium text-ink-soft hover:bg-paper-deep hover:text-ink",
      )}
    >
      <span className="relative shrink-0">
        <Icon
          size={17}
          strokeWidth={active ? 2.5 : 2}
          className={active ? "text-white" : "text-ink"}
        />
        {/*
          The red dot. Sits ON the icon so it reads at a glance from anywhere in
          the app — the point of the brief was noticing an error without going
          to look for one. Ringed so it stays visible against the active fill.
        */}
        {errorDot && (
          <span
            className={cn(
              "absolute -right-1 -top-1 h-2 w-2 rounded-full bg-alert",
              active ? "ring-2 ring-accent" : "ring-2 ring-surface",
            )}
            aria-hidden
          />
        )}
      </span>

      <span>{label}</span>

      {errorDot && <span className="sr-only">(errors need attention)</span>}

      {typeof badge === "number" && badge > 0 && (
        <span
          className={cn(
            "ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold",
            active ? "bg-white/20 text-white" : "bg-alert text-white",
          )}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}
