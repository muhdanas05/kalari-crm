"use client";

import { useEffect } from "react";
import { X } from "@/components/icons";
import { Sidebar } from "./Sidebar";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/auth/session";

type Props = {
  profile: Profile;
  errorCount?: number;
  open: boolean;
  onClose: () => void;
};

export function MobileNav({ profile, errorCount = 0, open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div
      className={cn(
        "fixed inset-0 z-40 lg:hidden",
        open ? "pointer-events-auto" : "pointer-events-none"
      )}
      aria-hidden={!open}
    >
      <div
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-ink/30 backdrop-blur-[2px] transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0"
        )}
      />
      <div
        className={cn(
          "absolute inset-y-3 left-3 flex w-[280px] flex-col rounded-2xl bg-surface shadow-floating transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-[110%]"
        )}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-ink-mid transition-colors hover:bg-paper-deep hover:text-ink"
          aria-label="Close navigation"
        >
          <X size={16} />
        </button>
        <Sidebar profile={profile} errorCount={errorCount} onNavigate={onClose} />
      </div>
    </div>
  );
}
