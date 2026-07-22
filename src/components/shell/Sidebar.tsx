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
    <div className={cn("flex h-full w-full flex-col", className)}>
      <div className="flex items-center justify-center px-5 pb-4 pt-5">
        <Wordmark />
      </div>

      <div className="mx-5 border-t border-line" />

      <nav className="flex-1 overflow-y-auto px-3 pb-2 pt-4">
        {sections.map((section, i) => (
          <div key={section.title || "top"} className={cn(i > 0 && "mt-5")}>
            {section.title && (
              <p className="mb-1.5 px-4 font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-gold-deep">
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

      <div className="mx-3 mb-3 mt-2 border-t border-line pt-3">
        <p className="px-4 pb-2 text-[11px] font-medium text-ink-faint">
          {profile.name}
          <span className="ml-1.5 font-mono uppercase tracking-[1px] text-ink-ghost">
            {profile.role}
          </span>
        </p>
        <form action={signOut}>
          <button
            type="submit"
            className="group flex h-10 w-full items-center gap-3 rounded-xl px-4 text-[13px] font-medium text-ink-mid transition-colors hover:bg-paper-deep hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-mist focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <LogOut
              size={17}
              strokeWidth={1.8}
              className="text-ink-faint group-hover:text-ink-soft"
            />
            <span>Sign out</span>
          </button>
        </form>
      </div>
    </div>
  );
}
