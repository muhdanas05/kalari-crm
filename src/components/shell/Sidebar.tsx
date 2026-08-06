"use client";

import { LogOut } from "@/components/icons";
import { Wordmark } from "@/components/brand/Wordmark";
import { SidebarNavItem } from "./SidebarNavItem";
import { visibleSections } from "./nav-config";
import { signOut } from "@/app/(auth)/actions";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/auth/session";

type Props = {
  profile: Profile;
  /**
   * Count of automation/email failures. Renders the red dot the brief asks for:
   * "a small red icon so i can see those errors". Passed down from the server
   * layout so it costs one query per page, not one per nav item.
   */
  errorCount?: number;
  onNavigate?: () => void;
  className?: string;
};

export function Sidebar({ profile, errorCount = 0, onNavigate, className }: Props) {
  const sections = visibleSections(profile.role);
  return (
    <div className={cn("flex h-full w-full flex-col bg-accent-deep", className)}>
      <div className="flex items-center justify-center px-5 pb-4 pt-5">
        <div className="rounded-xl bg-white p-2">
          <Wordmark />
        </div>
      </div>

      <div className="mx-5 border-t border-white/10" />

      <nav className="flex-1 overflow-y-auto px-3 pb-2 pt-4">
        {sections.map((section, i) => (
          <div key={section.title || "top"} className={cn(i > 0 && "mt-5")}>
            {section.title && (
              <p className="mb-1.5 px-4 font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-gold-soft">
                {section.title}
              </p>
            )}
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <SidebarNavItem
                  key={item.href}
                  label={item.label}
                  href={item.href}
                  icon={item.icon}
                  role={profile.role}
                  onNavigate={onNavigate}
                  errorDot={item.errorBadge ? errorCount > 0 : false}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="mx-3 mb-3 mt-2 border-t border-white/10 pt-3">
        <p className="flex items-center gap-1.5 px-4 pb-2 text-[11px] font-medium text-white/60">
          {profile.name}
          {profile.role === "employee" && (
            <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-white/70">
              Manager
            </span>
          )}
        </p>
        <form action={signOut}>
          <button
            type="submit"
            className="group flex h-10 w-full items-center gap-3 rounded-xl px-4 text-[13px] font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-soft focus-visible:ring-offset-2 focus-visible:ring-offset-accent-deep"
          >
            <LogOut
              size={17}
              strokeWidth={1.8}
              className="text-white/60 group-hover:text-white"
            />
            <span>Sign out</span>
          </button>
        </form>
      </div>
    </div>
  );
}
