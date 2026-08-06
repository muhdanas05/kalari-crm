"use client";

import { useRouter } from "next/navigation";
import { QUOTATION_STATUSES, statusLabel } from "@/lib/quotations/display";
import { cn } from "@/lib/utils";

export function QuotationFilter({ active }: { active: string }) {
  const router = useRouter();
  const options = ["all", ...QUOTATION_STATUSES];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((o) => (
        <button
          key={o}
          onClick={() =>
            router.push(o === "all" ? "/quotations" : `/quotations?status=${o}`, {
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
