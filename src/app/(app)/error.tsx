"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, LayoutDashboard } from "@/components/icons";
import { Button } from "@/components/ui/Button";

/**
 * The app's error boundary. Without one, a thrown error inside the shell shows
 * Next's default screen — no nav, no way back, and in production no clue what
 * happened. This keeps the person inside the app.
 *
 * The digest is shown deliberately: it is the only handle support has on which
 * server error this was, and asking someone to "describe what the page said"
 * gets nowhere. It is an opaque hash, not a stack trace — nothing leaks.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 text-center shadow-floating">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-alert-pale">
          <AlertTriangle size={22} className="text-alert" />
        </span>

        <h1 className="text-[19px] font-extrabold tracking-[-0.4px] text-ink">
          Something went wrong
        </h1>
        <p className="mx-auto mt-2 max-w-xs text-[13px] font-medium leading-[1.6] text-ink-mid">
          The page could not be loaded. Nothing you were working on has been
          lost — try again, and if it keeps happening, send us the code below.
        </p>

        <div className="mt-6 flex items-center justify-center gap-2">
          <Button variant="primary" size="sm" icon={RefreshCw} onClick={reset}>
            Try again
          </Button>
          <Link href="/dashboard">
            <Button variant="secondary" size="sm" icon={LayoutDashboard}>
              Dashboard
            </Button>
          </Link>
        </div>

        {error.digest && (
          <p className="mt-5 font-mono text-[11px] text-ink-ghost">
            Reference: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
