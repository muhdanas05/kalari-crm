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

  const wide = isWide(pathname);

  /*
   * The topbar's menu button opens different things at different widths: the
   * slide-in MobileNav drawer on tablet, the bottom "More" popover on phones.
   * Decided at click time from the live viewport rather than by rendering two
   * shells — see the note below on why there is only one tree now.
   */
  const openNav = () => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 640px)").matches
    ) {
      setMobileOpen(true);
    } else {
      setFullNavOpen(true);
    }
  };

  /*
   * ONE tree, responsive classes.
   *
   * This used to be two sibling subtrees — a `hidden sm:block` desktop shell
   * and a `sm:hidden` mobile one — each containing {children}. `hidden` is
   * display:none, NOT conditional rendering, so both were always mounted:
   * every page existed twice as independent React instances with independent
   * state and effects. Typing in a form and crossing the 640px breakpoint
   * showed the other copy's empty state; two <main> and two <h1> were in the
   * document at all times; every mount cost was doubled; and the two copies of
   * the customer search fought each other over the URL.
   */
  return (
    <NuqsAdapter>
      <ToastProvider>
        <div className="min-h-screen bg-paper">
          <div className="flex min-h-[100dvh] gap-3 p-3 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:min-h-0 sm:pb-3">
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
                <Topbar profile={profile} onOpenMobileNav={openNav} />
              </header>

              <main className="flex-1">
                <div
                  className={cn(
                    "animate-page-in w-full px-2 pt-2 sm:px-6 sm:pb-6 sm:pt-4",
                    wide ? "lg:px-8" : "mx-auto max-w-[1280px] lg:px-10",
                  )}
                >
                  {children}
                </div>
              </main>
            </div>
          </div>

          <MobileTabBar
            open={fullNavOpen}
            onToggle={() => setFullNavOpen((v) => !v)}
          />
          <MobileMorePopover
            open={fullNavOpen}
            profile={profile}
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
  "/quotations",
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
