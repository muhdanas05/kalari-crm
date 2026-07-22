"use client";

import { useRouter } from "next/navigation";
import { DISPLAY_STATUSES, statusLabel } from "@/lib/invoices/display";
import { cn } from "@/lib/utils";

/**
 * Filters on display_status — the value invoices_v derives. There is no status
 * column to filter on, and that's the point (§3.10).
 */
export function InvoiceFilter({ active }: { active: string }) {
  const router = useRouter();
  const options = ["all", ...DISPLAY_STATUSES];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((o) => (
        <button
          key={o}
          onClick={() =>
            router.push(o === "all" ? "/invoices" : `/invoices?status=${o}`, {
              scroll: false,
            })
          }
          aria-pressed={active === o}
          className={cn(
            "h-8 rounded-full border px-3 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-mist",
            active === o
              ? "border-accent bg-accent text-white"
              : "border-line bg-surface text-ink-mid hover:border-line-strong hover:text-ink",
          )}
        >
          {o === "all" ? "All" : statusLabel(o)}
        </button>
      ))}
    </div>
  );
}
