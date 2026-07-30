"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { MobileNav } from "./MobileNav";
import { MobileTabBar } from "./MobileTabBar";
import { MobileMorePopover } from "./MobileMorePopover";
import { ToastProvider } from "@/components/ui/Toast";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/auth/session";

/**
 * The floating-card shell, kept: inset white sidebar + topbar cards on the paper
 * canvas, floating pill nav on mobile.
 *
 * The demo-flag provider, route guard, Zustand hydration and quick-add host are
 * gone — this app reads real data through Server Components and gates on
 * profiles.role, so there is nothing to hydrate and nothing to flag.
 */
export function AppShell({
  profile,
  errorCount = 0,
  children,
}: {
  profile: Profile;
  errorCount?: number;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [fullNavOpen, setFullNavOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setFullNavOpen(false);
  }, [pathname]);

  return (
    <NuqsAdapter>
      <ToastProvider>
        <div className="min-h-screen bg-paper">
          {/* Desktop / tablet */}
          <div className="hidden sm:block">
            <DesktopShell
              profile={profile}
              errorCount={errorCount}
              mobileOpen={mobileOpen}
              setMobileOpen={setMobileOpen}
            >
              {children}
            </DesktopShell>
          </div>

          {/* Mobile: slim topbar card + floating bottom pill nav */}
          <div className="flex min-h-[100dvh] flex-col gap-3 p-3 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:hidden">
            <header className="sticky top-3 z-20 h-16 rounded-2xl bg-surface shadow-floating">
              <Topbar
                profile={profile}
                onOpenMobileNav={() => setFullNavOpen(true)}
              />
            </header>
            <main className="flex-1">
              <div className="animate-page-in mx-auto w-full max-w-[1280px] px-2 pt-2">
                {children}
              </div>
            </main>
          </div>

          <MobileTabBar
            open={fullNavOpen}
            onToggle={() => setFullNavOpen((v) => !v)}
          />
          <MobileMorePopover
            open={fullNavOpen}
            onClose={() => setFullNavOpen(false)}
          />
        </div>
      </ToastProvider>
    </NuqsAdapter>
  );
}

/**
 * List and board routes fill the column; detail routes clamp to a reading width.
 * Prefix match so /customers/<id> clamps while /customers stays wide.
 */
const WIDE_ROUTES = [
  "/dashboard",
  "/automations",
  "/history",
  "/pipeline",
  "/customers",
  "/invoices",
  "/payments",
  "/calls",
  "/suppliers",
  "/accounts",
  "/admin/calls",
  "/admin/catalogue",
  "/admin/logs",
];

function isWide(pathname: string) {
  return WIDE_ROUTES.includes(pathname);
}

function DesktopShell({
  profile,
  errorCount,
  children,
  mobileOpen,
  setMobileOpen,
}: {
  profile: Profile;
  errorCount: number;
  children: React.ReactNode;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}) {
  const pathname = usePathname();
  const wide = isWide(pathname);

  return (
    <div className="flex gap-3 p-3">
      <aside className="sticky top-3 hidden h-[calc(100vh-24px)] w-[268px] shrink-0 self-start overflow-hidden rounded-2xl bg-accent-deep shadow-floating lg:flex">
        <Sidebar profile={profile} errorCount={errorCount} />
      </aside>

      <MobileNav
        profile={profile}
        errorCount={errorCount}
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <header className="sticky top-3 z-20 h-16 rounded-2xl bg-surface shadow-floating">
          <Topbar profile={profile} onOpenMobileNav={() => setMobileOpen(true)} />
        </header>

        <main className="flex-1">
          <div
            className={cn(
              "animate-page-in",
              wide
                ? "w-full px-6 pb-6 pt-4 lg:px-8"
                : "mx-auto w-full max-w-[1280px] px-6 pb-6 pt-4 lg:px-10",
            )}
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
