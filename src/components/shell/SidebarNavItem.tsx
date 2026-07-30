"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type LucideIcon } from "@/components/icons";
import { allHrefs } from "./nav-config";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  href: string;
  icon: LucideIcon;
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
  onNavigate,
  badge,
  errorDot,
}: Props) {
  const pathname = usePathname();

  // Longest-prefix match wins, so /admin/catalogue highlights itself rather than
  // a parent /admin item.
  const best = allHrefs()
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
          ? "bg-white/10 font-semibold text-white"
          : "font-medium text-white/70 hover:bg-white/[0.07] hover:text-white",
      )}
    >
      {/* Gold active indicator — not white-on-gold, which fails AA (see
          tailwind.config.ts's rationale for accent vs gold roles). */}
      {active && (
        <span
          className="nav-indicator-in absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-gold-soft"
          aria-hidden
        />
      )}

      <span className="relative shrink-0">
        <Icon
          size={17}
          strokeWidth={active ? 2.5 : 2}
          className={active ? "text-gold-soft" : "text-white/55"}
        />
        {/*
          The red dot. Sits ON the icon so it reads at a glance from anywhere in
          the app — the point of the brief was noticing an error without going
          to look for one. Ringed so it stays visible against the active fill.
        */}
        {errorDot && (
          <span
            className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-alert ring-2 ring-accent-deep"
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
